use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::{AgentKind, TurnOptions};

/// Ce que la barre latérale affiche d'un chat, sans charger sa conversation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatSummary {
    pub id: String,
    pub project_id: Option<String>,
    pub number: u32,
    pub agent: AgentKind,
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
}

/// Une version de schéma par entrée : `PRAGMA user_version` dit lesquelles sont déjà passées.
const MIGRATIONS: &[&str] = &["CREATE TABLE chats (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        number INTEGER NOT NULL,
        agent TEXT NOT NULL,
        session_id TEXT,
        options TEXT,
        items TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )"];

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
        let mut query =
            db.prepare("SELECT id, project_id, number, agent FROM chats ORDER BY created_at")?;
        let rows = query.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        let mut chats = Vec::new();
        for row in rows {
            let (id, project_id, number, agent) = row?;
            // Un agent retiré d'une future version ne doit pas faire tomber toute la liste.
            if let Ok(agent) = serde_json::from_value(Value::String(agent)) {
                chats.push(ChatSummary {
                    id,
                    project_id,
                    number,
                    agent,
                });
            }
        }
        Ok(chats)
    }

    pub fn create(&self, chat: &ChatSummary) -> Result<(), AppError> {
        let now = now();
        self.lock().execute(
            "INSERT INTO chats (id, project_id, number, agent, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![chat.id, chat.project_id, chat.number, agent_name(chat.agent)?, now],
        )?;
        Ok(())
    }

    pub fn content(&self, id: &str) -> Result<Option<ChatContent>, AppError> {
        let row = self
            .lock()
            .query_row(
                "SELECT session_id, options, items FROM chats WHERE id = ?1",
                [id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        let Some((session_id, options, items)) = row else {
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
        }))
    }

    pub fn save(&self, id: &str, content: &ChatContent) -> Result<(), AppError> {
        let options = serde_json::to_string(&content.options).map_err(invalid)?;
        let items = serde_json::to_string(&content.items).map_err(invalid)?;
        self.lock().execute(
            "UPDATE chats SET session_id = ?1, options = ?2, items = ?3, updated_at = ?4 WHERE id = ?5",
            params![content.session_id, options, items, now(), id],
        )?;
        Ok(())
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
        };
        let content = ChatContent {
            session_id: Some("s1".into()),
            options: TurnOptions {
                mode: PermissionMode::Auto,
                model: Some("opus".into()),
                effort: None,
            },
            items: serde_json::json!([{ "kind": "user", "id": "u1", "text": "salut" }]),
        };

        let chats = ChatService::open(&path).expect("base");
        chats.create(&chat).expect("création");
        assert_eq!(chats.content("c1").expect("lecture"), None);
        chats.save("c1", &content).expect("enregistrement");
        drop(chats);

        let chats = ChatService::open(&path).expect("réouverture");
        assert_eq!(chats.list().expect("liste"), vec![chat]);
        assert_eq!(chats.content("c1").expect("lecture"), Some(content));
        chats.delete("c1").expect("suppression");
        assert!(chats.list().expect("liste").is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }
}
