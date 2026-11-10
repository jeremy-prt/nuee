mod commands;
mod error;
#[cfg(target_os = "macos")]
mod menu;
mod services;
mod utils;
mod window;

use tauri::webview::PageLoadEvent;
use tauri::{Manager, RunEvent, WindowEvent};

use crate::services::agent::AgentService;
use crate::services::attachment::AttachmentService;
use crate::services::autostart::AutostartService;
use crate::services::background::BackgroundService;
use crate::services::browser::BrowserService;
use crate::services::chat::ChatService;
use crate::services::github::GithubService;
use crate::services::power::PowerService;
use crate::services::project::ProjectService;
use crate::services::server::ServerService;
use crate::services::terminal::TerminalService;
use crate::services::worktree::WorktreeService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(not(target_os = "macos"))]
    let builder = builder.plugin(tauri_plugin_notification::init());
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu::build).on_menu_event(|app, event| {
        if event.id() == menu::QUIT {
            commands::app::request_quit(app);
        }
    });

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window::SAVED_STATE)
                .skip_initial_state("main")
                .build(),
        )
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                commands::app::request_quit(window.app_handle());
            }
        })
        // Page rechargée : ses terminaux n'ont plus d'onglet pour les montrer ni les fermer.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started {
                webview.state::<TerminalService>().close_all();
            }
        })
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                // Flou « Moyen » dès l'ouverture : le réglage choisi n'arrive qu'une fois la page chargée.
                #[cfg(target_os = "macos")]
                window::set_blur(&main, 48);
                window::restore_or_fit(&main)?;
            }
            let data = app.path().app_data_dir()?;
            let chats = ChatService::open(&data.join("nuee.db"))?;
            if let Err(error) = chats.adopt_worktrees(&data.join("worktrees")) {
                eprintln!("worktrees des chats : {error}");
            }
            app.manage(chats);
            let agents = AgentService::new(data.join("scratch"));
            let handle = app.handle().clone();
            agents.set_tools(std::sync::Arc::new(move |chat_id, cwd, message| {
                let app = handle.clone();
                Box::pin(async move {
                    let caller = services::browser::tools::Caller { chat_id, cwd };
                    services::browser::tools::handle(&app, &caller, message).await
                })
            }));
            app.manage(agents);
            app.manage(BrowserService::default());
            app.manage(services::operator::OperatorService::default());
            // Chemin repris par le scope `assetProtocol` de tauri.conf.json : les aperçus n'existent que là.
            app.manage(AttachmentService::new(data.join("attachments")));
            // Même contrainte que les pièces jointes : ce dossier est dans le scope `assetProtocol`.
            app.manage(BackgroundService::new(data.join("backgrounds")));
            app.manage(ProjectService::new(data.join("project-icons")));
            app.manage(WorktreeService::new(data.join("worktrees")));
            app.manage(PowerService::default());
            app.manage(GithubService::default());
            app.manage(TerminalService::default());
            app.manage(ServerService::default());
            app.manage(services::files::FilesService::default());
            app.manage(AutostartService::new(&app.package_info().name));
            // Le login shell met parfois une seconde à répondre : autant que ce ne soit pas au premier message.
            std::thread::spawn(utils::shell_env::search_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::system_locales,
            commands::system::system_machine_name,
            commands::app::app_quit,
            commands::agent::agent_send,
            commands::agent::agent_warm,
            commands::agent::agent_steer,
            commands::agent::agent_stop,
            commands::agent::agent_stop_task,
            commands::agent::agent_task_output,
            commands::agent::agent_rewind,
            commands::agent::agent_approve,
            commands::agent::agent_answer,
            commands::agent::agent_catalog,
            commands::agent::agent_probe,
            commands::agent::agent_update,
            commands::agent::agent_login,
            commands::agent::agent_login_code,
            commands::agent::agent_login_open,
            commands::agent::agent_login_cancel,
            commands::attachment::attachment_save,
            commands::attachment::attachment_import,
            commands::autostart::autostart_enabled,
            commands::autostart::autostart_set,
            commands::background::background_import,
            commands::background::background_remove,
            commands::browser::browser_watch,
            commands::browser::browser_open,
            commands::browser::browser_close,
            commands::browser::browser_close_chat,
            commands::browser::browser_select,
            commands::browser::browser_navigate,
            commands::browser::browser_history,
            commands::browser::browser_place,
            commands::browser::browser_emulate,
            commands::browser::browser_snapshot,
            commands::browser::browser_clear_data,
            commands::chat::chat_list,
            commands::chat::chat_create,
            commands::chat::chat_content,
            commands::chat::chat_save,
            commands::chat::chat_title,
            commands::chat::chat_rename,
            commands::chat::chat_set_pinned,
            commands::chat::chat_set_worktree,
            commands::chat::chat_set_archived,
            commands::chat::chat_archived_texts,
            commands::chat::chat_delete,
            commands::files::files_list,
            commands::files::files_read,
            commands::files::files_stat,
            commands::files::files_write,
            commands::files::files_editors,
            commands::files::files_open_editor,
            commands::files::files_reveal,
            commands::files::files_create,
            commands::files::files_rename,
            commands::files::files_trash,
            commands::files::files_paste,
            commands::files::files_watch,
            commands::files::files_unwatch,
            commands::files::files_search,
            commands::files::files_dir,
            commands::files::files_marks,
            commands::github::github_status,
            commands::github::github_login,
            commands::github::github_avatar,
            commands::github::github_switch,
            commands::github::github_login_open,
            commands::github::github_login_cancel,
            commands::install::install_open,
            commands::mcp::mcp_status,
            commands::mcp::mcp_check,
            commands::mcp::mcp_login,
            commands::mcp::mcp_cancel_login,
            commands::mcp::mcp_open_connectors,
            commands::mcp::mcp_set_enabled,
            commands::notification::notification_send,
            commands::notification::notification_withdraw,
            commands::notification::notification_badge,
            commands::notification::notification_permission,
            commands::notification::notification_open_settings,
            commands::power::power_keep_awake,
            commands::project::project_icon,
            commands::project::project_icon_set,
            commands::project::project_icon_reset,
            commands::project::project_files,
            commands::project::project_reveal,
            commands::project::project_reveal_scratch,
            commands::server::server_list,
            commands::server::server_start,
            commands::server::server_stop,
            commands::server::server_stop_all,
            commands::server::server_watch,
            commands::skills::skills_list,
            commands::skills::skills_read,
            commands::skills::skills_write,
            commands::skills::skills_set_mode,
            commands::skills::skills_trash,
            commands::skills::skills_reveal,
            commands::terminal::terminal_open,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_busy,
            commands::terminal::terminal_close,
            commands::terminal::terminal_close_chat,
            commands::operator::operator_reply,
            commands::window::window_set_blur,
            commands::worktree::worktree_support,
            commands::worktree::worktree_list,
            commands::worktree::worktree_branches,
            commands::worktree::worktree_checkout,
            commands::worktree::worktree_refs,
            commands::worktree::worktree_changes,
            commands::worktree::worktree_changed_files,
            commands::worktree::worktree_file_diff,
            commands::worktree::worktree_create,
            commands::worktree::worktree_remove,
        ])
        .build(tauri::generate_context!())
        .expect("échec au lancement de l'application Tauri")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Ready => services::notification::install_delegate(app),
            RunEvent::Exit => {
                app.state::<AgentService>().stop_all();
                app.state::<AgentService>().cancel_login();
                app.state::<GithubService>().cancel_login();
                app.state::<TerminalService>().close_all();
                app.state::<ServerService>().shutdown();
            }
            _ => {}
        });
}
