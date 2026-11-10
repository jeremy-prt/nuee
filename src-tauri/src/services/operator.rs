//! Outils de sessions du serveur MCP `nuee` : l'agent liste, lit, lance, renomme et archive les autres sessions,
//! et leur écrit. Projets et sessions vivent côté front : Rust lui passe la demande par un événement et attend sa réponse.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use ts_rs::TS;

use crate::error::AppError;

pub const REQUEST: &str = "operator-request";
pub const TOOLS: [&str; 6] = [
    "list_sessions",
    "read_session",
    "start_session",
    "send_message",
    "rename_session",
    "archive_session",
];
const TIMEOUT: Duration = Duration::from_secs(60);

/// Demande d'un outil de sessions, faite par l'agent de la session `caller`.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct OperatorRequest {
    pub id: u32,
    pub tool: String,
    #[ts(type = "Record<string, unknown>")]
    pub args: Value,
    pub caller: String,
}

type Answer = Result<String, String>;

#[derive(Default)]
pub struct OperatorService {
    next: AtomicU32,
    pending: Mutex<HashMap<u32, oneshot::Sender<Answer>>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl OperatorService {
    pub async fn request(
        &self,
        app: &AppHandle,
        tool: &str,
        args: &Value,
        caller: &str,
    ) -> Result<String, AppError> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        lock(&self.pending).insert(id, sender);
        let request = OperatorRequest {
            id,
            tool: tool.to_owned(),
            args: args.clone(),
            caller: caller.to_owned(),
        };
        if let Err(error) = app.emit(REQUEST, &request) {
            lock(&self.pending).remove(&id);
            return Err(AppError::AgentFailed(error.to_string()));
        }
        let answer = tokio::time::timeout(TIMEOUT, receiver).await;
        lock(&self.pending).remove(&id);
        match answer {
            Ok(Ok(Ok(text))) => Ok(text),
            Ok(Ok(Err(error))) => Err(AppError::InvalidInput(error)),
            _ => Err(AppError::AgentFailed(
                "Nuée n'a pas répondu à temps".to_owned(),
            )),
        }
    }

    pub fn reply(&self, id: u32, answer: Answer) {
        if let Some(sender) = lock(&self.pending).remove(&id) {
            let _ = sender.send(answer);
        }
    }
}
