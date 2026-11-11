use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use tauri::ipc::Channel;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::chat::ChatService;
use crate::utils::shell_env;

/// Sortie d'une commande lancée depuis la conversation : assez large pour les barres de progression.
const RUN_SIZE: (u16, u16) = (120, 40);

#[derive(Clone, Serialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export)]
pub enum TerminalEvent {
    Output {
        data: String,
    },
    /// `code` : `None` si le process a été tué par un signal.
    Exit {
        code: Option<u32>,
    },
}

struct Terminal {
    chat_id: String,
    pid: u32,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    exited: AtomicBool,
}

type Terminals = Arc<Mutex<HashMap<u32, Arc<Terminal>>>>;

/// Un pty par terminal, rangé sous l'id de son chat. Le shell est tué avec son onglet, son chat ou l'app.
#[derive(Default)]
pub struct TerminalService {
    terminals: Terminals,
    next: AtomicU32,
}

impl TerminalService {
    /// Le shell de connexion de l'utilisateur, avec le PATH donné aux agents.
    pub fn open(
        &self,
        chat_id: &str,
        cwd: &Path,
        size: (u16, u16),
        channel: Channel<TerminalEvent>,
    ) -> Result<u32, AppError> {
        let mut command = CommandBuilder::new_default_prog();
        command.cwd(cwd);
        command.env("PATH", shell_env::search_path());
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("TERM_PROGRAM", "Nuee");
        self.spawn(chat_id, command, size, channel)
    }

    /// Commande d'un bloc de code, lancée par un clic : le shell du terminal de la session l'exécute puis s'arrête.
    /// Rangée sous l'id du chat comme un shell, elle meurt avec lui ou avec l'app.
    pub fn run(
        &self,
        chats: &ChatService,
        chat_id: &str,
        cwd: &Path,
        line: &str,
        channel: Channel<TerminalEvent>,
    ) -> Result<u32, AppError> {
        let shell = CommandBuilder::new_default_prog().get_shell();
        self.run_in(&shell, chats, chat_id, cwd, line, channel)
    }

    fn run_in(
        &self,
        shell: &str,
        chats: &ChatService,
        chat_id: &str,
        cwd: &Path,
        line: &str,
        channel: Channel<TerminalEvent>,
    ) -> Result<u32, AppError> {
        if !chats.exists(chat_id)? {
            return Err(AppError::InvalidInput(format!(
                "session inconnue : {chat_id}"
            )));
        }
        if line.trim().is_empty() {
            return Err(AppError::InvalidInput("commande vide".into()));
        }
        let mut command = CommandBuilder::new(shell);
        // `-i` comme pour le PATH : zsh ne lit `.zshrc` (alias, nvm...) qu'en shell interactif.
        #[cfg(unix)]
        command.args(["-ilc", line]);
        #[cfg(windows)]
        command.args(["/C", line]);
        command.cwd(cwd);
        command.env("PATH", shell_env::search_path());
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("TERM_PROGRAM", "Nuee");
        self.spawn(chat_id, command, RUN_SIZE, channel)
    }

    fn spawn(
        &self,
        chat_id: &str,
        command: CommandBuilder,
        (cols, rows): (u16, u16),
        channel: Channel<TerminalEvent>,
    ) -> Result<u32, AppError> {
        let size = PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = native_pty_system().openpty(size).map_err(failed)?;
        let mut child = pair.slave.spawn_command(command).map_err(failed)?;
        // Le shell garde son côté du pty : le nôtre fermé, sa lecture finirait sur EOF trop tôt.
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(failed)?;
        let writer = pair.master.take_writer().map_err(failed)?;
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let terminal = Arc::new(Terminal {
            chat_id: chat_id.to_owned(),
            pid: child.process_id().unwrap_or_default(),
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            exited: AtomicBool::new(false),
        });
        lock(&self.terminals).insert(id, terminal.clone());

        let terminals = self.terminals.clone();
        std::thread::spawn(move || {
            let mut chunk = [0u8; 16 * 1024];
            let mut pending = Vec::new();
            while let Ok(read) = reader.read(&mut chunk) {
                if read == 0 {
                    break;
                }
                let data = decode(&mut pending, &chunk[..read]);
                if !data.is_empty() && channel.send(TerminalEvent::Output { data }).is_err() {
                    break;
                }
            }
            let code = child
                .wait()
                .ok()
                .filter(|status| status.signal().is_none())
                .map(|status| status.exit_code());
            terminal.exited.store(true, Ordering::Relaxed);
            lock(&terminals).remove(&id);
            let _ = channel.send(TerminalEvent::Exit { code });
        });
        Ok(id)
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), AppError> {
        let terminal = self.get(id)?;
        let mut writer = lock(&terminal.writer);
        writer.write_all(data.as_bytes())?;
        writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), AppError> {
        let terminal = self.get(id)?;
        let size = PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        };
        lock(&terminal.master).resize(size).map_err(failed)
    }

    /// La commande qui tient le terminal, `None` quand le shell attend à son invite.
    /// Lance `ps` : hors du thread principal, sinon chaque relevé (toutes les 1,5 s) fige un instant la fenêtre.
    pub async fn busy(&self, id: u32) -> Option<String> {
        let terminal = self.get(id).ok()?;
        tauri::async_runtime::spawn_blocking(move || foreground(&terminal))
            .await
            .ok()
            .flatten()
    }

    pub fn close(&self, id: u32) {
        let terminal = lock(&self.terminals).remove(&id);
        if let Some(terminal) = terminal {
            hang_up(terminal);
        }
    }

    /// Arrêt d'une commande lancée par `run`, comme celui d'un serveur : SIGTERM, SIGKILL trois secondes plus tard.
    /// Elle reste dans la liste jusqu'à sa fin, qui envoie `exit`.
    pub fn stop(&self, id: u32) {
        if let Ok(terminal) = self.get(id) {
            end(terminal, Signal::Term, Duration::from_secs(3));
        }
    }

    pub fn close_chat(&self, chat_id: &str) {
        let mut terminals = lock(&self.terminals);
        let ids: Vec<u32> = terminals
            .iter()
            .filter(|(_, terminal)| terminal.chat_id == chat_id)
            .map(|(id, _)| *id)
            .collect();
        for id in ids {
            if let Some(terminal) = terminals.remove(&id) {
                hang_up(terminal);
            }
        }
    }

    pub fn close_all(&self) {
        let terminals: Vec<_> = lock(&self.terminals).drain().map(|(_, t)| t).collect();
        for terminal in terminals {
            hang_up(terminal);
        }
    }

    fn get(&self, id: u32) -> Result<Arc<Terminal>, AppError> {
        lock(&self.terminals)
            .get(&id)
            .cloned()
            .ok_or_else(|| AppError::InvalidInput(format!("terminal inconnu : {id}")))
    }
}

#[derive(Clone, Copy)]
enum Signal {
    Hup,
    Term,
}

/// Comme la fermeture d'une fenêtre de terminal : SIGHUP au shell, qui le passe à ses tâches, et à la commande
/// au premier plan, dans son propre groupe. Ce qui l'ignore est tué deux secondes plus tard.
fn hang_up(terminal: Arc<Terminal>) {
    end(terminal, Signal::Hup, Duration::from_secs(2));
}

#[cfg(unix)]
fn end(terminal: Arc<Terminal>, first: Signal, grace: Duration) {
    let Ok(pid) = libc::pid_t::try_from(terminal.pid) else {
        return;
    };
    if pid <= 0 {
        return;
    }
    let front = lock(&terminal.master).process_group_leader();
    let signal = move |sig| {
        // SAFETY: kill() ne touche pas à la mémoire ; au pire le groupe n'existe plus et l'appel échoue.
        unsafe {
            if let Some(front) = front.filter(|front| *front > 0 && *front != pid) {
                libc::kill(-front, sig);
            }
            libc::kill(-pid, sig);
        }
    };
    signal(match first {
        Signal::Hup => libc::SIGHUP,
        Signal::Term => libc::SIGTERM,
    });
    std::thread::spawn(move || {
        std::thread::sleep(grace);
        if !terminal.exited.load(Ordering::Relaxed) {
            signal(libc::SIGKILL);
        }
    });
}

#[cfg(windows)]
fn end(terminal: Arc<Terminal>, _first: Signal, _grace: Duration) {
    crate::services::agent::process::kill_tree(terminal.pid, true);
}

#[cfg(unix)]
fn foreground(terminal: &Terminal) -> Option<String> {
    let front = lock(&terminal.master).process_group_leader()?;
    if front <= 0 || u32::try_from(front).ok()? == terminal.pid {
        return None;
    }
    let output = std::process::Command::new("/bin/ps")
        .args(["-o", "comm=", "-p", &front.to_string()])
        .output()
        .ok()?;
    let comm = String::from_utf8_lossy(&output.stdout);
    let name = Path::new(comm.trim()).file_name()?.to_string_lossy();
    let name = name.trim_start_matches('-');
    (!name.is_empty()).then(|| name.to_owned())
}

/// ConPTY ne dit pas quel process tient la console : on ne demande pas.
#[cfg(windows)]
fn foreground(_terminal: &Terminal) -> Option<String> {
    None
}

/// Un caractère UTF-8 peut être coupé entre deux lectures : sa fin attend la lecture suivante dans `pending`.
fn decode(pending: &mut Vec<u8>, chunk: &[u8]) -> String {
    pending.extend_from_slice(chunk);
    let mut out = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                out.push_str(text);
                pending.clear();
                return out;
            }
            Err(error) => {
                let valid = error.valid_up_to();
                out.push_str(&String::from_utf8_lossy(&pending[..valid]));
                match error.error_len() {
                    Some(len) => {
                        out.push(char::REPLACEMENT_CHARACTER);
                        pending.drain(..valid + len);
                    }
                    None => {
                        pending.drain(..valid);
                        return out;
                    }
                }
            }
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
    use std::sync::mpsc;
    use std::time::Instant;
    use tauri::ipc::InvokeResponseBody;

    #[test]
    fn a_character_split_between_reads_is_kept_whole() {
        let mut pending = Vec::new();
        let bytes = "é!".as_bytes();
        assert_eq!(decode(&mut pending, &bytes[..1]), "");
        assert_eq!(decode(&mut pending, &bytes[1..]), "é!");
        assert!(pending.is_empty());
        assert_eq!(decode(&mut pending, b"a\xffb"), "a\u{FFFD}b");
    }

    fn collect() -> (Channel<TerminalEvent>, mpsc::Receiver<String>) {
        let (tx, rx) = mpsc::channel();
        let channel = Channel::new(move |body| {
            if let InvokeResponseBody::Json(json) = body {
                let _ = tx.send(json);
            }
            Ok(())
        });
        (channel, rx)
    }

    fn wait_for(rx: &mpsc::Receiver<String>, seen: &mut String, needle: &str) -> bool {
        let deadline = Instant::now() + Duration::from_secs(10);
        while !seen.contains(needle) {
            let Some(left) = deadline.checked_duration_since(Instant::now()) else {
                return false;
            };
            match rx.recv_timeout(left) {
                Ok(json) => seen.push_str(&json),
                Err(_) => return false,
            }
        }
        true
    }

    #[test]
    fn a_shell_runs_reports_its_command_and_dies_with_its_tab() {
        use tauri::async_runtime::block_on;
        let service = TerminalService::default();
        let (channel, rx) = collect();
        let mut command = CommandBuilder::new("/bin/sh");
        command.env("PS1", "$ ");
        let id = service.spawn("chat", command, (80, 24), channel).unwrap();
        let mut seen = String::new();

        service.write(id, "echo nuee-$((40+2))\n").unwrap();
        assert!(wait_for(&rx, &mut seen, "nuee-42"));
        assert_eq!(block_on(service.busy(id)), None);

        service.write(id, "sleep 30\n").unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while block_on(service.busy(id)).is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(block_on(service.busy(id)).as_deref(), Some("sleep"));

        service.close_chat("chat");
        assert!(wait_for(&rx, &mut seen, "\"exit\""));
        assert!(service.write(id, "\n").is_err());
    }

    fn history(chat_id: &str) -> ChatService {
        use crate::services::agent::AgentKind;
        use crate::services::chat::ChatSummary;
        let dir = std::env::temp_dir().join(format!("nuee-run-{}-{chat_id}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let chats = ChatService::open(&dir.join("nuee.db")).unwrap();
        chats
            .create(&ChatSummary {
                id: chat_id.into(),
                project_id: None,
                number: 1,
                agent: AgentKind::Claude,
                title: None,
                started: true,
                worktree: false,
                worktree_path: None,
                archived: false,
                archived_at: None,
                created_at: 0,
                updated_at: 0,
                pinned: false,
                model: None,
                added: 0,
                removed: 0,
                parent_id: None,
            })
            .unwrap();
        chats
    }

    #[test]
    fn a_command_runs_in_the_session_folder_and_reports_its_exit_code() {
        let chats = history("run");
        let service = TerminalService::default();
        let cwd = std::fs::canonicalize(std::env::temp_dir()).unwrap();

        let (channel, rx) = collect();
        let line = "echo nuee-$((40+2)) && pwd";
        service
            .run_in("/bin/sh", &chats, "run", &cwd, line, channel)
            .unwrap();
        let mut seen = String::new();
        assert!(wait_for(&rx, &mut seen, "\"code\":0"), "{seen}");
        assert!(seen.contains("nuee-42"), "{seen}");
        assert!(seen.contains(&*cwd.to_string_lossy()), "{seen}");

        let (channel, rx) = collect();
        service
            .run_in("/bin/sh", &chats, "run", &cwd, "echo boom; exit 3", channel)
            .unwrap();
        let mut seen = String::new();
        assert!(wait_for(&rx, &mut seen, "\"code\":3"), "{seen}");
        assert!(seen.contains("boom"));
    }

    #[test]
    fn a_long_command_stops_on_request() {
        let chats = history("stop");
        let service = TerminalService::default();
        let (channel, rx) = collect();
        let cwd = std::env::temp_dir();
        let id = service
            .run_in(
                "/bin/sh",
                &chats,
                "stop",
                &cwd,
                "echo start; sleep 30",
                channel,
            )
            .unwrap();
        let mut seen = String::new();
        assert!(wait_for(&rx, &mut seen, "start"));
        let started = Instant::now();
        service.stop(id);
        assert!(wait_for(&rx, &mut seen, "\"exit\""), "{seen}");
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(service.get(id).is_err());
    }

    #[test]
    fn an_unknown_session_or_an_empty_command_is_refused() {
        let chats = history("known");
        let service = TerminalService::default();
        let cwd = std::env::temp_dir();
        let (channel, _rx) = collect();
        assert!(
            service
                .run_in("/bin/sh", &chats, "ghost", &cwd, "echo hi", channel)
                .is_err()
        );
        let (channel, _rx) = collect();
        assert!(
            service
                .run_in("/bin/sh", &chats, "known", &cwd, "  \n", channel)
                .is_err()
        );
        assert!(lock(&service.terminals).is_empty());
    }
}
