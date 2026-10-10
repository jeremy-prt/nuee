mod commands;
mod error;
#[cfg(target_os = "macos")]
mod menu;
mod services;
mod utils;
mod window;

use tauri::{Manager, RunEvent};

use crate::services::agent::AgentService;
use crate::services::attachment::AttachmentService;
use crate::services::chat::ChatService;

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
            let data = app.path().app_data_dir()?;
            app.manage(ChatService::open(&data.join("nuee.db"))?);
            app.manage(AgentService::new(data.join("scratch")));
            // Chemin repris par le scope `assetProtocol` de tauri.conf.json : les aperçus n'existent que là.
            app.manage(AttachmentService::new(data.join("attachments")));
            // Le login shell met parfois une seconde à répondre : autant que ce ne soit pas au premier message.
            std::thread::spawn(utils::shell_env::search_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::system_locales,
            commands::agent::agent_send,
            commands::agent::agent_warm,
            commands::agent::agent_stop,
            commands::agent::agent_approve,
            commands::agent::agent_catalog,
            commands::attachment::attachment_save,
            commands::attachment::attachment_import,
            commands::chat::chat_list,
            commands::chat::chat_create,
            commands::chat::chat_content,
            commands::chat::chat_save,
            commands::chat::chat_title,
            commands::chat::chat_delete,
        ])
        .build(tauri::generate_context!())
        .expect("échec au lancement de l'application Tauri")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<AgentService>().stop_all();
            }
        });
}
