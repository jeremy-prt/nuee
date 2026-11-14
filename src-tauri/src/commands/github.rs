use std::path::Path;

use tauri::State;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::services::github::{GithubDeviceCode, GithubService, GithubStatus};
use crate::services::github_clone::{CloneProgress, CloneService, GithubRepo};

#[tauri::command]
pub async fn github_status(github: State<'_, GithubService>) -> Result<GithubStatus, AppError> {
    github.status().await
}

/// Le code part sur `on_code` dès que gh le donne ; la commande rend la main une fois le compte ajouté.
#[tauri::command]
pub async fn github_login(
    on_code: Channel<GithubDeviceCode>,
    github: State<'_, GithubService>,
) -> Result<(), AppError> {
    github
        .login(|code| {
            let _ = on_code.send(code);
        })
        .await
}

#[tauri::command]
pub async fn github_avatar(
    login: String,
    github: State<'_, GithubService>,
) -> Result<Option<String>, AppError> {
    Ok(github.avatar(&login).await)
}

#[tauri::command]
pub async fn github_switch(
    host: String,
    login: String,
    github: State<'_, GithubService>,
) -> Result<GithubStatus, AppError> {
    github.switch(&host, &login).await
}

#[tauri::command]
pub fn github_login_open(github: State<'_, GithubService>) -> Result<(), AppError> {
    github.open_login_page()
}

#[tauri::command]
pub fn github_login_cancel(github: State<'_, GithubService>) {
    github.cancel_login();
}

#[tauri::command]
pub async fn github_repos(clone: State<'_, CloneService>) -> Result<Vec<GithubRepo>, AppError> {
    clone.repos().await
}

/// La progression part sur `on_progress` ; rend le chemin du dossier créé.
#[tauri::command]
pub async fn github_clone(
    repo: String,
    parent: String,
    name: String,
    on_progress: Channel<CloneProgress>,
    clone: State<'_, CloneService>,
) -> Result<String, AppError> {
    let target = clone
        .run(&repo, Path::new(&parent), &name, |progress| {
            let _ = on_progress.send(progress);
        })
        .await?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn github_clone_cancel(clone: State<'_, CloneService>) {
    clone.cancel();
}
