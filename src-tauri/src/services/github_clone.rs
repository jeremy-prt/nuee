use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::AsyncReadExt;
use tokio::time::timeout;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::process;
use crate::services::github::{BINARY, command};
use crate::utils::shell_env;

/// Plusieurs pages de 100 : un compte membre de grosses organisations en a des centaines.
const LIST_TIMEOUT: Duration = Duration::from_secs(20);
const TAIL_LINES: usize = 3;

/// Dépôt accessible au compte actif de gh, du plus récemment poussé au plus ancien.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GithubRepo {
    /// `propriétaire/nom`.
    pub name: String,
    pub description: Option<String>,
    pub private: bool,
    pub fork: bool,
    pub archived: bool,
    pub pushed_at: Option<String>,
}

/// Étape de `git clone` telle que git l'écrit (« Receiving objects ») ; le front la traduit.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CloneProgress {
    pub stage: String,
    pub percent: Option<u8>,
}

/// Un clone à la fois, annulé par son PID.
#[derive(Default)]
pub struct CloneService {
    running: Mutex<Option<u32>>,
}

impl CloneService {
    pub async fn repos(&self) -> Result<Vec<GithubRepo>, AppError> {
        let program = shell_env::find_binary(BINARY).ok_or(AppError::AgentNotFound(BINARY))?;
        let jq =
            ".[] | {name: .full_name, description, private, fork, archived, pushedAt: .pushed_at}";
        let args = [
            "api",
            "--paginate",
            "user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
            "--jq",
            jq,
        ];
        let output = timeout(LIST_TIMEOUT, command(&program, &args).output())
            .await
            .map_err(|_| AppError::AgentFailed("GitHub n'a pas répondu".into()))??;
        if !output.status.success() {
            return Err(AppError::AgentFailed(tail(&String::from_utf8_lossy(
                &output.stderr,
            ))));
        }
        Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| serde_json::from_str(line).ok())
            .collect())
    }

    /// Clone `repo` dans `parent/name`. Un dépôt GitHub (`propriétaire/nom` ou son adresse) passe par gh avec
    /// le jeton du compte actif, toujours en https : en ssh, la clé choisit le compte et le `git_protocol` de
    /// gh peut viser une clé absente. Toute autre adresse git passe par git seul, avec la config de
    /// l'utilisateur. Un clone annulé ou raté ne laisse pas de dossier à moitié rempli.
    pub async fn run(
        &self,
        repo: &str,
        parent: &Path,
        name: &str,
        on_progress: impl Fn(CloneProgress),
    ) -> Result<PathBuf, AppError> {
        let target = target(parent, name)?;
        let target_arg = target.to_string_lossy().into_owned();
        let github = parse_repo(repo);
        let (program, args) = match (&github, parse_git_url(repo)) {
            (Some(repo), _) => {
                let gh = shell_env::find_binary(BINARY).ok_or(AppError::AgentNotFound(BINARY))?;
                let url = format!("https://github.com/{repo}.git");
                (
                    gh,
                    vec![
                        "repo".into(),
                        "clone".into(),
                        url,
                        target_arg,
                        "--".into(),
                        "--progress".into(),
                    ],
                )
            }
            (None, Some(url)) => {
                let git = shell_env::find_binary("git").ok_or(AppError::AgentNotFound("git"))?;
                (
                    git,
                    vec![
                        "clone".into(),
                        "--progress".into(),
                        "--".into(),
                        url,
                        target_arg,
                    ],
                )
            }
            (None, None) => {
                return Err(AppError::InvalidInput(format!(
                    "adresse de dépôt invalide : {repo}"
                )));
            }
        };
        self.cancel();

        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let mut child = command(&program, &args).spawn()?;
        let pid = child.id().unwrap_or_default();
        *lock(&self.running) = Some(pid);

        let mut lines = Vec::new();
        if let Some(mut stderr) = child.stderr.take() {
            let mut buffer = [0u8; 4096];
            let mut pending = String::new();
            let mut last = None;
            while let Ok(read) = stderr.read(&mut buffer).await {
                if read == 0 {
                    break;
                }
                pending.push_str(&String::from_utf8_lossy(&buffer[..read]));
                // git réécrit sa ligne de progression avec \r.
                while let Some(end) = pending.find(['\r', '\n']) {
                    let line = pending[..end].trim().to_owned();
                    pending.drain(..=end);
                    if let Some(progress) = parse_progress(&line) {
                        if last.as_ref() != Some(&progress) {
                            on_progress(progress.clone());
                            last = Some(progress);
                        }
                    } else if !line.is_empty() {
                        lines.push(line);
                    }
                }
            }
        }
        let status = child.wait().await?;
        let cancelled = lock(&self.running).take() != Some(pid);
        if cancelled || !status.success() {
            let _ = std::fs::remove_dir_all(&target);
        }
        if cancelled {
            return Err(AppError::AgentFailed("clone annulé".into()));
        }
        if !status.success() {
            return Err(AppError::AgentFailed(tail(&lines.join("\n"))));
        }
        if github.is_some() {
            use_gh_credentials(&program, &target).await;
        }
        Ok(target)
    }

    pub fn cancel(&self) {
        if let Some(pid) = lock(&self.running).take() {
            process::kill_tree(pid, true);
        }
    }
}

/// Les push et pull de ce dépôt passent par le compte actif de gh, comme le clone : ce que fait
/// `gh auth setup-git`, mais dans la config du dépôt seulement. Sans lui, git demanderait un mot de passe.
async fn use_gh_credentials(gh: &Path, repo: &Path) {
    let Some(git) = shell_env::find_binary("git") else {
        return;
    };
    let key = "credential.https://github.com.helper";
    let helper = format!("!'{}' auth git-credential", gh.display());
    for value in ["", helper.as_str()] {
        let _ = tokio::process::Command::new(&git)
            .arg("-C")
            .arg(repo)
            .args(["config", "--local", "--add", key, value])
            .stdin(std::process::Stdio::null())
            .output()
            .await;
    }
}

/// Dossier à créer : le parent existe, le nom est un simple nom de dossier libre.
fn target(parent: &Path, name: &str) -> Result<PathBuf, AppError> {
    let name = name.trim();
    let valid = !name.is_empty()
        && name != "."
        && name != ".."
        && !name.starts_with('-')
        && !name.contains(['/', '\\', '\0']);
    if !valid {
        return Err(AppError::InvalidInput(format!(
            "nom de dossier invalide : {name}"
        )));
    }
    if !parent.is_absolute() || !parent.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "dossier introuvable : {}",
            parent.display()
        )));
    }
    let target = parent.join(name);
    if target.exists() {
        return Err(AppError::InvalidInput(format!(
            "{} existe déjà",
            target.display()
        )));
    }
    Ok(target)
}

/// `propriétaire/nom` depuis ce qu'on colle : `owner/repo`, l'adresse https du dépôt (ou d'une de ses
/// pages) ou l'adresse ssh. Rien d'autre ne part à gh.
pub fn parse_repo(input: &str) -> Option<String> {
    let input = input.trim();
    let path = input
        .strip_prefix("git@github.com:")
        .or_else(|| input.strip_prefix("ssh://git@github.com/"))
        .or_else(|| {
            input
                .strip_prefix("https://")
                .or_else(|| input.strip_prefix("http://"))
                .unwrap_or(input)
                .strip_prefix("github.com/")
                .or_else(|| input.strip_prefix("www.github.com/"))
        })
        .unwrap_or(input);
    let mut parts = path.trim_end_matches('/').split('/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    let repo = repo.strip_suffix(".git").unwrap_or(repo);
    let segment = |part: &str| {
        !part.is_empty()
            && !part.starts_with(['-', '.'])
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    };
    // Une adresse https peut continuer (`/tree/main`) ; `owner/repo` tapé à la main, non.
    let bare = path == input;
    if !segment(owner) || !segment(repo) || (bare && parts.next().is_some()) {
        return None;
    }
    Some(format!("{owner}/{repo}"))
}

/// Adresse git hors GitHub : https, ssh, git ou la forme `utilisateur@hôte:chemin`. Rien qui ressemble à
/// une option ni d'espace : elle part telle quelle à git, après `--`.
pub fn parse_git_url(input: &str) -> Option<String> {
    let url = input.trim();
    let scheme = ["https://", "http://", "ssh://", "git://"]
        .iter()
        .find_map(|prefix| url.strip_prefix(prefix));
    let valid = match scheme {
        Some(rest) => rest
            .split_once('/')
            .is_some_and(|(host, path)| !host.is_empty() && !path.is_empty()),
        None => url.split_once(':').is_some_and(|(host, path)| {
            host.contains('@') && !host.contains('/') && !path.is_empty()
        }),
    };
    let clean = !url.starts_with('-') && !url.chars().any(|c| c.is_whitespace() || c.is_control());
    (valid && clean).then(|| url.to_owned())
}

/// « Receiving objects:  45% (450/1000) » ; git l'écrit dans la langue du système, le libellé est gardé tel quel.
fn parse_progress(line: &str) -> Option<CloneProgress> {
    let line = line.strip_prefix("remote:").unwrap_or(line).trim();
    let (stage, rest) = line.split_once(':')?;
    let (number, _) = rest.split_once('%')?;
    let percent = number.trim().parse().ok()?;
    Some(CloneProgress {
        stage: stage.trim().to_owned(),
        percent: Some(percent),
    })
}

fn tail(text: &str) -> String {
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let start = lines.len().saturating_sub(TAIL_LINES);
    let joined = lines[start..].join(" ");
    if joined.is_empty() {
        "gh repo clone a échoué".into()
    } else {
        joined
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_repo_from_pasted_text() {
        let expected = Some("jeremy-prt/nuee".to_owned());
        for input in [
            "jeremy-prt/nuee",
            " jeremy-prt/nuee.git ",
            "https://github.com/jeremy-prt/nuee",
            "https://github.com/jeremy-prt/nuee.git",
            "https://github.com/jeremy-prt/nuee/tree/main/src",
            "github.com/jeremy-prt/nuee/",
            "git@github.com:jeremy-prt/nuee.git",
            "ssh://git@github.com/jeremy-prt/nuee",
        ] {
            assert_eq!(parse_repo(input), expected, "{input}");
        }
        for input in [
            "",
            "nuee",
            "-x/nuee",
            "jeremy-prt/nuee/extra",
            "a b/c",
            "../etc",
            "jeremy/;rm",
        ] {
            assert_eq!(parse_repo(input), None, "{input}");
        }
    }

    #[test]
    fn reads_git_urls() {
        for input in [
            "https://gitlab.com/group/sub/project.git",
            "git@codeberg.org:user/repo.git",
            "ssh://git@host.example:2222/repo",
        ] {
            assert_eq!(parse_git_url(input).as_deref(), Some(input), "{input}");
        }
        for input in [
            "",
            "-uhttps://x/y",
            "https://host",
            "https://a b/c",
            "file:///etc",
            "repo",
            "/local/path",
        ] {
            assert_eq!(parse_git_url(input), None, "{input}");
        }
    }

    #[test]
    fn reads_git_progress() {
        assert_eq!(
            parse_progress("Receiving objects:  45% (450/1000), 1.2 MiB | 2 MiB/s"),
            Some(CloneProgress {
                stage: "Receiving objects".into(),
                percent: Some(45)
            })
        );
        assert_eq!(
            parse_progress("remote: Counting objects: 100% (12/12), done."),
            Some(CloneProgress {
                stage: "Counting objects".into(),
                percent: Some(100)
            })
        );
        assert_eq!(
            parse_progress("Résolution des deltas : 81 % (9/11)").map(|p| p.percent),
            Some(Some(81))
        );
        assert_eq!(parse_progress("Cloning into 'nuee'..."), None);
    }

    #[test]
    fn refuses_unsafe_folder_names() {
        let parent = std::env::temp_dir();
        for name in ["", "..", "a/b", "-rf"] {
            assert!(target(&parent, name).is_err(), "{name}");
        }
        assert!(target(Path::new("relative"), "x").is_err());
    }
}
