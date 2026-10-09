mod commands;
#[cfg(target_os = "macos")]
mod menu;
mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu::build);

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                window::fit_to_screen(&main)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::system::system_locales])
        .run(tauri::generate_context!())
        .expect("échec au lancement de l'application Tauri");
}
