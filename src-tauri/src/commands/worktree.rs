use std::path::PathBuf;

use tauri::State;

use crate::error::AppError;
use crate::services::agent::AgentService;
use crate::services::chat::ChatService;
use crate::services::worktree::{
    BranchList, ChangedFile, ChangedFiles, CommitDone, CommitPage, FileDiff, HeadInfo, Worktree,
    WorktreeChanges, WorktreeService, WorktreeSupport, canonical,
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

/// Dossier où une commande écrit (commit, push, annulation) : refusé pour une session absente de la base, ou dont le
/// propre worktree n'est pas encore créé (le dossier du projet n'est pas le sien).
fn write_dir(chats: &ChatService, chat_id: &str, project: &str) -> Result<PathBuf, AppError> {
    match chats.place(chat_id)? {
        None => Err(AppError::InvalidInput(format!(
            "session inconnue : {chat_id}"
        ))),
        Some((true, None)) => Err(AppError::InvalidInput(
            "le worktree de cette session n'est pas encore créé".into(),
        )),
        Some((_, path)) => Ok(PathBuf::from(path.unwrap_or_else(|| project.to_owned()))),
    }
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

/// Dernier commit, branche et dépôt distant du dossier de la session.
#[tauri::command]
pub async fn worktree_head(
    chat_id: String,
    path: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<HeadInfo, AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees.head(&PathBuf::from(path), &dir).await
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
    let dir = write_dir(&chats, &chat_id, &path)?;
    worktrees
        .revert_file(&PathBuf::from(path), &dir, &file)
        .await
}

/// Remet dans l'état du dernier commit les fichiers confirmés encore dans la liste ; rend les dépôts imbriqués laissés.
#[tauri::command]
pub async fn worktree_revert_all(
    chat_id: String,
    path: String,
    files: Vec<String>,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<Vec<String>, AppError> {
    let dir = write_dir(&chats, &chat_id, &path)?;
    worktrees
        .revert_all(&PathBuf::from(path), &dir, &files)
        .await
}

/// Commit de tous les changements du dossier de la session, fait par l'app sans agent.
#[tauri::command]
pub async fn worktree_commit(
    chat_id: String,
    path: String,
    message: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<CommitDone, AppError> {
    let dir = write_dir(&chats, &chat_id, &path)?;
    worktrees.commit(&PathBuf::from(path), &dir, &message).await
}

/// Push de la branche courante du dossier de la session, jamais forcé.
#[tauri::command]
pub async fn worktree_push(
    chat_id: String,
    path: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<HeadInfo, AppError> {
    let dir = write_dir(&chats, &chat_id, &path)?;
    worktrees.push(&PathBuf::from(path), &dir).await
}

/// Une page du journal de la branche courante.
#[tauri::command]
pub async fn worktree_log(
    chat_id: String,
    path: String,
    skip: u32,
    query: Option<String>,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<CommitPage, AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees
        .log(&PathBuf::from(path), &dir, skip, query.as_deref())
        .await
}

/// Fichiers changés par un commit.
#[tauri::command]
pub async fn worktree_commit_files(
    chat_id: String,
    path: String,
    sha: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<Vec<ChangedFile>, AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees
        .commit_files(&PathBuf::from(path), &dir, &sha)
        .await
}

/// Diff d'un fichier d'un commit.
#[tauri::command]
pub async fn worktree_commit_diff(
    chat_id: String,
    path: String,
    sha: String,
    file: String,
    worktrees: State<'_, WorktreeService>,
    chats: State<'_, ChatService>,
) -> Result<FileDiff, AppError> {
    let dir = session_dir(&chats, &chat_id, &path)?;
    worktrees
        .commit_diff(&PathBuf::from(path), &dir, &sha, &file)
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
