use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio::time::timeout;

use super::{AgentEvent, AgentKind, Driver, GRACE, TurnOptions, TurnStatus, lock, process};
use crate::utils::shell_env;

const STDERR_TAIL: usize = 2000;

pub(super) type Sessions = Arc<Mutex<HashMap<String, Session>>>;

/// Deux envois avec la même clé partagent le process ; une clé différente le fait relancer.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct SessionKey {
    pub agent: AgentKind,
    pub cwd: PathBuf,
    pub options: TurnOptions,
}

pub(super) struct Turn {
    pub channel: Channel<AgentEvent>,
    pub stopped: bool,
    pub number: u64,
}

struct Slot {
    current: Option<Turn>,
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
        let mut child = spawn(program, args, cwd)?;
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
        tauri::async_runtime::spawn(async move {
            if let Some(stdout) = stdout {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    for event in driver.parse_line(&line) {
                        deliver(&reader_slot, event);
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
            let turn = lock(&reader_slot).current.take();
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
        slot.current = Some(turn);
    }

    pub fn write(&self, line: String) -> bool {
        self.input.send(line).is_ok()
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
        if slot.current.is_some() {
            Duration::ZERO
        } else {
            slot.idle_since.elapsed()
        }
    }
}

/// Les événements hors tour (process préchauffé) n'ont personne à qui parler : ils sont ignorés.
fn deliver(slot: &Mutex<Slot>, event: AgentEvent) {
    let mut slot = lock(slot);
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

pub(super) fn spawn(program: &Path, args: Vec<String>, cwd: &Path) -> std::io::Result<Child> {
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
    use super::super::{Catalog, PermissionMode, SessionSpec};
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
