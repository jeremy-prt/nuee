use std::time::Duration;

use serde::Serialize;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::time::{Instant, sleep, timeout_at};
use ts_rs::TS;

use super::{AgentKind, AgentService, Driver, lock, process, session, settings, valid_name};
use crate::error::AppError;

const MCP_TIMEOUT: Duration = Duration::from_secs(30);
const MCP_POLL: Duration = Duration::from_millis(400);
/// Certains serveurs (plugins) n'arrivent dans la liste qu'après un aller-retour réseau : une liste sans
/// serveur en attente avant ce délai peut encore s'allonger.
const MCP_SETTLE: Duration = Duration::from_secs(2);
/// Le temps de valider la page d'autorisation du serveur dans le navigateur.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const LOGIN_POLL: Duration = Duration::from_secs(1);

pub(super) struct McpAuth {
    /// Page d'autorisation à ouvrir ; `None` quand le serveur n'en demande pas. L'agent reçoit
    /// lui-même le retour du navigateur (port local), puis reconnecte le serveur.
    pub url: Option<String>,
}

/// Serveur MCP de la config de l'agent, tel qu'un nouveau chat le verrait. Les connecteurs de son compte
/// claude.ai n'en font pas partie : ils ne se règlent pas d'ici (choix de Jérémy).
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct McpServer {
    pub name: String,
    pub status: McpStatus,
    /// `stdio`, `http`, `sse`... ; `claudeai-proxy` pour un connecteur claude.ai.
    pub transport: String,
    /// Commande lancée ou adresse du serveur.
    pub target: String,
    /// Origine telle que l'agent la nomme : `user`, `claudeai`, `plugin`...
    pub scope: String,
    pub tools: Option<u32>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum McpStatus {
    Pending,
    Connected,
    NeedsAuth,
    Failed,
    /// Coupé dans la config de l'agent.
    Disabled,
}

impl AgentService {
    /// Chaque relevé part sur `on_update` jusqu'à ce qu'aucun serveur ne soit plus en connexion.
    pub async fn mcp_status(
        &self,
        kind: AgentKind,
        on_update: impl Fn(&[McpServer]),
    ) -> Result<Vec<McpServer>, AppError> {
        let denied = denied_servers(kind);
        let servers = self
            .watch_mcp(kind, |servers| {
                on_update(&visible(servers, &denied));
                servers
                    .iter()
                    .all(|server| server.status != McpStatus::Pending)
            })
            .await?;
        Ok(visible(&servers, &denied))
    }

    pub fn mcp_set_enabled(
        &self,
        kind: AgentKind,
        name: &str,
        enabled: bool,
    ) -> Result<(), AppError> {
        if !valid_name(name) {
            return Err(AppError::InvalidInput("nom de serveur invalide".into()));
        }
        let file = kind
            .settings_file()
            .ok_or_else(|| std::io::Error::other("dossier de config introuvable"))?;
        settings::set_server(&file, name, enabled)
    }

    /// Nouvel essai de connexion d'un serveur, dans un process neuf. S'il répond, les chats ouverts
    /// le retentent aussi : sans ça, ils garderaient l'échec jusqu'à la relance de leur process.
    pub async fn mcp_check(&self, kind: AgentKind, name: &str) -> Result<McpServer, AppError> {
        if !valid_name(name) {
            return Err(AppError::InvalidInput("nom de serveur invalide".into()));
        }
        let servers = self
            .watch_mcp(kind, |servers| {
                match servers.iter().find(|server| server.name == name) {
                    Some(server) => server.status != McpStatus::Pending,
                    None => servers
                        .iter()
                        .all(|server| server.status != McpStatus::Pending),
                }
            })
            .await?;
        let server = visible(&servers, &denied_servers(kind))
            .into_iter()
            .find(|server| server.name == name)
            .ok_or_else(|| AppError::InvalidInput(format!("serveur MCP inconnu : {name}")))?;
        if server.status == McpStatus::Connected {
            self.reconnect_live(kind, name);
        }
        Ok(server)
    }

    /// Ouvre l'autorisation du serveur dans le navigateur et attend que le serveur réponde. Par le
    /// protocole de contrôle : `claude mcp login` refuse de finir sans terminal.
    pub async fn mcp_login(&self, kind: AgentKind, name: &str) -> Result<McpServer, AppError> {
        if !valid_name(name) {
            return Err(AppError::InvalidInput("nom de serveur invalide".into()));
        }
        std::fs::create_dir_all(&self.scratch)?;
        let driver = kind.driver(&self.scratch);
        let program = self.program(kind)?;
        let (args, requests) = driver.mcp_probe();
        let mut child = session::spawn(&program, args, &self.scratch)?;
        let pid = child.id().unwrap_or_default();
        lock(&self.logins).insert(name.to_owned(), pid);

        let result = self
            .authorize(driver.as_ref(), &mut child, &requests, name, pid)
            .await;
        {
            let mut logins = lock(&self.logins);
            if logins.get(name) == Some(&pid) {
                logins.remove(name);
            }
        }
        process::kill_tree(pid, true);
        let _ = child.wait().await;
        let server = result?;
        self.reconnect_live(kind, name);
        Ok(server)
    }

    pub fn mcp_cancel_login(&self, name: &str) {
        if let Some(pid) = lock(&self.logins).remove(name) {
            process::kill_tree(pid, true);
        }
    }

    fn reconnect_live(&self, kind: AgentKind, name: &str) {
        let line = kind.driver(&self.scratch).mcp_reconnect_message(name);
        for session in lock(&self.sessions).values() {
            if session.key.agent == kind {
                session.write(line.clone());
            }
        }
    }

    /// Fait ouvrir la page d'autorisation, puis relit l'état du serveur jusqu'à ce qu'il réponde, que
    /// l'utilisateur annule (son entrée quitte `logins`) ou que le délai passe.
    async fn authorize(
        &self,
        driver: &dyn Driver,
        child: &mut Child,
        requests: &[String],
        name: &str,
        pid: u32,
    ) -> Result<McpServer, AppError> {
        let cancelled = || lock(&self.logins).get(name) != Some(&pid);
        let stopped = || {
            AppError::AgentFailed(if cancelled() {
                "connexion annulée".into()
            } else {
                format!("{} s'est arrêté", driver.binary())
            })
        };
        let (Some(stdin), Some(stdout)) = (child.stdin.as_mut(), child.stdout.take()) else {
            return Err(stopped());
        };
        let mut lines = BufReader::new(stdout).lines();
        let mut sent = true;
        for request in requests {
            sent = sent && send(stdin, request).await;
        }
        // Un serveur de plugin n'existe pour la CLI qu'une fois chargé : le demander avant donne
        // « Server not found ».
        let deadline = Instant::now() + MCP_TIMEOUT;
        loop {
            if !sent || !send(stdin, &driver.mcp_status_message()).await {
                return Err(stopped());
            }
            let servers = read_until(&mut lines, deadline, |line| driver.parse_mcp_status(line))
                .await
                .ok_or_else(stopped)?
                .map_err(AppError::AgentFailed)?;
            if servers.iter().any(|server| server.name == name) {
                break;
            }
            if Instant::now() + MCP_POLL >= deadline {
                return Err(AppError::InvalidInput(format!(
                    "serveur MCP inconnu : {name}"
                )));
            }
            sleep(MCP_POLL).await;
        }
        if !send(stdin, &driver.mcp_auth_message(name)).await {
            return Err(stopped());
        }
        let auth = read_until(&mut lines, Instant::now() + MCP_TIMEOUT, |line| {
            driver.parse_mcp_auth(line)
        })
        .await
        .ok_or_else(stopped)?
        .map_err(AppError::AgentFailed)?;
        if let Some(url) = &auth.url {
            if !url.starts_with("https://") && !url.starts_with("http://") {
                return Err(AppError::AgentFailed(format!("adresse refusée : {url}")));
            }
            tauri_plugin_opener::open_url(url, None::<&str>)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
        }

        let deadline = Instant::now() + LOGIN_TIMEOUT;
        loop {
            sleep(LOGIN_POLL).await;
            if cancelled() {
                return Err(stopped());
            }
            if Instant::now() >= deadline {
                return Err(AppError::AgentFailed("connexion trop longue".into()));
            }
            if !send(stdin, &driver.mcp_status_message()).await {
                return Err(stopped());
            }
            let servers = read_until(&mut lines, Instant::now() + MCP_TIMEOUT, |line| {
                driver.parse_mcp_status(line)
            })
            .await
            .ok_or_else(stopped)?
            .map_err(AppError::AgentFailed)?;
            if let Some(server) = servers
                .into_iter()
                .find(|server| server.name == name && server.status == McpStatus::Connected)
            {
                return Ok(server);
            }
        }
    }

    /// Lance l'agent sans tour et lui redemande l'état de ses serveurs jusqu'à ce que `done` le juge
    /// stable (après `MCP_SETTLE`) ou que le délai passe. Renvoie le dernier état lu.
    async fn watch_mcp(
        &self,
        kind: AgentKind,
        mut done: impl FnMut(&[McpServer]) -> bool,
    ) -> Result<Vec<McpServer>, AppError> {
        std::fs::create_dir_all(&self.scratch)?;
        let driver = kind.driver(&self.scratch);
        let program = self.program(kind)?;
        let (args, requests) = driver.mcp_probe();
        let mut child = session::spawn(&program, args, &self.scratch)?;
        let started = Instant::now();
        let deadline = started + MCP_TIMEOUT;

        let mut last = None;
        let mut failure = None;
        if let (Some(stdin), Some(stdout)) = (child.stdin.as_mut(), child.stdout.take()) {
            let mut lines = BufReader::new(stdout).lines();
            let mut sent = true;
            for request in &requests {
                sent = sent && send(stdin, request).await;
            }
            'watch: while sent && send(stdin, &driver.mcp_status_message()).await {
                let servers =
                    match read_until(&mut lines, deadline, |line| driver.parse_mcp_status(line))
                        .await
                    {
                        Some(Ok(servers)) => servers,
                        Some(Err(error)) => {
                            failure = Some(error);
                            break 'watch;
                        }
                        None => break 'watch,
                    };
                let stop = done(&servers) && started.elapsed() >= MCP_SETTLE;
                last = Some(servers);
                if stop || Instant::now() + MCP_POLL >= deadline {
                    break;
                }
                sleep(MCP_POLL).await;
            }
        }
        if let Some(pid) = child.id() {
            process::kill_tree(pid, true);
        }
        let _ = child.wait().await;
        last.ok_or_else(|| {
            AppError::AgentFailed(failure.unwrap_or_else(|| {
                format!(
                    "{} n'a pas donné l'état de ses serveurs MCP",
                    driver.binary()
                )
            }))
        })
    }
}

fn denied_servers(kind: AgentKind) -> Vec<String> {
    kind.settings_file()
        .and_then(|file| settings::read(&file).ok())
        .map(|config| settings::denied_servers(&config))
        .unwrap_or_default()
}

/// Sans les connecteurs claude.ai. La CLI tait les serveurs coupés partout : ils reviennent dans la
/// liste pour pouvoir être rallumés.
fn visible(servers: &[McpServer], denied: &[String]) -> Vec<McpServer> {
    let connector = |name: &str| name.starts_with("claude.ai ");
    let mut all: Vec<McpServer> = servers
        .iter()
        .filter(|server| server.scope != "claudeai" && !connector(&server.name))
        .cloned()
        .collect();
    for name in denied {
        if connector(name) || all.iter().any(|server| &server.name == name) {
            continue;
        }
        let scope = if name.starts_with("plugin:") {
            "plugin"
        } else {
            ""
        };
        all.push(McpServer {
            name: name.clone(),
            status: McpStatus::Disabled,
            transport: String::new(),
            target: String::new(),
            scope: scope.to_owned(),
            tools: None,
            error: None,
        });
    }
    all
}

/// Lit la sortie jusqu'à la ligne que `parse` reconnaît. `None` : fin de la sortie ou délai passé.
async fn read_until<T>(
    lines: &mut Lines<BufReader<ChildStdout>>,
    deadline: Instant,
    parse: impl Fn(&str) -> Option<T>,
) -> Option<T> {
    loop {
        let Ok(Ok(Some(line))) = timeout_at(deadline, lines.next_line()).await else {
            return None;
        };
        if let Some(value) = parse(&line) {
            return Some(value);
        }
    }
}

async fn send(stdin: &mut ChildStdin, line: &str) -> bool {
    stdin
        .write_all(format!("{line}\n").as_bytes())
        .await
        .is_ok()
        && stdin.flush().await.is_ok()
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    use super::*;

    /// Faux `claude` : `good` reste en connexion deux relevés, puis répond. `later` attend une
    /// autorisation, accordée deux relevés après la demande ; `slow` ne l'obtient jamais. Aucune
    /// réponse ne donne de page à ouvrir : le test n'ouvre pas de navigateur.
    const FAKE: &str = r#"#!/bin/sh
n=0; asked=1000
while IFS= read -r line; do
  case "$line" in
    *mcp_status*)
      n=$((n+1)); s=connected; [ $n -lt 3 ] && s=pending
      l=needs-auth; [ $n -ge $((asked+2)) ] && l=connected
      printf '{"type":"control_response","response":{"subtype":"success","request_id":"nuee-mcp","response":{"mcpServers":[{"name":"good","status":"%s","config":{"command":"x"},"scope":"user"},{"name":"later","status":"%s","config":{"type":"http","url":"https://x"},"scope":"user"},{"name":"slow","status":"needs-auth","config":{"type":"http","url":"https://y"},"scope":"user"}]}}}\n' "$s" "$l";;
    *mcp_authenticate*good*)
      printf '{"type":"control_response","response":{"subtype":"error","request_id":"nuee-mcp-auth","error":"Server type stdio does not support OAuth authentication"}}\n';;
    *mcp_authenticate*)
      case "$line" in *later*) asked=$n;; esac
      printf '{"type":"control_response","response":{"subtype":"success","request_id":"nuee-mcp-auth","response":{"requiresUserAction":false,"callbackExpected":true}}}\n';;
    *initialize*)
      printf '{"type":"control_response","response":{"subtype":"success","request_id":"nuee-init","response":{}}}\n';;
  esac
done
"#;

    fn fake_service(name: &str) -> (AgentService, PathBuf) {
        let dir = std::env::temp_dir().join(format!("nuee-mcp-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("bin")).unwrap();
        let program = dir.join("bin").join("claude");
        std::fs::write(&program, FAKE).unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        let service = AgentService::new(dir.join("scratch"));
        service
            .set_path(
                AgentKind::Claude,
                Some(program.to_string_lossy().into_owned()),
            )
            .unwrap();
        (service, dir)
    }

    fn cleanup(dir: &Path) {
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn status_streams_until_no_server_is_pending() {
        tauri::async_runtime::block_on(status_streams());
    }

    async fn status_streams() {
        let (service, dir) = fake_service("status");
        let updates = Mutex::new(Vec::new());
        let servers = service
            .mcp_status(AgentKind::Claude, |servers| {
                lock(&updates).push(servers[0].status);
            })
            .await
            .unwrap();
        assert_eq!(servers[0].status, McpStatus::Connected);
        let updates = updates.into_inner().unwrap();
        assert_eq!(
            &updates[..3],
            [McpStatus::Pending, McpStatus::Pending, McpStatus::Connected]
        );

        let server = service.mcp_check(AgentKind::Claude, "good").await.unwrap();
        assert_eq!(server.status, McpStatus::Connected);
        assert!(
            service
                .mcp_check(AgentKind::Claude, "unknown")
                .await
                .is_err()
        );
        cleanup(&dir);
    }

    #[test]
    fn login_reports_the_agent_error_and_can_be_cancelled() {
        tauri::async_runtime::block_on(login_errors());
    }

    async fn login_errors() {
        let (service, dir) = fake_service("login");
        let error = service
            .mcp_login(AgentKind::Claude, "good")
            .await
            .unwrap_err();
        assert!(
            error.to_string().contains("does not support OAuth"),
            "{error}"
        );
        assert!(
            service
                .mcp_login(AgentKind::Claude, "--help")
                .await
                .is_err()
        );

        let server = service.mcp_login(AgentKind::Claude, "later").await.unwrap();
        assert_eq!(server.status, McpStatus::Connected);

        let started = std::time::Instant::now();
        let (result, ()) = tokio::join!(service.mcp_login(AgentKind::Claude, "slow"), async {
            sleep(Duration::from_millis(1500)).await;
            service.mcp_cancel_login("slow");
        });
        assert!(result.unwrap_err().to_string().contains("annulée"));
        assert!(started.elapsed() < Duration::from_secs(10));
        assert!(lock(&service.logins).is_empty());
        cleanup(&dir);
    }

    #[test]
    fn connectors_hidden_and_denied_servers_listed() {
        let servers = [McpServer {
            name: "good".into(),
            status: McpStatus::Connected,
            transport: "stdio".into(),
            target: "x".into(),
            scope: "user".into(),
            tools: Some(1),
            error: None,
        }];
        let connector = McpServer {
            name: "claude.ai Linear".into(),
            scope: "claudeai".into(),
            ..servers[0].clone()
        };
        let all = visible(
            &[servers[0].clone(), connector],
            &["claude.ai Notion".into(), "plugin:figma:figma".into()],
        );
        let names: Vec<&str> = all.iter().map(|server| server.name.as_str()).collect();
        assert_eq!(names, ["good", "plugin:figma:figma"]);
        assert_eq!(all[1].status, McpStatus::Disabled);
        assert_eq!(all[1].scope, "plugin");
    }
}
