use tauri::State;

use crate::error::AppError;
use crate::services::agent::{AgentKind, AgentService};
use crate::services::attachment::AttachmentService;
use crate::services::chat::{ChatContent, ChatService, ChatSummary, ChatText};
use crate::services::worktree::WorktreeService;

#[tauri::command]
pub async fn chat_list(chats: State<'_, ChatService>) -> Result<Vec<ChatSummary>, AppError> {
    chats.list()
}

#[tauri::command]
pub async fn chat_create(chat: ChatSummary, chats: State<'_, ChatService>) -> Result<(), AppError> {
    chats.create(&chat)
}

/// Résume le premier message en titre ; si l'agent n'y arrive pas, `seed` (début du message) reste.
#[tauri::command]
pub async fn chat_title(
    id: String,
    agent: AgentKind,
    prompt: String,
    seed: String,
    chats: State<'_, ChatService>,
    agents: State<'_, AgentService>,
) -> Result<String, AppError> {
    let title = match prompt.trim() {
        "" => None,
        prompt => agents.title(agent, prompt).await,
    }
    .unwrap_or(seed);
    chats.set_title(&id, &title)?;
    Ok(title)
}

/// `None` tant que le chat n'a jamais été enregistré.
#[tauri::command]
pub async fn chat_content(
    id: String,
    chats: State<'_, ChatService>,
) -> Result<Option<ChatContent>, AppError> {
    chats.content(&id)
}

#[tauri::command]
pub async fn chat_save(
    id: String,
    content: ChatContent,
    chats: State<'_, ChatService>,
) -> Result<(), AppError> {
    chats.save(&id, &content)
}

/// Avant le premier message seulement : ensuite l'agent travaille déjà dans son dossier.
/// `path` : worktree existant rejoint par le chat ; `None` avec `worktree` : le sien, créé au premier message.
#[tauri::command]
pub async fn chat_set_worktree(
    id: String,
    worktree: bool,
    path: Option<String>,
    chats: State<'_, ChatService>,
) -> Result<(), AppError> {
    chats.set_worktree(&id, worktree, path.as_deref())
}

#[tauri::command]
pub async fn chat_set_archived(
    ids: Vec<String>,
    archived: bool,
    chats: State<'_, ChatService>,
) -> Result<Option<i64>, AppError> {
    chats.set_archived(&ids, archived)
}

#[tauri::command]
pub async fn chat_archived_texts(chats: State<'_, ChatService>) -> Result<Vec<ChatText>, AppError> {
    chats.archived_texts()
}

/// Renvoie le chemin du worktree du chat s'il a été gardé (changements non commités). Un worktree que
/// d'autres chats utilisent encore reste sans rien dire.
#[tauri::command]
pub async fn chat_delete(
    id: String,
    chats: State<'_, ChatService>,
    agents: State<'_, AgentService>,
    attachments: State<'_, AttachmentService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<Option<String>, AppError> {
    let path = chats.worktree_path(&id)?;
    chats.delete(&id)?;
    agents.close(&id);
    agents.discard_scratch(&id);
    attachments.discard(&id);
    if let Some(path) = path
        && !chats.worktree_users(&path)?.is_empty()
    {
        return Ok(None);
    }
    // Ne touche qu'au dossier propre au chat : un worktree rejoint n'est retiré que depuis sa liste.
    Ok(worktrees.discard(&id).await)
}
