use std::path::PathBuf;

use tauri::State;

use crate::error::AppError;
use crate::services::agent::AgentService;
use crate::services::chat::ChatService;
use crate::services::worktree::{Worktree, WorktreeService, WorktreeSupport, canonical};

#[tauri::command]
pub async fn worktree_support(
    path: String,
    worktrees: State<'_, WorktreeService>,
) -> Result<WorktreeSupport, AppError> {
    Ok(worktrees.support(&PathBuf::from(path)).await)
}

#[tauri::command]
pub async fn worktree_list(
    path: String,
    worktrees: State<'_, WorktreeService>,
) -> Result<Vec<Worktree>, AppError> {
    worktrees.list(&PathBuf::from(path)).await
}

#[tauri::command]
pub async fn worktree_branches(
    path: String,
    worktrees: State<'_, WorktreeService>,
) -> Result<Vec<String>, AppError> {
    worktrees.branches(&PathBuf::from(path)).await
}

/// `existing` : la branche existe déjà ; sinon elle naît du HEAD du projet.
#[tauri::command]
pub async fn worktree_create(
    project_id: String,
    path: String,
    branch: String,
    existing: bool,
    worktrees: State<'_, WorktreeService>,
) -> Result<Worktree, AppError> {
    worktrees
        .create(&project_id, &PathBuf::from(path), &branch, existing)
        .await
}

/// Renvoie les chats qui y travaillaient : ils repartent dans le dossier du projet au prochain message.
#[tauri::command]
pub async fn worktree_remove(
    path: String,
    worktree: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
    agents: State<'_, AgentService>,
) -> Result<Vec<String>, AppError> {
    let worktree = canonical(&PathBuf::from(worktree));
    let users = chats.worktree_users(&worktree)?;
    if agents.busy(&users) {
        return Err(AppError::InvalidInput(
            "un agent travaille encore dans ce worktree".into(),
        ));
    }
    worktrees
        .remove(&PathBuf::from(path), &PathBuf::from(&worktree))
        .await?;
    for id in &users {
        agents.close(id);
    }
    chats.leave_worktree(&worktree)
}
