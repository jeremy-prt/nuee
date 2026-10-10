//! Notifications du système et pastille du Dock. macOS passe par `UNUserNotificationCenter` : le plugin
//! officiel y utilise encore `NSUserNotification`, que macOS 27 refuse, et seule cette API autorise la
//! pastille et sait quel chat ouvrir au clic. Windows et Linux passent par le plugin.

use serde::Serialize;
use tauri::AppHandle;
use ts_rs::TS;

use crate::error::AppError;

/// Ce que le système laisse faire. `Unavailable` : rien à autoriser ici (sous `tauri dev` sur macOS).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
// Hors macOS, le plugin ne demande rien : seul `Granted` est construit, mais le type reste partagé avec le front.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub enum NotificationPermission {
    Granted,
    Denied,
    Undetermined,
    Unavailable,
}

/// Envoyé au front avec l'id du chat quand on clique une notification.
#[cfg(target_os = "macos")]
const CLICKED: &str = "notification-clicked";

/// Une notification par chat : la suivante remplace la précédente.
pub fn send(app: &AppHandle, chat_id: &str, title: &str, body: &str) {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        macos::send(chat_id, title, body);
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_notification::NotificationExt;
        let _ = chat_id;
        if let Err(error) = app.notification().builder().title(title).body(body).show() {
            eprintln!("notification : {error}");
        }
    }
}

/// Le chat a été vu : sa notification quitte le centre de notifications.
pub fn withdraw(chat_id: &str) {
    #[cfg(target_os = "macos")]
    macos::withdraw(chat_id);
    #[cfg(not(target_os = "macos"))]
    let _ = chat_id;
}

/// 0 retire la pastille.
pub fn badge(app: &AppHandle, count: u32) {
    #[cfg(target_os = "macos")]
    macos::badge(app.clone(), count);
    #[cfg(not(target_os = "macos"))]
    let _ = (app, count);
}

/// Windows et Linux n'ont pas de permission à demander : les notifications y passent toujours.
pub async fn permission() -> NotificationPermission {
    #[cfg(target_os = "macos")]
    return macos::permission().await;
    #[cfg(not(target_os = "macos"))]
    NotificationPermission::Granted
}

/// La page de l'app dans Réglages Système > Notifications, pour lever un refus.
pub fn open_settings(app: &AppHandle) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        let url = format!(
            "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id={}",
            app.config().identifier
        );
        std::process::Command::new("open").arg(url).spawn()?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    Ok(())
}

#[cfg(target_os = "macos")]
pub use macos::install_delegate;

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::RefCell;
    use std::ptr::NonNull;
    use std::sync::{Mutex, mpsc};
    use std::time::Duration;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
    use objc2::{AnyThread, DefinedClass, MainThreadMarker, define_class, msg_send};
    use objc2_foundation::{NSArray, NSError, NSString};
    use objc2_user_notifications::{
        UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent,
        UNNotificationRequest, UNNotificationResponse, UNNotificationSettings,
        UNUserNotificationCenter, UNUserNotificationCenterDelegate,
    };

    use super::NotificationPermission;
    use tauri::{AppHandle, Emitter, Manager};

    /// Hors d'un .app (`tauri dev`), `currentNotificationCenter` lève une exception Objective-C qui ferait
    /// planter l'app : notifications et pastille ne marchent qu'une fois l'app empaquetée.
    fn available() -> bool {
        crate::utils::macos::in_app_bundle()
    }

    /// La première demande affiche la question de macOS ; les suivantes répondent tout de suite.
    /// La pastille en dépend aussi : sans l'option `Badge`, macOS ignore celle du Dock.
    fn when_authorized(then: impl FnOnce() + Send + 'static) {
        if !available() {
            return;
        }
        let then = Mutex::new(Some(then));
        let handler = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
            let next = then.lock().ok().and_then(|mut slot| slot.take());
            if let (true, Some(next)) = (granted.as_bool(), next) {
                next();
            }
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .requestAuthorizationWithOptions_completionHandler(
                UNAuthorizationOptions::Alert
                    | UNAuthorizationOptions::Sound
                    | UNAuthorizationOptions::Badge,
                &handler,
            );
    }

    /// Les objets Objective-C restent ici : seul le canal traverse l'`await`, la commande reste `Send`.
    fn query_permission() -> mpsc::Receiver<NotificationPermission> {
        let (tx, rx) = mpsc::channel();
        let handler = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
            let status = unsafe { settings.as_ref() }.authorizationStatus();
            let _ = tx.send(match status {
                UNAuthorizationStatus::NotDetermined => NotificationPermission::Undetermined,
                UNAuthorizationStatus::Denied => NotificationPermission::Denied,
                _ => NotificationPermission::Granted,
            });
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .getNotificationSettingsWithCompletionHandler(&handler);
        rx
    }

    pub async fn permission() -> NotificationPermission {
        if !available() {
            return NotificationPermission::Unavailable;
        }
        let rx = query_permission();
        tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(3)).ok())
            .await
            .ok()
            .flatten()
            .unwrap_or(NotificationPermission::Undetermined)
    }

    pub fn send(chat_id: &str, title: &str, body: &str) {
        let (chat_id, title, body) = (chat_id.to_owned(), title.to_owned(), body.to_owned());
        when_authorized(move || {
            let content = UNMutableNotificationContent::new();
            content.setTitle(&NSString::from_str(&title));
            content.setBody(&NSString::from_str(&body));
            let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
                &NSString::from_str(&chat_id),
                &content,
                None,
            );
            UNUserNotificationCenter::currentNotificationCenter()
                .addNotificationRequest_withCompletionHandler(&request, None);
        });
    }

    pub fn withdraw(chat_id: &str) {
        if !available() {
            return;
        }
        let identifiers = NSArray::from_retained_slice(&[NSString::from_str(chat_id)]);
        UNUserNotificationCenter::currentNotificationCenter()
            .removeDeliveredNotificationsWithIdentifiers(&identifiers);
    }

    /// Retirer la pastille ne demande rien : la question de macOS n'arrive qu'au premier chat non vu.
    pub fn badge(app: AppHandle, count: u32) {
        let apply = move || {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_badge_count((count > 0).then_some(i64::from(count)));
            }
        };
        if count == 0 {
            apply()
        } else {
            when_authorized(apply)
        }
    }

    struct Ivars {
        app: AppHandle,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "NueeNotificationDelegate"]
        #[ivars = Ivars]
        struct Delegate;

        unsafe impl NSObjectProtocol for Delegate {}

        unsafe impl UNUserNotificationCenterDelegate for Delegate {
            #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
            fn did_receive(
                &self,
                _center: &UNUserNotificationCenter,
                response: &UNNotificationResponse,
                completion: &block2::DynBlock<dyn Fn()>,
            ) {
                let chat_id = response.notification().request().identifier().to_string();
                let app = &self.ivars().app;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
                let _ = app.emit(super::CLICKED, chat_id);
                completion.call(());
            }
        }
    );

    thread_local! {
        // Le centre ne garde qu'une référence faible vers son délégué.
        static DELEGATE: RefCell<Option<Retained<Delegate>>> = const { RefCell::new(None) };
    }

    /// Sur le thread principal, une fois l'app prête.
    pub fn install_delegate(app: &AppHandle) {
        if !available() || MainThreadMarker::new().is_none() {
            return;
        }
        let delegate = Delegate::alloc().set_ivars(Ivars { app: app.clone() });
        let delegate: Retained<Delegate> = unsafe { msg_send![super(delegate), init] };
        UNUserNotificationCenter::currentNotificationCenter()
            .setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        DELEGATE.with(|slot| *slot.borrow_mut() = Some(delegate));
    }
}
