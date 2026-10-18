//! Connexion du compte d'un agent par sa propre CLI (`claude auth login`), sans terminal : la CLI ouvre la
//! page de connexion, la page donne un code, l'utilisateur le colle dans Nuée et Rust l'écrit sur stdin.
//! Nuée ne lit ni ne garde aucun jeton : la CLI range la connexion elle-même.

use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;
use tokio::time::{Instant, timeout_at};

use super::{AgentKind, AgentService, lock, process, session};
use crate::error::AppError;

/// Le temps de se connecter dans le navigateur, d'y retrouver le code et de le coller.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const PAGE_TIMEOUT: Duration = Duration::from_secs(30);
const TAIL_LINES: usize = 4;

/// Connexion en cours : une seule à la fois, annulée par son PID.
pub(super) struct Login {
    pid: u32,
    url: Option<String>,
    stdin: Option<ChildStdin>,
}

impl AgentService {
    /// Lance la connexion du compte de `kind`. `on_page` est appelé quand la page de connexion est prête
    /// (ouverte par la CLI) ; la commande rend la main quand la CLI a fini, échoue ou est annulée.
    pub async fn login(&self, kind: AgentKind, on_page: impl Fn() + Sync) -> Result<(), AppError> {
        let driver = kind.driver(&self.scratch);
        let args = driver.login_args().ok_or_else(|| {
            AppError::InvalidInput("connexion impossible depuis Nuée pour cet agent".into())
        })?;
        let program = self.program(kind)?;
        std::fs::create_dir_all(&self.scratch)?;
        self.cancel_login();
        let mut child = session::spawn(&program, args, &[], &self.scratch)?;
        let pid = child.id().unwrap_or_default();
        *lock(&self.login) = Some(Login {
            pid,
            url: None,
            stdin: child.stdin.take(),
        });
        let cancelled = || lock(&self.login).as_ref().map(|login| login.pid) != Some(pid);
        // Annulée ou remplacée se lit avant `end`, qui vide l'état : après, tout passerait pour annulé.
        let finish = |message: String| {
            let was_cancelled = cancelled();
            self.end(pid);
            AppError::AgentFailed(if was_cancelled {
                "connexion annulée".into()
            } else {
                message
            })
        };

        // stderr lu à part : une CLI qui s'y épancherait ne bloquerait pas sa sortie standard.
        let stderr = child.stderr.take().map(|mut stderr| {
            tauri::async_runtime::spawn(async move {
                let mut text = String::new();
                let _ = (&mut stderr)
                    .take(16 * 1024)
                    .read_to_string(&mut text)
                    .await;
                text
            })
        });
        let started = Instant::now();
        let mut tail: Vec<String> = Vec::new();
        let mut page = false;
        if let Some(stdout) = child.stdout.take() {
            let mut lines = BufReader::new(stdout).lines();
            loop {
                let deadline = started + if page { LOGIN_TIMEOUT } else { PAGE_TIMEOUT };
                let line = match timeout_at(deadline, lines.next_line()).await {
                    Err(_) if page => break,
                    Err(_) => {
                        process::kill_tree(pid, true);
                        return Err(finish("la page de connexion ne s'est pas ouverte".into()));
                    }
                    Ok(Ok(Some(line))) => line,
                    Ok(_) => break,
                };
                match login_url(&line) {
                    Some(url) if !page => {
                        if let Some(login) =
                            lock(&self.login).as_mut().filter(|login| login.pid == pid)
                        {
                            login.url = Some(url);
                        }
                        page = true;
                        on_page();
                    }
                    // Les lignes d'adresse portent l'état de la connexion : jamais dans un message d'erreur.
                    _ if !line.trim().is_empty() && !line.contains("https://") => {
                        tail.push(line.trim().to_owned());
                        if tail.len() > TAIL_LINES {
                            tail.remove(0);
                        }
                    }
                    _ => {}
                }
            }
        }
        let status = match timeout_at(started + LOGIN_TIMEOUT, child.wait()).await {
            Ok(status) => status?,
            Err(_) => {
                process::kill_tree(pid, true);
                return Err(finish("connexion trop longue".into()));
            }
        };
        if cancelled() {
            return Err(finish(String::new()));
        }
        if status.success() {
            self.end(pid);
            // Les process ouverts sans compte ne verraient pas la nouvelle connexion : ils repartiront au
            // prochain message. Un tour en cours est laissé à sa fin.
            let idle: Vec<_> = {
                let mut sessions = lock(&self.sessions);
                let ids: Vec<String> = sessions
                    .iter()
                    .filter(|(_, session)| session.key.agent == kind && !session.busy())
                    .map(|(id, _)| id.clone())
                    .collect();
                ids.iter().filter_map(|id| sessions.remove(id)).collect()
            };
            for session in idle {
                session.retire();
            }
            return Ok(());
        }
        // La raison d'un échec est sur stderr ; sinon, la fin de ce que la CLI a écrit.
        let mut errors: Vec<String> = Vec::new();
        if let Some(stderr) = stderr
            && let Ok(text) = stderr.await
        {
            errors = text
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty() && !line.contains("https://"))
                .map(str::to_owned)
                .collect();
        }
        let lines = if errors.is_empty() { tail } else { errors };
        let lines = &lines[lines.len().saturating_sub(TAIL_LINES)..];
        Err(finish(if lines.is_empty() {
            "la connexion a échoué".into()
        } else {
            lines.join(" ")
        }))
    }

    /// Code donné par la page de connexion, écrit à la CLI qui l'attend.
    pub async fn login_code(&self, code: &str) -> Result<(), AppError> {
        let code = code.trim();
        if !valid_code(code) {
            return Err(AppError::InvalidInput(
                "code incomplet, le copier en entier depuis la page".into(),
            ));
        }
        // Sorti du verrou le temps d'écrire : il ne traverse pas un `.await`.
        let (pid, mut stdin) = {
            let mut login = lock(&self.login);
            let login = login
                .as_mut()
                .ok_or_else(|| AppError::InvalidInput("aucune connexion en cours".into()))?;
            let stdin = login
                .stdin
                .take()
                .ok_or_else(|| AppError::InvalidInput("code déjà envoyé".into()))?;
            (login.pid, stdin)
        };
        stdin.write_all(format!("{code}\n").as_bytes()).await?;
        stdin.flush().await?;
        if let Some(login) = lock(&self.login).as_mut().filter(|login| login.pid == pid) {
            login.stdin = Some(stdin);
        }
        Ok(())
    }

    /// Rouvre la page de connexion depuis Rust : son adresse ne passe pas par le front.
    pub fn open_login_page(&self) -> Result<(), AppError> {
        let url = lock(&self.login)
            .as_ref()
            .and_then(|login| login.url.clone())
            .ok_or_else(|| AppError::InvalidInput("aucune connexion en cours".into()))?;
        tauri_plugin_opener::open_url(&url, None::<&str>)
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        Ok(())
    }

    pub fn cancel_login(&self) {
        if let Some(login) = lock(&self.login).take() {
            process::kill_tree(login.pid, true);
        }
    }

    fn end(&self, pid: u32) {
        let mut login = lock(&self.login);
        if login.as_ref().is_some_and(|login| login.pid == pid) {
            *login = None;
        }
    }
}

/// La page donne `code#état` : sans les deux, la CLI attendrait encore sans le dire.
fn valid_code(code: &str) -> bool {
    let complete = code
        .split_once('#')
        .is_some_and(|(code, state)| !code.is_empty() && !state.is_empty());
    complete && code.len() <= 512 && !code.chars().any(|c| c.is_whitespace() || c.is_control())
}

/// Adresse de la page de connexion dans une ligne de la CLI ; seulement sur les domaines de l'éditeur, une
/// adresse d'aide ou de documentation n'en est pas une. Coupée au premier caractère de contrôle : hors d'un vrai
/// terminal, la CLI peut quand même écrire un lien de terminal (OSC 8) autour.
fn login_url(line: &str) -> Option<String> {
    let start = line.find("https://")?;
    let raw: String = line[start..]
        .chars()
        .take_while(|c| !c.is_whitespace() && !c.is_control())
        .collect();
    let url = tauri::Url::parse(&raw).ok()?;
    let host = url.host_str()?;
    let trusted = ["claude.com", "claude.ai", "anthropic.com"]
        .iter()
        .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")));
    (url.scheme() == "https" && trusted && url.path().contains("oauth")).then_some(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_complete_code_reaches_the_cli() {
        assert!(valid_code("abc123#state456"));
        assert!(!valid_code("abc123"));
        assert!(!valid_code("#state"));
        assert!(!valid_code("abc#"));
        assert!(!valid_code("abc 123#state"));
    }

    #[test]
    fn the_login_page_is_read_from_the_cli_output() {
        let line = "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&state=abc";
        assert_eq!(
            login_url(line).as_deref(),
            Some("https://claude.com/cai/oauth/authorize?code=true&state=abc")
        );
        assert_eq!(login_url("Opening browser to sign in…"), None);
        assert_eq!(login_url("see https://docs.claude.com/en/docs"), None);
        assert_eq!(
            login_url("visit https://claude.com.evil.io/oauth/authorize"),
            None
        );
    }
}
