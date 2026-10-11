use tauri::State;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::services::github::{GithubDeviceCode, GithubService, GithubStatus};

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
pub fn github_login_open(github: State<'_, GithubService>) -> Result<(), AppError> {
    github.open_login_page()
}

#[tauri::command]
pub fn github_login_cancel(github: State<'_, GithubService>) {
    github.cancel_login();
}
