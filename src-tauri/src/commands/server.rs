use tauri::State;
use tauri::ipc::Channel;

use crate::commands::terminal::work_dir;
use crate::error::AppError;
use crate::services::agent::AgentService;
use crate::services::server::{ServerEvent, ServerList, ServerLogs, ServerService, ServerStart};
use crate::services::worktree::WorktreeService;

/// Les serveurs de `.claude/launch.json` dans le dossier où travaille l'agent du chat (même `Place` que le terminal).
#[tauri::command]
pub async fn server_list(
    chat_id: String,
    cwd: Option<String>,
    worktree: bool,
    worktree_path: Option<String>,
    servers: State<'_, ServerService>,
    agents: State<'_, AgentService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<ServerList, AppError> {
    let root = work_dir(&chat_id, cwd, worktree, worktree_path, &agents, &worktrees).await?;
    Ok(servers.list(&root))
}

/// Le front ne donne que le nom : la commande vient du fichier du dossier, relu ici.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn server_start(
    chat_id: String,
    cwd: Option<String>,
    worktree: bool,
    worktree_path: Option<String>,
    name: String,
    servers: State<'_, ServerService>,
    agents: State<'_, AgentService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<ServerStart, AppError> {
    let root = work_dir(&chat_id, cwd, worktree, worktree_path, &agents, &worktrees).await?;
    servers.start(&root, &name)
}

#[tauri::command]
pub fn server_stop(root: String, name: String, servers: State<'_, ServerService>) {
    servers.stop(&root, &name);
}

#[tauri::command]
pub fn server_stop_all(root: String, servers: State<'_, ServerService>) {
    servers.stop_root(&root);
}

#[tauri::command]
pub fn server_watch(
    on_event: Channel<ServerEvent>,
    servers: State<'_, ServerService>,
) -> Vec<ServerLogs> {
    servers.watch(on_event)
}
