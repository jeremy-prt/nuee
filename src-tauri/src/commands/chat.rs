use tauri::State;

use crate::error::AppError;
use crate::services::agent::AgentService;
use crate::services::chat::{ChatContent, ChatService, ChatSummary};

#[tauri::command]
pub async fn chat_list(chats: State<'_, ChatService>) -> Result<Vec<ChatSummary>, AppError> {
    chats.list()
}

#[tauri::command]
pub async fn chat_create(chat: ChatSummary, chats: State<'_, ChatService>) -> Result<(), AppError> {
    chats.create(&chat)
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

#[tauri::command]
pub async fn chat_delete(
    id: String,
    chats: State<'_, ChatService>,
    agents: State<'_, AgentService>,
) -> Result<(), AppError> {
    chats.delete(&id)?;
    agents.discard_scratch(&id);
    Ok(())
}
