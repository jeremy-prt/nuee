use tauri::State;

use crate::error::AppError;
use crate::services::attachment::{Attachment, AttachmentService};

/// Fichier collé, en base64 : il n'a pas de chemin sur disque.
#[tauri::command]
pub async fn attachment_save(
    chat_id: String,
    name: String,
    base64: String,
    attachments: State<'_, AttachmentService>,
) -> Result<Attachment, AppError> {
    attachments.save(&chat_id, &name, &base64)
}

/// Fichiers glissés depuis le Finder ou choisis dans la fenêtre d'ouverture.
#[tauri::command]
pub async fn attachment_import(
    chat_id: String,
    paths: Vec<String>,
    attachments: State<'_, AttachmentService>,
) -> Result<Vec<Attachment>, AppError> {
    attachments.import(&chat_id, &paths)
}

/// Capture d'une zone de l'écran, jointe au message ; rien si elle est annulée.
#[tauri::command]
pub async fn attachment_capture(
    chat_id: String,
    attachments: State<'_, AttachmentService>,
) -> Result<Option<Attachment>, AppError> {
    attachments.capture(&chat_id).await
}
