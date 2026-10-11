use std::path::PathBuf;

use tauri::State;

use crate::error::AppError;
use crate::services::project::{ProjectIcons, ProjectService};

#[tauri::command]
pub async fn project_icon(
    id: String,
    path: String,
    projects: State<'_, ProjectService>,
) -> Result<ProjectIcons, AppError> {
    projects.icons(&id, &PathBuf::from(path))
}

/// Copie l'image choisie dans le dossier de l'app : le projet peut bouger, elle reste.
#[tauri::command]
pub async fn project_icon_set(
    id: String,
    source: String,
    projects: State<'_, ProjectService>,
) -> Result<String, AppError> {
    projects.set_icon(&id, &PathBuf::from(source))
}

#[tauri::command]
pub async fn project_icon_reset(
    id: String,
    projects: State<'_, ProjectService>,
) -> Result<(), AppError> {
    projects.reset_icon(&id)
}

#[tauri::command]
pub async fn project_reveal(path: String) -> Result<(), AppError> {
    let dir = std::fs::canonicalize(&path)
        .map_err(|_| AppError::InvalidInput(format!("dossier introuvable : {path}")))?;
    if !dir.is_dir() {
        return Err(AppError::InvalidInput(format!("pas un dossier : {path}")));
    }
    tauri_plugin_opener::reveal_item_in_dir(dir)
        .map_err(|error| std::io::Error::other(error.to_string()).into())
}
