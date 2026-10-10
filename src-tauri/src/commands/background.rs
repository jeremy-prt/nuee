use tauri::State;

use crate::error::AppError;
use crate::services::background::BackgroundService;

/// Image choisie ou glissée : renvoie le chemin de sa copie, affichable par la webview.
#[tauri::command]
pub async fn background_import(
    path: String,
    backgrounds: State<'_, BackgroundService>,
) -> Result<String, AppError> {
    backgrounds.import(&path)
}

#[tauri::command]
pub async fn background_remove(backgrounds: State<'_, BackgroundService>) -> Result<(), AppError> {
    backgrounds.remove()
}
