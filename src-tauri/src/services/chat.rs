use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::{AgentKind, ContextUsage, TurnOptions};
use crate::services::worktree::canonical;

/// Ce que la barre latérale affiche d'un chat, sans charger sa conversation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatSummary {
    pub id: String,
    pub project_id: Option<String>,
    pub number: u32,
    pub agent: AgentKind,
    /// Résumé du premier message, donné par l'agent. `None` : on affiche « Chat <number> ».
    pub title: Option<String>,
    /// Faux tant qu'aucun message n'est parti : l'historique ne montre pas un chat vide.
    #[serde(default)]
    pub started: bool,
    /// L'agent travaille dans un worktree du projet. Réglable jusqu'au premier message.
    #[serde(default)]
    pub worktree: bool,
    /// Worktree choisi ou créé pour le chat. `None` avec `worktree` : le sien, créé au premier message.
    #[serde(default)]
    pub worktree_path: Option<String>,
    /// Masqué de l'historique, retrouvé dans Réglages › Archives.
    #[serde(default)]
    pub archived: bool,
    /// Millisecondes depuis 1970 : point de départ de la suppression automatique des archives.
    #[serde(default)]
    #[ts(type = "number | null")]
    pub archived_at: Option<i64>,
    /// Dernier enregistrement de la conversation, en millisecondes : point de départ de l'archivage automatique.
    #[serde(default)]
    #[ts(type = "number")]
    pub updated_at: i64,
    /// Épinglé en haut de la liste du projet ; l'archivage automatique le laisse.
    #[serde(default)]
    pub pinned: bool,
    /// Modèle des réglages enregistrés. `None` : celui que l'agent prend par défaut.
    #[serde(default)]
    pub model: Option<String>,
    /// Lignes ajoutées et retirées par l'agent sur toute la session.
    #[serde(default)]
    pub added: u32,
    #[serde(default)]
    pub removed: u32,
}

/// Texte d'une session archivée (messages et réponses, sans les outils) pour la recherche.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatText {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatContent {
    pub session_id: Option<String>,
    pub options: TurnOptions,
    /// Messages tels que le front les affiche : Rust les range sans les lire.
    #[ts(type = "unknown[]")]
    pub items: Value,
    /// Dernier relevé de l'agent : la jauge s'affiche dès la réouverture du chat.
    pub context: Option<ContextUsage>,
    /// Compté par le front, seul à lire les messages : la liste des sessions le montre sans les charger.
    #[serde(default)]
    pub added: u32,
    #[serde(default)]
    pub removed: u32,
}

/// Une version de schéma par entrée : `PRAGMA user_version` dit lesquelles sont déjà passées.
const MIGRATIONS: &[&str] = &[
    "CREATE TABLE chats (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        number INTEGER NOT NULL,
        agent TEXT NOT NULL,
        session_id TEXT,
        options TEXT,
        items TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )",
    "ALTER TABLE chats ADD COLUMN title TEXT",
    "ALTER TABLE chats ADD COLUMN worktree INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE chats ADD COLUMN worktree_path TEXT",
    "ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    // Les archives d'avant la colonne repartent du jour de la migration : aucune ne disparaît au lancement.
    "ALTER TABLE chats ADD COLUMN archived_at INTEGER;
     UPDATE chats SET archived_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE archived = 1",
    "ALTER TABLE chats ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
    // La liste lisait toute la conversation (`items != '[]'`) pour savoir si un chat avait commencé.
    "ALTER TABLE chats ADD COLUMN started INTEGER NOT NULL DEFAULT 0;
     UPDATE chats SET started = 1 WHERE items != '[]'",
    "ALTER TABLE chats ADD COLUMN context TEXT",
    // Les sessions d'avant la colonne sont comptées ici, une fois ; ensuite le front envoie le compte.
    "ALTER TABLE chats ADD COLUMN added INTEGER NOT NULL DEFAULT 0;
     ALTER TABLE chats ADD COLUMN removed INTEGER NOT NULL DEFAULT 0;
     UPDATE chats SET
       added = (SELECT coalesce(sum(json_extract(value, '$.change.added')), 0) FROM json_each(chats.items)
                WHERE json_extract(value, '$.kind') = 'tool'),
       removed = (SELECT coalesce(sum(json_extract(value, '$.change.removed')), 0) FROM json_each(chats.items)
                  WHERE json_extract(value, '$.kind') = 'tool')
     WHERE json_valid(items)",
];

/// Historique des chats dans une base SQLite du dossier de données de l'app.
pub struct ChatService {
    db: Mutex<Connection>,
}

impl ChatService {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let db = Connection::open(path)?;
        db.pragma_update(None, "journal_mode", "WAL")?;
        migrate(&db)?;
        Ok(Self { db: Mutex::new(db) })
    }

    pub fn list(&self) -> Result<Vec<ChatSummary>, AppError> {
        let db = self.lock();
        let mut query = db.prepare(
            "SELECT id, project_id, number, agent, title, started, worktree, worktree_path, archived, archived_at, updated_at, pinned,
                    iif(json_valid(options), json_extract(options, '$.model'), NULL), added, removed
             FROM chats ORDER BY created_at",
        )?;
        let rows = query.query_map([], |row| {
            // Un agent retiré d'une future version ne doit pas faire tomber toute la liste.
            let Ok(agent) = serde_json::from_value(Value::String(row.get(3)?)) else {
                return Ok(None);
            };
            Ok(Some(ChatSummary {
                id: row.get(0)?,
                project_id: row.get(1)?,
                number: row.get(2)?,
                agent,
                title: row.get(4)?,
                started: row.get(5)?,
                worktree: row.get(6)?,
                worktree_path: row.get(7)?,
                archived: row.get(8)?,
                archived_at: row.get(9)?,
                updated_at: row.get(10)?,
                pinned: row.get(11)?,
                model: row.get(12)?,
                added: row.get(13)?,
                removed: row.get(14)?,
            }))
        })?;
        let chats = rows.collect::<Result<Vec<_>, _>>()?;
        Ok(chats.into_iter().flatten().collect())
    }

    pub fn create(&self, chat: &ChatSummary) -> Result<(), AppError> {
        let now = now();
        self.lock().execute(
            "INSERT INTO chats (id, project_id, number, agent, title, worktree, worktree_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![chat.id, chat.project_id, chat.number, agent_name(chat.agent)?, chat.title, chat.worktree, chat.worktree_path, now],
        )?;
        Ok(())
    }

    pub fn content(&self, id: &str) -> Result<Option<ChatContent>, AppError> {
        let row = self
            .lock()
            .query_row(
                "SELECT session_id, options, items, context, added, removed FROM chats WHERE id = ?1",
                [id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, u32>(4)?,
                        row.get::<_, u32>(5)?,
                    ))
                },
            )
            .optional()?;
        let Some((session_id, options, items, context, added, removed)) = row else {
            return Ok(None);
        };
        // Un chat créé mais jamais enregistré n'a pas encore d'options : le front met les siennes.
        let Some(options) = options else {
            return Ok(None);
        };
        Ok(Some(ChatContent {
            session_id,
            options: serde_json::from_str(&options).map_err(invalid)?,
            items: serde_json::from_str(&items).map_err(invalid)?,
            context: context.and_then(|context| serde_json::from_str(&context).ok()),
            added,
            removed,
        }))
    }

    pub fn save(&self, id: &str, content: &ChatContent) -> Result<(), AppError> {
        let options = serde_json::to_string(&content.options).map_err(invalid)?;
        let items = serde_json::to_string(&content.items).map_err(invalid)?;
        let context = content
            .context
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(invalid)?;
        self.lock().execute(
            "UPDATE chats SET session_id = ?1, options = ?2, items = ?3, updated_at = ?4, started = ?5, context = ?6, added = ?7, removed = ?8 WHERE id = ?9",
            params![
                content.session_id,
                options,
                items,
                now(),
                content.items.as_array().is_some_and(|items| !items.is_empty()),
                context,
                content.added,
                content.removed,
                id
            ],
        )?;
        Ok(())
    }

    pub fn set_title(&self, id: &str, title: &str) -> Result<(), AppError> {
        self.lock().execute(
            "UPDATE chats SET title = ?1 WHERE id = ?2",
            params![title, id],
        )?;
        Ok(())
    }

    pub fn set_pinned(&self, id: &str, pinned: bool) -> Result<(), AppError> {
        self.lock().execute(
            "UPDATE chats SET pinned = ?1 WHERE id = ?2",
            params![pinned, id],
        )?;
        Ok(())
    }

    pub fn set_worktree(
        &self,
        id: &str,
        worktree: bool,
        path: Option<&str>,
    ) -> Result<(), AppError> {
        self.lock().execute(
            "UPDATE chats SET worktree = ?1, worktree_path = ?2 WHERE id = ?3",
            params![worktree, path.filter(|_| worktree), id],
        )?;
        Ok(())
    }

    pub fn worktree_path(&self, id: &str) -> Result<Option<String>, AppError> {
        Ok(self
            .lock()
            .query_row(
                "SELECT worktree_path FROM chats WHERE id = ?1 AND worktree = 1",
                [id],
                |row| row.get(0),
            )
            .optional()?
            .flatten())
    }

    pub fn worktree_users(&self, path: &str) -> Result<Vec<String>, AppError> {
        let db = self.lock();
        let mut query =
            db.prepare("SELECT id FROM chats WHERE worktree = 1 AND worktree_path = ?1")?;
        let ids = query.query_map([path], |row| row.get(0))?;
        Ok(ids.collect::<Result<_, _>>()?)
    }

    pub fn leave_worktree(&self, path: &str) -> Result<Vec<String>, AppError> {
        let ids = self.worktree_users(path)?;
        self.lock().execute(
            "UPDATE chats SET worktree = 0, worktree_path = NULL WHERE worktree_path = ?1",
            [path],
        )?;
        Ok(ids)
    }

    /// Avant que le chemin n'entre en base, un worktree de chat se déduisait de son id : on l'y inscrit.
    pub fn adopt_worktrees(&self, dir: &Path) -> Result<(), AppError> {
        let ids: Vec<String> = {
            let db = self.lock();
            let mut query = db.prepare(
                "SELECT id FROM chats WHERE worktree = 1 AND worktree_path IS NULL AND started = 1",
            )?;
            query
                .query_map([], |row| row.get(0))?
                .collect::<Result<_, _>>()?
        };
        for id in ids {
            let own = dir.join(&id);
            if own.join(".git").exists() {
                self.set_worktree(&id, true, Some(&canonical(&own)))?;
            }
        }
        Ok(())
    }

    /// Rend la date d'archivage enregistrée (`None` au retour dans l'historique).
    pub fn set_archived(&self, ids: &[String], archived: bool) -> Result<Option<i64>, AppError> {
        let at = archived.then(now);
        let mut db = self.lock();
        let tx = db.transaction()?;
        for id in ids {
            tx.execute(
                "UPDATE chats SET archived = ?1, archived_at = ?2 WHERE id = ?3",
                params![archived, at, id],
            )?;
        }
        tx.commit()?;
        Ok(at)
    }

    pub fn archived_texts(&self) -> Result<Vec<ChatText>, AppError> {
        let db = self.lock();
        let mut query = db.prepare(
            "SELECT chats.id, group_concat(json_extract(item.value, '$.text'), char(10))
             FROM chats, json_each(chats.items) AS item
             WHERE chats.archived = 1 AND json_extract(item.value, '$.kind') IN ('user', 'text')
             GROUP BY chats.id",
        )?;
        let texts = query.query_map([], |row| {
            Ok(ChatText {
                id: row.get(0)?,
                text: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            })
        })?;
        Ok(texts.collect::<Result<_, _>>()?)
    }

    pub fn delete(&self, id: &str) -> Result<(), AppError> {
        self.lock()
            .execute("DELETE FROM chats WHERE id = ?1", [id])?;
        Ok(())
    }

    fn lock(&self) -> MutexGuard<'_, Connection> {
        self.db
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn migrate(db: &Connection) -> Result<(), AppError> {
    let done: i64 = db.pragma_query_value(None, "user_version", |row| row.get(0))?;
    for (version, sql) in (1..)
        .zip(MIGRATIONS)
        .skip(usize::try_from(done).unwrap_or(0))
    {
        db.execute_batch(sql)?;
        db.pragma_update(None, "user_version", version)?;
    }
    Ok(())
}

fn agent_name(agent: AgentKind) -> Result<String, AppError> {
    match serde_json::to_value(agent).map_err(invalid)? {
        Value::String(name) => Ok(name),
        _ => Err(AppError::InvalidInput("agent".into())),
    }
}

fn invalid(error: serde_json::Error) -> AppError {
    AppError::InvalidInput(error.to_string())
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::agent::PermissionMode;

    #[test]
    fn a_chat_survives_a_reopen() {
        let dir = std::env::temp_dir().join(format!("nuee-test-{}", std::process::id()));
        let path = dir.join("nuee.db");
        let chat = ChatSummary {
            id: "c1".into(),
            project_id: Some("p1".into()),
            number: 1,
            agent: AgentKind::Claude,
            title: None,
            started: false,
            worktree: false,
            worktree_path: None,
            archived: false,
            archived_at: None,
            updated_at: 0,
            pinned: false,
            model: None,
            added: 0,
            removed: 0,
        };
        let content = ChatContent {
            session_id: Some("s1".into()),
            options: TurnOptions {
                mode: PermissionMode::Auto,
                model: Some("opus".into()),
                effort: None,
                fast: false,
            },
            items: serde_json::json!([{ "kind": "user", "id": "u1", "text": "salut" }]),
            context: Some(ContextUsage {
                used: 41_432,
                window: 200_000,
                categories: Vec::new(),
            }),
            added: 7,
            removed: 2,
        };

        let chats = ChatService::open(&path).expect("base");
        chats.create(&chat).expect("création");
        assert_eq!(chats.content("c1").expect("lecture"), None);
        chats.save("c1", &content).expect("enregistrement");
        chats.set_title("c1", "Inverser une liste").expect("titre");
        chats.set_pinned("c1", true).expect("épingle");
        chats
            .set_worktree("c1", true, Some("/tmp/arbre"))
            .expect("worktree");
        let archived_at = chats.set_archived(&["c1".into()], true).expect("archive");
        assert!(archived_at.is_some());
        assert_eq!(
            chats.archived_texts().expect("textes"),
            vec![ChatText {
                id: "c1".into(),
                text: "salut".into()
            }]
        );
        drop(chats);

        let chats = ChatService::open(&path).expect("réouverture");
        let listed = chats.list().expect("liste").remove(0);
        assert!(listed.updated_at > 0);
        let titled = ChatSummary {
            title: Some("Inverser une liste".into()),
            started: true,
            worktree: true,
            worktree_path: Some("/tmp/arbre".into()),
            archived: true,
            archived_at,
            updated_at: listed.updated_at,
            pinned: true,
            model: Some("opus".into()),
            added: 7,
            removed: 2,
            ..chat
        };
        assert_eq!(chats.list().expect("liste"), vec![titled]);
        assert_eq!(
            chats.worktree_users("/tmp/arbre").expect("users"),
            vec!["c1"]
        );
        assert_eq!(
            chats.leave_worktree("/tmp/arbre").expect("quitte"),
            vec!["c1"]
        );
        assert_eq!(chats.worktree_path("c1").expect("chemin"), None);
        assert_eq!(chats.content("c1").expect("lecture"), Some(content));
        chats.delete("c1").expect("suppression");
        assert!(chats.list().expect("liste").is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn older_sessions_get_their_changed_lines_counted() {
        let dir = std::env::temp_dir().join(format!("nuee-test-diff-{}", std::process::id()));
        let path = dir.join("nuee.db");
        std::fs::create_dir_all(&dir).expect("dossier");
        let before = MIGRATIONS.len() - 1;
        {
            let db = Connection::open(&path).expect("base");
            for sql in &MIGRATIONS[..before] {
                db.execute_batch(sql).expect("migration");
            }
            db.pragma_update(
                None,
                "user_version",
                i64::try_from(before).expect("version"),
            )
            .expect("version");
            let items = serde_json::json!([
                { "kind": "user", "id": "u1", "text": "corrige" },
                { "kind": "tool", "id": "t1", "change": { "patch": "", "added": 5, "removed": 1, "created": false } },
                { "kind": "tool", "id": "t2", "change": null },
                { "kind": "tool", "id": "t3", "change": { "patch": "", "added": 2, "removed": 3, "created": false } },
            ]);
            db.execute(
                "INSERT INTO chats (id, number, agent, items, created_at, updated_at, started) VALUES ('c1', 1, 'claude', ?1, 0, 0, 1)",
                [items.to_string()],
            )
            .expect("chat");
        }

        let listed = ChatService::open(&path)
            .expect("migration")
            .list()
            .expect("liste")
            .remove(0);
        assert_eq!((listed.added, listed.removed), (7, 4));
        let _ = std::fs::remove_dir_all(dir);
    }
}
