use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Serialize;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::valid_session_id;

/// Au-delà, l'icône passerait mal dans l'IPC en `data:` : on cherche la suivante.
const LIMIT: u64 = 1024 * 1024;
const SOURCE_LIMIT: u64 = 512 * 1024;
const EXTENSIONS: [&str; 7] = ["svg", "png", "ico", "jpg", "jpeg", "gif", "webp"];

/// Emplacements connus des favicons, dans l'ordre de T3 Code.
const CANDIDATES: [&str; 21] = [
    "favicon.svg",
    "favicon.ico",
    "favicon.png",
    "public/favicon.svg",
    "public/favicon.ico",
    "public/favicon.png",
    "app/favicon.ico",
    "app/favicon.png",
    "app/icon.svg",
    "app/icon.png",
    "app/icon.ico",
    "src/favicon.ico",
    "src/favicon.svg",
    "src/app/favicon.ico",
    "src/app/icon.svg",
    "src/app/icon.png",
    "assets/icon.svg",
    "assets/icon.png",
    "assets/logo.svg",
    "assets/logo.png",
    ".idea/icon.svg",
];

/// Fichiers qui déclarent l'icône (`<link rel="icon">` ou `{ rel: 'icon', href }`).
const SOURCES: [&str; 7] = [
    "index.html",
    "public/index.html",
    "app/routes/__root.tsx",
    "src/routes/__root.tsx",
    "app/root.tsx",
    "src/root.tsx",
    "src/index.html",
];

/// Clients lourds, que T3 Code ignore : Electron, app macOS empaquetée sans projet Xcode (SwiftPM), puis
/// Android de la plus grande densité à la plus petite.
const APP_ICONS: [&str; 4] = [
    "build/icon.png",
    "resources/icon.png",
    "Resources/AppIcon.svg",
    "Resources/AppIcon.png",
];
const ANDROID_RES: [&str; 2] = ["app/src/main/res", "android/app/src/main/res"];
const DENSITIES: [&str; 5] = ["xxxhdpi", "xxhdpi", "xhdpi", "hdpi", "mdpi"];
/// Dossiers où un projet Xcode ne range pas ses images, et qui coûteraient cher à parcourir.
const SKIPPED: [&str; 10] = [
    "node_modules",
    "target",
    "build",
    "dist",
    "Pods",
    "DerivedData",
    "vendor",
    ".build",
    ".git",
    ".next",
];
const XCODE_DEPTH: usize = 4;
const XCODE_VISITS: usize = 2000;

/// Images en `data:` : la CSP refuse toute autre image hors des dossiers de l'app. Le front choisit laquelle
/// afficher selon le mode du projet (automatique, mascotte ou image importée).
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProjectIcons {
    pub detected: Option<DetectedIcon>,
    /// Image importée dans les réglages, gardée même quand le projet repasse en automatique.
    pub custom: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DetectedIcon {
    pub data: String,
    /// Relatif au dossier du projet, pour dire où l'icône a été trouvée.
    pub path: String,
}

/// Icônes des projets : celle trouvée dans le dossier du projet, et celle importée à la main (copiée dans
/// `<données de l'app>/project-icons`).
pub struct ProjectService {
    icons: PathBuf,
}

impl ProjectService {
    pub fn new(icons: PathBuf) -> Self {
        Self { icons }
    }

    pub fn icons(&self, id: &str, root: &Path) -> Result<ProjectIcons, AppError> {
        let custom = self.custom(id)?.and_then(|path| encode(&path));
        let root = fs::canonicalize(root).ok();
        let detected = root.as_deref().and_then(|root| {
            let path = detect(root)?;
            let data = encode(&path)?;
            let relative = path.strip_prefix(root).ok()?.to_string_lossy().into_owned();
            Some(DetectedIcon {
                data,
                path: relative,
            })
        });
        Ok(ProjectIcons { detected, custom })
    }

    /// Renvoie l'image importée en `data:`.
    pub fn set_icon(&self, id: &str, source: &Path) -> Result<String, AppError> {
        valid_id(id)?;
        let extension = extension(source)
            .ok_or_else(|| AppError::InvalidInput("format d'image non pris en charge".into()))?;
        let metadata = fs::metadata(source)?;
        if !metadata.is_file() {
            return Err(AppError::InvalidInput("ce n'est pas un fichier".into()));
        }
        if metadata.len() > LIMIT {
            return Err(AppError::InvalidInput(
                "image trop lourde (1 Mo maximum)".into(),
            ));
        }
        fs::create_dir_all(&self.icons)?;
        self.reset_icon(id)?;
        let target = self.icons.join(format!("{id}.{extension}"));
        fs::copy(source, &target)?;
        encode(&target).ok_or_else(|| AppError::InvalidInput("image illisible".into()))
    }

    pub fn reset_icon(&self, id: &str) -> Result<(), AppError> {
        while let Some(path) = self.custom(id)? {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    fn custom(&self, id: &str) -> Result<Option<PathBuf>, AppError> {
        valid_id(id)?;
        Ok(EXTENSIONS
            .iter()
            .map(|extension| self.icons.join(format!("{id}.{extension}")))
            .find(|path| path.is_file()))
    }
}

/// Premier fichier trouvé : favicons connus, icône déclarée par une page, puis applications natives.
pub fn detect(root: &Path) -> Option<PathBuf> {
    let root = fs::canonicalize(root).ok()?;
    CANDIDATES
        .iter()
        .find_map(|candidate| inside(&root, candidate))
        .or_else(|| SOURCES.iter().find_map(|source| declared(&root, source)))
        .or_else(|| largest_png(&root, &root.join("src-tauri/icons")))
        .or_else(|| {
            APP_ICONS
                .iter()
                .find_map(|candidate| inside(&root, candidate))
        })
        .or_else(|| xcode_icon(&root))
        .or_else(|| android_icon(&root))
}

/// Le chemin canonisé doit rester sous la racine : un lien ou un `../` ne fait pas lire ailleurs.
fn inside(root: &Path, relative: &str) -> Option<PathBuf> {
    let path = fs::canonicalize(root.join(relative)).ok()?;
    usable(root, &path).then_some(path)
}

fn usable(root: &Path, path: &Path) -> bool {
    path.starts_with(root)
        && extension(path).is_some()
        && fs::metadata(path).is_ok_and(|meta| meta.is_file() && meta.len() <= LIMIT)
}

fn declared(root: &Path, source: &str) -> Option<PathBuf> {
    let path = fs::canonicalize(root.join(source)).ok()?;
    if !path.starts_with(root) || fs::metadata(&path).ok()?.len() > SOURCE_LIMIT {
        return None;
    }
    let text = fs::read_to_string(path).ok()?;
    let href = icon_href(&text)?;
    let clean = href.split(['?', '#']).next()?.trim_start_matches('/');
    if clean.is_empty() || clean.contains("://") {
        return None;
    }
    inside(root, &format!("public/{clean}")).or_else(|| inside(root, clean))
}

/// `href` d'un `<link rel="icon">`, sinon d'un objet `{ rel: 'icon', href: '...' }` (routes TanStack, Remix).
fn icon_href(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let mut from = 0;
    while let Some(start) = lower[from..].find("<link") {
        let start = from + start;
        let end = lower[start..]
            .find('>')
            .map_or(lower.len(), |end| start + end);
        let tag = &text[start..end];
        if attribute(tag, "rel", '=').is_some_and(|rel| is_icon_rel(&rel))
            && let Some(href) = attribute(tag, "href", '=')
        {
            return Some(href);
        }
        from = end;
    }
    text.split('}').find_map(|run| {
        let rel = attribute(run, "rel", ':')?;
        is_icon_rel(&rel).then(|| attribute(run, "href", ':'))?
    })
}

fn is_icon_rel(rel: &str) -> bool {
    matches!(rel.to_ascii_lowercase().as_str(), "icon" | "shortcut icon")
}

/// Valeur entre guillemets qui suit `name` puis `separator` (espaces permis autour).
fn attribute(text: &str, name: &str, separator: char) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower[from..].find(name) {
        let at = from + found;
        from = at + name.len();
        let before = lower[..at].chars().next_back();
        if before.is_some_and(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            continue;
        }
        let rest = text[from..].trim_start();
        let Some(rest) = rest.strip_prefix(separator) else {
            continue;
        };
        let rest = rest.trim_start();
        let Some(quote) = rest
            .chars()
            .next()
            .filter(|c| matches!(c, '"' | '\'' | '`'))
        else {
            continue;
        };
        let value = &rest[1..];
        return value.find(quote).map(|end| value[..end].to_owned());
    }
    None
}

/// La plus grande en pixels, lus dans l'en-tête PNG.
fn largest_png(root: &Path, dir: &Path) -> Option<PathBuf> {
    fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| extension(path) == Some("png"))
        .filter_map(|path| fs::canonicalize(path).ok())
        .filter(|path| usable(root, path))
        .filter_map(|path| png_width(&path).map(|width| (width, path)))
        .max_by_key(|(width, _)| *width)
        .map(|(_, path)| path)
}

fn png_width(path: &Path) -> Option<u32> {
    let mut header = [0u8; 24];
    fs::File::open(path).ok()?.read_exact(&mut header).ok()?;
    if &header[..8] != b"\x89PNG\r\n\x1a\n" || &header[12..16] != b"IHDR" {
        return None;
    }
    Some(u32::from_be_bytes([
        header[16], header[17], header[18], header[19],
    ]))
}

/// `AppIcon.appiconset` d'un catalogue d'images, cherché à faible profondeur.
fn xcode_icon(root: &Path) -> Option<PathBuf> {
    let mut queue = vec![(root.to_owned(), 0)];
    let mut visits = 0;
    while let Some((dir, depth)) = queue.pop() {
        visits += 1;
        if visits > XCODE_VISITS {
            return None;
        }
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if !kind.is_dir() {
                continue;
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name == "AppIcon.appiconset" {
                if let Some(icon) = largest_png(root, &entry.path()) {
                    return Some(icon);
                }
            } else if depth < XCODE_DEPTH && !SKIPPED.contains(&name.as_ref()) {
                queue.push((entry.path(), depth + 1));
            }
        }
    }
    None
}

fn android_icon(root: &Path) -> Option<PathBuf> {
    ANDROID_RES.iter().find_map(|res| {
        DENSITIES
            .iter()
            .find_map(|density| inside(root, &format!("{res}/mipmap-{density}/ic_launcher.png")))
    })
}

fn extension(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    EXTENSIONS
        .iter()
        .find(|known| **known == extension)
        .copied()
}

fn encode(path: &Path) -> Option<String> {
    let mime = match extension(path)? {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        _ => "image/webp",
    };
    let bytes = fs::read(path).ok()?;
    (bytes.len() as u64 <= LIMIT).then(|| format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

/// L'id devient un nom de fichier : rien qui permette d'en sortir.
fn valid_id(id: &str) -> Result<(), AppError> {
    if valid_session_id(id) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "identifiant de projet invalide".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "nuee-project-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |time| time.as_nanos())
        ));
        fs::create_dir_all(&dir).expect("dossier de test");
        fs::canonicalize(dir).expect("chemin")
    }

    fn write(root: &Path, relative: &str, content: &[u8]) {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().expect("parent")).expect("dossier");
        fs::write(path, content).expect("fichier");
    }

    fn png(width: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
        bytes.extend(width.to_be_bytes());
        bytes.extend(width.to_be_bytes());
        bytes
    }

    #[test]
    fn a_web_favicon_comes_first() {
        let root = project("web");
        write(&root, "public/favicon.svg", b"<svg/>");
        write(&root, "src-tauri/icons/icon.png", &png(512));
        assert_eq!(detect(&root), Some(root.join("public/favicon.svg")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn the_icon_declared_by_index_html_is_found_in_public() {
        let root = project("link");
        write(
            &root,
            "index.html",
            b"<head><link href=\"/brand/mark.svg?v=2\" rel=\"icon\" type=\"image/svg+xml\"></head>",
        );
        write(&root, "public/brand/mark.svg", b"<svg/>");
        assert_eq!(detect(&root), Some(root.join("public/brand/mark.svg")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn object_metadata_declares_an_icon() {
        let root = project("meta");
        write(
            &root,
            "src/routes/__root.tsx",
            b"links: [{ rel: 'stylesheet', href: '/app.css' }, { rel: 'icon', href: '/logo.png' }]",
        );
        write(&root, "public/logo.png", &png(64));
        assert_eq!(detect(&root), Some(root.join("public/logo.png")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_tauri_project_gives_its_largest_png() {
        let root = project("tauri");
        write(&root, "src-tauri/icons/32x32.png", &png(32));
        write(&root, "src-tauri/icons/icon.png", &png(1024));
        write(&root, "src-tauri/icons/128x128.png", &png(128));
        write(&root, "src-tauri/icons/icon.icns", b"icns");
        assert_eq!(detect(&root), Some(root.join("src-tauri/icons/icon.png")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_swift_package_app_gives_its_resources_icon() {
        let root = project("swiftpm");
        write(&root, "Package.swift", b"// swift-tools-version:6.0");
        write(&root, "Resources/AppIcon.icns", b"icns");
        write(&root, "Resources/AppIcon.svg", b"<svg/>");
        let found = detect(&root).expect("trouvée");
        assert!(found.to_string_lossy().ends_with("AppIcon.svg"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn xcode_and_android_icons_are_found() {
        let xcode = project("xcode");
        write(
            &xcode,
            "Brume/Assets.xcassets/AppIcon.appiconset/small.png",
            &png(64),
        );
        write(
            &xcode,
            "Brume/Assets.xcassets/AppIcon.appiconset/large.png",
            &png(1024),
        );
        assert_eq!(
            detect(&xcode),
            Some(xcode.join("Brume/Assets.xcassets/AppIcon.appiconset/large.png"))
        );
        let android = project("android");
        write(
            &android,
            "app/src/main/res/mipmap-hdpi/ic_launcher.png",
            &png(72),
        );
        write(
            &android,
            "app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
            &png(192),
        );
        assert_eq!(
            detect(&android),
            Some(android.join("app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"))
        );
        let _ = fs::remove_dir_all(xcode);
        let _ = fs::remove_dir_all(android);
    }

    #[test]
    fn nothing_outside_the_project_or_too_heavy() {
        let outside = project("outside");
        write(&outside, "secret.png", &png(16));
        let root = project("escape");
        write(
            &root,
            "index.html",
            format!(
                "<link rel=\"icon\" href=\"../{}/secret.png\">",
                outside.file_name().unwrap().to_string_lossy()
            )
            .as_bytes(),
        );
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.join("secret.png"), root.join("favicon.png"))
            .expect("lien");
        write(&root, "favicon.svg", &vec![b' '; LIMIT as usize + 1]);
        assert_eq!(detect(&root), None);
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn the_imported_image_sits_beside_the_detected_icon() {
        let root = project("custom");
        write(&root, "public/favicon.ico", b"ico");
        let image = root.join("mine.PNG");
        fs::write(&image, png(48)).expect("image");
        let service = ProjectService::new(root.join("icons"));

        let found = service.icons("p1", &root).expect("icônes");
        let detected = found.detected.clone().expect("trouvée");
        assert_eq!(detected.path, "public/favicon.ico");
        assert!(detected.data.starts_with("data:image/x-icon;base64,") && found.custom.is_none());
        let chosen = service.set_icon("p1", &image).expect("copiée");
        assert!(chosen.starts_with("data:image/png;base64,"));
        let both = service.icons("p1", &root).expect("icônes");
        assert_eq!((both.detected, both.custom), (Some(detected), Some(chosen)));
        service.reset_icon("p1").expect("retirée");
        assert_eq!(service.icons("p1", &root).expect("icônes"), found);
        assert!(service.set_icon("../p1", &image).is_err());
        assert!(
            service
                .set_icon("p1", &root.join("favicon.ico.txt"))
                .is_err()
        );
        let _ = fs::remove_dir_all(root);
    }
}
