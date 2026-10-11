use std::path::Path;

use tauri::State;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::services::agent::{
    AgentEvent, AgentKind, AgentService, AgentStatus, Catalog, ChatCommand, SessionSpec,
};
use crate::services::attachment::Attachment;
use crate::services::worktree::WorktreeService;

/// Rend la main dès que le message est parti ; la suite arrive sur `on_event` jusqu'à `turnEnd`.
/// Le worktree d'un chat naît ici, au premier message.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn agent_send(
    mut spec: SessionSpec,
    prompt: String,
    attachments: Vec<Attachment>,
    recap: Option<String>,
    command: Option<ChatCommand>,
    on_event: Channel<AgentEvent>,
    agents: State<'_, AgentService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<(), AppError> {
    if spec.worktree
        && let Some(project) = spec.cwd.take()
    {
        let dir = worktrees.ensure(&spec.chat_id, Path::new(&project)).await?;
        spec.cwd = Some(dir.to_string_lossy().into_owned());
    }
    agents.send(spec, prompt, &attachments, recap, command, on_event)
}

/// Un worktree pas encore créé attend le premier message : rien à préparer d'ici là.
#[tauri::command]
pub async fn agent_warm(
    mut spec: SessionSpec,
    agents: State<'_, AgentService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<(), AppError> {
    if spec.worktree
        && let Some(project) = spec.cwd.take()
    {
        if !worktrees.exists(&spec.chat_id) {
            return Ok(());
        }
        let dir = worktrees.ensure(&spec.chat_id, Path::new(&project)).await?;
        spec.cwd = Some(dir.to_string_lossy().into_owned());
    }
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

/// `path` : emplacement choisi dans les réglages, repris ensuite par tous les chats de l'agent.
#[tauri::command]
pub async fn agent_probe(
    agent: AgentKind,
    path: Option<String>,
    agents: State<'_, AgentService>,
) -> Result<AgentStatus, AppError> {
    agents.set_path(agent, path)?;
    agents.status(agent).await
}

#[tauri::command]
pub async fn agent_update(
    agent: AgentKind,
    agents: State<'_, AgentService>,
) -> Result<String, AppError> {
    agents.update(agent).await
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
