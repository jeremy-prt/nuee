use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;

const LIMIT: u64 = 25 * 1024 * 1024;
const EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];

/// Image de fond des chats, copiée dans `<données de l'app>/backgrounds` : avec les pièces jointes,
/// le seul dossier que la webview peut afficher (scope `assetProtocol` de tauri.conf.json).
pub struct BackgroundService {
    dir: PathBuf,
}

impl BackgroundService {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    pub fn import(&self, source: &str) -> Result<String, AppError> {
        let source = Path::new(source);
        let extension = source
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .filter(|extension| EXTENSIONS.contains(&extension.as_str()))
            .ok_or_else(|| AppError::InvalidInput("format d'image non pris en charge".into()))?;
        let metadata = std::fs::metadata(source)?;
        if !metadata.is_file() {
            return Err(AppError::InvalidInput("ce n'est pas un fichier".into()));
        }
        if metadata.len() > LIMIT {
            return Err(AppError::InvalidInput(
                "image trop lourde (25 Mo maximum)".into(),
            ));
        }

        std::fs::create_dir_all(&self.dir)?;
        // Nom neuf à chaque import : sous le même nom, la webview garderait l'ancienne image en cache.
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |time| time.as_millis());
        let target = self.dir.join(format!("background-{stamp}.{extension}"));
        std::fs::copy(source, &target)?;
        self.clear(Some(&target))?;
        Ok(target.display().to_string())
    }

    pub fn remove(&self) -> Result<(), AppError> {
        self.clear(None)
    }

    fn clear(&self, keep: Option<&Path>) -> Result<(), AppError> {
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return Ok(());
        };
        for path in entries.flatten().map(|entry| entry.path()) {
            if path.is_file() && Some(path.as_path()) != keep {
                std::fs::remove_file(path)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service() -> (BackgroundService, PathBuf) {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |time| time.as_nanos());
        let dir =
            std::env::temp_dir().join(format!("nuee-backgrounds-{}-{stamp}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("dossier de test");
        (BackgroundService::new(dir.join("backgrounds")), dir)
    }

    #[test]
    fn a_new_image_replaces_the_previous_one() {
        let (backgrounds, root) = service();
        let first = root.join("dune.PNG");
        let second = root.join("lune.webp");
        std::fs::write(&first, b"png").expect("image");
        std::fs::write(&second, b"webp").expect("image");

        let kept = backgrounds
            .import(first.to_str().expect("chemin"))
            .expect("importée");
        assert!(kept.ends_with(".png"));
        let replaced = backgrounds
            .import(second.to_str().expect("chemin"))
            .expect("importée");
        assert!(!Path::new(&kept).exists());
        assert_eq!(std::fs::read(&replaced).expect("copie"), b"webp");

        backgrounds.remove().expect("retirée");
        assert!(!Path::new(&replaced).exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_file_that_is_not_an_image_is_refused() {
        let (backgrounds, root) = service();
        let text = root.join("notes.txt");
        std::fs::write(&text, b"texte").expect("fichier");
        assert!(backgrounds.import(text.to_str().expect("chemin")).is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}
