use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::services::browser::{
    BrowserEvent, BrowserService, BrowserTab, ColorScheme, History, PaneRect, Viewport,
};

#[tauri::command]
pub fn browser_watch(
    on_event: Channel<BrowserEvent>,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Vec<BrowserTab> {
    browser.watch(&app, on_event)
}

/// `project` : dossier du projet de la session, qui choisit le stockage (cookies) de la page.
#[tauri::command]
pub async fn browser_open(
    chat_id: String,
    project: Option<String>,
    url: String,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Result<BrowserTab, AppError> {
    browser.bind(&chat_id, project.as_deref());
    browser.open(&app, &chat_id, &url).await
}

#[tauri::command]
pub async fn browser_close(
    id: String,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Result<(), AppError> {
    browser.close(&app, &id).await
}

#[tauri::command]
pub async fn browser_close_chat(
    chat_id: String,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Result<(), AppError> {
    browser.close_chat(&app, &chat_id).await;
    Ok(())
}

#[tauri::command]
pub fn browser_select(chat_id: String, id: String, browser: State<'_, BrowserService>) {
    browser.select(&chat_id, &id);
}

#[tauri::command]
pub async fn browser_navigate(
    id: String,
    url: String,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Result<(), AppError> {
    browser.navigate(&app, &id, &url).await
}

#[tauri::command]
pub async fn browser_history(
    id: String,
    step: String,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Result<(), AppError> {
    let step = match step.as_str() {
        "back" => History::Back,
        "forward" => History::Forward,
        "reload" => History::Reload,
        "stop" => History::Stop,
        other => return Err(AppError::InvalidInput(format!("étape inconnue : {other}"))),
    };
    browser.history(&app, &id, step).await
}

/// `rect` : zone du volet en points de la fenêtre ; `None` : la page quitte l'écran.
#[tauri::command]
pub async fn browser_place(
    id: String,
    rect: Option<PaneRect>,
    order: u64,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Result<(), AppError> {
    browser.place(&app, &id, rect, order).await
}

#[tauri::command]
pub async fn browser_emulate(
    id: String,
    viewport: Option<Viewport>,
    color_scheme: Option<ColorScheme>,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Result<(), AppError> {
    let mobile = viewport.is_some_and(|viewport| viewport.width < 500);
    browser
        .emulate(&app, &id, viewport, Some(color_scheme), mobile)
        .await
}

/// Image de la page en `data:` : posée à sa place pendant qu'un menu de Nuée passe par-dessus.
#[tauri::command]
pub async fn browser_snapshot(
    id: String,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Result<String, AppError> {
    use base64::Engine;
    let shot = browser.screenshot(&app, &id, None, 2.0, true).await?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(shot.data)
    ))
}

#[tauri::command]
pub async fn browser_clear_data(
    chat_id: String,
    project: Option<String>,
    app: AppHandle,
    browser: State<'_, BrowserService>,
) -> Result<(), AppError> {
    browser.bind(&chat_id, project.as_deref());
    browser.clear_data(&app, &chat_id).await
}
