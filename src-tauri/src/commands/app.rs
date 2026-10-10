use tauri::{AppHandle, Emitter, Manager};

use crate::services::agent::AgentService;

/// Envoyé au front, avec le nombre de chats au travail, quand quitter couperait un agent.
const QUIT_REQUESTED: &str = "app-quit-requested";

/// ⌘Q ou fermeture de la fenêtre. Sans agent au travail, l'app quitte tout de suite ; sinon le front
/// demande confirmation et rappelle `app_quit`. Quitter depuis le Dock passe à côté : tao ne relaie
/// pas `applicationShouldTerminate`.
pub fn request_quit(app: &AppHandle) {
    let busy = app.state::<AgentService>().busy_count();
    if busy == 0 {
        return app.exit(0);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit(QUIT_REQUESTED, busy);
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}
