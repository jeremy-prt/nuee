#[cfg(debug_assertions)]
use std::collections::HashSet;
use std::env;
use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::sync::OnceLock;
#[cfg(debug_assertions)]
use std::sync::{Mutex, MutexGuard, PoisonError};

static SEARCH_PATH: OnceLock<OsString> = OnceLock::new();

/// PATH donné aux agents : celui du shell de l'utilisateur, puis celui hérité, puis les dossiers
/// d'installation courants. Lancée depuis le Finder, l'app n'hérite que de `/usr/bin:/bin:...`.
pub fn search_path() -> &'static OsStr {
    SEARCH_PATH.get_or_init(build)
}

pub fn find_binary(name: &str) -> Option<PathBuf> {
    if is_hidden(name) {
        return None;
    }
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
    which::which_in(name, Some(search_path()), cwd).ok()
}

/// Debug seulement : `NUEE_HIDE_BINARIES=gh,claude` fait passer ces outils pour absents.
#[cfg(debug_assertions)]
pub fn is_hidden(name: &str) -> bool {
    hidden().contains(name)
}

#[cfg(not(debug_assertions))]
pub fn is_hidden(_name: &str) -> bool {
    false
}

#[cfg(debug_assertions)]
fn hidden() -> MutexGuard<'static, HashSet<String>> {
    static HIDDEN: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    HIDDEN
        .get_or_init(|| {
            let names = env::var("NUEE_HIDE_BINARIES").unwrap_or_default();
            Mutex::new(parse_hidden(&names))
        })
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
}

#[cfg(debug_assertions)]
fn parse_hidden(names: &str) -> HashSet<String> {
    names
        .split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect()
}

#[cfg(all(test, debug_assertions))]
pub(crate) fn hide(name: &str) {
    hidden().insert(name.to_owned());
}

#[cfg(all(test, debug_assertions))]
pub(crate) fn reveal(name: &str) {
    hidden().remove(name);
}

fn build() -> OsString {
    let mut dirs: Vec<PathBuf> = Vec::new();
    #[cfg(unix)]
    if let Some(path) = login_shell_path() {
        dirs.extend(env::split_paths(&path));
    }
    if let Some(path) = env::var_os("PATH") {
        dirs.extend(env::split_paths(&path));
    }
    dirs.extend(fallback_dirs());

    let mut unique: Vec<PathBuf> = Vec::new();
    for dir in dirs {
        if !dir.as_os_str().is_empty() && !unique.contains(&dir) {
            unique.push(dir);
        }
    }
    env::join_paths(unique).unwrap_or_default()
}

fn fallback_dirs() -> Vec<PathBuf> {
    let home = env::home_dir().unwrap_or_default();
    #[cfg(unix)]
    let dirs = [
        ".local/bin",
        ".claude/local",
        ".npm-global/bin",
        ".bun/bin",
        ".volta/bin",
        ".cargo/bin",
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
    ];
    #[cfg(windows)]
    let dirs = [
        ".local\\bin",
        "AppData\\Roaming\\npm",
        ".bun\\bin",
        ".volta\\bin",
        // gh posé par winget : son installeur ne change le PATH que des process lancés après lui.
        "C:\\Program Files\\GitHub CLI",
    ];
    dirs.iter().map(|dir| home.join(dir)).collect()
}

/// `-i` en plus de `-l` : zsh ne lit `.zshrc` (nvm, fnm, mise...) qu'en shell interactif.
/// Un rc qui bloque est coupé au bout de 5 s ; on garde alors les dossiers de repli.
#[cfg(unix)]
fn login_shell_path() -> Option<OsString> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::time::Duration;

    const MARK: &str = "__NUEE_PATH__";
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut child = Command::new(shell)
        .args(["-ilc", &format!("printf '{MARK}%s{MARK}' \"$PATH\"")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut out = String::new();
        let _ = stdout.read_to_string(&mut out);
        let _ = tx.send(out);
    });
    let out = rx.recv_timeout(Duration::from_secs(5));
    let _ = child.kill();
    let _ = child.wait();

    let out = out.ok()?;
    let path = out.split(MARK).nth(1)?;
    (!path.is_empty()).then(|| path.into())
}

#[cfg(all(test, debug_assertions))]
mod tests {
    use super::*;

    #[test]
    fn hidden_names_are_trimmed() {
        let names = parse_hidden(" gh, claude ,,");
        assert_eq!(names, HashSet::from(["gh".to_owned(), "claude".to_owned()]));
        assert!(parse_hidden("").is_empty());
    }

    #[test]
    fn a_hidden_binary_is_missing_until_revealed() {
        let name = if cfg!(windows) { "cmd" } else { "true" };
        assert!(find_binary(name).is_some());
        hide(name);
        assert!(is_hidden(name));
        assert!(find_binary(name).is_none());
        reveal(name);
        assert!(find_binary(name).is_some());
    }
}
