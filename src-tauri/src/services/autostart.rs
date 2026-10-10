use auto_launch::{AutoLaunch, AutoLaunchBuilder};

use crate::error::AppError;

/// Lancement à l'ouverture de session. Sur macOS, SMAppService range l'app dans Réglages Système >
/// Général > Ouverture, avec les autres apps ; un LaunchAgent (le plugin officiel) la classerait
/// parmi les tâches de fond.
pub struct AutostartService {
    launcher: Option<AutoLaunch>,
}

impl AutostartService {
    pub fn new(app_name: &str) -> Self {
        Self {
            launcher: launcher(app_name),
        }
    }

    /// `None` : indisponible ici (sous `tauri dev` sur macOS, ou système trop ancien).
    pub fn enabled(&self) -> Result<Option<bool>, AppError> {
        let Some(launcher) = &self.launcher else {
            return Ok(None);
        };
        launcher.is_enabled().map(Some).map_err(system_error)
    }

    pub fn set(&self, on: bool) -> Result<(), AppError> {
        let Some(launcher) = &self.launcher else {
            return Err(AppError::InvalidInput(
                "lancement au démarrage indisponible".into(),
            ));
        };
        if on {
            launcher.enable()
        } else {
            launcher.disable()
        }
        .map_err(system_error)
    }
}

fn system_error(error: auto_launch::Error) -> AppError {
    AppError::Io(std::io::Error::other(error.to_string()))
}

/// SMAppService inscrit l'app en cours d'exécution : hors d'un .app, il n'y a rien à inscrire.
#[cfg(target_os = "macos")]
fn launcher(app_name: &str) -> Option<AutoLaunch> {
    if !crate::utils::macos::in_app_bundle() {
        return None;
    }
    AutoLaunchBuilder::new()
        .set_app_name(app_name)
        .set_macos_launch_mode(auto_launch::MacOSLaunchMode::SMAppService)
        .build()
        .ok()
}

/// Une AppImage se relance par son fichier, pas par le binaire extrait qu'elle exécute.
#[cfg(not(target_os = "macos"))]
fn launcher(app_name: &str) -> Option<AutoLaunch> {
    let path = std::env::var("APPIMAGE").ok().or_else(|| {
        std::env::current_exe()
            .ok()
            .map(|exe| exe.display().to_string())
    })?;
    AutoLaunchBuilder::new()
        .set_app_name(app_name)
        .set_app_path(&path)
        .build()
        .ok()
}
