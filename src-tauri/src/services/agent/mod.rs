mod claude;
mod mcp;
pub(crate) mod process;
mod release;
mod session;
pub mod settings;

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::time::{Instant, timeout, timeout_at};
use ts_rs::TS;

use self::mcp::McpAuth;
pub use self::mcp::{McpServer, McpStatus};
use self::session::{Session, SessionKey, Sessions, Turn};
pub use self::settings::SkillMode;

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

    pub fn skills_dir(self) -> Option<PathBuf> {
        match self {
            Self::Claude => claude::config_dir().map(|dir| dir.join("skills")),
        }
    }

    /// Réglages globaux de l'agent, là où Nuée écrit l'activation des skills.
    pub fn settings_file(self) -> Option<PathBuf> {
        match self {
            Self::Claude => claude::config_dir().map(|dir| dir.join("settings.json")),
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
    /// `false` : les hooks de la config de l'utilisateur ne tournent pas dans les chats de Nuée.
    pub hooks: bool,
    /// Réglages des skills propres à Nuée, par nom de dossier : ils priment sur ceux de l'utilisateur
    /// sans les modifier.
    pub skills: BTreeMap<String, SkillMode>,
    /// Serveurs MCP coupés dans Nuée seulement.
    pub servers_off: Vec<String>,
    /// Le chat travaille dans son worktree plutôt que dans le dossier du projet (`cwd`).
    #[serde(default)]
    pub worktree: bool,
}

/// Commande de Nuée attachée à un message : des consignes que l'utilisateur ne voit pas partent avec lui.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum ChatCommand {
    /// Écrire un nouveau skill dans la config globale de l'agent.
    CreateSkill,
    /// Retoucher un skill de la config globale, désigné par son dossier.
    EditSkill { id: String },
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

/// Ce que Réglages > Agents montre d'un agent installé.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AgentStatus {
    pub path: String,
    pub version: Option<String>,
    /// Version publiée plus récente que celle installée, sur le canal que suit l'installation.
    pub latest: Option<String>,
    /// `None` : personne n'est connecté à la CLI.
    pub account: Option<Account>,
    /// `None` : l'abonnement n'a pas de quotas (clé d'API) ou l'agent ne les a pas donnés.
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Account {
    pub email: Option<String>,
    /// Abonnement tel que l'agent le nomme (« Claude Max »).
    pub plan: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Usage {
    pub session: Option<Quota>,
    pub weekly: Option<Quota>,
    /// Quotas hebdomadaires propres à un modèle (Claude en a un pour Fable).
    pub models: Vec<ModelQuota>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModelQuota {
    pub model: String,
    pub quota: Quota,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Quota {
    /// Part consommée, de 0 à 1.
    pub used: f64,
    /// En millisecondes depuis 1970.
    #[ts(type = "number | null")]
    pub resets_at: Option<i64>,
}

/// Ce que l'agent dit de lui quand on le lance sans tour.
#[derive(Default)]
struct Probe {
    /// L'agent a répondu à la première question : sans ça, il est cassé ou trop lent.
    described: bool,
    catalog: Option<Catalog>,
    version: Option<String>,
    account: Option<Account>,
    usage_read: bool,
    usage: Option<Usage>,
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
    /// Quotas relus pendant le tour : seules les valeurs présentes changent.
    Usage {
        session: Option<Quota>,
        weekly: Option<Quota>,
        /// Quota du modèle à part ; l'agent ne le nomme pas ici, la sonde l'a déjà fait.
        model: Option<Quota>,
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
    /// Lance l'agent sans tour pour qu'il se décrive : ses arguments et les lignes à lui écrire.
    /// `usage` : demander aussi les quotas, qui passent par le réseau.
    fn probe(&self, usage: bool) -> (Vec<String>, Vec<String>);
    fn parse_probe(&self, line: &str, probe: &mut Probe);
    /// Lance l'agent sans tour pour suivre ses serveurs MCP : ses arguments et les lignes à lui écrire.
    fn mcp_probe(&self) -> (Vec<String>, Vec<String>);
    /// Ligne qui redemande l'état des serveurs MCP.
    fn mcp_status_message(&self) -> String;
    /// `Some` quand la ligne répond à `mcp_status_message`.
    fn parse_mcp_status(&self, line: &str) -> Option<Result<Vec<McpServer>, String>>;
    /// Ligne qui fait retenter un serveur à un process déjà ouvert.
    fn mcp_reconnect_message(&self, name: &str) -> String;
    /// Ligne qui demande l'autorisation (OAuth) d'un serveur ; `parse_mcp_auth` lit la réponse.
    fn mcp_auth_message(&self, name: &str) -> String;
    fn parse_mcp_auth(&self, line: &str) -> Option<Result<McpAuth, String>>;
    /// Paquet npm où l'agent publie ses versions, et l'étiquette que suit cette installation.
    fn release(&self, program: &Path) -> (&'static str, &'static str);
    /// Mise à jour par la CLI elle-même : elle sait mieux que Nuée comment elle a été installée.
    fn update_args(&self) -> Vec<String>;
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
const PROBE_TIMEOUT: Duration = Duration::from_secs(20);
/// Les quotas viennent du réseau : passé ce délai après la description, on s'en passe.
const USAGE_TIMEOUT: Duration = Duration::from_secs(8);
/// Téléchargement, plus une installation npm complète pour une CLI installée par npm.
const UPDATE_TIMEOUT: Duration = Duration::from_secs(300);
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
    /// Emplacement choisi à la main dans les réglages, à la place de celui trouvé dans le PATH.
    paths: Mutex<HashMap<AgentKind, PathBuf>>,
    /// Connexions de serveurs MCP qui attendent le navigateur, par nom : de quoi les annuler.
    logins: Mutex<HashMap<String, u32>>,
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
            paths: Mutex::default(),
            logins: Mutex::default(),
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
        command: Option<ChatCommand>,
        channel: Channel<AgentEvent>,
    ) -> Result<(), AppError> {
        if prompt.trim().is_empty() && attachments.is_empty() {
            return Err(AppError::InvalidInput("message vide".into()));
        }
        let instructions = command
            .map(|command| command_instructions(spec.agent, &command))
            .transpose()?;
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
        // Avant le message, comme le rappel : une phrase en anglais à la fin ferait répondre en anglais.
        let text = match instructions {
            Some(instructions) => format!("{instructions}\n\n{text}"),
            None => text,
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

    /// Lu une fois par lancement de l'app (ou par sonde des réglages) : l'agent met une à deux secondes à répondre.
    pub async fn catalog(&self, kind: AgentKind) -> Result<Catalog, AppError> {
        if let Some(catalog) = lock(&self.catalogs).get(&kind) {
            return Ok(catalog.clone());
        }
        let driver = kind.driver(&self.scratch);
        let probe = self.probe(kind, false).await?;
        probe.catalog.ok_or_else(|| {
            AppError::AgentFailed(format!("{} n'a pas décrit ses modèles", driver.binary()))
        })
    }

    /// Emplacement, version, compte et quotas, plus la dernière version publiée.
    pub async fn status(&self, kind: AgentKind) -> Result<AgentStatus, AppError> {
        let driver = kind.driver(&self.scratch);
        let program = self.program(kind)?;
        let (package, tag) = driver.release(&program);
        let (probe, latest) = tokio::join!(self.probe(kind, true), release::latest(package, tag));
        let probe = probe?;
        if !probe.described {
            return Err(AppError::AgentFailed(format!(
                "{} ne répond pas",
                driver.binary()
            )));
        }
        let latest = latest.filter(|latest| {
            probe
                .version
                .as_deref()
                .is_some_and(|version| release::is_newer(latest, version))
        });
        Ok(AgentStatus {
            path: program.to_string_lossy().into_owned(),
            version: probe.version,
            latest,
            account: probe.account,
            usage: probe.usage,
        })
    }

    /// `None` : retour à la détection automatique. Un chemin choisi doit mener à un fichier qui porte
    /// le nom de l'agent : la webview ne fait pas lancer n'importe quel exécutable.
    pub fn set_path(&self, kind: AgentKind, path: Option<String>) -> Result<(), AppError> {
        let mut paths = lock(&self.paths);
        paths.remove(&kind);
        if let Some(path) = path {
            let driver = kind.driver(&self.scratch);
            paths.insert(kind, valid_binary(&path, driver.binary())?);
        }
        Ok(())
    }

    /// Renvoie la dernière ligne écrite par la CLI : elle dit ce qui s'est passé, même quand la
    /// commande réussit sans rien installer (Homebrew renvoie vers `brew upgrade`).
    pub async fn update(&self, kind: AgentKind) -> Result<String, AppError> {
        let driver = kind.driver(&self.scratch);
        let program = self.program(kind)?;
        std::fs::create_dir_all(&self.scratch)?;
        let mut child = session::spawn(&program, driver.update_args(), &self.scratch)?;
        // stdin fermé : une CLI qui voudrait poser une question échoue au lieu d'attendre.
        drop(child.stdin.take());
        let output = timeout(UPDATE_TIMEOUT, child.wait_with_output())
            .await
            .map_err(|_| AppError::AgentFailed("mise à jour trop longue".into()))??;
        let message = last_line(&output.stderr)
            .or_else(|| last_line(&output.stdout))
            .unwrap_or_default();
        if output.status.success() {
            Ok(last_line(&output.stdout).unwrap_or(message))
        } else {
            Err(AppError::AgentFailed(message))
        }
    }

    /// Lance l'agent sans tour et lit ce qu'il dit de lui ; le catalogue au passage est gardé.
    async fn probe(&self, kind: AgentKind, usage: bool) -> Result<Probe, AppError> {
        std::fs::create_dir_all(&self.scratch)?;
        let driver = kind.driver(&self.scratch);
        let program = self.program(kind)?;
        let (args, requests) = driver.probe(usage);
        let mut child = session::spawn(&program, args, &self.scratch)?;

        // stdin reste ouvert : à sa fermeture l'agent quitterait avant d'avoir répondu.
        let mut stdin = child.stdin.take();
        if let Some(stdin) = stdin.as_mut() {
            for request in requests {
                stdin.write_all(format!("{request}\n").as_bytes()).await?;
            }
            stdin.flush().await?;
        }
        let mut probe = Probe::default();
        if let Some(stdout) = child.stdout.take() {
            let mut lines = BufReader::new(stdout).lines();
            let mut deadline = Instant::now() + PROBE_TIMEOUT;
            while let Ok(Ok(Some(line))) = timeout_at(deadline, lines.next_line()).await {
                let described = probe.described;
                driver.parse_probe(&line, &mut probe);
                // Déconnecté : pas de quotas à attendre.
                if probe.described && (!usage || probe.usage_read || probe.account.is_none()) {
                    break;
                }
                if !described && probe.described {
                    deadline = deadline.min(Instant::now() + USAGE_TIMEOUT);
                }
            }
        }
        drop(stdin);
        if let Some(pid) = child.id() {
            process::kill_tree(pid, true);
        }
        let _ = child.wait().await;

        if let Some(catalog) = &probe.catalog {
            lock(&self.catalogs).insert(kind, catalog.clone());
        }
        Ok(probe)
    }

    fn program(&self, kind: AgentKind) -> Result<PathBuf, AppError> {
        let binary = kind.driver(&self.scratch).binary();
        // Un chemin choisi porte le nom de l'agent : `NUEE_HIDE_BINARIES` le masque aussi.
        if let Some(path) = lock(&self.paths).get(&kind)
            && !shell_env::is_hidden(binary)
        {
            return Ok(path.clone());
        }
        shell_env::find_binary(binary).ok_or(AppError::AgentNotFound(binary))
    }

    /// Titre court tiré du premier message d'un chat. `None` si l'agent n'a pas su répondre.
    pub async fn title(&self, kind: AgentKind, prompt: &str) -> Option<String> {
        std::fs::create_dir_all(&self.scratch).ok()?;
        let driver = kind.driver(&self.scratch);
        let program = self.program(kind).ok()?;
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
        let program = self.program(spec.agent)?;
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
            hooks: spec.hooks,
            skills: valid_skills(&spec.skills)?,
            servers_off: valid_names(&spec.servers_off)?,
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

fn valid_skills(
    skills: &BTreeMap<String, SkillMode>,
) -> Result<BTreeMap<String, SkillMode>, AppError> {
    if skills.len() > 500 || !skills.keys().all(|id| valid_name(id)) {
        return Err(AppError::InvalidInput(
            "réglages de skills invalides".into(),
        ));
    }
    Ok(skills.clone())
}

/// Noms de serveurs, triés : le même choix dans un autre ordre ne relance pas le process.
fn valid_names(names: &[String]) -> Result<Vec<String>, AppError> {
    if names.len() > 500 || !names.iter().all(|name| valid_name(name)) {
        return Err(AppError::InvalidInput("liste de noms invalide".into()));
    }
    let mut names = names.to_vec();
    names.sort();
    names.dedup();
    Ok(names)
}

/// Nom de skill ou de serveur MCP (« claude.ai Google Drive », « plugin:figma:figma »). Il finit en
/// argument de la CLI : rien qui puisse passer pour une option.
pub(crate) fn valid_name(name: &str) -> bool {
    !name.trim().is_empty()
        && name.len() <= 200
        && !name.starts_with('-')
        && !name.chars().any(char::is_control)
}

/// Consignes d'une commande, avec les vrais chemins : l'agent écrit où la CLI ira lire. Elles partent avec
/// la première réponse de l'utilisateur au formulaire que Nuée affiche seule.
fn command_instructions(kind: AgentKind, command: &ChatCommand) -> Result<String, AppError> {
    let skills_dir = kind
        .skills_dir()
        .ok_or_else(|| std::io::Error::other("dossier de config introuvable"))?;
    let task = match command {
        ChatCommand::CreateSkill => CREATE_SKILL.to_owned(),
        ChatCommand::EditSkill { id } => {
            let file = crate::services::skills::skill_file(kind, id)?;
            EDIT_SKILL.replace("{file}", &file.to_string_lossy())
        }
    };
    Ok(include_str!("skill_writer.md")
        .replace("{task}", &task)
        .replace("{skills_dir}", &skills_dir.to_string_lossy()))
}

// Le formulaire décrit ici est celui des clés `chat.commands.form` de l'interface : les garder d'accord.
const CREATE_SKILL: &str = r#"The user wants to create a new skill. Nuée has already shown them this form, translated into their language:

Skill name: to fill in
Description: to fill in (what it does and when to use it)
Automatic invocation: yes or no (yes = Claude runs it on its own when it helps; no = only when you type /name)

Their answer comes after these instructions, maybe loose or partial. The name and what the skill does cannot be guessed; automatic invocation can: yes unless they say no. Then write the skill right away, following the rules below: the name normalized to lowercase letters, digits and hyphens, a description that triggers, `disable-model-invocation: true` if they answered no. Never overwrite an existing folder: if `{skills_dir}/<name>` already exists, the name is taken, ask for another one and suggest a free one.

Once it is written, the block is:

```nuee-skill
{"action":"created","name":"<name>","summary":"<two or three sentences: what it does and when it triggers>","automatic":true}
```

with `"automatic":false` when the skill has `disable-model-invocation: true`."#;

const EDIT_SKILL: &str = r#"The user wants to change the skill in `{file}`. Nuée has already shown them this form, translated into their language:

Skill summary: <the description from the file>
Automatic invocation: yes or no (no when the file has `disable-model-invocation: true`)
What you want to change: to fill in

Their answer comes after these instructions. Read the file, then apply the change right away, following the rules below: only what they asked plus clear mistakes, in the same folder with the same `name`. An answer that turns automatic invocation on or off removes or adds `disable-model-invocation: true`.

Once it is saved, the block is:

```nuee-skill
{"action":"modified","name":"<name>","changes":"<one to three sentences on what changed>","summary":"<two or three sentences: what it does now and when it triggers>","automatic":true}
```

with `"automatic":false` when the skill has `disable-model-invocation: true`."#;

fn with_recap(recap: &str, prompt: &str) -> String {
    format!(
        "[Nuée] Your previous reply was interrupted by the user before it finished. \
         This is what you had written so far:\n\n{recap}\n\n[End of the interrupted reply]\n\n{prompt}"
    )
}

fn valid_binary(path: &str, name: &str) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(path);
    // Le nom tel que choisi : un lien `claude` mène souvent à un fichier nommé d'après sa version.
    let named = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .is_some_and(|stem| stem == name);
    if !path.is_absolute() || !named || !path.is_file() {
        return Err(AppError::InvalidInput(format!(
            "pas un exécutable `{name}` : {}",
            path.display()
        )));
    }
    Ok(path)
}

fn last_line(output: &[u8]) -> Option<String> {
    String::from_utf8_lossy(output)
        .lines()
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .map(str::to_owned)
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

    #[test]
    fn skill_commands_point_to_the_real_folder() {
        let text = command_instructions(AgentKind::Claude, &ChatCommand::CreateSkill).unwrap();
        let dir = AgentKind::Claude.skills_dir().unwrap();
        assert!(text.contains(&format!("{}/<name>", dir.to_string_lossy())));
        assert!(text.contains("Never overwrite"));
        assert!(text.contains("```nuee-skill\n{\"action\":\"created\""));
        assert!(!text.contains("{task}") && !text.contains("{skills_dir}"));
        let edit = ChatCommand::EditSkill {
            id: "../settings.json".into(),
        };
        assert!(command_instructions(AgentKind::Claude, &edit).is_err());
    }

    #[test]
    fn names_are_sorted_and_checked() {
        let names = [
            "vue".to_owned(),
            "claude.ai Notion".to_owned(),
            "vue".to_owned(),
        ];
        assert_eq!(
            valid_names(&names).unwrap(),
            ["claude.ai Notion".to_owned(), "vue".to_owned()]
        );
        assert!(valid_names(&["--settings".to_owned()]).is_err());
        assert!(valid_names(&["a\nb".to_owned()]).is_err());
        assert!(valid_names(&[" ".to_owned()]).is_err());
    }
}
