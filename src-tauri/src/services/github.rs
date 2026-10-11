use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::process::Stdio;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::{Instant, timeout, timeout_at};
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::process;
use crate::utils::shell_env;

const BINARY: &str = "gh";
/// Seul hôte où Nuée ajoute un compte ; ceux d'un autre hôte (Enterprise) s'affichent tels que gh les donne.
const HOST: &str = "github.com";
const STATUS_TIMEOUT: Duration = Duration::from_secs(5);
/// gh demande le code à GitHub dès son lancement : passé ce délai, il est bloqué.
const CODE_TIMEOUT: Duration = Duration::from_secs(30);
/// Le temps de taper le code sur GitHub et de valider.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const TAIL_LINES: usize = 4;
const AVATAR_TIMEOUT: Duration = Duration::from_secs(5);
const AVATAR_MAX_BYTES: u64 = 512 * 1024;

/// GitHub CLI tel que Réglages > Intégrations le montre.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum GithubStatus {
    /// Introuvable, même dans le PATH du shell.
    Missing,
    /// Trop ancien pour `gh auth status --json`.
    Outdated { version: Option<String> },
    Ready {
        version: Option<String>,
        accounts: Vec<GithubAccount>,
    },
}

/// Compte enregistré dans gh. Aucun jeton : le JSON de gh n'en donne pas sans `--show-token`, et un
/// champ `token` serait de toute façon ignoré à la lecture.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GithubAccount {
    pub host: String,
    /// Vide quand gh n'a pas pu identifier le compte (jeton refusé).
    pub login: String,
    /// Compte que gh utilise pour cet hôte, dans tous les terminaux.
    pub active: bool,
    pub state: GithubAccountState,
    /// Message de gh, tel quel.
    pub error: Option<String>,
    /// Variable d'environnement d'où vient le jeton (`GH_TOKEN`...) : elle l'emporte sur les comptes enregistrés.
    pub env_var: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum GithubAccountState {
    Ok,
    Failed,
    /// gh n'a pas pu joindre l'hôte pour vérifier le compte.
    Timeout,
}

/// Code à usage unique à taper sur la page de GitHub.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GithubDeviceCode {
    pub code: String,
    pub url: String,
}

/// Tout passe par la CLI `gh` : Nuée ne lit ni sa config, ni le Trousseau, ni aucun jeton, et ne change
/// jamais le compte actif de gh (`switch`, `logout`) : il vaut pour tous les terminaux de l'utilisateur.
#[derive(Default)]
pub struct GithubService {
    login: Mutex<Option<Login>>,
    /// Avatars déjà lus, par login ; un échec n'est pas retenu (hors ligne au lancement).
    avatars: Mutex<HashMap<String, String>>,
}

/// `gh auth login` en cours : un seul à la fois, annulé par son PID.
struct Login {
    pid: u32,
    url: Option<String>,
}

impl GithubService {
    pub async fn status(&self) -> Result<GithubStatus, AppError> {
        match shell_env::find_binary(BINARY) {
            Some(program) => status_of(&program).await,
            None => Ok(GithubStatus::Missing),
        }
    }

    /// Ajoute un compte github.com par le navigateur. `on_code` reçoit le code dès que gh le donne ; la
    /// commande rend la main quand gh a fini (compte enregistré), échoue ou est annulé.
    pub async fn login(&self, on_code: impl Fn(GithubDeviceCode) + Sync) -> Result<(), AppError> {
        let program = shell_env::find_binary(BINARY).ok_or(AppError::AgentNotFound(BINARY))?;
        self.login_with(&program, LOGIN_TIMEOUT, &on_code).await
    }

    /// Ouvre la page du code depuis Rust : la capability du front n'a pas à connaître cette adresse.
    pub fn open_login_page(&self) -> Result<(), AppError> {
        let url = lock(&self.login)
            .as_ref()
            .and_then(|login| login.url.clone())
            .ok_or_else(|| AppError::InvalidInput("aucune connexion GitHub en cours".into()))?;
        tauri_plugin_opener::open_url(&url, None::<&str>)
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        Ok(())
    }

    /// Avatar public d'un compte github.com, en `data:` : la CSP n'autorise aucune image distante. Lu sans
    /// jeton, comme n'importe quel visiteur du profil.
    pub async fn avatar(&self, login: &str) -> Option<String> {
        if !valid_login(login) {
            return None;
        }
        if let Some(cached) = lock(&self.avatars).get(login) {
            return Some(cached.clone());
        }
        let owned = login.to_owned();
        let avatar = tauri::async_runtime::spawn_blocking(move || fetch_avatar(&owned))
            .await
            .ok()
            .flatten()?;
        lock(&self.avatars).insert(login.to_owned(), avatar.clone());
        Some(avatar)
    }

    /// Rend `login` actif dans gh pour `host` : ça vaut pour tous les terminaux, donc seulement sur un clic
    /// explicite. Seul un compte que gh liste comme utilisable est accepté ; rend l'état relu.
    pub async fn switch(&self, host: &str, login: &str) -> Result<GithubStatus, AppError> {
        let program = shell_env::find_binary(BINARY).ok_or(AppError::AgentNotFound(BINARY))?;
        switch_with(&program, host, login).await
    }

    pub fn cancel_login(&self) {
        if let Some(login) = lock(&self.login).take() {
            process::kill_tree(login.pid, true);
        }
    }

    async fn login_with(
        &self,
        program: &Path,
        limit: Duration,
        on_code: &(dyn Fn(GithubDeviceCode) + Sync),
    ) -> Result<(), AppError> {
        self.cancel_login();
        // `--web` sans terminal : gh écrit le code et l'adresse sans attendre de touche ni ouvrir le navigateur.
        // Pas de `--git-protocol` : gh l'écrirait pour tous les comptes de l'hôte, dans tous les terminaux.
        let mut command = command(program, &["auth", "login", "--hostname", HOST, "--web"]);
        command.stdout(Stdio::null());
        let mut child = command.spawn()?;
        let pid = child.id().unwrap_or_default();
        *lock(&self.login) = Some(Login { pid, url: None });

        let result = self.follow(&mut child, pid, limit, on_code).await;
        {
            let mut login = lock(&self.login);
            if login.as_ref().is_some_and(|login| login.pid == pid) {
                *login = None;
            }
        }
        if matches!(child.try_wait(), Ok(None)) {
            process::kill_tree(pid, true);
            let _ = child.wait().await;
        }
        result
    }

    /// Lit stderr (gh y écrit tout) jusqu'à sa fin, puis attend le code de sortie.
    async fn follow(
        &self,
        child: &mut Child,
        pid: u32,
        limit: Duration,
        on_code: &(dyn Fn(GithubDeviceCode) + Sync),
    ) -> Result<(), AppError> {
        let cancelled = || lock(&self.login).as_ref().map(|login| login.pid) != Some(pid);
        let failed = |message: &str| {
            AppError::AgentFailed(if cancelled() {
                "connexion annulée".into()
            } else {
                message.to_owned()
            })
        };
        let Some(stderr) = child.stderr.take() else {
            return Err(failed("gh s'est arrêté"));
        };
        let mut lines = BufReader::new(stderr).lines();
        let started = Instant::now();
        let (mut code, mut url, mut sent) = (None, None, false);
        let mut tail: Vec<String> = Vec::new();
        loop {
            let deadline = started + if sent { limit } else { CODE_TIMEOUT.min(limit) };
            let line = match timeout_at(deadline, lines.next_line()).await {
                Err(_) if sent => return Err(failed("connexion trop longue")),
                Err(_) => return Err(failed("gh n'a pas donné de code")),
                Ok(Ok(Some(line))) => line,
                Ok(_) => break,
            };
            // Une adresse dans un message d'erreur (documentation) n'est pas la page du code.
            match parse_login_line(&line) {
                Some(LoginLine::Code(value)) if code.is_none() => code = Some(value),
                Some(LoginLine::Url(value)) if url.is_none() && valid_login_url(&value) => {
                    url = Some(value);
                }
                _ if !line.trim().is_empty() => {
                    tail.push(line.trim().to_owned());
                    if tail.len() > TAIL_LINES {
                        tail.remove(0);
                    }
                }
                _ => {}
            }
            if let (false, Some(code), Some(url)) = (sent, &code, &url) {
                if let Some(login) = lock(&self.login).as_mut().filter(|login| login.pid == pid) {
                    login.url = Some(url.clone());
                }
                on_code(GithubDeviceCode {
                    code: code.clone(),
                    url: url.clone(),
                });
                sent = true;
            }
        }
        let status = timeout_at(started + limit, child.wait())
            .await
            .map_err(|_| failed("connexion trop longue"))??;
        if cancelled() {
            return Err(AppError::AgentFailed("connexion annulée".into()));
        }
        if status.success() {
            Ok(())
        } else if tail.is_empty() {
            Err(failed("gh auth login a échoué"))
        } else {
            Err(failed(&tail.join(" ")))
        }
    }
}

/// Règles des logins GitHub : le login finit dans une URL.
fn valid_login(login: &str) -> bool {
    (1..=39).contains(&login.len())
        && !login.starts_with('-')
        && login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn fetch_avatar(login: &str) -> Option<String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(AVATAR_TIMEOUT))
        .build()
        .into();
    let mut response = agent
        .get(format!("https://{HOST}/{login}.png?size=96"))
        .header("User-Agent", "Nuee")
        .call()
        .ok()?;
    let mime = response
        .headers()
        .get("content-type")?
        .to_str()
        .ok()?
        .split(';')
        .next()?
        .trim()
        .to_owned();
    if !matches!(
        mime.as_str(),
        "image/png" | "image/jpeg" | "image/gif" | "image/webp"
    ) {
        return None;
    }
    let bytes = response
        .body_mut()
        .with_config()
        .limit(AVATAR_MAX_BYTES)
        .read_to_vec()
        .ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

async fn switch_with(program: &Path, host: &str, login: &str) -> Result<GithubStatus, AppError> {
    let usable = match status_of(program).await? {
        GithubStatus::Ready { accounts, .. } => accounts.iter().any(|account| {
            account.host == host
                && account.login == login
                && account.state == GithubAccountState::Ok
        }),
        _ => false,
    };
    if !usable {
        return Err(AppError::InvalidInput(format!(
            "compte GitHub inutilisable : {login}"
        )));
    }
    let args = ["auth", "switch", "--hostname", host, "--user", login];
    let output = timeout(STATUS_TIMEOUT, command(program, &args).output())
        .await
        .map_err(|_| AppError::AgentFailed("gh auth switch n'a pas répondu".into()))??;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(AppError::AgentFailed(if stderr.is_empty() {
            "gh auth switch a échoué".into()
        } else {
            stderr
        }));
    }
    status_of(program).await
}

async fn status_of(program: &Path) -> Result<GithubStatus, AppError> {
    let (version, auth) = tokio::join!(
        run(program, &["--version"]),
        run(program, &["auth", "status", "--json", "hosts"]),
    );
    let version = version.ok().and_then(|(stdout, _)| parse_version(&stdout));
    let (stdout, stderr) = auth?;
    parse_status(version, &stdout, &stderr).map_err(AppError::AgentFailed)
}

/// Sans terminal ni question : une invite bloquerait gh, ses traces de débogage finiraient sur stderr.
fn command(program: &Path, args: &[&str]) -> Command {
    let mut command = Command::new(program);
    command
        .args(args)
        .env("PATH", shell_env::search_path())
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GH_DEBUG", "")
        .env("NO_COLOR", "1")
        .env("CLICOLOR_FORCE", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    #[cfg(windows)]
    command.creation_flags(process::CREATE_NO_WINDOW);
    command
}

/// Sorties standard et d'erreur, quel que soit le code de sortie : `auth status` peut finir en erreur
/// avec un JSON valide.
async fn run(program: &Path, args: &[&str]) -> Result<(String, String), AppError> {
    let child = command(program, args).spawn()?;
    let pid = child.id();
    match timeout(STATUS_TIMEOUT, child.wait_with_output()).await {
        Ok(output) => {
            let output = output?;
            Ok((
                String::from_utf8_lossy(&output.stdout).into_owned(),
                String::from_utf8_lossy(&output.stderr).into_owned(),
            ))
        }
        Err(_) => {
            if let Some(pid) = pid {
                process::kill_tree(pid, true);
            }
            Err(AppError::AgentFailed(format!(
                "gh n'a pas répondu en {} s",
                STATUS_TIMEOUT.as_secs()
            )))
        }
    }
}

#[derive(Deserialize)]
struct RawStatus {
    #[serde(default)]
    hosts: BTreeMap<String, Vec<RawAccount>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawAccount {
    #[serde(default)]
    state: String,
    #[serde(default)]
    error: String,
    #[serde(default)]
    active: bool,
    #[serde(default)]
    host: String,
    #[serde(default)]
    login: String,
    #[serde(default)]
    token_source: String,
}

/// « gh version 2.88.1 (2026-03-12) » : la première ligne seulement.
fn parse_version(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .next()?
        .split_whitespace()
        .find(|word| word.starts_with(|c: char| c.is_ascii_digit()))
        .map(str::to_owned)
}

fn parse_status(
    version: Option<String>,
    stdout: &str,
    stderr: &str,
) -> Result<GithubStatus, String> {
    if stderr.contains("unknown flag: --json") {
        return Ok(GithubStatus::Outdated { version });
    }
    let raw: RawStatus = serde_json::from_str(stdout.trim()).map_err(|_| {
        stderr
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map_or_else(
                || "gh auth status n'a rien renvoyé de lisible".to_owned(),
                str::to_owned,
            )
    })?;
    let mut accounts: Vec<GithubAccount> = raw
        .hosts
        .into_iter()
        .flat_map(|(host, accounts)| accounts.into_iter().map(move |raw| account(&host, raw)))
        .collect();
    accounts.sort_by_key(|account| account.host != HOST);
    Ok(GithubStatus::Ready { version, accounts })
}

fn account(host: &str, raw: RawAccount) -> GithubAccount {
    let state = match raw.state.as_str() {
        "success" => GithubAccountState::Ok,
        "timeout" => GithubAccountState::Timeout,
        _ => GithubAccountState::Failed,
    };
    let error = raw.error.trim();
    GithubAccount {
        host: if raw.host.is_empty() {
            host.to_owned()
        } else {
            raw.host
        },
        login: raw.login,
        active: raw.active,
        state,
        error: (state != GithubAccountState::Ok && !error.is_empty()).then(|| error.to_owned()),
        env_var: is_env_var(&raw.token_source).then_some(raw.token_source),
    }
}

/// `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`... ; `keyring` ou `oauth_token` viennent de la config.
fn is_env_var(source: &str) -> bool {
    source.ends_with("_TOKEN")
        && source
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

#[derive(Debug, PartialEq)]
enum LoginLine {
    Code(String),
    Url(String),
}

/// Lignes de `gh auth login --web` sans terminal (gh 2.88) :
/// « ! First copy your one-time code: XXXX-XXXX » puis « Open this URL to continue in your web browser:
/// https://github.com/login/device ». Lues par leur forme plutôt que leur formulation.
fn parse_login_line(line: &str) -> Option<LoginLine> {
    let words = || {
        line.split_whitespace()
            .map(|word| word.trim_matches(|c: char| matches!(c, '(' | ')' | ',' | '.' | ':')))
    };
    if let Some(url) = words().find(|word| word.starts_with("https://")) {
        return Some(LoginLine::Url(url.to_owned()));
    }
    if !line.to_lowercase().contains("code") {
        return None;
    }
    words()
        .find(|word| is_device_code(word))
        .map(|code| LoginLine::Code(code.to_owned()))
}

fn is_device_code(word: &str) -> bool {
    word.split_once('-').is_some_and(|(left, right)| {
        [left, right].iter().all(|part| {
            (4..=8).contains(&part.len())
                && part
                    .chars()
                    .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
        })
    })
}

/// Seule une page de l'hôte demandé est ouverte.
fn valid_login_url(url: &str) -> bool {
    url.strip_prefix("https://")
        .and_then(|rest| rest.strip_prefix(HOST))
        .is_some_and(|path| path.starts_with('/'))
        && !url.chars().any(|c| c.is_whitespace() || c.is_control())
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logins_are_checked_before_reaching_a_url() {
        assert!(valid_login("jeremy-prt"));
        assert!(valid_login("JeremyUlysSoft"));
        for bad in ["", "-a", "a/b", "a?b", "../x", &"a".repeat(40)] {
            assert!(!valid_login(bad), "{bad}");
        }
    }

    /// Sortie réelle de gh 2.88.1 (deux comptes), plus un hôte Enterprise.
    const TWO_ACCOUNTS: &str = r#"{"hosts":{"ghe.example.com":[{"state":"success","active":true,"host":"ghe.example.com","login":"jp","scopes":"repo","gitProtocol":"https","tokenSource":"keyring"}],"github.com":[{"state":"success","active":true,"host":"github.com","login":"jeremy-prt","scopes":"gist, project, read:org, repo, workflow","gitProtocol":"ssh","tokenSource":"keyring"},{"state":"success","active":false,"host":"github.com","login":"JeremyUlysSoft","scopes":"admin:org, gist, repo","gitProtocol":"ssh","tokenSource":"keyring"}]}}"#;

    fn ready(status: GithubStatus) -> Vec<GithubAccount> {
        match status {
            GithubStatus::Ready { accounts, .. } => accounts,
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn reads_every_account_github_com_first() {
        let accounts = ready(parse_status(Some("2.88.1".into()), TWO_ACCOUNTS, "").unwrap());
        let logins: Vec<(&str, &str, bool)> = accounts
            .iter()
            .map(|account| {
                (
                    account.host.as_str(),
                    account.login.as_str(),
                    account.active,
                )
            })
            .collect();
        assert_eq!(
            logins,
            [
                ("github.com", "jeremy-prt", true),
                ("github.com", "JeremyUlysSoft", false),
                ("ghe.example.com", "jp", true),
            ]
        );
        assert!(
            accounts
                .iter()
                .all(|account| account.state == GithubAccountState::Ok
                    && account.error.is_none()
                    && account.env_var.is_none())
        );
    }

    #[test]
    fn failed_accounts_and_env_tokens() {
        // Sortie réelle avec un GH_TOKEN refusé : pas de login, le message de l'API tel quel.
        let stdout = r#"{"hosts":{"github.com":[{"state":"error","error":"non-200 OK status code: 401 Unauthorized","active":true,"host":"github.com","login":"","tokenSource":"GH_TOKEN","gitProtocol":"https"},{"state":"timeout","active":false,"host":"github.com","login":"other","tokenSource":"keyring","gitProtocol":"ssh"},{"state":"success","active":false,"host":"github.com","login":"ci","tokenSource":"GITHUB_ENTERPRISE_TOKEN"},{"state":"success","active":false,"host":"github.com","login":"old","tokenSource":"oauth_token"}]}}"#;
        let accounts = ready(parse_status(None, stdout, "").unwrap());
        assert_eq!(accounts[0].state, GithubAccountState::Failed);
        assert_eq!(accounts[0].login, "");
        assert_eq!(
            accounts[0].error.as_deref(),
            Some("non-200 OK status code: 401 Unauthorized")
        );
        assert_eq!(accounts[0].env_var.as_deref(), Some("GH_TOKEN"));
        assert_eq!(accounts[1].state, GithubAccountState::Timeout);
        assert_eq!(accounts[1].error, None);
        assert_eq!(
            accounts[2].env_var.as_deref(),
            Some("GITHUB_ENTERPRISE_TOKEN")
        );
        assert_eq!(accounts[3].env_var, None);
    }

    #[test]
    fn no_account_is_an_empty_list() {
        // Sortie réelle sans compte : le JSON sur stdout, la phrase sur stderr, code de sortie 0.
        let status = parse_status(
            Some("2.88.1".into()),
            "{\"hosts\":{}}\n",
            "You are not logged into any GitHub hosts. To log in, run: gh auth login\n",
        )
        .unwrap();
        assert!(ready(status).is_empty());
    }

    #[test]
    fn old_gh_is_outdated_not_signed_out() {
        let stderr = "unknown flag: --json\n\nUsage:  gh auth status [flags]\n\nFlags:\n  -h, --hostname string\n";
        assert_eq!(
            parse_status(Some("2.40.1".into()), "", stderr),
            Ok(GithubStatus::Outdated {
                version: Some("2.40.1".into())
            })
        );
    }

    #[test]
    fn unreadable_status_gives_the_gh_message() {
        let error = parse_status(None, "", "\nfailed to read configuration: denied\n").unwrap_err();
        assert_eq!(error, "failed to read configuration: denied");
        assert!(parse_status(None, "", "").is_err());
    }

    #[test]
    fn a_token_never_reaches_the_front() {
        let stdout = r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"a","token":"gho_secret","tokenSource":"keyring"}]}}"#;
        let status = parse_status(None, stdout, "").unwrap();
        let json = serde_json::to_string(&status).unwrap();
        assert!(!json.contains("gho_secret"), "{json}");
    }

    #[test]
    fn version_from_the_first_line() {
        let stdout =
            "gh version 2.88.1 (2026-03-12)\nhttps://github.com/cli/cli/releases/tag/v2.88.1\n";
        assert_eq!(parse_version(stdout).as_deref(), Some("2.88.1"));
        assert_eq!(parse_version(""), None);
    }

    #[test]
    fn login_output_gives_the_code_and_the_page() {
        // Sortie réelle de gh 2.88.1 sans terminal, sur stderr.
        assert_eq!(parse_login_line(""), None);
        assert_eq!(
            parse_login_line("! First copy your one-time code: AB12-CD34"),
            Some(LoginLine::Code("AB12-CD34".into()))
        );
        assert_eq!(
            parse_login_line(
                "Open this URL to continue in your web browser: https://github.com/login/device"
            ),
            Some(LoginLine::Url("https://github.com/login/device".into()))
        );
        // Variante avec --clipboard, et messages de fin.
        assert_eq!(
            parse_login_line("! One-time code (AB12-CD34) copied to clipboard"),
            Some(LoginLine::Code("AB12-CD34".into()))
        );
        assert_eq!(parse_login_line("✓ Logged in as jeremy-prt"), None);
        assert_eq!(
            parse_login_line("- gh config set -h github.com git_protocol ssh"),
            None
        );
    }

    #[test]
    fn only_a_page_of_the_host_is_opened() {
        assert!(valid_login_url("https://github.com/login/device"));
        assert!(!valid_login_url("http://github.com/login/device"));
        assert!(!valid_login_url(
            "https://github.com.evil.example/login/device"
        ));
        assert!(!valid_login_url("https://evil.example/github.com/"));
        assert!(!valid_login_url("https://github.com"));
    }

    #[test]
    fn env_vars_are_told_apart_from_the_config() {
        assert!(is_env_var("GH_TOKEN"));
        assert!(is_env_var("GITHUB_TOKEN"));
        assert!(!is_env_var("oauth_token"));
        assert!(!is_env_var("keyring"));
        assert!(!is_env_var(""));
    }

    #[cfg(unix)]
    mod fake {
        use std::os::unix::fs::PermissionsExt;
        use std::path::PathBuf;

        use super::super::*;

        /// Faux `gh` : refuse de répondre si l'environnement laisserait gh poser une question.
        fn fake_gh(name: &str, login: &str) -> PathBuf {
            let dir = std::env::temp_dir().join(format!("nuee-gh-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            let program = dir.join("gh");
            let state = if name == "switch" { "success" } else { "error" };
            let script = format!(
                r#"#!/bin/sh
[ "$GH_PROMPT_DISABLED" = 1 ] && [ "$GH_PAGER" = cat ] && [ "$GIT_TERMINAL_PROMPT" = 0 ] && [ "${{GH_DEBUG-unset}}" = "" ] || {{ echo "bad env" >&2; exit 3; }}
case "$*" in
  --version) echo "gh version 2.88.1 (2026-03-12)";;
  "auth status --json hosts")
    echo "one account is broken" >&2
    printf '{{"hosts":{{"github.com":[{{"state":"{state}","error":"bad credentials","active":true,"host":"github.com","login":"a","tokenSource":"keyring"}}]}}}}\n'
    exit 1;;
  "auth login --hostname github.com --web")
{login};;
  "auth switch --hostname github.com --user a") touch "$(dirname "$0")/switched";;
esac
"#
            );
            std::fs::write(&program, script).unwrap();
            std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
            program
        }

        const CODE: &str = r#"    echo >&2
    echo "! First copy your one-time code: AB12-CD34" >&2
    echo "Open this URL to continue in your web browser: https://github.com/login/device" >&2"#;

        #[test]
        fn switch_only_targets_a_usable_account() {
            let broken = fake_gh("broken", "");
            let refused = tauri::async_runtime::block_on(switch_with(&broken, "github.com", "a"));
            assert!(matches!(refused, Err(AppError::InvalidInput(_))));
            assert!(!broken.with_file_name("switched").exists());

            let program = fake_gh("switch", "");
            let unknown = tauri::async_runtime::block_on(switch_with(&program, "github.com", "b"));
            assert!(matches!(unknown, Err(AppError::InvalidInput(_))));
            let status = tauri::async_runtime::block_on(switch_with(&program, "github.com", "a"));
            assert!(
                matches!(status, Ok(GithubStatus::Ready { .. })),
                "{status:?}"
            );
            assert!(program.with_file_name("switched").exists());
            for fake in [broken, program] {
                let _ = std::fs::remove_dir_all(fake.parent().unwrap());
            }
        }

        #[test]
        fn status_reads_the_json_despite_the_exit_code() {
            let program = fake_gh("status", "");
            let status = tauri::async_runtime::block_on(status_of(&program)).unwrap();
            let GithubStatus::Ready { version, accounts } = status else {
                panic!("{status:?}");
            };
            assert_eq!(version.as_deref(), Some("2.88.1"));
            assert_eq!(accounts[0].error.as_deref(), Some("bad credentials"));
            let _ = std::fs::remove_dir_all(program.parent().unwrap());
        }

        #[test]
        fn login_sends_the_code_then_waits_for_gh() {
            let program = fake_gh(
                "login",
                &format!("{CODE}\n    sleep 0.3\n    echo \"✓ Logged in as new\" >&2"),
            );
            let service = GithubService::default();
            let codes = Mutex::new(Vec::new());
            let result = tauri::async_runtime::block_on(service.login_with(
                &program,
                Duration::from_secs(10),
                &|code| lock(&codes).push(code),
            ));
            assert!(result.is_ok(), "{result:?}");
            assert_eq!(
                lock(&codes).as_slice(),
                [GithubDeviceCode {
                    code: "AB12-CD34".into(),
                    url: "https://github.com/login/device".into()
                }]
            );
            assert!(lock(&service.login).is_none());
            let _ = std::fs::remove_dir_all(program.parent().unwrap());
        }

        #[test]
        fn login_failure_gives_the_gh_message() {
            // Sortie réelle quand GH_TOKEN est défini.
            let program = fake_gh(
                "refused",
                r#"    echo "The value of the GH_TOKEN environment variable is being used for authentication." >&2
    echo "To have GitHub CLI store credentials instead, first clear the value from the environment." >&2
    exit 1"#,
            );
            let service = GithubService::default();
            let error = tauri::async_runtime::block_on(service.login_with(
                &program,
                Duration::from_secs(10),
                &|_| {},
            ))
            .unwrap_err();
            assert!(
                error.to_string().starts_with("The value of the GH_TOKEN"),
                "{error}"
            );
            let _ = std::fs::remove_dir_all(program.parent().unwrap());
        }

        #[test]
        fn a_link_in_an_error_is_not_the_code_page() {
            let program = fake_gh(
                "link",
                r#"    echo "failed to authenticate, see https://docs.github.com/rest" >&2
    exit 1"#,
            );
            let codes = Mutex::new(0);
            let error = tauri::async_runtime::block_on(GithubService::default().login_with(
                &program,
                Duration::from_secs(10),
                &|_| *lock(&codes) += 1,
            ))
            .unwrap_err();
            assert!(error.to_string().contains("docs.github.com"), "{error}");
            assert_eq!(*lock(&codes), 0);
            let _ = std::fs::remove_dir_all(program.parent().unwrap());
        }

        #[test]
        fn login_can_be_cancelled() {
            let program = fake_gh("cancel", &format!("{CODE}\n    exec sleep 30"));
            let service = GithubService::default();
            let started = std::time::Instant::now();
            let (result, ()) = tauri::async_runtime::block_on(async {
                tokio::join!(
                    service.login_with(&program, Duration::from_secs(60), &|_| {}),
                    async {
                        tokio::time::sleep(Duration::from_millis(500)).await;
                        let url = lock(&service.login)
                            .as_ref()
                            .and_then(|login| login.url.clone());
                        assert_eq!(url.as_deref(), Some("https://github.com/login/device"));
                        service.cancel_login();
                    }
                )
            });
            assert!(result.unwrap_err().to_string().contains("annulée"));
            assert!(started.elapsed() < Duration::from_secs(10));
            assert!(lock(&service.login).is_none());
            let _ = std::fs::remove_dir_all(program.parent().unwrap());
        }
    }
}
