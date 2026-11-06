use std::path::{Path, PathBuf};

use tauri::State;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::services::agent::{AgentService, valid_dir};
use crate::services::terminal::{TerminalEvent, TerminalService};
use crate::services::worktree::{WorktreeService, canonical};

/// Ouvre un shell là où travaille l'agent du chat (même `Place` que `agent_send`). Son worktree pas encore
/// créé, le terminal part du dossier du projet.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn terminal_open(
    chat_id: String,
    cwd: Option<String>,
    worktree: bool,
    worktree_path: Option<String>,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
    terminals: State<'_, TerminalService>,
    agents: State<'_, AgentService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<u32, AppError> {
    let dir = work_dir(&chat_id, cwd, worktree, worktree_path, &agents, &worktrees).await?;
    terminals.open(&chat_id, &dir, (cols, rows), on_event)
}

async fn work_dir(
    chat_id: &str,
    cwd: Option<String>,
    worktree: bool,
    worktree_path: Option<String>,
    agents: &AgentService,
    worktrees: &WorktreeService,
) -> Result<PathBuf, AppError> {
    let Some(project) = cwd else {
        return agents.scratch_dir(chat_id);
    };
    if worktree {
        let own = canonical(&worktrees.own(chat_id)?);
        match worktree_path {
            Some(path) if path != own => {
                return worktrees.enter(Path::new(&path), Path::new(&project)).await;
            }
            _ if worktrees.exists(chat_id) => {
                return worktrees.ensure(chat_id, Path::new(&project), None).await;
            }
            _ => {}
        }
    }
    valid_dir(&project)
}

#[tauri::command]
pub fn terminal_write(
    id: u32,
    data: String,
    terminals: State<'_, TerminalService>,
) -> Result<(), AppError> {
    terminals.write(id, &data)
}

#[tauri::command]
pub fn terminal_resize(
    id: u32,
    cols: u16,
    rows: u16,
    terminals: State<'_, TerminalService>,
) -> Result<(), AppError> {
    terminals.resize(id, cols, rows)
}

#[tauri::command]
pub fn terminal_busy(id: u32, terminals: State<'_, TerminalService>) -> Option<String> {
    terminals.busy(id)
}

#[tauri::command]
pub fn terminal_close(id: u32, terminals: State<'_, TerminalService>) {
    terminals.close(id);
}

#[tauri::command]
pub fn terminal_close_chat(chat_id: String, terminals: State<'_, TerminalService>) {
    terminals.close_chat(&chat_id);
}
