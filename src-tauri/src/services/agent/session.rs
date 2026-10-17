use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};
use tokio::time::timeout;

use super::{
    AgentEvent, AgentKind, CONTEXT_EVENT, Driver, GRACE, TaskStatus, TurnOptions, TurnStatus, lock,
    process,
};
use crate::utils::shell_env;

const STDERR_TAIL: usize = 2000;

pub(super) type Sessions = Arc<Mutex<HashMap<String, Session>>>;

/// Deux envois avec la même clé partagent le process ; une clé différente le fait relancer.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct SessionKey {
    pub agent: AgentKind,
    pub cwd: PathBuf,
    pub options: TurnOptions,
    pub hooks: bool,
    pub skills: std::collections::BTreeMap<String, super::SkillMode>,
    pub servers_off: Vec<String>,
}

pub(super) struct Turn {
    pub channel: Channel<AgentEvent>,
    pub stopped: bool,
    pub number: u64,
    /// Réponse complète : un message ajouté maintenant ouvrirait un tour que personne n'écoute.
    pub answered: bool,
}

struct Slot {
    current: Option<Turn>,
    /// Canal du dernier tour : ce qui arrive entre deux tours (tâche de fond, tour ouvert par l'agent) y passe.
    listener: Option<Channel<AgentEvent>>,
    /// Tâches en cours : tant qu'il en reste, le process n'est pas arrêté pour inactivité.
    tasks: HashSet<String>,
    /// Requêtes de Nuée qui attendent leur réponse, par identifiant.
    waiting: HashMap<String, oneshot::Sender<Result<serde_json::Value, String>>>,
    turns: u64,
    idle_since: Instant,
    /// Demandes d'autorisation en attente, avec les paramètres à renvoyer en cas d'accord.
    approvals: HashMap<String, serde_json::Value>,
}

pub(super) struct Launch<'a> {
    pub program: &'a Path,
    pub args: Vec<String>,
    pub cwd: &'a Path,
    pub driver: Box<dyn Driver>,
    pub chat_id: String,
    pub id: u64,
    pub key: SessionKey,
    pub sessions: Sessions,
}

/// Process d'un chat : on lui écrit les messages sur stdin, sa sortie part sur le canal du tour en cours.
pub(super) struct Session {
    pub id: u64,
    pub pid: u32,
    pub key: SessionKey,
    input: mpsc::UnboundedSender<String>,
    interrupt: String,
    slot: Arc<Mutex<Slot>>,
    alive: Arc<AtomicBool>,
}

impl Session {
    pub fn start(launch: Launch) -> std::io::Result<Self> {
        let Launch {
            program,
            args,
            cwd,
            mut driver,
            chat_id,
            id,
            key,
            sessions,
        } = launch;
        let mut child = spawn(program, args, driver.session_env(), cwd)?;
        let pid = child.id().unwrap_or_default();
        let interrupt = driver.interrupt_message();

        let (input, mut lines_in) = mpsc::unbounded_channel::<String>();
        if let Some(mut stdin) = child.stdin.take() {
            // Session abandonnée : le canal se ferme, stdin aussi, et l'agent quitte de lui-même.
            tauri::async_runtime::spawn(async move {
                while let Some(line) = lines_in.recv().await {
                    let written = async {
                        stdin.write_all(line.as_bytes()).await?;
                        stdin.write_all(b"\n").await?;
                        stdin.flush().await
                    };
                    if written.await.is_err() {
                        break;
                    }
                }
            });
        }

        let slot = Arc::new(Mutex::new(Slot {
            current: None,
            listener: None,
            tasks: HashSet::new(),
            waiting: HashMap::new(),
            turns: 0,
            idle_since: Instant::now(),
            approvals: HashMap::new(),
        }));
        let alive = Arc::new(AtomicBool::new(true));
        let stderr = child
            .stderr
            .take()
            .map(|stream| tauri::async_runtime::spawn(read_tail(stream)));
        let stdout = child.stdout.take();
        let (reader_slot, reader_alive) = (slot.clone(), alive.clone());
        // Faible : la session abandonnée doit pouvoir fermer stdin pendant que la lecture continue.
        let reader_input = input.downgrade();
        tauri::async_runtime::spawn(async move {
            if let Some(stdout) = stdout {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some((id, response)) = driver.control_response(&line) {
                        let waiter = lock(&reader_slot).waiting.remove(&id);
                        if let Some(waiter) = waiter {
                            let _ = waiter.send(response);
                            continue;
                        }
                    }
                    for event in driver.parse_line(&line) {
                        let ended = matches!(event, AgentEvent::TurnEnd { .. });
                        deliver(&reader_slot, event);
                        if ended
                            && let Some((input, request)) = reader_input
                                .upgrade()
                                .zip(driver.context_request(CONTEXT_EVENT))
                        {
                            let _ = input.send(request);
                        }
                    }
                }
            }
            let exit = match timeout(GRACE, child.wait()).await {
                Ok(status) => status.ok(),
                Err(_) => {
                    process::kill_tree(pid, true);
                    child.wait().await.ok()
                }
            };
            reader_alive.store(false, Ordering::Relaxed);
            // Un petit-enfant qui aurait hérité de stderr ne doit pas retenir la fin du tour.
            let stderr = match stderr {
                Some(task) => timeout(GRACE, task)
                    .await
                    .ok()
                    .and_then(Result::ok)
                    .unwrap_or_default(),
                None => String::new(),
            };
            // Retirée avant d'annoncer la fin : l'envoi suivant relancera un process.
            {
                let mut map = lock(&sessions);
                if map.get(&chat_id).is_some_and(|session| session.id == id) {
                    map.remove(&chat_id);
                }
            }
            let (turn, orphans) = {
                let mut slot = lock(&reader_slot);
                let tasks: Vec<String> = slot.tasks.drain().collect();
                slot.waiting.clear();
                (
                    slot.current.take(),
                    slot.listener.take().map(|channel| (channel, tasks)),
                )
            };
            // Ses tâches de fond meurent avec le process.
            if let Some((channel, tasks)) = orphans {
                for id in tasks {
                    let _ = channel.send(AgentEvent::Task {
                        id,
                        tool_id: None,
                        kind: None,
                        status: Some(TaskStatus::Stopped),
                        description: None,
                        progress: None,
                        background: None,
                        tool_uses: None,
                        duration_ms: None,
                    });
                }
            }
            if let Some(turn) = turn {
                let (status, error) = if turn.stopped {
                    (TurnStatus::Stopped, None)
                } else {
                    (TurnStatus::Failed, Some(exit_detail(&stderr, exit)))
                };
                let _ = turn.channel.send(AgentEvent::TurnEnd {
                    status,
                    error,
                    duration_ms: None,
                });
            }
        });

        Ok(Self {
            id,
            pid,
            key,
            input,
            interrupt,
            slot,
            alive,
        })
    }

    pub fn busy(&self) -> bool {
        lock(&self.slot).current.is_some()
    }

    /// Aucun tour envoyé à ce process : il ignore ce qu'un process précédent avait commencé à écrire.
    pub fn is_fresh(&self) -> bool {
        lock(&self.slot).turns == 0
    }

    pub fn begin(&self, mut turn: Turn) {
        let mut slot = lock(&self.slot);
        slot.turns += 1;
        turn.number = slot.turns;
        slot.listener = Some(turn.channel.clone());
        slot.current = Some(turn);
    }

    pub fn write(&self, line: String) -> bool {
        self.input.send(line).is_ok()
    }

    /// Écrit une requête et rend de quoi attendre sa réponse ; fermé sans réponse si le process s'arrête.
    pub fn request(
        &self,
        id: String,
        line: String,
    ) -> oneshot::Receiver<Result<serde_json::Value, String>> {
        let (sender, receiver) = oneshot::channel();
        lock(&self.slot).waiting.insert(id, sender);
        let _ = self.input.send(line);
        receiver
    }

    /// Ajoute un message au tour en cours, que l'agent lit à sa prochaine étape. Faux si le tour est
    /// déjà répondu ou arrêté : le message attend alors le tour suivant.
    pub fn steer(&self, line: String) -> bool {
        let slot = lock(&self.slot);
        let open = slot
            .current
            .as_ref()
            .is_some_and(|turn| !turn.stopped && !turn.answered);
        open && self.input.send(line).is_ok()
    }

    /// L'écriture a échoué : ce tour n'aura jamais de fin.
    pub fn abandon(&self) {
        lock(&self.slot).current = None;
    }

    pub fn answer(&self, request_id: &str, allow: bool) {
        let Some(input) = lock(&self.slot).approvals.remove(request_id) else {
            return;
        };
        let driver = self.key.agent.driver(&self.key.cwd);
        let _ = self
            .input
            .send(driver.approval_message(request_id, &input, allow));
    }

    /// L'agent clôt normalement son tour aussitôt ; s'il ne le fait pas, SIGINT, SIGTERM puis SIGKILL.
    pub fn interrupt(&self) {
        let number = {
            let mut slot = lock(&self.slot);
            let Some(turn) = slot.current.as_mut() else {
                return;
            };
            turn.stopped = true;
            turn.number
        };
        let _ = self.input.send(self.interrupt.clone());

        let (slot, alive, pid) = (self.slot.clone(), self.alive.clone(), self.pid);
        tauri::async_runtime::spawn(async move {
            let steps: [fn(u32); 3] = [
                process::interrupt,
                |pid| process::kill_tree(pid, false),
                |pid| process::kill_tree(pid, true),
            ];
            for step in steps {
                tokio::time::sleep(GRACE).await;
                let pending = lock(&slot)
                    .current
                    .as_ref()
                    .is_some_and(|turn| turn.number == number);
                if !pending || !alive.load(Ordering::Relaxed) {
                    return;
                }
                step(pid);
            }
        });
    }

    /// Plus utilisée : stdin se ferme pour que l'agent quitte, puis signaux s'il traîne.
    pub fn retire(self) {
        if self.busy() {
            let _ = self.input.send(self.interrupt.clone());
        }
        let Self {
            pid, alive, input, ..
        } = self;
        drop(input);
        tauri::async_runtime::spawn(async move {
            for force in [false, true] {
                tokio::time::sleep(GRACE).await;
                if !alive.load(Ordering::Relaxed) {
                    return;
                }
                process::kill_tree(pid, force);
            }
        });
    }

    fn idle_for(&self) -> Duration {
        let slot = lock(&self.slot);
        if slot.current.is_some() || !slot.tasks.is_empty() {
            Duration::ZERO
        } else {
            slot.idle_since.elapsed()
        }
    }
}

/// Hors tour, les événements vont au canal du dernier tour : une tâche de fond qui avance, ou un tour que l'agent
/// ouvre lui-même pour en rendre compte. Un process préchauffé, qui n'a jamais eu de tour, n'a personne à qui parler.
fn deliver(slot: &Mutex<Slot>, event: AgentEvent) {
    let mut slot = lock(slot);
    if let AgentEvent::Task { id, status, .. } = &event {
        match status {
            Some(TaskStatus::Running) => {
                slot.tasks.insert(id.clone());
            }
            Some(_) => {
                slot.tasks.remove(id);
            }
            None => {}
        }
    }
    if slot.current.is_none() {
        let Some(channel) = slot.listener.clone() else {
            return;
        };
        match event {
            AgentEvent::Text { .. } | AgentEvent::Thinking { .. } | AgentEvent::Tool { .. } => {
                slot.turns += 1;
                slot.current = Some(Turn {
                    channel: channel.clone(),
                    stopped: false,
                    number: slot.turns,
                    answered: false,
                });
                let _ = channel.send(AgentEvent::TurnStart);
            }
            AgentEvent::TurnEnd { .. } => return,
            event => {
                let _ = channel.send(event);
                return;
            }
        }
    }
    match event {
        AgentEvent::TurnEnd {
            status,
            error,
            duration_ms,
        } => {
            let Some(turn) = slot.current.take() else {
                return;
            };
            slot.idle_since = Instant::now();
            slot.approvals.clear();
            let (status, error) = if turn.stopped {
                (TurnStatus::Stopped, None)
            } else {
                (status, error)
            };
            let _ = turn.channel.send(AgentEvent::TurnEnd {
                status,
                error,
                duration_ms,
            });
        }
        event => {
            match &event {
                AgentEvent::Answered => {
                    if let Some(turn) = slot.current.as_mut() {
                        turn.answered = true;
                    }
                }
                AgentEvent::Approval { id, input, .. } => {
                    slot.approvals.insert(id.clone(), input.clone());
                }
                AgentEvent::ApprovalCancelled { id } => {
                    slot.approvals.remove(id);
                }
                _ => {}
            }
            if let Some(turn) = &slot.current {
                let _ = turn.channel.send(event);
            }
        }
    }
}

pub(super) fn reap_idle(sessions: Sessions, idle: Duration) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let idle_sessions: Vec<Session> = {
                let mut map = lock(&sessions);
                let ids: Vec<String> = map
                    .iter()
                    .filter(|(_, session)| session.idle_for() > idle)
                    .map(|(id, _)| id.clone())
                    .collect();
                ids.iter().filter_map(|id| map.remove(id)).collect()
            };
            for session in idle_sessions {
                session.retire();
            }
        }
    });
}

pub(super) fn spawn(
    program: &Path,
    args: Vec<String>,
    env: &[(&str, &str)],
    cwd: &Path,
) -> std::io::Result<Child> {
    let mut command = Command::new(program);
    command
        .args(args)
        .envs(env.iter().copied())
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

fn exit_detail(stderr: &str, exit: Option<std::process::ExitStatus>) -> String {
    match (stderr.trim(), exit.and_then(|exit| exit.code())) {
        ("", Some(code)) => format!("code de sortie {code}"),
        ("", None) => "process interrompu".to_owned(),
        (stderr, _) => stderr.to_owned(),
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

#[cfg(test)]
mod tests {
    use super::super::{PermissionMode, Probe, SessionSpec};
    use super::*;

    struct Silent;

    impl Driver for Silent {
        fn binary(&self) -> &'static str {
            "sh"
        }
        fn probe(&self, _: bool) -> (Vec<String>, Vec<String>) {
            (Vec::new(), Vec::new())
        }
        fn parse_probe(&self, _: &str, _: &mut Probe) {}
        fn mcp_probe(&self) -> (Vec<String>, Vec<String>) {
            (Vec::new(), Vec::new())
        }
        fn mcp_status_message(&self) -> String {
            String::new()
        }
        fn parse_mcp_status(
            &self,
            _: &str,
        ) -> Option<Result<Vec<super::super::McpServer>, String>> {
            None
        }
        fn mcp_reconnect_message(&self, _: &str) -> String {
            String::new()
        }
        fn mcp_auth_message(&self, _: &str) -> String {
            String::new()
        }
        fn parse_mcp_auth(&self, _: &str) -> Option<Result<super::super::McpAuth, String>> {
            None
        }
        fn release(&self, _: &Path) -> (&'static str, &'static str) {
            ("sh", "latest")
        }
        fn session_env(&self) -> &'static [(&'static str, &'static str)] {
            &[]
        }
        fn stop_task_message(&self, _: &str) -> String {
            String::new()
        }
        fn task_output_request(&self, _: &str, _: &str) -> String {
            String::new()
        }
        fn read_task_output(&self, _: &serde_json::Value) -> Option<String> {
            None
        }
        fn context_request(&self, _: &str) -> Option<String> {
            None
        }
        fn read_context(&self, _: &serde_json::Value) -> Option<super::super::ContextUsage> {
            None
        }
        fn control_response(&self, _: &str) -> Option<(String, Result<serde_json::Value, String>)> {
            None
        }
        fn rewind_requests(&self, _: &str) -> Vec<(String, String)> {
            Vec::new()
        }
        fn read_rewind(
            &self,
            _: &str,
            _: Result<serde_json::Value, String>,
            _: &mut super::super::Rewind,
        ) -> Result<(), String> {
            Ok(())
        }
        fn update_args(&self) -> Vec<String> {
            Vec::new()
        }
        fn title_args(&self) -> Vec<String> {
            Vec::new()
        }
        fn parse_title(&self, _: &str) -> Option<String> {
            None
        }
        fn args(&self, _: &SessionSpec) -> Vec<String> {
            Vec::new()
        }
        fn user_message(
            &self,
            prompt: &str,
            _: &[crate::services::attachment::Attached],
        ) -> String {
            prompt.to_owned()
        }
        fn interrupt_message(&self) -> String {
            String::new()
        }
        fn approval_message(&self, _: &str, _: &serde_json::Value, _: bool) -> String {
            String::new()
        }
        fn parse_line(&mut self, _: &str) -> Vec<AgentEvent> {
            Vec::new()
        }
    }

    fn task(status: TaskStatus) -> AgentEvent {
        AgentEvent::Task {
            id: "b1".into(),
            tool_id: None,
            kind: None,
            status: Some(status),
            description: None,
            progress: None,
            background: Some(true),
            tool_uses: None,
            duration_ms: None,
        }
    }

    #[test]
    fn after_a_turn_the_agent_can_report_its_background_tasks_and_open_a_turn() {
        let received = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = received.clone();
        let channel = Channel::new(move |body| {
            if let tauri::ipc::InvokeResponseBody::Json(json) = body {
                lock(&sink).push(json);
            }
            Ok(())
        });
        let slot = Mutex::new(Slot {
            current: Some(Turn {
                channel: channel.clone(),
                stopped: false,
                number: 1,
                answered: false,
            }),
            listener: Some(channel),
            tasks: HashSet::new(),
            waiting: HashMap::new(),
            turns: 1,
            idle_since: Instant::now(),
            approvals: HashMap::new(),
        });
        let end = || AgentEvent::TurnEnd {
            status: TurnStatus::Completed,
            error: None,
            duration_ms: None,
        };
        deliver(&slot, task(TaskStatus::Running));
        deliver(&slot, end());
        assert!(
            !lock(&slot).tasks.is_empty(),
            "la tâche tient le process éveillé"
        );
        deliver(&slot, task(TaskStatus::Completed));
        deliver(
            &slot,
            AgentEvent::Text {
                id: "m2:0".into(),
                delta: "Fini".into(),
            },
        );
        deliver(&slot, end());
        let types: Vec<String> = lock(&received)
            .iter()
            .map(|json| {
                serde_json::from_str::<serde_json::Value>(json).unwrap()["type"]
                    .as_str()
                    .unwrap_or_default()
                    .to_owned()
            })
            .collect();
        assert_eq!(
            types,
            ["task", "turnEnd", "task", "turnStart", "text", "turnEnd"]
        );
        assert!(lock(&slot).tasks.is_empty());
        assert!(lock(&slot).current.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn a_deaf_agent_is_stopped_with_the_commands_it_started() {
        tauri::async_runtime::block_on(async {
            let sessions = Sessions::default();
            let key = SessionKey {
                agent: AgentKind::Claude,
                cwd: PathBuf::from("/"),
                options: TurnOptions {
                    mode: PermissionMode::Bypass,
                    model: None,
                    effort: None,
                },
                hooks: true,
                skills: Default::default(),
                servers_off: Vec::new(),
            };
            let session = Session::start(Launch {
                program: Path::new("/bin/sh"),
                args: vec!["-c".into(), "sleep 30 & sleep 30".into()],
                cwd: Path::new("/"),
                driver: Box::new(Silent),
                chat_id: "c1".into(),
                id: 1,
                key,
                sessions: sessions.clone(),
            })
            .expect("sh");
            let pid = session.pid;

            let received = Arc::new(Mutex::new(Vec::<String>::new()));
            let sink = received.clone();
            let channel = Channel::new(move |body| {
                if let tauri::ipc::InvokeResponseBody::Json(json) = body {
                    lock(&sink).push(json);
                }
                Ok(())
            });
            session.begin(Turn {
                channel,
                stopped: false,
                number: 0,
                answered: false,
            });
            lock(&sessions).insert("c1".into(), session);
            if let Some(session) = lock(&sessions).get("c1") {
                session.interrupt();
            }

            let started = Instant::now();
            while lock(&received).is_empty() && started.elapsed() < GRACE * 5 {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            let events = lock(&received).clone();
            assert_eq!(events.len(), 1);
            assert!(events[0].contains("\"turnEnd\"") && events[0].contains("\"stopped\""));
            assert!(lock(&sessions).is_empty());
            // SAFETY: signal 0 ne fait que tester l'existence du groupe.
            let group_alive =
                unsafe { libc::kill(-libc::pid_t::try_from(pid).expect("pid"), 0) } == 0;
            assert!(!group_alive);
        });
    }
}
