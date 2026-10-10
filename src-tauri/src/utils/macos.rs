use objc2_foundation::NSBundle;

/// `tauri dev` lance un binaire nu, hors de tout .app : les API qui s'adressent à l'app installée
/// (notifications, ouverture de session) n'y ont rien à quoi se rattacher.
pub fn in_app_bundle() -> bool {
    NSBundle::mainBundle()
        .bundlePath()
        .to_string()
        .ends_with(".app")
}
