mod claude;
mod process;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::timeout;
use ts_rs::TS;

use crate::error::AppError;
use crate::utils::shell_env;

/// Agents qu'on sait lancer. En ajouter un : une variante ici, un `Driver` dans son fichier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum AgentKind {
    Claude,
}

impl AgentKind {
    fn driver(self, cwd: &Path) -> Box<dyn Driver> {
        match self {
            Self::Claude => Box::new(claude::Claude::new(cwd)),
        }
    }
}

#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TurnRequest {
    pub chat_id: String,
    pub agent: AgentKind,
    /// Dossier du projet. `None` : chat sans projet, l'agent travaille dans un dossier vide propre au chat.
    pub cwd: Option<String>,
    pub prompt: String,
    /// Session renvoyée par l'agent au tour précédent : la reprendre garde le fil de la conversation.
    pub session_id: Option<String>,
    pub options: TurnOptions,
}

/// Réglages d'un chat, repris à chaque tour : en changer en cours de conversation est possible.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TurnOptions {
    pub mode: PermissionMode,
    /// Valeur prise dans le catalogue de l'agent ; `None` laisse l'agent choisir.
    pub model: Option<String>,
    pub effort: Option<Effort>,
}

/// Pas de mode « validation manuelle » : Nuée laisse l'agent agir seul.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum PermissionMode {
    /// Aucune demande de permission.
    Bypass,
    /// L'agent juge lui-même ce qui est risqué.
    Auto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Effort {
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ToolKind {
    Read,
    Edit,
    Command,
    Search,
    Web,
    Agent,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum TurnStatus {
    Completed,
    Failed,
    Stopped,
    Unauthenticated,
}

/// Modèles proposés par l'agent installé, tels qu'il les décrit lui-même.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Catalog {
    pub models: Vec<ModelInfo>,
    /// `value` du modèle utilisé quand on n'en choisit aucun.
    pub default_model: Option<String>,
    pub default_effort: Effort,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModelInfo {
    pub value: String,
    pub label: String,
    pub description: String,
    /// Vide quand le modèle ne règle pas son effort.
    pub efforts: Vec<Effort>,
}

/// Flux commun à tous les agents : chaque driver traduit sa sortie dans ces événements.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum AgentEvent {
    Session {
        id: String,
    },
    /// Morceau d'un bloc de texte ; les morceaux d'un même bloc partagent `id`.
    Text {
        id: String,
        delta: String,
    },
    /// Outil appelé. Peut revenir avec le même `id` quand ses paramètres sont complets.
    Tool {
        id: String,
        name: String,
        kind: ToolKind,
        summary: Option<String>,
    },
    ToolResult {
        id: String,
        output: String,
        is_error: bool,
    },
    /// Toujours le dernier événement d'un tour, envoyé une fois le process terminé.
    TurnEnd {
        status: TurnStatus,
        error: Option<String>,
        duration_ms: Option<u32>,
    },
}

/// Bilan d'un tour annoncé par l'agent lui-même, avant qu'il ne quitte.
#[derive(Debug, Clone, PartialEq)]
pub struct Outcome {
    pub status: TurnStatus,
    pub error: Option<String>,
    pub duration_ms: Option<u32>,
}

/// Ce qu'un agent fournit pour être branché : sa ligne de commande et la lecture de sa sortie.
/// Le prompt part toujours sur stdin. Un driver ne sert qu'à un tour : il garde l'état du flux.
trait Driver: Send + Sync {
    fn binary(&self) -> &'static str;
    /// Lance l'agent sans tour pour qu'il décrive ses modèles : ses arguments et la ligne à lui écrire.
    fn catalog_probe(&self) -> (Vec<String>, String);
    fn parse_catalog(&self, line: &str) -> Option<Catalog>;
    fn args(&self, request: &TurnRequest) -> Vec<String>;
    fn parse_line(&mut self, line: &str) -> Vec<AgentEvent>;
    fn outcome(&self) -> Option<&Outcome>;
}

/// Temps laissé à l'agent pour quitter après son bilan, puis après un SIGTERM.
const GRACE: Duration = Duration::from_secs(2);
const CATALOG_TIMEOUT: Duration = Duration::from_secs(20);
const STDERR_TAIL: usize = 2000;

struct Running {
    turn: u64,
    pid: u32,
    stopped: Arc<AtomicBool>,
}

type Registry = Arc<Mutex<HashMap<String, Running>>>;

/// Un process par tour : le prompt part sur stdin, la sortie revient ligne par ligne sur le canal.
pub struct AgentService {
    running: Registry,
    next_turn: AtomicU64,
    /// Parent des dossiers de travail des chats sans projet.
    scratch: PathBuf,
    catalogs: Mutex<HashMap<AgentKind, Catalog>>,
}

impl AgentService {
    pub fn new(scratch: PathBuf) -> Self {
        Self {
            running: Registry::default(),
            next_turn: AtomicU64::new(0),
            scratch,
            catalogs: Mutex::default(),
        }
    }

    pub fn send(&self, request: TurnRequest, channel: Channel<AgentEvent>) -> Result<(), AppError> {
        let cwd = match &request.cwd {
            Some(path) => valid_dir(path)?,
            None => self.scratch_dir(&request.chat_id)?,
        };
        if request.prompt.trim().is_empty() {
            return Err(AppError::InvalidInput("message vide".into()));
        }
        if let Some(id) = &request.session_id
            && !valid_session_id(id)
        {
            return Err(AppError::InvalidInput(
                "identifiant de session invalide".into(),
            ));
        }

        let driver = request.agent.driver(&cwd);
        if let Some(model) = &request.options.model
            && !self.knows_model(request.agent, model)
        {
            return Err(AppError::InvalidInput(format!("modèle inconnu : {model}")));
        }
        let program = shell_env::find_binary(driver.binary())
            .ok_or(AppError::AgentNotFound(driver.binary()))?;

        let mut running = lock(&self.running);
        if running.contains_key(&request.chat_id) {
            return Err(AppError::Busy);
        }

        let child = spawn(&program, driver.args(&request), &cwd)?;
        let pid = child.id().unwrap_or_default();
        let turn = self.next_turn.fetch_add(1, Ordering::Relaxed);
        let stopped = Arc::new(AtomicBool::new(false));
        running.insert(
            request.chat_id.clone(),
            Running {
                turn,
                pid,
                stopped: stopped.clone(),
            },
        );
        drop(running);

        let registry = self.running.clone();
        tauri::async_runtime::spawn(async move {
            let end = run_turn(child, driver, request.prompt, &channel, &stopped).await;
            // Libéré avant le dernier événement : le front peut renvoyer un message aussitôt.
            let mut running = lock(&registry);
            if running
                .get(&request.chat_id)
                .is_some_and(|entry| entry.turn == turn)
            {
                running.remove(&request.chat_id);
            }
            drop(running);
            let _ = channel.send(end);
        });
        Ok(())
    }

    /// SIGINT d'abord, puis SIGTERM puis SIGKILL au groupe tant que l'agent n'est pas sorti.
    pub fn stop(&self, chat_id: &str) {
        let running = lock(&self.running);
        let Some(entry) = running.get(chat_id) else {
            return;
        };
        entry.stopped.store(true, Ordering::Relaxed);
        process::interrupt(entry.pid);

        let (pid, turn, chat_id) = (entry.pid, entry.turn, chat_id.to_owned());
        let registry = self.running.clone();
        tauri::async_runtime::spawn(async move {
            for force in [false, true] {
                tokio::time::sleep(GRACE).await;
                let alive = lock(&registry)
                    .get(&chat_id)
                    .is_some_and(|entry| entry.turn == turn);
                if !alive {
                    return;
                }
                process::kill_tree(pid, force);
            }
        });
    }

    /// Lu une fois par lancement de l'app : l'agent met une à deux secondes à répondre.
    pub async fn catalog(&self, kind: AgentKind) -> Result<Catalog, AppError> {
        if let Some(catalog) = self
            .catalogs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(&kind)
        {
            return Ok(catalog.clone());
        }
        std::fs::create_dir_all(&self.scratch)?;
        let driver = kind.driver(&self.scratch);
        let program = shell_env::find_binary(driver.binary())
            .ok_or(AppError::AgentNotFound(driver.binary()))?;
        let (args, line) = driver.catalog_probe();
        let mut child = spawn(&program, args, &self.scratch)?;

        // stdin reste ouvert : à sa fermeture l'agent quitterait avant d'avoir répondu.
        let mut stdin = child.stdin.take();
        if let Some(stdin) = stdin.as_mut() {
            stdin.write_all(format!("{line}\n").as_bytes()).await?;
            stdin.flush().await?;
        }
        let read = async {
            let stdout = child.stdout.take()?;
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(catalog) = driver.parse_catalog(&line) {
                    return Some(catalog);
                }
            }
            None
        };
        let catalog = timeout(CATALOG_TIMEOUT, read).await.ok().flatten();
        drop(stdin);
        if let Some(pid) = child.id() {
            process::kill_tree(pid, true);
        }
        let _ = child.wait().await;

        let catalog = catalog.ok_or_else(|| {
            AppError::AgentFailed(format!("{} n'a pas décrit ses modèles", driver.binary()))
        })?;
        self.catalogs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(kind, catalog.clone());
        Ok(catalog)
    }

    /// Le dossier de travail d'un chat sans projet disparaît avec lui.
    pub fn discard_scratch(&self, chat_id: &str) {
        if valid_session_id(chat_id) {
            let _ = std::fs::remove_dir_all(self.scratch.join(chat_id));
        }
    }

    fn scratch_dir(&self, chat_id: &str) -> Result<PathBuf, AppError> {
        // L'id devient un nom de dossier : rien qui permette d'en sortir.
        if !valid_session_id(chat_id) {
            return Err(AppError::InvalidInput(
                "identifiant de chat invalide".into(),
            ));
        }
        let dir = self.scratch.join(chat_id);
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    /// Sans catalogue (agent qui n'a pas répondu), seule la forme de la valeur est vérifiée.
    fn knows_model(&self, kind: AgentKind, model: &str) -> bool {
        match self
            .catalogs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(&kind)
        {
            Some(catalog) => catalog.models.iter().any(|known| known.value == model),
            None => valid_session_id(model),
        }
    }

    /// À la fermeture de l'app : sans ça, les agents en cours survivraient à la fenêtre.
    pub fn stop_all(&self) {
        for entry in lock(&self.running).values() {
            entry.stopped.store(true, Ordering::Relaxed);
            process::kill_tree(entry.pid, false);
        }
    }
}

fn spawn(program: &Path, args: Vec<String>, cwd: &Path) -> std::io::Result<Child> {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(cwd)
        .env("PATH", shell_env::search_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    // Groupe à part : l'arrêt vise aussi les commandes lancées par l'agent.
    #[cfg(unix)]
    command.process_group(0);
    #[cfg(windows)]
    command.creation_flags(process::CREATE_NO_WINDOW);
    command.spawn()
}

async fn run_turn(
    mut child: Child,
    mut driver: Box<dyn Driver>,
    prompt: String,
    channel: &Channel<AgentEvent>,
    stopped: &AtomicBool,
) -> AgentEvent {
    if let Some(mut stdin) = child.stdin.take() {
        tauri::async_runtime::spawn(async move {
            let _ = stdin.write_all(prompt.as_bytes()).await;
            let _ = stdin.shutdown().await;
        });
    }
    let stderr = child
        .stderr
        .take()
        .map(|stderr| tauri::async_runtime::spawn(read_tail(stderr)));

    if let Some(stdout) = child.stdout.take() {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            // Après son bilan l'agent doit sortir : un enfant qui garde stdout ouvert ne bloque pas le tour.
            let next = if driver.outcome().is_some() {
                timeout(GRACE, lines.next_line()).await.unwrap_or(Ok(None))
            } else {
                lines.next_line().await
            };
            let Ok(Some(line)) = next else { break };
            for event in driver.parse_line(&line) {
                let _ = channel.send(event);
            }
        }
    }

    let exit = match timeout(GRACE, child.wait()).await {
        Ok(status) => status.ok(),
        Err(_) => {
            if let Some(pid) = child.id() {
                process::kill_tree(pid, true);
            }
            child.wait().await.ok()
        }
    };
    // Un petit-enfant qui aurait hérité de stderr ne doit pas retenir la fin du tour.
    let stderr = match stderr {
        Some(task) => timeout(GRACE, task)
            .await
            .ok()
            .and_then(Result::ok)
            .unwrap_or_default(),
        None => String::new(),
    };

    let (status, error, duration_ms) = if stopped.load(Ordering::Relaxed) {
        (TurnStatus::Stopped, None, None)
    } else if let Some(outcome) = driver.outcome() {
        (outcome.status, outcome.error.clone(), outcome.duration_ms)
    } else if exit.is_some_and(|exit| exit.success()) {
        (TurnStatus::Completed, None, None)
    } else {
        let detail = match (stderr.trim(), exit.and_then(|exit| exit.code())) {
            ("", Some(code)) => format!("code de sortie {code}"),
            ("", None) => "process interrompu".to_owned(),
            (stderr, _) => stderr.to_owned(),
        };
        (TurnStatus::Failed, Some(detail), None)
    };
    AgentEvent::TurnEnd {
        status,
        error,
        duration_ms,
    }
}

/// Garde la fin de stderr : c'est là que les CLI écrivent la raison d'un échec.
async fn read_tail(stream: impl AsyncRead + Unpin) -> String {
    let mut buffer = Vec::new();
    let mut reader = BufReader::new(stream);
    let mut chunk = [0u8; 4096];
    while let Ok(read) = reader.read(&mut chunk).await {
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > STDERR_TAIL * 2 {
            buffer.drain(..buffer.len() - STDERR_TAIL);
        }
    }
    let start = buffer.len().saturating_sub(STDERR_TAIL);
    String::from_utf8_lossy(&buffer[start..]).into_owned()
}

fn valid_dir(path: &str) -> Result<PathBuf, AppError> {
    let dir = std::fs::canonicalize(path)
        .map_err(|_| AppError::InvalidInput(format!("dossier introuvable : {path}")))?;
    if !dir.is_dir() {
        return Err(AppError::InvalidInput(format!("pas un dossier : {path}")));
    }
    Ok(dir)
}

/// L'id finit en argument de la CLI : rien qui puisse passer pour une option.
fn valid_session_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && !id.starts_with('-')
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn lock(registry: &Registry) -> MutexGuard<'_, HashMap<String, Running>> {
    registry
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Silent;

    impl Driver for Silent {
        fn binary(&self) -> &'static str {
            "sh"
        }
        fn catalog_probe(&self) -> (Vec<String>, String) {
            (Vec::new(), String::new())
        }
        fn parse_catalog(&self, _: &str) -> Option<Catalog> {
            None
        }
        fn args(&self, _: &TurnRequest) -> Vec<String> {
            Vec::new()
        }
        fn parse_line(&mut self, _: &str) -> Vec<AgentEvent> {
            Vec::new()
        }
        fn outcome(&self) -> Option<&Outcome> {
            None
        }
    }

    #[cfg(unix)]
    #[test]
    fn stop_ends_the_turn_and_kills_the_commands_it_started() {
        tauri::async_runtime::block_on(async {
            let script = vec!["-c".to_owned(), "sleep 30 & sleep 30".to_owned()];
            let child = spawn(Path::new("/bin/sh"), script, Path::new("/")).expect("sh");
            let pid = child.id().expect("pid");
            let stopped = Arc::new(AtomicBool::new(false));

            let flag = stopped.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(300)).await;
                flag.store(true, Ordering::Relaxed);
                process::kill_tree(pid, false);
            });

            let channel = Channel::new(|_| Ok(()));
            let started = std::time::Instant::now();
            let end = run_turn(child, Box::new(Silent), String::new(), &channel, &stopped).await;
            assert!(matches!(
                end,
                AgentEvent::TurnEnd {
                    status: TurnStatus::Stopped,
                    ..
                }
            ));
            assert!(started.elapsed() < GRACE);

            // Le `sleep` lancé en arrière-plan doit avoir disparu avec son groupe.
            let group = -libc::pid_t::try_from(pid).expect("pid");
            let mut alive = true;
            for _ in 0..20 {
                // SAFETY: signal 0 ne fait que tester l'existence du groupe.
                alive = unsafe { libc::kill(group, 0) } == 0;
                if !alive {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            assert!(!alive);
        });
    }

    #[test]
    fn session_id_rejects_options_and_separators() {
        assert!(valid_session_id("1d0cf17d-9061-48e3-bd69-6389a56c5b64"));
        assert!(!valid_session_id("--dangerously-skip-permissions"));
        assert!(!valid_session_id("abc def"));
        assert!(!valid_session_id(""));
    }
}
