use tauri::State;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::services::agent::{AgentEvent, AgentKind, AgentService, Catalog, SessionSpec};
use crate::services::attachment::Attachment;

/// Rend la main dès que le message est parti ; la suite arrive sur `on_event` jusqu'à `turnEnd`.
#[tauri::command]
pub async fn agent_send(
    spec: SessionSpec,
    prompt: String,
    attachments: Vec<Attachment>,
    recap: Option<String>,
    on_event: Channel<AgentEvent>,
    agents: State<'_, AgentService>,
) -> Result<(), AppError> {
    agents.send(spec, prompt, &attachments, recap, on_event)
}

#[tauri::command]
pub async fn agent_warm(
    spec: SessionSpec,
    agents: State<'_, AgentService>,
) -> Result<(), AppError> {
    agents.warm(spec)
}

#[tauri::command]
pub fn agent_stop(chat_id: String, agents: State<'_, AgentService>) {
    agents.stop(&chat_id);
}

#[tauri::command]
pub async fn agent_catalog(
    agent: AgentKind,
    agents: State<'_, AgentService>,
) -> Result<Catalog, AppError> {
    agents.catalog(agent).await
}

#[tauri::command]
pub fn agent_approve(
    chat_id: String,
    request_id: String,
    allow: bool,
    agents: State<'_, AgentService>,
) {
    agents.approve(&chat_id, &request_id, allow);
}
