use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};

use crate::error::AppError;
use crate::services::agent::AgentService;
use crate::services::cleanup::{CleanupGroup, CleanupReport, CleanupScan, CleanupService, Roots};
use crate::services::server::ServerService;
use crate::services::terminal::TerminalService;

pub fn roots(app: &AppHandle) -> Roots {
    Roots {
        app: std::process::id(),
        others: Default::default(),
        agents: app.state::<AgentService>().pids().into_iter().collect(),
        servers: app.state::<ServerService>().pids().into_iter().collect(),
        terminals: app.state::<TerminalService>().pids().into_iter().collect(),
    }
}

/// Les dossiers de projet viennent du front ; ceux de Nuée (sessions sans projet, worktrees) sont ajoutés ici.
fn folders(app: &AppHandle, projects: Vec<String>) -> Result<Vec<PathBuf>, AppError> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    let mut folders: Vec<PathBuf> = projects
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| path.is_absolute() && path.components().count() > 2)
        .collect();
    folders.extend([data.join("scratch"), data.join("worktrees")]);
    Ok(folders)
}

#[tauri::command]
pub async fn cleanup_scan(
    projects: Vec<String>,
    app: AppHandle,
    cleanup: State<'_, CleanupService>,
) -> Result<CleanupScan, AppError> {
    let folders = folders(&app, projects)?;
    Ok(cleanup.scan(&mut roots(&app), &folders))
}

/// Le front n'envoie que des groupes : Rust choisit lui-même les process, d'après un relevé neuf.
#[tauri::command]
pub async fn cleanup_run(
    groups: Vec<CleanupGroup>,
    projects: Vec<String>,
    app: AppHandle,
    cleanup: State<'_, CleanupService>,
) -> Result<CleanupReport, AppError> {
    let folders = folders(&app, projects)?;
    let targets = cleanup.targets(&mut roots(&app), &folders, &groups);
    if groups.contains(&CleanupGroup::Agents) {
        app.state::<AgentService>().retire_idle();
    }
    if groups.contains(&CleanupGroup::Servers) {
        app.state::<ServerService>().stop_everything();
    }
    Ok(cleanup.stop(&targets).await)
}

#[tauri::command]
pub async fn cleanup_force(cleanup: State<'_, CleanupService>) -> Result<CleanupReport, AppError> {
    Ok(cleanup.force().await)
}
