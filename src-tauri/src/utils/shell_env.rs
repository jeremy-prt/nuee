use std::env;
use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::sync::OnceLock;

static SEARCH_PATH: OnceLock<OsString> = OnceLock::new();

/// PATH donné aux agents : celui du shell de l'utilisateur, puis celui hérité, puis les dossiers
/// d'installation courants. Lancée depuis le Finder, l'app n'hérite que de `/usr/bin:/bin:...`.
pub fn search_path() -> &'static OsStr {
    SEARCH_PATH.get_or_init(build)
}

pub fn find_binary(name: &str) -> Option<PathBuf> {
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
    which::which_in(name, Some(search_path()), cwd).ok()
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
