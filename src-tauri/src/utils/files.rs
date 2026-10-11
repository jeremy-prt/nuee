use std::fs;
use std::io::{self, Write};
use std::path::Path;

/// Remplace un fichier de l'utilisateur d'un coup : un agent qui le relit au même moment ne voit
/// jamais un fichier à moitié écrit. Un lien symbolique est suivi (config rangée dans un dépôt de
/// dotfiles) et les droits du fichier sont gardés (`settings.json` est souvent en 600).
pub fn write_atomic(path: &Path, content: &[u8]) -> io::Result<()> {
    let target = fs::canonicalize(path).unwrap_or_else(|_| path.to_owned());
    let (Some(dir), Some(name)) = (target.parent(), target.file_name()) else {
        return Err(io::Error::other(format!(
            "chemin invalide : {}",
            path.display()
        )));
    };
    let temp = dir.join(format!(
        ".{}.nuee-{}",
        name.to_string_lossy(),
        std::process::id()
    ));
    let written = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        // Créé fermé : le contenu (des clés d'API, parfois) n'est jamais lisible par les autres comptes.
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        let mut file = options.open(&temp)?;
        file.write_all(content)?;
        file.sync_all()?;
        if let Ok(meta) = fs::metadata(&target) {
            fs::set_permissions(&temp, meta.permissions())?;
        }
        fs::rename(&temp, &target)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn keeps_permissions_and_follows_links() {
        use std::os::unix::fs::PermissionsExt;

        let dir = std::env::temp_dir().join(format!("nuee-files-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let real = dir.join("real.json");
        fs::write(&real, "{}").unwrap();
        fs::set_permissions(&real, fs::Permissions::from_mode(0o600)).unwrap();
        let link = dir.join("link.json");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        write_atomic(&link, b"{\"a\":1}").unwrap();

        assert!(
            fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(fs::read_to_string(&real).unwrap(), "{\"a\":1}");
        assert_eq!(
            fs::metadata(&real).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        fs::remove_dir_all(&dir).unwrap();
    }
}
