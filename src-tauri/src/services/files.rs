use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::AppError;
use crate::utils::files::write_atomic;
use crate::utils::shell_env::find_binary;

const TEXT_LIMIT: u64 = 2 * 1024 * 1024;
const IMAGE_LIMIT: u64 = 20 * 1024 * 1024;
const SNIFF: usize = 8000;

// SVG absent : c'est du texte, éditable, avec son aperçu côté front.
const IMAGES: [(&str, &str); 8] = [
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("avif", "image/avif"),
    ("ico", "image/x-icon"),
    ("bmp", "image/bmp"),
];

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FileList {
    /// Dossier de la session tel que le disque l'écrit : sert au chemin complet d'un fichier.
    pub root: String,
    pub files: Vec<String>,
}

#[derive(Serialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum FileBody {
    Text { text: String },
    Image { data: String },
    Binary,
    TooLarge,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FileContent {
    pub path: String,
    pub version: String,
    pub body: FileBody,
}

/// `conflict` : le fichier a changé sur le disque depuis la version attendue, rien n'est écrit et `version` est
/// celle du disque.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FileSaved {
    pub version: String,
    pub conflict: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Editor {
    Vscode,
    VscodeInsiders,
    Vscodium,
    Cursor,
    Zed,
    Windsurf,
    SublimeText,
}

/// Éditeur trouvé sur la machine, avec l'icône de son app en `data:` (absente hors macOS ou sans `.icns`).
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EditorApp {
    pub id: Editor,
    pub name: String,
    pub icon: Option<String>,
}

/// Même liste que monocode : nom affiché, apps cherchées dans `/Applications`, commandes de repli.
const EDITORS: [(Editor, &str, &[&str], &[&str]); 7] = [
    (
        Editor::Vscode,
        "VS Code",
        &["Visual Studio Code"],
        &["code"],
    ),
    (
        Editor::VscodeInsiders,
        "VS Code Insiders",
        &["Visual Studio Code - Insiders"],
        &["code-insiders"],
    ),
    (Editor::Vscodium, "VSCodium", &["VSCodium"], &["codium"]),
    (Editor::Cursor, "Cursor", &["Cursor"], &["cursor"]),
    (Editor::Zed, "Zed", &["Zed", "Zed Preview"], &["zed"]),
    (Editor::Windsurf, "Windsurf", &["Windsurf"], &["windsurf"]),
    (
        Editor::SublimeText,
        "Sublime Text",
        &["Sublime Text"],
        &["subl", "sublime_text"],
    ),
];

enum Launcher {
    App(PathBuf),
    Command(PathBuf),
}

fn bundle(apps: &[&str]) -> Option<PathBuf> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let home = std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Applications"));
    let dirs = [home, Some(PathBuf::from("/Applications"))];
    apps.iter()
        .flat_map(|app| {
            dirs.iter()
                .flatten()
                .map(move |dir| dir.join(format!("{app}.app")))
        })
        .find(|path| path.is_dir())
}

fn launcher(editor: Editor) -> Option<Launcher> {
    let (_, _, apps, commands) = EDITORS.iter().find(|entry| entry.0 == editor)?;
    bundle(apps).map(Launcher::App).or_else(|| {
        commands
            .iter()
            .find_map(|name| find_binary(name))
            .map(Launcher::Command)
    })
}

/// Icône de l'app (`CFBundleIconFile`), réduite en PNG 64 px par `sips` : le menu montre le vrai logo.
fn app_icon(app: &Path) -> Option<String> {
    let resources = app.join("Contents/Resources");
    let plist = app.join("Contents/Info.plist");
    let named = std::process::Command::new("/usr/bin/plutil")
        .args(["-extract", "CFBundleIconFile", "raw", "-o", "-"])
        .arg(&plist)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|name| !name.is_empty());
    let icns = named
        .map(|name| {
            let file = resources.join(&name);
            if file.extension().is_some() {
                file
            } else {
                file.with_extension("icns")
            }
        })
        .filter(|file| file.is_file())
        .or_else(|| {
            fs::read_dir(&resources)
                .ok()?
                .flatten()
                .map(|entry| entry.path())
                .find(|path| {
                    path.extension()
                        .is_some_and(|extension| extension == "icns")
                })
        })?;
    let out = std::env::temp_dir().join(format!("nuee-editor-{}.png", std::process::id()));
    let converted = std::process::Command::new("/usr/bin/sips")
        .args(["-s", "format", "png", "-Z", "64"])
        .arg(&icns)
        .arg("--out")
        .arg(&out)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .ok()?;
    let bytes = converted.success().then(|| fs::read(&out).ok()).flatten();
    let _ = fs::remove_file(&out);
    Some(format!("data:image/png;base64,{}", STANDARD.encode(bytes?)))
}

/// Icône du Finder pour le bouton « Afficher dans le Finder » (macOS seulement).
pub fn finder_icon() -> Option<String> {
    cfg!(target_os = "macos")
        .then(|| app_icon(Path::new("/System/Library/CoreServices/Finder.app")))
        .flatten()
}

/// Éditeurs présents sur la machine, dans l'ordre de la liste.
pub fn editors() -> Vec<EditorApp> {
    EDITORS
        .iter()
        .filter_map(|(id, name, _, _)| {
            let icon = match launcher(*id)? {
                Launcher::App(app) => app_icon(&app),
                Launcher::Command(_) => None,
            };
            Some(EditorApp {
                id: *id,
                name: (*name).to_owned(),
                icon,
            })
        })
        .collect()
}

/// `relative` vide : le dossier de la session.
pub fn open_in(editor: Editor, root: &Path, relative: &str) -> Result<(), AppError> {
    let file = if relative.is_empty() {
        root_of(root)?
    } else {
        resolve(root, relative)?
    };
    let mut command = match launcher(editor) {
        Some(Launcher::App(app)) => {
            let mut open = std::process::Command::new("/usr/bin/open");
            open.arg("-a").arg(app);
            open
        }
        Some(Launcher::Command(program)) => std::process::Command::new(program),
        None => {
            return Err(AppError::InvalidInput(
                "éditeur introuvable sur cette machine".into(),
            ));
        }
    };
    command
        .arg(file)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()?;
    Ok(())
}

fn root_of(dir: &Path) -> Result<PathBuf, AppError> {
    fs::canonicalize(dir)
        .ok()
        .filter(|root| root.is_dir())
        .ok_or_else(|| AppError::InvalidInput(format!("dossier introuvable : {}", dir.display())))
}

/// Chemin relatif venu du front, ramené dans le dossier de la session. Refusé s'il en sort, même par un lien
/// symbolique : la webview ne doit lire ni écrire ailleurs.
pub fn resolve(root: &Path, relative: &str) -> Result<PathBuf, AppError> {
    let refused = || AppError::InvalidInput(format!("chemin hors du dossier : {relative}"));
    let path = Path::new(relative);
    let plain = path
        .components()
        .all(|part| matches!(part, Component::Normal(_) | Component::CurDir));
    if relative.is_empty() || !plain {
        return Err(refused());
    }
    let root = root_of(root)?;
    let target = fs::canonicalize(root.join(path))
        .map_err(|_| AppError::InvalidInput(format!("fichier introuvable : {relative}")))?;
    if target == root || !target.starts_with(&root) {
        return Err(refused());
    }
    Ok(target)
}

pub fn list_root(dir: &Path) -> Result<String, AppError> {
    Ok(root_of(dir)?.display().to_string())
}

fn version_of(meta: &fs::Metadata) -> String {
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |time| time.as_nanos());
    format!("{modified}-{}", meta.len())
}

fn image_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    IMAGES
        .iter()
        .find(|(known, _)| *known == extension)
        .map(|(_, mime)| *mime)
}

fn regular(file: &Path, relative: &str) -> Result<fs::Metadata, AppError> {
    let meta = fs::metadata(file)?;
    if !meta.is_file() {
        return Err(AppError::InvalidInput(format!(
            "pas un fichier : {relative}"
        )));
    }
    Ok(meta)
}

pub fn read(root: &Path, relative: &str) -> Result<FileContent, AppError> {
    let file = resolve(root, relative)?;
    let meta = regular(&file, relative)?;
    let body = match image_type(&file) {
        Some(_) if meta.len() > IMAGE_LIMIT => FileBody::TooLarge,
        Some(mime) => FileBody::Image {
            data: format!("data:{mime};base64,{}", STANDARD.encode(fs::read(&file)?)),
        },
        None if meta.len() > TEXT_LIMIT => {
            let mut head = Vec::with_capacity(SNIFF);
            fs::File::open(&file)?
                .take(SNIFF as u64)
                .read_to_end(&mut head)?;
            if head.contains(&0) {
                FileBody::Binary
            } else {
                FileBody::TooLarge
            }
        }
        None => {
            let bytes = fs::read(&file)?;
            let binary = bytes[..bytes.len().min(SNIFF)].contains(&0);
            match String::from_utf8(bytes) {
                Ok(text) if !binary => FileBody::Text { text },
                _ => FileBody::Binary,
            }
        }
    };
    Ok(FileContent {
        path: file.display().to_string(),
        version: version_of(&meta),
        body,
    })
}

/// Version actuelle sur le disque, `None` si le fichier a disparu.
pub fn stat(root: &Path, relative: &str) -> Result<Option<String>, AppError> {
    match resolve(root, relative) {
        Ok(file) => Ok(fs::metadata(file).ok().map(|meta| version_of(&meta))),
        Err(AppError::InvalidInput(message)) if message.starts_with("fichier introuvable") => {
            Ok(None)
        }
        Err(error) => Err(error),
    }
}

/// `expected` : la version sur laquelle porte l'édition. Sans elle, le texte remplace ce qu'il y a sur le disque.
pub fn write(
    root: &Path,
    relative: &str,
    text: &str,
    expected: Option<&str>,
) -> Result<FileSaved, AppError> {
    let file = resolve(root, relative)?;
    let current = version_of(&regular(&file, relative)?);
    if expected.is_some_and(|expected| expected != current) {
        return Ok(FileSaved {
            version: current,
            conflict: true,
        });
    }
    write_atomic(&file, text.as_bytes())?;
    Ok(FileSaved {
        version: version_of(&fs::metadata(&file)?),
        conflict: false,
    })
}

/// Dossier de la session (`""`) ou l'un de ses dossiers.
fn resolve_dir(root: &Path, relative: &str) -> Result<PathBuf, AppError> {
    let dir = if relative.is_empty() {
        root_of(root)?
    } else {
        resolve(root, relative)?
    };
    if !dir.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "pas un dossier : {relative}"
        )));
    }
    Ok(dir)
}

/// Nom tapé dans l'arborescence : un seul élément de chemin, sans séparateur.
fn valid_name(name: &str) -> Result<&str, AppError> {
    let name = name.trim();
    let mut parts = Path::new(name).components();
    let single = matches!(parts.next(), Some(Component::Normal(_))) && parts.next().is_none();
    if name.is_empty() || !single || name.contains(['/', '\\']) {
        return Err(AppError::InvalidInput(format!("nom invalide : {name}")));
    }
    Ok(name)
}

fn relative_to(root: &Path, path: &Path) -> Result<String, AppError> {
    let root = root_of(root)?;
    let relative = path.strip_prefix(&root).map_err(|_| {
        AppError::InvalidInput(format!("chemin hors du dossier : {}", path.display()))
    })?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn taken(path: &Path) -> AppError {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    AppError::InvalidInput(format!("« {name} » existe déjà"))
}

/// Crée un fichier vide ou un dossier dans `parent` et rend son chemin relatif.
pub fn create(root: &Path, parent: &str, name: &str, dir: bool) -> Result<String, AppError> {
    let target = resolve_dir(root, parent)?.join(valid_name(name)?);
    if fs::symlink_metadata(&target).is_ok() {
        return Err(taken(&target));
    }
    if dir {
        fs::create_dir(&target)?;
    } else {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)?;
    }
    relative_to(root, &target)
}

pub fn rename(root: &Path, relative: &str, name: &str) -> Result<String, AppError> {
    let source = resolve(root, relative)?;
    let parent = source
        .parent()
        .ok_or_else(|| AppError::InvalidInput(format!("chemin invalide : {relative}")))?;
    let target = parent.join(valid_name(name)?);
    if target == source {
        return relative_to(root, &target);
    }
    // Seule la casse change (macOS) : le disque voit le même fichier, le renommage reste permis.
    let same = target.to_string_lossy().to_lowercase() == source.to_string_lossy().to_lowercase();
    if !same && fs::symlink_metadata(&target).is_ok() {
        return Err(taken(&target));
    }
    fs::rename(&source, &target)?;
    relative_to(root, &target)
}

/// Mis à la corbeille du système, jamais effacé : on peut le récupérer.
pub fn trash(root: &Path, relative: &str) -> Result<(), AppError> {
    let target = resolve(root, relative)?;
    trash::delete(&target).map_err(|error| std::io::Error::other(error.to_string()).into())
}

/// Premier nom libre dans `dir` : « nom.ext », puis « nom 2.ext », « nom 3.ext »…
fn free_name(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if fs::symlink_metadata(&first).is_err() {
        return first;
    }
    let path = Path::new(name);
    let (stem, extension) = match (path.file_stem(), path.extension()) {
        (Some(stem), Some(extension))
            if !name.starts_with('.') || name.matches('.').count() > 1 =>
        {
            (
                stem.to_string_lossy().into_owned(),
                format!(".{}", extension.to_string_lossy()),
            )
        }
        _ => (name.to_owned(), String::new()),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} {n}{extension}")))
        .find(|candidate| fs::symlink_metadata(candidate).is_err())
        .unwrap_or(first)
}

/// Les liens symboliques ne sont pas suivis : une copie ne ramène rien de hors du dossier.
fn copy_tree(source: &Path, target: &Path) -> std::io::Result<()> {
    let meta = fs::symlink_metadata(source)?;
    if meta.is_dir() {
        fs::create_dir(target)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_tree(&entry.path(), &target.join(entry.file_name()))?;
        }
    } else if meta.is_file() {
        fs::copy(source, target)?;
    }
    Ok(())
}

/// Copie (coller, dupliquer) dans `parent` sous un nom libre, et rend le chemin relatif de la copie.
pub fn copy(root: &Path, relative: &str, parent: &str) -> Result<String, AppError> {
    let source = resolve(root, relative)?;
    let dir = resolve_dir(root, parent)?;
    if dir.starts_with(&source) {
        return Err(AppError::InvalidInput(format!(
            "dossier copié dans lui-même : {relative}"
        )));
    }
    let name = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let target = free_name(&dir, &name);
    copy_tree(&source, &target)?;
    relative_to(root, &target)
}

/// Couper puis coller : déplacé dans `parent`, refusé si le nom y est déjà pris.
pub fn move_to(root: &Path, relative: &str, parent: &str) -> Result<String, AppError> {
    let source = resolve(root, relative)?;
    let dir = resolve_dir(root, parent)?;
    if dir.starts_with(&source) {
        return Err(AppError::InvalidInput(format!(
            "dossier déplacé dans lui-même : {relative}"
        )));
    }
    let target = dir.join(source.file_name().unwrap_or_default());
    if target == source {
        return relative_to(root, &target);
    }
    if fs::symlink_metadata(&target).is_ok() {
        return Err(taken(&target));
    }
    fs::rename(&source, &target)?;
    relative_to(root, &target)
}

/// Dossiers dont les changements ne touchent pas l'explorateur : dépendances, builds, et l'intérieur de `.git`.
const QUIET: [&str; 10] = [
    ".git",
    "node_modules",
    "target",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    "__pycache__",
    ".venv",
    "DerivedData",
];
const SETTLE: std::time::Duration = std::time::Duration::from_millis(150);

fn noisy(root: &Path, path: &Path) -> bool {
    let inside = path.strip_prefix(root).unwrap_or(path);
    inside.components().any(|part| match part {
        Component::Normal(name) => QUIET.iter().any(|quiet| name == *quiet) || name == ".DS_Store",
        _ => false,
    })
}

/// Surveille le dossier de la session tant que le volet est ouvert. Un changement sur le disque (agent, terminal,
/// autre app) donne un signal sur le canal, après 150 ms sans autre changement.
#[derive(Default)]
pub struct FilesService {
    watchers: std::sync::Mutex<std::collections::HashMap<u32, notify::RecommendedWatcher>>,
    next: std::sync::atomic::AtomicU32,
}

impl FilesService {
    pub fn watch(&self, dir: &Path, signal: impl Fn() + Send + 'static) -> Result<u32, AppError> {
        use notify::Watcher;
        let root = root_of(dir)?;
        let (sender, receiver) = std::sync::mpsc::channel::<()>();
        let filter = root.clone();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                let Ok(event) = event else { return };
                if event.kind.is_access() || event.paths.iter().all(|path| noisy(&filter, path)) {
                    return;
                }
                let _ = sender.send(());
            })
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        watcher
            .watch(&root, notify::RecursiveMode::Recursive)
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        // S'arrête seul quand le watcher est lâché : l'émetteur part avec lui.
        std::thread::spawn(move || {
            while receiver.recv().is_ok() {
                while receiver.recv_timeout(SETTLE).is_ok() {}
                signal();
            }
        });
        let id = self.next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        self.lock().insert(id, watcher);
        Ok(id)
    }

    pub fn unwatch(&self, id: u32) {
        self.lock().remove(&id);
    }

    fn lock(
        &self,
    ) -> std::sync::MutexGuard<'_, std::collections::HashMap<u32, notify::RecommendedWatcher>> {
        self.watchers
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchOptions {
    pub query: String,
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub regex: bool,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchMatch {
    pub path: String,
    pub line: u32,
    pub preview: String,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchResults {
    pub matches: Vec<SearchMatch>,
    /// Plus de résultats que la limite : la liste est coupée.
    pub truncated: bool,
}

const MAX_MATCHES: usize = 500;
const SEARCH_FILE_LIMIT: u64 = 512 * 1024;
const PREVIEW: usize = 240;

fn preview(line: &str) -> String {
    let line = line.trim_end_matches('\r');
    match line.char_indices().nth(PREVIEW) {
        Some((cut, _)) => format!("{}…", &line[..cut]),
        None => line.to_owned(),
    }
}

/// Recherche dans le contenu : `git grep` (fichiers suivis et non ignorés), sinon un parcours en Rust, sans
/// expression régulière, comme monocode.
pub async fn search(root: &Path, options: &SearchOptions) -> Result<SearchResults, AppError> {
    let root = root_of(root)?;
    if options.query.is_empty() {
        return Ok(SearchResults {
            matches: Vec::new(),
            truncated: false,
        });
    }
    if let Some(found) = git_grep(&root, options).await {
        return Ok(found);
    }
    let files = crate::services::project::files(&root, false).await?;
    let options = SearchOptions {
        query: options.query.clone(),
        ..*options
    };
    tauri::async_runtime::spawn_blocking(move || scan(&root, &files, &options))
        .await
        .map_err(|error| std::io::Error::other(error.to_string()).into())
}

async fn git_grep(root: &Path, options: &SearchOptions) -> Option<SearchResults> {
    let git = crate::services::worktree::git_binary()?;
    let mut command = tokio::process::Command::new(git);
    command.arg("-C").arg(root).args([
        "-c",
        "core.fsmonitor=false",
        "grep",
        "-z",
        "-n",
        "-I",
        "--untracked",
        "--no-color",
    ]);
    if !options.case_sensitive {
        command.arg("-i");
    }
    if options.whole_word {
        command.arg("-w");
    }
    command
        .arg(if options.regex { "-E" } else { "-F" })
        .arg("-e")
        .arg(&options.query)
        .env("PATH", crate::utils::shell_env::search_path())
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true);
    let output = tokio::time::timeout(std::time::Duration::from_secs(20), command.output())
        .await
        .ok()?
        .ok()?;
    // 1 : aucune ligne trouvée ; au-delà, pas un dépôt ou motif refusé : le parcours prend le relais.
    match output.status.code() {
        Some(0) => {}
        Some(1) => {
            return Some(SearchResults {
                matches: Vec::new(),
                truncated: false,
            });
        }
        _ => return None,
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut matches = Vec::new();
    let mut truncated = false;
    for entry in text.split('\n').filter(|entry| !entry.is_empty()) {
        let mut parts = entry.splitn(3, '\0');
        let (Some(path), Some(line), Some(content)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        if matches.len() >= MAX_MATCHES {
            truncated = true;
            break;
        }
        matches.push(SearchMatch {
            path: path.to_owned(),
            line: line.parse().unwrap_or(1),
            preview: preview(content),
        });
    }
    Some(SearchResults { matches, truncated })
}

fn scan(root: &Path, files: &[String], options: &SearchOptions) -> SearchResults {
    let needle = if options.case_sensitive {
        options.query.clone()
    } else {
        options.query.to_lowercase()
    };
    let word = |line: &str, at: usize| {
        let before = line[..at].chars().next_back();
        let after = line[at + needle.len()..].chars().next();
        let part = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_');
        !part(before) && !part(after)
    };
    let mut matches = Vec::new();
    if options.regex {
        return SearchResults {
            matches,
            truncated: false,
        };
    }
    for file in files {
        let path = root.join(file);
        if fs::metadata(&path).map_or(true, |meta| meta.len() > SEARCH_FILE_LIMIT) {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        if text.as_bytes().contains(&0) {
            continue;
        }
        for (index, line) in text.lines().enumerate() {
            let haystack = if options.case_sensitive {
                line.to_owned()
            } else {
                line.to_lowercase()
            };
            let found = haystack
                .match_indices(&needle)
                .any(|(at, _)| !options.whole_word || word(&haystack, at));
            if !found {
                continue;
            }
            if matches.len() >= MAX_MATCHES {
                return SearchResults {
                    matches,
                    truncated: true,
                };
            }
            matches.push(SearchMatch {
                path: file.clone(),
                line: index as u32 + 1,
                preview: preview(line),
            });
        }
    }
    SearchResults {
        matches,
        truncated: false,
    }
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DirEntry {
    pub name: String,
    /// Relatif au dossier de la session, séparé par « / ».
    pub path: String,
    pub folder: bool,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DirListing {
    pub root: String,
    pub entries: Vec<DirEntry>,
}

/// Contenu d'un seul dossier (`""` : la racine), comme l'explorateur de monocode : l'arbre ne lit que les dossiers
/// ouverts, l'affichage est immédiat même dans un gros dépôt. Ce que git ignore est masqué ; hors dépôt, les
/// dossiers de dépendances et de build.
pub async fn list_dir(root: &Path, relative: &str) -> Result<DirListing, AppError> {
    let base = root_of(root)?;
    let dir = resolve_dir(root, relative)?;
    let prefix = if relative.is_empty() {
        String::new()
    } else {
        format!("{}/", relative.trim_end_matches('/'))
    };
    let mut entries: Vec<DirEntry> = fs::read_dir(&dir)?
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name == ".git" || name == ".DS_Store" {
                return None;
            }
            // Un lien vers un dossier se déplie comme un dossier ; sa lecture reste bornée par `resolve`.
            let folder = fs::metadata(entry.path()).is_ok_and(|meta| meta.is_dir());
            Some(DirEntry {
                path: format!("{prefix}{name}"),
                name,
                folder,
            })
        })
        .collect();
    let ignored = ignored(&base, &entries).await;
    entries.retain(|entry| !ignored.contains(&entry.path));
    entries.sort_by(|a, b| {
        b.folder
            .cmp(&a.folder)
            .then_with(|| natural(&a.name.to_lowercase(), &b.name.to_lowercase()))
    });
    Ok(DirListing {
        root: base.display().to_string(),
        entries,
    })
}

/// Chemins que git ignore parmi `entries`, en un appel (`check-ignore --stdin`). Hors dépôt : les dossiers lourds.
async fn ignored(root: &Path, entries: &[DirEntry]) -> std::collections::HashSet<String> {
    use tokio::io::AsyncWriteExt;
    let heavy = || {
        entries
            .iter()
            .filter(|entry| entry.folder && QUIET.contains(&entry.name.as_str()))
            .map(|entry| entry.path.clone())
            .collect()
    };
    let Some(git) = crate::services::worktree::git_binary() else {
        return heavy();
    };
    let spawned = tokio::process::Command::new(git)
        .arg("-C")
        .arg(root)
        .args([
            "-c",
            "core.fsmonitor=false",
            "check-ignore",
            "--stdin",
            "-z",
        ])
        .env("PATH", crate::utils::shell_env::search_path())
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn();
    let Ok(mut child) = spawned else {
        return heavy();
    };
    if let Some(mut stdin) = child.stdin.take() {
        let input: Vec<u8> = entries
            .iter()
            .flat_map(|entry| {
                let mut line = entry.path.as_bytes().to_vec();
                line.push(0);
                line
            })
            .collect();
        let _ = stdin.write_all(&input).await;
    }
    let Ok(Ok(output)) =
        tokio::time::timeout(std::time::Duration::from_secs(10), child.wait_with_output()).await
    else {
        return heavy();
    };
    // 0 : certains sont ignorés, 1 : aucun, 128 : pas un dépôt git.
    match output.status.code() {
        Some(0) => String::from_utf8_lossy(&output.stdout)
            .split('\0')
            .filter(|path| !path.is_empty())
            .map(str::to_owned)
            .collect(),
        Some(1) => std::collections::HashSet::new(),
        _ => heavy(),
    }
}

/// Ordre naturel : « 2.git » avant « 10.notes ».
fn natural(a: &str, b: &str) -> std::cmp::Ordering {
    let (mut a, mut b) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (a.peek().copied(), b.peek().copied()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, _) => return std::cmp::Ordering::Less,
            (_, None) => return std::cmp::Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let take = |it: &mut std::iter::Peekable<std::str::Chars>| {
                    let mut digits = String::new();
                    while let Some(c) = it.peek().copied().filter(char::is_ascii_digit) {
                        digits.push(c);
                        it.next();
                    }
                    digits
                };
                let (x, y) = (take(&mut a), take(&mut b));
                let order = x
                    .trim_start_matches('0')
                    .len()
                    .cmp(&y.trim_start_matches('0').len())
                    .then_with(|| x.trim_start_matches('0').cmp(y.trim_start_matches('0')));
                if order.is_ne() {
                    return order;
                }
            }
            (Some(x), Some(y)) => {
                if x != y {
                    return x.cmp(&y);
                }
                a.next();
                b.next();
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum GitMark {
    Modified,
    Added,
    Renamed,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FileMark {
    /// Relatif au dossier de la session.
    pub path: String,
    pub mark: GitMark,
}

/// État git des fichiers du dossier de la session, pour colorer l'arbre comme monocode (modifié en jaune, nouveau
/// en vert). Vide hors dépôt. Les fichiers supprimés ne sont pas dans l'arbre, ils sont laissés de côté.
pub async fn marks(root: &Path) -> Result<Vec<FileMark>, AppError> {
    let root = root_of(root)?;
    let Some(git) = crate::services::worktree::git_binary() else {
        return Ok(Vec::new());
    };
    let limit = std::time::Duration::from_secs(15);
    let Ok(prefix) =
        crate::services::worktree::run(&git, &root, &["rev-parse", "--show-prefix"], limit).await
    else {
        return Ok(Vec::new());
    };
    let prefix = prefix.trim().to_owned();
    let args = ["status", "--porcelain=v1", "-z", "--untracked-files=all"];
    let listed = crate::services::worktree::run(&git, &root, &args, limit)
        .await
        .unwrap_or_default();
    Ok(parse_marks(&listed, &prefix))
}

fn parse_marks(listed: &str, prefix: &str) -> Vec<FileMark> {
    let mut marks = Vec::new();
    let mut fields = listed.split('\0');
    while let Some(entry) = fields.next() {
        if entry.len() < 4 {
            continue;
        }
        let (code, path) = entry.split_at(3);
        let (x, y) = (code.as_bytes()[0], code.as_bytes()[1]);
        // Un renommage est suivi de son ancien chemin, dans le champ d'après.
        if x == b'R' || x == b'C' {
            fields.next();
        }
        let mark = match (x, y) {
            (b'?', b'?') | (b'A', _) => GitMark::Added,
            (b'R', _) | (b'C', _) => GitMark::Renamed,
            (b'D', _) | (_, b'D') => continue,
            _ => GitMark::Modified,
        };
        let Some(path) = path.strip_prefix(prefix) else {
            continue;
        };
        marks.push(FileMark {
            path: path.to_owned(),
            mark,
        });
    }
    marks
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nuee-files-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("src")).unwrap();
        dir
    }

    #[test]
    fn reads_text_images_and_binaries() {
        let root = folder("read");
        fs::write(root.join("src/main.ts"), "const a = 1\n").unwrap();
        fs::write(root.join("logo.png"), [137, 80, 78, 71]).unwrap();
        fs::write(root.join("data.bin"), [1, 0, 2]).unwrap();

        let text = read(&root, "src/main.ts").unwrap();
        assert!(matches!(text.body, FileBody::Text { ref text } if text == "const a = 1\n"));
        assert!(text.path.ends_with("main.ts"));
        let image = read(&root, "logo.png").unwrap();
        assert!(
            matches!(image.body, FileBody::Image { ref data } if data.starts_with("data:image/png;base64,"))
        );
        assert!(matches!(
            read(&root, "data.bin").unwrap().body,
            FileBody::Binary
        ));
        assert!(read(&root, "src").is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn writes_and_detects_a_change_on_disk() {
        let root = folder("write");
        fs::write(root.join("notes.md"), "un").unwrap();
        let first = read(&root, "notes.md").unwrap().version;

        let saved = write(&root, "notes.md", "deux", Some(&first)).unwrap();
        assert!(!saved.conflict);
        assert_eq!(fs::read_to_string(root.join("notes.md")).unwrap(), "deux");

        // L'agent réécrit le fichier entre-temps : la version gardée par l'éditeur ne correspond plus.
        fs::write(root.join("notes.md"), "trois, plus long").unwrap();
        let refused = write(&root, "notes.md", "mien", Some(&saved.version)).unwrap();
        assert!(refused.conflict);
        assert_eq!(
            fs::read_to_string(root.join("notes.md")).unwrap(),
            "trois, plus long"
        );
        assert_eq!(stat(&root, "notes.md").unwrap(), Some(refused.version));

        let forced = write(&root, "notes.md", "mien", None).unwrap();
        assert!(!forced.conflict);
        assert_eq!(fs::read_to_string(root.join("notes.md")).unwrap(), "mien");
        assert_eq!(stat(&root, "absent.md").unwrap(), None);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_paths_outside_the_folder() {
        let root = folder("outside");
        let outside = folder("outside-secret");
        fs::write(outside.join("secret.txt"), "clé").unwrap();
        fs::write(root.join("src/ok.txt"), "ok").unwrap();

        let secret = outside.join("secret.txt").display().to_string();
        let escape = format!(
            "../{}/secret.txt",
            outside.file_name().unwrap().to_string_lossy()
        );
        for path in [
            escape.as_str(),
            "src/../../secret.txt",
            secret.as_str(),
            "",
            ".",
        ] {
            assert!(read(&root, path).is_err(), "lu : {path}");
            assert!(write(&root, path, "x", None).is_err(), "écrit : {path}");
            assert!(stat(&root, path).is_err(), "testé : {path}");
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(outside.join("secret.txt"), root.join("lien.txt")).unwrap();
            assert!(read(&root, "lien.txt").is_err());
            assert!(write(&root, "lien.txt", "x", None).is_err());
        }
        assert_eq!(
            fs::read_to_string(outside.join("secret.txt")).unwrap(),
            "clé"
        );
        assert!(read(&root, "./src/ok.txt").is_ok());
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn creates_renames_copies_and_moves_inside_the_folder() {
        let root = folder("ops");
        assert_eq!(create(&root, "", "docs", true).unwrap(), "docs");
        assert_eq!(create(&root, "docs", "a.md", false).unwrap(), "docs/a.md");
        assert!(create(&root, "docs", "a.md", false).is_err());
        for name in ["", "..", "x/y", "../evil.txt", "."] {
            assert!(create(&root, "", name, false).is_err(), "nom : {name}");
        }
        assert!(create(&root, "..", "evil.txt", false).is_err());

        assert_eq!(rename(&root, "docs/a.md", "b.md").unwrap(), "docs/b.md");
        assert!(rename(&root, "docs/b.md", "../b.md").is_err());
        assert_eq!(copy(&root, "docs/b.md", "docs").unwrap(), "docs/b 2.md");
        assert_eq!(copy(&root, "docs/b.md", "docs").unwrap(), "docs/b 3.md");
        assert_eq!(copy(&root, "docs", "").unwrap(), "docs 2");
        assert!(root.join("docs 2/b 3.md").is_file());
        assert!(copy(&root, "docs", "docs").is_err());
        assert_eq!(move_to(&root, "docs/b.md", "src").unwrap(), "src/b.md");
        assert!(move_to(&root, "docs", "docs").is_err());
        assert!(move_to(&root, "src/b.md", "..").is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn searches_content_without_git_and_skips_dependencies() {
        let root = folder("search");
        fs::write(root.join("src/a.ts"), "const Total = 1\nlet subtotal = 2\n").unwrap();
        fs::write(root.join("notes.md"), "le total du mois\n").unwrap();
        let files = vec!["src/a.ts".to_owned(), "notes.md".to_owned()];
        let options = |query: &str, case_sensitive, whole_word| SearchOptions {
            query: query.to_owned(),
            case_sensitive,
            whole_word,
            regex: false,
        };
        let found = scan(&root, &files, &options("total", false, false));
        assert_eq!(found.matches.len(), 3);
        assert_eq!(found.matches[1].line, 2);
        assert_eq!(
            scan(&root, &files, &options("total", false, true))
                .matches
                .len(),
            2
        );
        assert_eq!(
            scan(&root, &files, &options("Total", true, true))
                .matches
                .len(),
            1
        );

        assert!(noisy(&root, &root.join("node_modules/vue/index.js")));
        assert!(noisy(&root, &root.join(".git/index")));
        assert!(!noisy(&root, &root.join("src/a.ts")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn lists_one_folder_hiding_ignored_entries() {
        let root = folder("dir");
        fs::create_dir_all(root.join("node_modules/vue")).unwrap();
        fs::create_dir_all(root.join("docs")).unwrap();
        fs::write(root.join("10.md"), "").unwrap();
        fs::write(root.join("2.md"), "").unwrap();
        fs::write(root.join(".DS_Store"), "").unwrap();
        fs::write(root.join("src/a.ts"), "").unwrap();
        let listed = tauri::async_runtime::block_on(list_dir(&root, "")).unwrap();
        let names: Vec<_> = listed
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();
        assert_eq!(names, ["docs", "src", "2.md", "10.md"]);
        let inner = tauri::async_runtime::block_on(list_dir(&root, "src")).unwrap();
        assert_eq!(inner.entries[0].path, "src/a.ts");
        assert!(tauri::async_runtime::block_on(list_dir(&root, "..")).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn git_marks_follow_the_session_folder() {
        let listed =
            " M app/a.ts\0?? app/new.ts\0R  app/b.ts\0app/old.ts\0 D app/gone.ts\0M  other/c.ts\0";
        let marks = parse_marks(listed, "app/");
        let found: Vec<_> = marks
            .iter()
            .map(|mark| (mark.path.as_str(), mark.mark))
            .collect();
        assert_eq!(
            found,
            [
                ("a.ts", GitMark::Modified),
                ("new.ts", GitMark::Added),
                ("b.ts", GitMark::Renamed)
            ]
        );
    }
}
