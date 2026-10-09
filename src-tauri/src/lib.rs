mod commands;
mod error;
#[cfg(target_os = "macos")]
mod menu;
mod services;
mod utils;
mod window;

use tauri::{Manager, RunEvent};

use crate::services::agent::AgentService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu::build);

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AgentService::default())
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                window::fit_to_screen(&main)?;
            }
            // Le login shell met parfois une seconde à répondre : autant que ce ne soit pas au premier message.
            std::thread::spawn(utils::shell_env::search_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::system_locales,
            commands::agent::agent_send,
            commands::agent::agent_stop,
        ])
        .build(tauri::generate_context!())
        .expect("échec au lancement de l'application Tauri")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<AgentService>().stop_all();
            }
        });
}
