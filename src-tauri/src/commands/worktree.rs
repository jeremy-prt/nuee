use std::path::PathBuf;

use tauri::State;

use crate::error::AppError;
use crate::services::worktree::{WorktreeService, WorktreeSupport};

#[tauri::command]
pub async fn worktree_support(
    path: String,
    worktrees: State<'_, WorktreeService>,
) -> Result<WorktreeSupport, AppError> {
    Ok(worktrees.support(&PathBuf::from(path)).await)
}
