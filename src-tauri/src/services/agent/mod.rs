mod claude;
mod process;
mod session;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::time::timeout;
use ts_rs::TS;

use self::session::{Session, SessionKey, Sessions, Turn};

use crate::error::AppError;
use crate::services::attachment::{self, Attached, Attachment};
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

/// Ce qui définit le process d'un chat. Le même process sert tous les tours tant que ça ne change pas.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SessionSpec {
    pub chat_id: String,
    pub agent: AgentKind,
    /// Dossier du projet. `None` : chat sans projet, l'agent travaille dans un dossier vide propre au chat.
    pub cwd: Option<String>,
    /// Session renvoyée par l'agent : la reprendre garde le fil quand le process doit être relancé.
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
    /// L'agent demande s'il peut utiliser un outil (mode Auto) ; il attend la réponse pour continuer.
    Approval {
        id: String,
        name: String,
        kind: ToolKind,
        /// Ce qui sera exécuté ou modifié, en entier (commande, chemin...).
        detail: Option<String>,
        /// Explication donnée par l'agent, dans sa langue à lui.
        description: Option<String>,
        /// Paramètres de l'outil, renvoyés tels quels avec l'accord : ils restent côté Rust.
        #[serde(skip)]
        #[ts(skip)]
        input: serde_json::Value,
    },
    ApprovalCancelled {
        id: String,
    },
    /// La réponse est complète. L'agent range encore son tour (résumé, hooks) avant `turnEnd`.
    Answered,
    /// Toujours le dernier événement d'un tour.
    TurnEnd {
        status: TurnStatus,
        error: Option<String>,
        duration_ms: Option<u32>,
    },
}

/// Ce qu'un agent fournit pour être branché : sa ligne de commande, ses messages sur stdin et la
/// lecture de sa sortie. Un driver vit autant que le process du chat.
trait Driver: Send + Sync {
    fn binary(&self) -> &'static str;
    /// Lance l'agent sans tour pour qu'il décrive ses modèles : ses arguments et la ligne à lui écrire.
    fn catalog_probe(&self) -> (Vec<String>, String);
    fn parse_catalog(&self, line: &str) -> Option<Catalog>;
    /// Lance l'agent hors de tout chat pour résumer un message en titre ; le message part sur stdin.
    fn title_args(&self) -> Vec<String>;
    fn parse_title(&self, output: &str) -> Option<String>;
    fn args(&self, spec: &SessionSpec) -> Vec<String>;
    /// Ligne à écrire sur stdin pour lancer un tour.
    fn user_message(&self, prompt: &str, attachments: &[Attached]) -> String;
    /// Ligne qui interrompt le tour en cours sans arrêter le process.
    fn interrupt_message(&self) -> String;
    /// Réponse à une demande `Approval`.
    fn approval_message(&self, id: &str, input: &serde_json::Value, allow: bool) -> String;
    /// Traduit une ligne de sortie ; renvoie `TurnEnd` quand l'agent clôt le tour.
    fn parse_line(&mut self, line: &str) -> Vec<AgentEvent>;
}

/// Temps laissé à l'agent pour obéir avant de passer au signal suivant.
const GRACE: Duration = Duration::from_secs(2);
const CATALOG_TIMEOUT: Duration = Duration::from_secs(20);
const TITLE_TIMEOUT: Duration = Duration::from_secs(45);
/// Assez pour comprendre la demande ; un long message collé n'apporte rien de plus au titre.
const TITLE_INPUT_LIMIT: usize = 8000;
/// Un process inutilisé si longtemps est arrêté ; le tour suivant le relance avec `--resume`.
const IDLE: Duration = Duration::from_secs(5 * 60);

/// Un process par chat, gardé ouvert entre les tours : pas de démarrage à payer à chaque message.
pub struct AgentService {
    sessions: Sessions,
    next_session: AtomicU64,
    /// Parent des dossiers de travail des chats sans projet.
    scratch: PathBuf,
    catalogs: Mutex<HashMap<AgentKind, Catalog>>,
}

impl AgentService {
    pub fn new(scratch: PathBuf) -> Self {
        let sessions = Sessions::default();
        session::reap_idle(sessions.clone(), IDLE);
        Self {
            sessions,
            next_session: AtomicU64::new(0),
            scratch,
            catalogs: Mutex::default(),
        }
    }

    /// `recap` : réponse coupée par un arrêt au tour précédent. Un process neuf ne l'a pas en mémoire,
    /// elle lui est donc rappelée avant le message.
    pub fn send(
        &self,
        spec: SessionSpec,
        prompt: String,
        attachments: &[Attachment],
        recap: Option<String>,
        channel: Channel<AgentEvent>,
    ) -> Result<(), AppError> {
        if prompt.trim().is_empty() && attachments.is_empty() {
            return Err(AppError::InvalidInput("message vide".into()));
        }
        let (key, cwd) = self.key(&spec)?;
        let attached = attachment::load(attachments)?;
        let driver = spec.agent.driver(&cwd);

        let mut sessions = lock(&self.sessions);
        if let Some(session) = sessions.get(&spec.chat_id) {
            if session.busy() {
                return Err(AppError::Busy);
            }
            if session.key != key
                && let Some(old) = sessions.remove(&spec.chat_id)
            {
                old.retire();
            }
        }
        if !sessions.contains_key(&spec.chat_id) {
            let session = self.start(&spec, key, &cwd)?;
            sessions.insert(spec.chat_id.clone(), session);
        }
        let Some(session) = sessions.get(&spec.chat_id) else {
            return Err(AppError::AgentFailed("session introuvable".into()));
        };

        let text = match recap.filter(|recap| session.is_fresh() && !recap.trim().is_empty()) {
            Some(recap) => with_recap(&recap, &prompt),
            None => prompt,
        };
        session.begin(Turn {
            channel,
            stopped: false,
            number: 0,
        });
        if !session.write(driver.user_message(&text, &attached)) {
            session.abandon();
            return Err(AppError::AgentFailed(format!(
                "{} s'est arrêté",
                driver.binary()
            )));
        }
        Ok(())
    }

    /// Lance le process d'un chat avant le premier message, pendant que l'utilisateur écrit.
    pub fn warm(&self, spec: SessionSpec) -> Result<(), AppError> {
        let (key, cwd) = self.key(&spec)?;
        let mut sessions = lock(&self.sessions);
        if !sessions.contains_key(&spec.chat_id) {
            let session = self.start(&spec, key, &cwd)?;
            sessions.insert(spec.chat_id.clone(), session);
        }
        Ok(())
    }

    /// Interrompt le tour en cours ; le process reste ouvert et garde ce qu'il avait déjà écrit.
    pub fn stop(&self, chat_id: &str) {
        if let Some(session) = lock(&self.sessions).get(chat_id) {
            session.interrupt();
        }
    }

    pub fn approve(&self, chat_id: &str, request_id: &str, allow: bool) {
        if let Some(session) = lock(&self.sessions).get(chat_id) {
            session.answer(request_id, allow);
        }
    }

    /// Chat fermé pour de bon (supprimé) : son process s'arrête.
    pub fn close(&self, chat_id: &str) {
        if let Some(session) = lock(&self.sessions).remove(chat_id) {
            session.retire();
        }
    }

    /// Chats dont un tour n'est pas clos : réponse en cours, rangement ou demande d'autorisation.
    pub fn busy_count(&self) -> usize {
        lock(&self.sessions)
            .values()
            .filter(|session| session.busy())
            .count()
    }

    /// À la fermeture de l'app : sans ça, les agents survivraient à la fenêtre.
    pub fn stop_all(&self) {
        for session in lock(&self.sessions).values() {
            process::kill_tree(session.pid, false);
        }
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
        let mut child = session::spawn(&program, args, &self.scratch)?;

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

    /// Titre court tiré du premier message d'un chat. `None` si l'agent n'a pas su répondre.
    pub async fn title(&self, kind: AgentKind, prompt: &str) -> Option<String> {
        std::fs::create_dir_all(&self.scratch).ok()?;
        let driver = kind.driver(&self.scratch);
        let program = shell_env::find_binary(driver.binary())?;
        let mut child = session::spawn(&program, driver.title_args(), &self.scratch).ok()?;
        let input: String = prompt.chars().take(TITLE_INPUT_LIMIT).collect();
        // stdin fermé après le message : l'agent sait qu'il n'y en aura pas d'autre.
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(input.as_bytes()).await.ok()?;
        }
        let read = async {
            let mut output = String::new();
            child
                .stdout
                .take()?
                .read_to_string(&mut output)
                .await
                .ok()?;
            Some(output)
        };
        let output = timeout(TITLE_TIMEOUT, read).await.ok().flatten();
        if let Some(pid) = child.id() {
            process::kill_tree(pid, true);
        }
        let _ = child.wait().await;
        driver.parse_title(&output?)
    }

    /// Le dossier de travail d'un chat sans projet disparaît avec lui.
    pub fn discard_scratch(&self, chat_id: &str) {
        if valid_session_id(chat_id) {
            let _ = std::fs::remove_dir_all(self.scratch.join(chat_id));
        }
    }

    fn start(&self, spec: &SessionSpec, key: SessionKey, cwd: &Path) -> Result<Session, AppError> {
        let driver = spec.agent.driver(cwd);
        let program = shell_env::find_binary(driver.binary())
            .ok_or(AppError::AgentNotFound(driver.binary()))?;
        let args = driver.args(spec);
        let id = self.next_session.fetch_add(1, Ordering::Relaxed);
        Ok(Session::start(session::Launch {
            program: &program,
            args,
            cwd,
            driver,
            chat_id: spec.chat_id.clone(),
            id,
            key,
            sessions: self.sessions.clone(),
        })?)
    }

    /// Valide tout ce qui finira en argument ou en chemin, et donne de quoi comparer deux process.
    fn key(&self, spec: &SessionSpec) -> Result<(SessionKey, PathBuf), AppError> {
        let cwd = match &spec.cwd {
            Some(path) => valid_dir(path)?,
            None => self.scratch_dir(&spec.chat_id)?,
        };
        if let Some(id) = &spec.session_id
            && !valid_session_id(id)
        {
            return Err(AppError::InvalidInput(
                "identifiant de session invalide".into(),
            ));
        }
        if let Some(model) = &spec.options.model
            && !self.knows_model(spec.agent, model)
        {
            return Err(AppError::InvalidInput(format!("modèle inconnu : {model}")));
        }
        let key = SessionKey {
            agent: spec.agent,
            cwd: cwd.clone(),
            options: spec.options.clone(),
        };
        Ok((key, cwd))
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
}

fn with_recap(recap: &str, prompt: &str) -> String {
    format!(
        "[Nuée] Your previous reply was interrupted by the user before it finished. \
         This is what you had written so far:\n\n{recap}\n\n[End of the interrupted reply]\n\n{prompt}"
    )
}

fn valid_dir(path: &str) -> Result<PathBuf, AppError> {
    let dir = std::fs::canonicalize(path)
        .map_err(|_| AppError::InvalidInput(format!("dossier introuvable : {path}")))?;
    if !dir.is_dir() {
        return Err(AppError::InvalidInput(format!("pas un dossier : {path}")));
    }
    Ok(dir)
}

/// L'id finit en argument de la CLI ou en nom de dossier : rien qui puisse passer pour une option.
pub(crate) fn valid_session_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && !id.starts_with('-')
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_id_rejects_options_and_separators() {
        assert!(valid_session_id("1d0cf17d-9061-48e3-bd69-6389a56c5b64"));
        assert!(valid_session_id("claude-haiku-4-5-20251001"));
        assert!(!valid_session_id("--dangerously-skip-permissions"));
        assert!(!valid_session_id("abc def"));
        assert!(!valid_session_id(".."));
        assert!(!valid_session_id(""));
    }
}
