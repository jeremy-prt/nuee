// La webview ne connaît pas la vraie langue du système (WebView2 renvoie toujours en-US).
#[tauri::command]
pub fn system_locales() -> Vec<String> {
    sys_locale::get_locales().collect()
}
