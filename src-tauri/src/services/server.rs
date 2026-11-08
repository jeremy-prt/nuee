use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::process::kill_tree;
use crate::utils::shell_env;

/// Même fichier que l'app Claude : ses serveurs se lancent aussi depuis Nuée.
const LAUNCH_FILE: &str = ".claude/launch.json";
const DEFAULT_PORT: u16 = 3000;
/// Au-delà, le début des logs part.
const MAX_LOGS: usize = 512 * 1024;
const PORT_SEARCH: u16 = 100;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ServerStatus {
    Stopped,
    Starting,
    Running,
    Exited,
}

#[derive(Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ServerInfo {
    pub name: String,
    pub port: u16,
    pub url: Option<String>,
    /// Une simple adresse, sans commande : un serveur que l'utilisateur lance lui-même.
    pub external: bool,
    pub status: ServerStatus,
    /// Port réellement donné au serveur, autre que `port` si celui-ci était pris.
    pub active_port: Option<u16>,
    pub exit_code: Option<u32>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ServerList {
    pub root: String,
    pub servers: Vec<ServerInfo>,
    /// Pas de `.claude/launch.json` dans le dossier.
    pub missing: bool,
    /// Fichier illisible : le message du parseur.
    pub problem: Option<String>,
}

#[derive(Serialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export)]
pub enum ServerStart {
    Started { server: ServerInfo },
    PortTaken { port: u16 },
    CommandNotFound { command: String },
}

#[derive(Clone, Serialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export)]
pub enum ServerEvent {
    Output {
        root: String,
        name: String,
        data: String,
    },
    Status {
        root: String,
        server: ServerInfo,
    },
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ServerLogs {
    pub root: String,
    pub name: String,
    pub data: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchFile {
    #[serde(default)]
    configurations: Vec<LaunchEntry>,
    auto_verify: Option<bool>,
}

/// Vérification après chaque modification sans qu'on la demande : seulement avec `"autoVerify": true` (choix de
/// Jérémy, chaque vérification coûte des tokens). Sinon l'agent ne vérifie que si on le lui demande.
pub fn auto_verify(root: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(root.join(LAUNCH_FILE)) else {
        return false;
    };
    serde_json::from_str::<LaunchFile>(&strip_jsonc(&text))
        .is_ok_and(|file| file.auto_verify == Some(true))
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchEntry {
    name: String,
    runtime_executable: Option<String>,
    #[serde(default)]
    runtime_args: Vec<String>,
    program: Option<String>,
    #[serde(default)]
    args: Vec<String>,
    port: Option<u16>,
    cwd: Option<String>,
    #[serde(default)]
    env: BTreeMap<String, String>,
    auto_port: Option<bool>,
    url: Option<String>,
}

impl LaunchEntry {
    fn external(&self) -> bool {
        self.runtime_executable.is_none() && self.program.is_none()
    }

    fn port(&self) -> u16 {
        self.port.unwrap_or(DEFAULT_PORT)
    }

    fn stopped(&self) -> ServerInfo {
        ServerInfo {
            name: self.name.clone(),
            port: self.port(),
            url: self.url.clone(),
            external: self.external(),
            status: ServerStatus::Stopped,
            active_port: None,
            exit_code: None,
        }
    }
}

struct Process {
    root: String,
    entry: LaunchEntry,
    pid: u32,
    port: u16,
    // Gardé ouvert : le pty fermé, le serveur recevrait SIGHUP.
    _master: Mutex<Box<dyn MasterPty + Send>>,
    status: Mutex<(ServerStatus, Option<u32>)>,
    logs: Mutex<String>,
    stopping: AtomicBool,
    exited: AtomicBool,
}

impl Process {
    fn info(&self) -> ServerInfo {
        let (status, exit_code) = *lock(&self.status);
        ServerInfo {
            status,
            exit_code,
            active_port: matches!(status, ServerStatus::Starting | ServerStatus::Running)
                .then_some(self.port),
            ..self.entry.stopped()
        }
    }

    fn alive(&self) -> bool {
        matches!(
            lock(&self.status).0,
            ServerStatus::Starting | ServerStatus::Running
        )
    }
}

#[derive(Default)]
struct Shared {
    processes: Mutex<HashMap<(String, String), Arc<Process>>>,
    // Verrouillé avant les logs d'un process : `watch` voit ainsi des logs et un flux qui se suivent sans trou.
    channel: Mutex<Option<Channel<ServerEvent>>>,
}

impl Shared {
    fn status(&self, process: &Process, status: ServerStatus, exit_code: Option<u32>) {
        *lock(&process.status) = (status, exit_code);
        if let Some(channel) = lock(&self.channel).as_ref() {
            let _ = channel.send(ServerEvent::Status {
                root: process.root.clone(),
                server: process.info(),
            });
        }
    }
}

/// Les serveurs de `.claude/launch.json`, rangés par dossier de session et nom. Un serveur lancé reste à son
/// dossier, quelle que soit la session qui l'affiche ; ils s'arrêtent tous avec l'app.
#[derive(Default)]
pub struct ServerService {
    shared: Arc<Shared>,
    // Deux clics rapprochés lanceraient deux fois le même serveur, le premier hors de la liste et jamais arrêté.
    starting: Mutex<()>,
}

impl ServerService {
    pub fn list(&self, root: &Path) -> ServerList {
        let key = root.to_string_lossy().into_owned();
        let processes: Vec<Arc<Process>> = lock(&self.shared.processes)
            .values()
            .filter(|process| process.root == key)
            .cloned()
            .collect();
        let (entries, missing, problem) = match read_launch(root) {
            Ok(Some(entries)) => (entries, false, None),
            Ok(None) => (Vec::new(), true, None),
            Err(problem) => (Vec::new(), false, Some(problem)),
        };
        let mut servers: Vec<ServerInfo> = entries
            .iter()
            .map(|entry| {
                processes
                    .iter()
                    .find(|process| process.entry.name == entry.name)
                    .map_or_else(|| entry.stopped(), |process| process.info())
            })
            .collect();
        // Retiré du fichier pendant qu'il tourne : il reste là pour qu'on puisse l'arrêter.
        for process in &processes {
            if process.alive() && !entries.iter().any(|e| e.name == process.entry.name) {
                servers.push(process.info());
            }
        }
        ServerList {
            root: key,
            servers,
            missing,
            problem,
        }
    }

    pub fn start(&self, root: &Path, name: &str) -> Result<ServerStart, AppError> {
        let _starting = lock(&self.starting);
        let key = root.to_string_lossy().into_owned();
        let entries = read_launch(root)
            .map_err(AppError::InvalidInput)?
            .unwrap_or_default();
        let entry = entries
            .into_iter()
            .find(|entry| entry.name == name)
            .ok_or_else(|| AppError::InvalidInput(format!("serveur inconnu : {name}")))?;
        if entry.external() {
            return Err(AppError::InvalidInput(format!(
                "{name} n'a pas de commande à lancer"
            )));
        }
        let id = (key.clone(), name.to_owned());
        if let Some(process) = lock(&self.shared.processes).get(&id)
            && process.alive()
        {
            return Ok(ServerStart::Started {
                server: process.info(),
            });
        }

        let dir = work_dir(root, entry.cwd.as_deref())?;
        let (command, mut args) = match &entry.program {
            Some(program) if entry.runtime_executable.is_none() => {
                let mut args = vec![program.clone()];
                args.extend(entry.args.iter().cloned());
                ("node".to_owned(), args)
            }
            _ => (
                entry.runtime_executable.clone().unwrap_or_default(),
                entry.runtime_args.clone(),
            ),
        };
        let Some(binary) = find(&command, &dir) else {
            return Ok(ServerStart::CommandNotFound { command });
        };

        let preferred = entry.port();
        let mut port = preferred;
        if self.port_busy(preferred) {
            // Comme l'app Claude : sans `autoPort`, le serveur suit aussi le port libre.
            let free = (entry.auto_port != Some(false))
                .then(|| {
                    (preferred.saturating_add(1)..=preferred.saturating_add(PORT_SEARCH))
                        .find(|candidate| !self.port_busy(*candidate))
                })
                .flatten();
            let Some(free) = free else {
                return Ok(ServerStart::PortTaken { port: preferred });
            };
            port = free;
            args = with_port(&args, port);
        }

        let mut builder = CommandBuilder::new(binary);
        builder.args(&args);
        builder.cwd(&dir);
        builder.env("PATH", shell_env::search_path());
        builder.env("TERM", "xterm-256color");
        builder.env("COLORTERM", "truecolor");
        builder.env("PORT", port.to_string());
        for (name, value) in &entry.env {
            builder.env(name, value);
        }
        let process = self.spawn(key, entry, port, builder)?;
        Ok(ServerStart::Started {
            server: process.info(),
        })
    }

    fn spawn(
        &self,
        root: String,
        entry: LaunchEntry,
        port: u16,
        command: CommandBuilder,
    ) -> Result<Arc<Process>, AppError> {
        let size = PtySize {
            rows: 50,
            cols: 200,
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = native_pty_system().openpty(size).map_err(failed)?;
        let mut child = pair.slave.spawn_command(command).map_err(failed)?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(failed)?;
        let process = Arc::new(Process {
            root: root.clone(),
            pid: child.process_id().unwrap_or_default(),
            port,
            _master: Mutex::new(pair.master),
            status: Mutex::new((ServerStatus::Starting, None)),
            logs: Mutex::new(String::new()),
            stopping: AtomicBool::new(false),
            exited: AtomicBool::new(false),
            entry,
        });
        lock(&self.shared.processes)
            .insert((root.clone(), process.entry.name.clone()), process.clone());
        self.shared.status(&process, ServerStatus::Starting, None);

        let shared = self.shared.clone();
        let output = process.clone();
        std::thread::spawn(move || {
            let mut chunk = [0u8; 16 * 1024];
            let mut pending = Vec::new();
            while let Ok(read) = reader.read(&mut chunk) {
                if read == 0 {
                    break;
                }
                let data = decode(&mut pending, &chunk[..read]);
                if data.is_empty() {
                    continue;
                }
                let channel = lock(&shared.channel);
                append(&mut lock(&output.logs), &data);
                if let Some(channel) = channel.as_ref() {
                    let _ = channel.send(ServerEvent::Output {
                        root: output.root.clone(),
                        name: output.entry.name.clone(),
                        data,
                    });
                }
            }
            let code = child.wait().ok().map(|status| status.exit_code());
            output.exited.store(true, Ordering::Relaxed);
            let status = if output.stopping.load(Ordering::Relaxed) {
                ServerStatus::Stopped
            } else {
                ServerStatus::Exited
            };
            shared.status(
                &output,
                status,
                code.filter(|_| status == ServerStatus::Exited),
            );
        });

        // Prêt quand le port répond : un serveur qui démarre n'écrit rien de commun à tous les outils.
        let shared = self.shared.clone();
        let ready = process.clone();
        std::thread::spawn(move || {
            while !ready.exited.load(Ordering::Relaxed) && !ready.stopping.load(Ordering::Relaxed) {
                if listening(ready.port) {
                    if lock(&ready.status).0 == ServerStatus::Starting {
                        shared.status(&ready, ServerStatus::Running, None);
                    }
                    return;
                }
                std::thread::sleep(Duration::from_millis(250));
            }
        });
        Ok(process)
    }

    /// SIGTERM au groupe du serveur (gestionnaire de paquets et ce qu'il a lancé), SIGKILL trois secondes plus tard.
    pub fn stop(&self, root: &str, name: &str) {
        let process = lock(&self.shared.processes)
            .get(&(root.to_owned(), name.to_owned()))
            .cloned();
        if let Some(process) = process.filter(|process| process.alive()) {
            terminate(process);
        }
    }

    pub fn stop_root(&self, root: &str) {
        for process in self.alive(Some(root)) {
            terminate(process);
        }
    }

    /// Fermeture de l'app : tous arrêtés, deux secondes laissées pour ranger avant SIGKILL.
    pub fn shutdown(&self) {
        let processes = self.alive(None);
        for process in &processes {
            process.stopping.store(true, Ordering::Relaxed);
            kill_tree(process.pid, false);
        }
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline
            && processes
                .iter()
                .any(|process| !process.exited.load(Ordering::Relaxed))
        {
            std::thread::sleep(Duration::from_millis(50));
        }
        for process in processes {
            if !process.exited.load(Ordering::Relaxed) {
                kill_tree(process.pid, true);
            }
        }
    }

    /// Sortie d'un serveur du dossier, pour l'agent (`preview_logs`).
    pub fn logs(&self, root: &str, name: &str) -> Option<String> {
        lock(&self.shared.processes)
            .get(&(root.to_owned(), name.to_owned()))
            .map(|process| lock(&process.logs).clone())
    }

    /// Branche le flux du front (un seul, remplacé au rechargement de la page) et rend les logs déjà reçus.
    pub fn watch(&self, channel: Channel<ServerEvent>) -> Vec<ServerLogs> {
        let mut current = lock(&self.shared.channel);
        *current = Some(channel);
        lock(&self.shared.processes)
            .values()
            .map(|process| ServerLogs {
                root: process.root.clone(),
                name: process.entry.name.clone(),
                data: lock(&process.logs).clone(),
            })
            .collect()
    }

    fn alive(&self, root: Option<&str>) -> Vec<Arc<Process>> {
        lock(&self.shared.processes)
            .values()
            .filter(|process| root.is_none_or(|root| process.root == root) && process.alive())
            .cloned()
            .collect()
    }

    /// Un port tenu par un autre programme, ou réservé par un de nos serveurs qui démarre.
    fn port_busy(&self, port: u16) -> bool {
        self.alive(None).iter().any(|process| process.port == port) || port_taken(port)
    }
}

fn terminate(process: Arc<Process>) {
    process.stopping.store(true, Ordering::Relaxed);
    kill_tree(process.pid, false);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        if !process.exited.load(Ordering::Relaxed) {
            kill_tree(process.pid, true);
        }
    });
}

/// `None` : pas de fichier. `Err` : fichier illisible, avec le message à montrer.
fn read_launch(root: &Path) -> Result<Option<Vec<LaunchEntry>>, String> {
    let text = match std::fs::read_to_string(root.join(LAUNCH_FILE)) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let file: LaunchFile =
        serde_json::from_str(&strip_jsonc(&text)).map_err(|error| error.to_string())?;
    let mut entries: Vec<LaunchEntry> = Vec::new();
    for entry in file.configurations {
        if entry.name.trim().is_empty() {
            return Err("configuration sans `name`".to_owned());
        }
        if entry.external() && entry.url.is_none() {
            return Err(format!(
                "{} : ni `runtimeExecutable`, ni `program`, ni `url`",
                entry.name
            ));
        }
        if !entries.iter().any(|known| known.name == entry.name) {
            entries.push(entry);
        }
    }
    Ok(Some(entries))
}

/// Le fichier accepte les commentaires et les virgules finales, comme dans l'app Claude.
fn strip_jsonc(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut in_string = false;
    while let Some(c) = chars.next() {
        if in_string {
            out.push(c);
            match c {
                '\\' => out.extend(chars.next()),
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }
        match (c, chars.peek()) {
            ('"', _) => {
                in_string = true;
                out.push(c);
            }
            ('/', Some('/')) => {
                for next in chars.by_ref() {
                    if next == '\n' {
                        out.push('\n');
                        break;
                    }
                }
            }
            ('/', Some('*')) => {
                chars.next();
                let mut previous = ' ';
                for next in chars.by_ref() {
                    if previous == '*' && next == '/' {
                        break;
                    }
                    previous = next;
                }
            }
            _ => out.push(c),
        }
    }
    drop_trailing_commas(&out)
}

fn drop_trailing_commas(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut in_string = false;
    let mut escaped = false;
    for (index, &c) in chars.iter().enumerate() {
        if in_string {
            in_string = escaped || c != '"';
            escaped = !escaped && c == '\\';
        } else if c == '"' {
            in_string = true;
        } else if c == ','
            && matches!(
                chars[index + 1..].iter().find(|next| !next.is_whitespace()),
                Some('}' | ']')
            )
        {
            continue;
        }
        out.push(c);
    }
    out
}

/// Dossier relatif à la racine de la session, sans en sortir.
fn work_dir(root: &Path, cwd: Option<&str>) -> Result<PathBuf, AppError> {
    let Some(cwd) = cwd.filter(|cwd| !cwd.trim().is_empty()) else {
        return Ok(root.to_path_buf());
    };
    let relative = cwd.replace("${workspaceFolder}", &root.to_string_lossy());
    let dir = std::fs::canonicalize(root.join(&relative))
        .map_err(|_| AppError::InvalidInput(format!("dossier introuvable : {cwd}")))?;
    if !dir.starts_with(root) || !dir.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "`cwd` hors du dossier de la session : {cwd}"
        )));
    }
    Ok(dir)
}

fn find(command: &str, dir: &Path) -> Option<PathBuf> {
    if command.trim().is_empty() || shell_env::is_hidden(command) {
        return None;
    }
    which::which_in(command, Some(shell_env::search_path()), dir).ok()
}

/// Comme l'app Claude : un `--port` ou `-p` des arguments suit le port choisi.
fn with_port(args: &[String], port: u16) -> Vec<String> {
    let mut out = Vec::with_capacity(args.len());
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if arg == "--port" || arg == "-p" {
            out.push(arg.clone());
            if iter.next().is_some() {
                out.push(port.to_string());
            }
        } else if arg.starts_with("--port=") {
            out.push(format!("--port={port}"));
        } else {
            out.push(arg.clone());
        }
    }
    out
}

const LOOPBACK: [IpAddr; 2] = [
    IpAddr::V4(Ipv4Addr::LOCALHOST),
    IpAddr::V6(Ipv6Addr::LOCALHOST),
];

fn listening(port: u16) -> bool {
    LOOPBACK.iter().any(|ip| {
        TcpStream::connect_timeout(&SocketAddr::new(*ip, port), Duration::from_millis(200)).is_ok()
    })
}

/// Vite écoute sur `::1` seul : 127.0.0.1 resterait libre, d'où la connexion sur les deux.
fn port_taken(port: u16) -> bool {
    listening(port) || TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_err()
}

fn append(logs: &mut String, data: &str) {
    logs.push_str(data);
    if logs.len() > MAX_LOGS {
        let mut cut = logs.len() - MAX_LOGS;
        while !logs.is_char_boundary(cut) {
            cut += 1;
        }
        let cut = logs[cut..].find('\n').map_or(cut, |line| cut + line + 1);
        logs.drain(..cut);
    }
}

/// Un caractère UTF-8 peut être coupé entre deux lectures : sa fin attend la lecture suivante.
fn decode(pending: &mut Vec<u8>, chunk: &[u8]) -> String {
    pending.extend_from_slice(chunk);
    match std::str::from_utf8(pending) {
        Ok(text) => {
            let text = text.to_owned();
            pending.clear();
            text
        }
        Err(error) if error.error_len().is_none() => {
            let valid = error.valid_up_to();
            let text = String::from_utf8_lossy(&pending[..valid]).into_owned();
            pending.drain(..valid);
            text
        }
        Err(_) => {
            let text = String::from_utf8_lossy(pending).into_owned();
            pending.clear();
            text
        }
    }
}

fn failed(error: impl std::fmt::Display) -> AppError {
    AppError::Io(std::io::Error::other(error.to_string()))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn project(launch: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nuee-server-{}", uuid()));
        std::fs::create_dir_all(dir.join(".claude")).unwrap();
        std::fs::write(dir.join(LAUNCH_FILE), launch).unwrap();
        std::fs::canonicalize(dir).unwrap()
    }

    fn uuid() -> String {
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        format!(
            "{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        )
    }

    fn wait(service: &ServerService, root: &Path, name: &str, status: ServerStatus) -> ServerInfo {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let info = service
                .list(root)
                .servers
                .into_iter()
                .find(|server| server.name == name)
                .unwrap();
            if info.status == status || Instant::now() > deadline {
                return info;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    #[test]
    fn comments_and_trailing_commas_are_accepted() {
        let text = r#"{
            // serveur de dev
            "configurations": [
                { "name": "web", /* bloc */ "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev",], "url": "http://a//b", "env": { "K": "v\",]" }, },
            ],
        }"#;
        let file: LaunchFile = serde_json::from_str(&strip_jsonc(text)).unwrap();
        assert_eq!(file.configurations.len(), 1);
        assert_eq!(file.configurations[0].runtime_args, ["run", "dev"]);
        assert_eq!(file.configurations[0].url.as_deref(), Some("http://a//b"));
        assert_eq!(file.configurations[0].env["K"], "v\",]");
    }

    #[test]
    fn a_missing_or_broken_file_is_reported() {
        let service = ServerService::default();
        let empty = std::env::temp_dir().join(format!("nuee-server-empty-{}", uuid()));
        std::fs::create_dir_all(&empty).unwrap();
        assert!(service.list(&empty).missing);

        let broken = project("{ \"configurations\": [ { \"name\": } ] }");
        let list = service.list(&broken);
        assert!(!list.missing);
        assert!(list.problem.is_some());

        let unnamed = project(r#"{ "configurations": [ { "name": "x" } ] }"#);
        assert!(service.list(&unnamed).problem.unwrap().contains("x"));
    }

    #[test]
    fn port_flags_follow_the_chosen_port() {
        let args: Vec<String> = [
            "exec", "vite", "--port", "1430", "-p", "1", "--port=2", "--host",
        ]
        .map(str::to_owned)
        .to_vec();
        assert_eq!(
            with_port(&args, 1431),
            [
                "exec",
                "vite",
                "--port",
                "1431",
                "-p",
                "1431",
                "--port=1431",
                "--host"
            ]
        );
    }

    #[test]
    fn cwd_stays_inside_the_root() {
        let root = project("{}");
        std::fs::create_dir_all(root.join("apps/web")).unwrap();
        assert_eq!(
            work_dir(&root, Some("${workspaceFolder}/apps/web")).unwrap(),
            root.join("apps/web")
        );
        assert!(work_dir(&root, Some("..")).is_err());
        assert!(work_dir(&root, Some("nope")).is_err());
    }

    #[test]
    fn a_server_gets_a_free_port_runs_and_stops() {
        let holder = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let taken = holder.local_addr().unwrap().port();
        let script = "import http.server,os;print('port',os.environ['PORT'],flush=True);\
            http.server.HTTPServer(('127.0.0.1',int(os.environ['PORT'])),http.server.SimpleHTTPRequestHandler).serve_forever()";
        let launch = serde_json::json!({ "configurations": [
            { "name": "web", "runtimeExecutable": "python3", "runtimeArgs": ["-c", script], "port": taken },
            { "name": "fixed", "runtimeExecutable": "python3", "runtimeArgs": ["-c", script], "port": taken, "autoPort": false },
            { "name": "ghost", "runtimeExecutable": "nuee-absent-binary", "port": taken },
            { "name": "crash", "runtimeExecutable": "sh", "runtimeArgs": ["-c", "echo boom; exit 3"], "port": taken },
        ]});
        let root = project(&launch.to_string());
        let service = ServerService::default();

        assert!(matches!(
            service.start(&root, "fixed").unwrap(),
            ServerStart::PortTaken { port } if port == taken
        ));
        assert!(matches!(
            service.start(&root, "ghost").unwrap(),
            ServerStart::CommandNotFound { .. }
        ));

        let ServerStart::Started { server } = service.start(&root, "web").unwrap() else {
            panic!("pas démarré");
        };
        let port = server.active_port.unwrap();
        assert_ne!(port, taken);
        let running = wait(&service, &root, "web", ServerStatus::Running);
        assert_eq!(running.status, ServerStatus::Running);
        let key = root.to_string_lossy().into_owned();
        let logs = &service.watch(Channel::new(|_| Ok(())))[0].data;
        assert!(logs.contains(&format!("port {port}")), "{logs}");

        service.stop(&key, "web");
        assert_eq!(
            wait(&service, &root, "web", ServerStatus::Stopped).status,
            ServerStatus::Stopped
        );
        assert!(!listening(port));

        service.start(&root, "crash").unwrap();
        let crashed = wait(&service, &root, "crash", ServerStatus::Exited);
        assert_eq!(crashed.status, ServerStatus::Exited);
        assert_eq!(crashed.exit_code, Some(3));
        drop(holder);
    }

    #[test]
    fn shutdown_kills_a_server_that_ignores_sigterm() {
        let launch = serde_json::json!({ "configurations": [
            { "name": "têtu", "runtimeExecutable": "python3", "runtimeArgs": ["-c", "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); print('ok', flush=True); time.sleep(30)"], "port": 4999 },
        ]});
        let root = project(&launch.to_string());
        let service = ServerService::default();
        service.start(&root, "têtu").unwrap();
        // Laisse Python poser son gestionnaire avant le SIGTERM.
        while service.watch(Channel::new(|_| Ok(())))[0].data.is_empty() {
            std::thread::sleep(Duration::from_millis(50));
        }
        let started = Instant::now();
        service.shutdown();
        let elapsed = started.elapsed();
        assert!(elapsed >= Duration::from_secs(2) && elapsed < Duration::from_secs(3));
        assert_eq!(
            wait(&service, &root, "têtu", ServerStatus::Stopped).status,
            ServerStatus::Stopped
        );
    }
}
