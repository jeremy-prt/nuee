use tauri::WebviewWindow;

// Commande synchrone : Tauri l'exécute sur le thread principal, seul autorisé à toucher la NSWindow.
#[tauri::command]
pub fn window_set_blur(window: WebviewWindow, radius: u8) {
    #[cfg(target_os = "macos")]
    crate::window::set_blur(&window, radius.min(100));
    #[cfg(not(target_os = "macos"))]
    let _ = (window, radius);
}
