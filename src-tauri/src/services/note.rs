use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::AppError;

pub const TITLE_MAX: usize = 200;
pub const BODY_MAX: usize = 1_000_000;
const SLUG_MAX: usize = 48;

/// Note markdown, libre (`project_id` vide) ou rangée dans un projet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Note {
    pub id: String,
    /// Nom dans `@note/<slug>`. Fixé au premier titre, il ne suit pas les renommages : une mention déjà écrite reste
    /// valable. `None` tant que la note n'a pas de titre.
    pub slug: Option<String>,
    pub title: String,
    pub body: String,
    pub project_id: Option<String>,
    /// Session d'où vient la note (réponse enregistrée, résumé).
    pub source_chat_id: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

/// Ce que le front envoie pour créer ou modifier une note : Rust garde le slug et les dates.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteInput {
    pub id: String,
    pub title: String,
    pub body: String,
    pub project_id: Option<String>,
    #[serde(default)]
    pub source_chat_id: Option<String>,
}

/// Notes dans `nuee.db`, sur une connexion à part : la table se crée elle-même, hors des migrations des chats.
pub struct NoteService {
    db: Mutex<Connection>,
}

impl NoteService {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let db = Connection::open(path)?;
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                slug TEXT UNIQUE,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                project_id TEXT,
                source_chat_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
        )?;
        Ok(Self { db: Mutex::new(db) })
    }

    pub fn list(&self) -> Result<Vec<Note>, AppError> {
        let db = self.lock();
        let mut query = db.prepare(
            "SELECT id, slug, title, body, project_id, source_chat_id, created_at, updated_at
             FROM notes ORDER BY updated_at DESC",
        )?;
        let notes = query.query_map([], read)?.collect::<Result<Vec<_>, _>>()?;
        Ok(notes)
    }

    pub fn save(&self, input: &NoteInput) -> Result<Note, AppError> {
        validate(input)?;
        let db = self.lock();
        let existing: Option<Option<String>> = db
            .query_row("SELECT slug FROM notes WHERE id = ?1", [&input.id], |row| {
                row.get(0)
            })
            .optional()?;
        let slug = match existing.flatten() {
            Some(slug) => Some(slug),
            None => free_slug(&db, &input.title)?,
        };
        let now = now();
        db.execute(
            "INSERT INTO notes (id, slug, title, body, project_id, source_chat_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
             ON CONFLICT(id) DO UPDATE SET slug = ?2, title = ?3, body = ?4, project_id = ?5, updated_at = ?7",
            params![input.id, slug, input.title, input.body, input.project_id, input.source_chat_id, now],
        )?;
        Ok(db.query_row(
            "SELECT id, slug, title, body, project_id, source_chat_id, created_at, updated_at FROM notes WHERE id = ?1",
            [&input.id],
            read,
        )?)
    }

    pub fn delete(&self, id: &str) -> Result<(), AppError> {
        self.lock()
            .execute("DELETE FROM notes WHERE id = ?1", [id])?;
        Ok(())
    }

    fn lock(&self) -> MutexGuard<'_, Connection> {
        self.db
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn read(row: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        slug: row.get(1)?,
        title: row.get(2)?,
        body: row.get(3)?,
        project_id: row.get(4)?,
        source_chat_id: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn validate(input: &NoteInput) -> Result<(), AppError> {
    let id_ok = !input.id.is_empty()
        && input.id.len() <= 64
        && input
            .id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !id_ok {
        return Err(AppError::InvalidInput("id".into()));
    }
    if input.title.chars().count() > TITLE_MAX {
        return Err(AppError::InvalidInput("title".into()));
    }
    if input.body.len() > BODY_MAX {
        return Err(AppError::InvalidInput("body".into()));
    }
    Ok(())
}

/// Slug libre tiré du titre (`-2`, `-3`… s'il est pris) ; `None` sans titre.
fn free_slug(db: &Connection, title: &str) -> Result<Option<String>, AppError> {
    if title.trim().is_empty() {
        return Ok(None);
    }
    let base = slugify(title);
    let taken = |slug: &str| -> Result<bool, AppError> {
        Ok(db
            .query_row("SELECT 1 FROM notes WHERE slug = ?1", [slug], |_| Ok(()))
            .optional()?
            .is_some())
    };
    if !taken(&base)? {
        return Ok(Some(base));
    }
    for n in 2.. {
        let slug = format!("{base}-{n}");
        if !taken(&slug)? {
            return Ok(Some(slug));
        }
    }
    unreachable!()
}

/// Titre en minuscules ASCII reliées par des tirets. Un titre sans lettre latine (japonais, chinois) donne `note`.
pub fn slugify(title: &str) -> String {
    let mut slug = String::new();
    for c in title.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
        } else if let Some(folded) = fold(c) {
            slug.push_str(folded);
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    // Rien que de l'ASCII : couper à l'octet ne tombe jamais au milieu d'un caractère.
    slug.truncate(SLUG_MAX);
    match slug.trim_matches('-') {
        "" => "note".into(),
        slug => slug.into(),
    }
}

// Lettres accentuées des langues de l'interface ; le reste devient un séparateur.
fn fold(c: char) -> Option<&'static str> {
    Some(match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => "a",
        'ç' => "c",
        'è' | 'é' | 'ê' | 'ë' => "e",
        'ì' | 'í' | 'î' | 'ï' => "i",
        'ñ' => "n",
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' => "o",
        'ù' | 'ú' | 'û' | 'ü' => "u",
        'ý' | 'ÿ' => "y",
        'œ' => "oe",
        'æ' => "ae",
        'ß' => "ss",
        _ => return None,
    })
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service(name: &str) -> NoteService {
        let dir = std::env::temp_dir().join(format!("nuee-notes-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        NoteService::open(&dir.join("nuee.db")).expect("base")
    }

    fn input(id: &str, title: &str) -> NoteInput {
        NoteInput {
            id: id.into(),
            title: title.into(),
            body: "corps".into(),
            project_id: None,
            source_chat_id: None,
        }
    }

    #[test]
    fn slugs_fold_accents_and_fall_back() {
        assert_eq!(
            slugify("Pièges WebKit : flou & verre"),
            "pieges-webkit-flou-verre"
        );
        assert_eq!(slugify("  ---  "), "note");
        assert_eq!(slugify("メモ"), "note");
        assert!(slugify(&"long ".repeat(40)).len() <= SLUG_MAX);
    }

    #[test]
    fn the_slug_stays_after_a_rename_and_never_collides() {
        let notes = service("slug");
        let untitled = notes.save(&input("n1", "")).expect("note");
        assert_eq!(untitled.slug, None);
        let first = notes.save(&input("n1", "Fin de session")).expect("note");
        assert_eq!(first.slug.as_deref(), Some("fin-de-session"));
        let renamed = notes.save(&input("n1", "Autre titre")).expect("note");
        assert_eq!(renamed.slug.as_deref(), Some("fin-de-session"));
        let twin = notes.save(&input("n2", "Fin de session")).expect("note");
        assert_eq!(twin.slug.as_deref(), Some("fin-de-session-2"));
        notes.delete("n1").expect("suppression");
        assert_eq!(notes.list().expect("liste").len(), 1);
    }

    #[test]
    fn bad_input_is_refused() {
        let notes = service("refus");
        assert!(notes.save(&input("../x", "t")).is_err());
        assert!(
            notes
                .save(&input("n1", &"t".repeat(TITLE_MAX + 1)))
                .is_err()
        );
    }
}
