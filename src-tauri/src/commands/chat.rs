use tauri::State;

use crate::error::AppError;
use crate::services::agent::{AgentKind, AgentService};
use crate::services::attachment::AttachmentService;
use crate::services::chat::{ChatContent, ChatService, ChatSummary};
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
#[tauri::command]
pub async fn chat_set_worktree(
    id: String,
    worktree: bool,
    chats: State<'_, ChatService>,
) -> Result<(), AppError> {
    chats.set_worktree(&id, worktree)
}

/// Renvoie le chemin du worktree du chat s'il a été gardé (changements non commités).
#[tauri::command]
pub async fn chat_delete(
    id: String,
    chats: State<'_, ChatService>,
    agents: State<'_, AgentService>,
    attachments: State<'_, AttachmentService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<Option<String>, AppError> {
    chats.delete(&id)?;
    agents.close(&id);
    agents.discard_scratch(&id);
    attachments.discard(&id);
    Ok(worktrees.discard(&id).await)
}
