use tauri::State;

use crate::error::AppError;
use crate::services::autostart::AutostartService;

#[tauri::command]
pub fn autostart_enabled(autostart: State<'_, AutostartService>) -> Result<Option<bool>, AppError> {
    autostart.enabled()
}

#[tauri::command]
pub fn autostart_set(on: bool, autostart: State<'_, AutostartService>) -> Result<(), AppError> {
    autostart.set(on)
}
