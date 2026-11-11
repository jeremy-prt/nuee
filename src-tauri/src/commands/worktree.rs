use std::path::PathBuf;

use tauri::State;

use crate::error::AppError;
use crate::services::agent::AgentService;
use crate::services::chat::ChatService;
use crate::services::worktree::{
    BranchList, ChangedFiles, FileDiff, Worktree, WorktreeChanges, WorktreeService,
    WorktreeSupport, canonical,
};

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

#[tauri::command]
pub async fn worktree_checkout(
    path: String,
    branch: String,
    worktrees: State<'_, WorktreeService>,
) -> Result<(), AppError> {
    worktrees.checkout(&PathBuf::from(path), &branch).await
}

/// Dossier de la session : son worktree s'il en a un en base, sinon celui du projet.
fn session_dir(chats: &ChatService, chat_id: &str, project: &str) -> Result<PathBuf, AppError> {
    Ok(PathBuf::from(
        chats
            .worktree_path(chat_id)?
            .unwrap_or_else(|| project.to_owned()),
    ))
}

/// Branches vues depuis le dossier de la session.
#[tauri::command]
pub async fn worktree_refs(
    chat_id: String,
    path: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<BranchList, AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees.refs(&PathBuf::from(path), &dir).await
}

/// Changements non commités du dossier de la session.
#[tauri::command]
pub async fn worktree_changes(
    chat_id: String,
    path: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<WorktreeChanges, AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees.changes(&PathBuf::from(path), &dir).await
}

/// Fichiers non commités du dossier de la session ; `None` hors git.
#[tauri::command]
pub async fn worktree_changed_files(
    chat_id: String,
    path: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<Option<ChangedFiles>, AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees.changed_files(&PathBuf::from(path), &dir).await
}

/// Diff d'un fichier de la liste précédente, chemin relatif à la racine du dépôt.
#[tauri::command]
pub async fn worktree_file_diff(
    chat_id: String,
    path: String,
    file: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<FileDiff, AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees.file_diff(&PathBuf::from(path), &dir, &file).await
}

/// Des commits du dossier de la session restent à pousser.
#[tauri::command]
pub async fn worktree_unpushed(
    chat_id: String,
    path: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<bool, AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees.unpushed(&PathBuf::from(path), &dir).await
}

/// Remet un fichier de la liste des changements dans l'état du dernier commit.
#[tauri::command]
pub async fn worktree_revert_file(
    chat_id: String,
    path: String,
    file: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<(), AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees
        .revert_file(&PathBuf::from(path), &dir, &file)
        .await
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
