use std::sync::Mutex;

use keepawake::KeepAwake;

use crate::error::AppError;

/// Empêche la mise en veille du système tant qu'un agent travaille. L'écran, lui, peut s'éteindre.
#[derive(Default)]
pub struct PowerService {
    awake: Mutex<Option<KeepAwake>>,
}

impl PowerService {
    pub fn keep_awake(&self, on: bool) -> Result<(), AppError> {
        let mut awake = self
            .awake
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !on {
            // Rendre le verrou au système suffit : `KeepAwake` le libère en étant détruit.
            *awake = None;
        } else if awake.is_none() {
            let lock = keepawake::Builder::default()
                .idle(true)
                .reason("Un agent de code travaille")
                .app_name("Nuée")
                .app_reverse_domain("io.github.jeremy-prt.nuee")
                .create()
                .map_err(|error| AppError::Io(std::io::Error::other(error.to_string())))?;
            *awake = Some(lock);
        }
        Ok(())
    }
}
