use tauri::AppHandle;

use crate::error::AppError;
use crate::services::notification::{self, NotificationPermission};

#[tauri::command]
pub fn notification_send(app: AppHandle, chat_id: String, title: String, body: String) {
    notification::send(&app, &chat_id, &title, &body);
}

#[tauri::command]
pub fn notification_withdraw(chat_id: String) {
    notification::withdraw(&chat_id);
}

#[tauri::command]
pub fn notification_badge(app: AppHandle, count: u32) {
    notification::badge(&app, count);
}

#[tauri::command]
pub async fn notification_permission() -> NotificationPermission {
    notification::permission().await
}

#[tauri::command]
pub fn notification_open_settings(app: AppHandle) -> Result<(), AppError> {
    notification::open_settings(&app)
}
