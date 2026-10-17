use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tokio::process::Command;
use tokio::time::timeout;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::{process, valid_session_id};
use crate::utils::shell_env;

/// `worktree add` peut extraire un gros dépôt et lancer ses hooks de checkout.
const ADD_TIMEOUT: Duration = Duration::from_secs(120);
const GIT_TIMEOUT: Duration = Duration::from_secs(15);

/// Ce qui empêche (ou non) de donner un worktree aux chats d'un projet.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum WorktreeSupport {
    Ready,
    NotRepo,
    /// Dépôt sans commit : pas de HEAD d'où partir.
    NoCommit,
    /// git absent : Nuée ne l'installe pas.
    NoGit,
}

/// Un worktree du dépôt d'un projet, tel que `git worktree list` le décrit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Worktree {
    pub path: String,
    /// `None` : HEAD détaché.
    pub branch: Option<String>,
    /// Le dossier principal du dépôt, toujours en premier.
    pub main: bool,
    pub state: WorktreeState,
    pub locked: bool,
}

/// Branches locales vues depuis le dossier d'une session : l'actuelle (`None` : HEAD détaché), puis les autres de la
/// plus récemment modifiée à la plus ancienne.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BranchList {
    pub current: Option<String>,
    pub branches: Vec<Branch>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Branch {
    pub name: String,
    /// Prise par un autre worktree : git refuse d'y passer.
    pub elsewhere: bool,
}

/// `Blocked` : des modifications non commitées seraient écrasées, git n'a rien changé.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase", tag = "kind")]
#[ts(export)]
pub enum SwitchOutcome {
    Done { branch: String },
    Blocked { files: Vec<String> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum WorktreeState {
    Clean,
    /// Changements non commités, ou état que git n'a pas su lire : rien ne le supprime.
    Changed,
    /// Dossier effacé à la main, encore inscrit dans le dépôt.
    Missing,
}

/// Worktree propre à un chat dans `<données de l'app>/worktrees/<id du chat>`, sur sa branche `nuee/<id court>` ;
/// créé à la main dans `worktrees/<id du projet>/<branche>`, partageable entre chats.
/// La branche reste toujours, et rien ne passe `--force` : un travail non commité n'est jamais perdu.
pub struct WorktreeService {
    dir: PathBuf,
}

impl WorktreeService {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    pub async fn support(&self, project: &Path) -> WorktreeSupport {
        let Some(git) = git_binary() else {
            return WorktreeSupport::NoGit;
        };
        match run(
            &git,
            project,
            &["rev-parse", "--is-inside-work-tree"],
            GIT_TIMEOUT,
        )
        .await
        {
            Ok(out) if out.trim() == "true" => {}
            _ => return WorktreeSupport::NotRepo,
        }
        let head = ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"];
        if run(&git, project, &head, GIT_TIMEOUT).await.is_err() {
            return WorktreeSupport::NoCommit;
        }
        WorktreeSupport::Ready
    }

    pub fn exists(&self, chat_id: &str) -> bool {
        self.path(chat_id)
            .is_ok_and(|dir| dir.join(".git").exists())
    }

    /// Dossier où travaille l'agent du chat : le worktree, créé au premier appel depuis le HEAD du projet.
    /// Un projet rangé dans un sous-dossier du dépôt retrouve ce sous-dossier dans le worktree.
    pub async fn ensure(&self, chat_id: &str, project: &Path) -> Result<PathBuf, AppError> {
        let dir = self.path(chat_id)?;
        let project = std::fs::canonicalize(project).map_err(|_| {
            AppError::InvalidInput(format!("dossier introuvable : {}", project.display()))
        })?;
        let git = require_git()?;
        let prefix = prefix(&git, &project).await?;
        if !dir.join(".git").exists() {
            std::fs::create_dir_all(&self.dir)?;
            // Un worktree effacé à la main reste inscrit tant qu'on ne nettoie pas : `add` le refuserait.
            let _ = run(&git, &project, &["worktree", "prune"], GIT_TIMEOUT).await;
            let branch = branch(chat_id);
            let target = dir.to_string_lossy();
            let local = format!("refs/heads/{branch}");
            let verify = ["rev-parse", "--verify", "--quiet", local.as_str()];
            let known = run(&git, &project, &verify, GIT_TIMEOUT).await.is_ok();
            let (target, branch) = (target.as_ref(), branch.as_str());
            let args: Vec<&str> = if known {
                vec!["worktree", "add", "--", target, branch]
            } else {
                vec![
                    "worktree",
                    "add",
                    "--no-track",
                    "-b",
                    branch,
                    "--",
                    target,
                    "HEAD",
                ]
            };
            run(&git, &project, &args, ADD_TIMEOUT).await?;
        }
        let cwd = dir.join(prefix);
        std::fs::create_dir_all(&cwd)?;
        Ok(cwd)
    }

    pub fn own(&self, chat_id: &str) -> Result<PathBuf, AppError> {
        self.path(chat_id)
    }

    /// Dossier où travaille un chat qui a rejoint un worktree existant du dépôt.
    pub async fn enter(&self, worktree: &Path, project: &Path) -> Result<PathBuf, AppError> {
        let project = std::fs::canonicalize(project).map_err(|_| {
            AppError::InvalidInput(format!("dossier introuvable : {}", project.display()))
        })?;
        let git = require_git()?;
        let tree = registered(&git, &project, worktree).await?;
        if tree.state == WorktreeState::Missing {
            return Err(AppError::Git(format!(
                "le worktree {} est introuvable. Retire-le dans les réglages du projet, le chat repartira dans son dossier",
                tree.path
            )));
        }
        let cwd = Path::new(&tree.path).join(prefix(&git, &project).await?);
        std::fs::create_dir_all(&cwd)?;
        Ok(cwd)
    }

    /// Tous les worktrees du dépôt, le dossier principal en premier, y compris ceux créés hors de Nuée.
    pub async fn list(&self, project: &Path) -> Result<Vec<Worktree>, AppError> {
        let git = require_git()?;
        let mut trees = list(&git, project).await?;
        for tree in &mut trees {
            if tree.state == WorktreeState::Missing {
                continue;
            }
            let status = ["status", "--porcelain", "--untracked-files=normal"];
            tree.state = match run(&git, Path::new(&tree.path), &status, GIT_TIMEOUT).await {
                Ok(changes) if changes.trim().is_empty() => WorktreeState::Clean,
                _ => WorktreeState::Changed,
            };
        }
        Ok(trees)
    }

    pub async fn branches(&self, project: &Path) -> Result<Vec<String>, AppError> {
        let git = require_git()?;
        let refs = ["for-each-ref", "--format=%(refname)", "refs/heads/"];
        let out = run(&git, project, &refs, GIT_TIMEOUT).await?;
        Ok(out
            .lines()
            .filter_map(|line| line.strip_prefix("refs/heads/"))
            .map(str::to_owned)
            .collect())
    }

    /// Branches vues depuis `dir` : le dossier du projet ou l'un de ses worktrees, jamais un autre chemin.
    pub async fn refs(&self, project: &Path, dir: &Path) -> Result<BranchList, AppError> {
        let git = require_git()?;
        let dir = session_dir(&git, project, dir).await?;
        let current = current_branch(&git, &dir).await?;
        let format = "--format=%(refname:short)%09%(worktreepath)";
        let refs = [
            "for-each-ref",
            "--sort=-committerdate",
            format,
            "refs/heads/",
        ];
        let out = run(&git, &dir, &refs, GIT_TIMEOUT).await?;
        let mut branches: Vec<Branch> = out
            .lines()
            .filter_map(|line| {
                let (name, tree) = line.split_once('\t').unwrap_or((line, ""));
                (Some(name) != current.as_deref()).then(|| Branch {
                    name: name.to_owned(),
                    elsewhere: !tree.is_empty(),
                })
            })
            .collect();
        if let Some(name) = &current {
            branches.insert(
                0,
                Branch {
                    name: name.clone(),
                    elsewhere: false,
                },
            );
        }
        Ok(BranchList { current, branches })
    }

    /// Passe `dir` sur `branch`, créée depuis le HEAD actuel si `create`. Les modifications non commitées suivent
    /// quand git le peut ; sinon rien ne bouge et `Blocked` nomme les fichiers en cause.
    pub async fn switch(
        &self,
        project: &Path,
        dir: &Path,
        branch: &str,
        create: bool,
    ) -> Result<SwitchOutcome, AppError> {
        let git = require_git()?;
        let dir = session_dir(&git, project, dir).await?;
        let branch = branch.trim();
        valid_branch(&git, &dir, branch).await?;
        let args: &[&str] = if create {
            &["switch", "--create", branch]
        } else {
            &["switch", branch]
        };
        match run(&git, &dir, args, GIT_TIMEOUT).await {
            Ok(_) => Ok(SwitchOutcome::Done {
                branch: current_branch(&git, &dir)
                    .await?
                    .unwrap_or_else(|| branch.to_owned()),
            }),
            Err(AppError::Git(message)) => {
                let files = blocking_files(&message);
                if files.is_empty() {
                    Err(AppError::Git(message))
                } else {
                    Ok(SwitchOutcome::Blocked { files })
                }
            }
            Err(error) => Err(error),
        }
    }

    /// Worktree dans `worktrees/<id du projet>/<branche nettoyée>`, sur une nouvelle branche partie du HEAD du
    /// projet ou sur une branche locale existante.
    pub async fn create(
        &self,
        project_id: &str,
        project: &Path,
        branch: &str,
        existing: bool,
    ) -> Result<Worktree, AppError> {
        if !valid_session_id(project_id) {
            return Err(AppError::InvalidInput(
                "identifiant de projet invalide".into(),
            ));
        }
        let git = require_git()?;
        let branch = branch.trim();
        valid_branch(&git, project, branch).await?;
        let _ = run(&git, project, &["worktree", "prune"], GIT_TIMEOUT).await;
        if list(&git, project)
            .await?
            .iter()
            .any(|tree| tree.branch.as_deref() == Some(branch))
        {
            return Err(AppError::InvalidInput(format!(
                "la branche {branch} a déjà un worktree"
            )));
        }
        let local = format!("refs/heads/{branch}");
        let verify = ["rev-parse", "--verify", "--quiet", local.as_str()];
        let known = run(&git, project, &verify, GIT_TIMEOUT).await.is_ok();
        if known != existing {
            return Err(AppError::InvalidInput(if existing {
                format!("la branche {branch} n'existe pas")
            } else {
                format!("la branche {branch} existe déjà")
            }));
        }
        let slug: String = branch
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '-'
                }
            })
            .collect();
        let parent = self.dir.join(project_id);
        let target = parent.join(slug);
        if target.exists() {
            return Err(AppError::InvalidInput(format!(
                "le dossier {} existe déjà",
                target.display()
            )));
        }
        std::fs::create_dir_all(&parent)?;
        let shown = target.to_string_lossy();
        let args: Vec<&str> = if existing {
            vec!["worktree", "add", "--", shown.as_ref(), branch]
        } else {
            vec![
                "worktree",
                "add",
                "--no-track",
                "-b",
                branch,
                "--",
                shown.as_ref(),
                "HEAD",
            ]
        };
        if let Err(error) = run(&git, project, &args, ADD_TIMEOUT).await {
            let _ = std::fs::remove_dir(&parent);
            return Err(error);
        }
        registered(&git, project, &target).await
    }

    /// Retire un worktree propre (ou effacé à la main) ; sa branche reste. Refusé s'il a des changements.
    pub async fn remove(&self, project: &Path, worktree: &Path) -> Result<(), AppError> {
        let git = require_git()?;
        let tree = registered(&git, project, worktree).await?;
        if tree.main {
            return Err(AppError::InvalidInput(
                "le dossier principal du dépôt ne se supprime pas".into(),
            ));
        }
        if tree.locked {
            return Err(AppError::Git("ce worktree est verrouillé dans git".into()));
        }
        // Sans branche, ses commits ne seraient plus retenus par rien.
        if tree.branch.is_none() {
            return Err(AppError::Git("ce worktree n'est sur aucune branche".into()));
        }
        if tree.state == WorktreeState::Missing {
            // `prune` ne retire que les worktrees dont le dossier a disparu.
            run(&git, project, &["worktree", "prune"], GIT_TIMEOUT).await?;
        } else {
            let status = ["status", "--porcelain", "--untracked-files=normal"];
            match run(&git, Path::new(&tree.path), &status, GIT_TIMEOUT).await {
                Ok(changes) if changes.trim().is_empty() => {}
                _ => {
                    return Err(AppError::Git(
                        "ce worktree a des changements non commités".into(),
                    ));
                }
            }
            let args = ["worktree", "remove", "--", tree.path.as_str()];
            run(&git, project, &args, GIT_TIMEOUT).await?;
        }
        if let Some(parent) = Path::new(&tree.path).parent()
            && parent.starts_with(&self.dir)
            && parent != self.dir
        {
            let _ = std::fs::remove_dir(parent);
        }
        Ok(())
    }

    /// Retire le worktree d'un chat supprimé s'il n'a aucun changement non commité. Sinon il reste, et son
    /// chemin est renvoyé pour le dire.
    pub async fn discard(&self, chat_id: &str) -> Option<String> {
        let dir = self.path(chat_id).ok()?;
        if !dir.exists() {
            return None;
        }
        // Création interrompue avant que git n'y écrive : un dossier vide, rien à garder.
        if !dir.join(".git").exists() {
            let _ = std::fs::remove_dir(&dir);
            return None;
        }
        let shown = dir.to_string_lossy().into_owned();
        let Some(git) = git_binary() else {
            return Some(shown);
        };
        let status = ["status", "--porcelain", "--untracked-files=normal"];
        match run(&git, &dir, &status, GIT_TIMEOUT).await {
            Ok(changes) if changes.trim().is_empty() => {}
            _ => return Some(shown),
        }
        run(
            &git,
            &dir,
            &["worktree", "remove", "--", shown.as_str()],
            GIT_TIMEOUT,
        )
        .await
        .err()
        .map(|_| shown)
    }

    fn path(&self, chat_id: &str) -> Result<PathBuf, AppError> {
        // L'id devient un nom de dossier et de branche : rien qui permette d'en sortir.
        if !valid_session_id(chat_id) {
            return Err(AppError::InvalidInput(
                "identifiant de chat invalide".into(),
            ));
        }
        Ok(self.dir.join(chat_id))
    }
}

/// `check-ref-format --branch` développe `@{-1}` : un nom qui commence par `@` ou `-` n'en est pas un.
async fn valid_branch(git: &Path, dir: &Path, branch: &str) -> Result<(), AppError> {
    if branch.is_empty() || branch.starts_with('-') || branch.starts_with('@') {
        return Err(AppError::InvalidInput("nom de branche invalide".into()));
    }
    run(
        git,
        dir,
        &["check-ref-format", "--branch", branch],
        GIT_TIMEOUT,
    )
    .await
    .map(|_| ())
    .map_err(|_| AppError::InvalidInput(format!("« {branch} » n'est pas un nom de branche valide")))
}

/// Le dossier du projet tel quel, sinon un worktree enregistré du dépôt.
async fn session_dir(git: &Path, project: &Path, dir: &Path) -> Result<PathBuf, AppError> {
    if canonical(dir) == canonical(project) {
        return Ok(PathBuf::from(canonical(project)));
    }
    Ok(PathBuf::from(registered(git, project, dir).await?.path))
}

async fn current_branch(git: &Path, dir: &Path) -> Result<Option<String>, AppError> {
    let out = run(git, dir, &["branch", "--show-current"], GIT_TIMEOUT).await?;
    let name = out.trim();
    Ok((!name.is_empty()).then(|| name.to_owned()))
}

/// Fichiers que git refuse d'écraser, cités un par ligne en retrait. Le reste du message est traduit selon la
/// langue du système : seules ces lignes se lisent partout.
fn blocking_files(message: &str) -> Vec<String> {
    message
        .lines()
        .filter(|line| line.starts_with('\t'))
        .map(|line| line.trim().to_owned())
        .collect()
}

fn require_git() -> Result<PathBuf, AppError> {
    git_binary().ok_or_else(|| AppError::Git("git est introuvable sur cet ordinateur".into()))
}

/// Sous-dossier du dépôt où se trouve le projet : un worktree le retrouve à la même place.
async fn prefix(git: &Path, project: &Path) -> Result<PathBuf, AppError> {
    let prefix = run(git, project, &["rev-parse", "--show-prefix"], GIT_TIMEOUT).await?;
    let prefix = PathBuf::from(prefix.trim());
    if !prefix
        .components()
        .all(|part| matches!(part, Component::Normal(_)))
    {
        return Err(AppError::Git("emplacement du dépôt inattendu".into()));
    }
    Ok(prefix)
}

/// État laissé à `Clean` pour un dossier présent : `WorktreeService::list` lance `status` ensuite.
async fn list(git: &Path, project: &Path) -> Result<Vec<Worktree>, AppError> {
    let out = run(
        git,
        project,
        &["worktree", "list", "--porcelain", "-z"],
        GIT_TIMEOUT,
    )
    .await?;
    Ok(parse(&out))
}

fn parse(out: &str) -> Vec<Worktree> {
    let mut trees: Vec<Worktree> = Vec::new();
    let mut current: Option<Worktree> = None;
    for field in out.split('\0') {
        if let Some(path) = field.strip_prefix("worktree ") {
            let path = Path::new(path);
            current = Some(Worktree {
                path: canonical(path),
                branch: None,
                main: trees.is_empty(),
                state: if path.is_dir() {
                    WorktreeState::Clean
                } else {
                    WorktreeState::Missing
                },
                locked: false,
            });
        } else if let Some(tree) = current.as_mut() {
            if let Some(branch) = field.strip_prefix("branch refs/heads/") {
                tree.branch = Some(branch.to_owned());
            } else if field == "locked" || field.starts_with("locked ") {
                tree.locked = true;
            } else if field.is_empty() {
                trees.extend(current.take());
            }
        }
    }
    trees.extend(current);
    trees
}

/// Chemin comparable d'un appel à l'autre : git, le front et la base ne l'écrivent pas toujours pareil.
/// Un dossier pas encore créé prend le chemin canonique de son parent.
pub fn canonical(path: &Path) -> String {
    std::fs::canonicalize(path)
        .ok()
        .or_else(|| {
            Some(
                std::fs::canonicalize(path.parent()?)
                    .ok()?
                    .join(path.file_name()?),
            )
        })
        .unwrap_or_else(|| path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

/// Le worktree du dépôt à cet emplacement : un chemin reçu du front n'est jamais pris tel quel.
async fn registered(git: &Path, project: &Path, worktree: &Path) -> Result<Worktree, AppError> {
    let wanted = canonical(worktree);
    list(git, project)
        .await?
        .into_iter()
        .find(|tree| tree.path == wanted)
        .ok_or_else(|| {
            AppError::InvalidInput(format!("{wanted} n'est pas un worktree de ce dépôt"))
        })
}

/// Même règle que `worktreeBranch` côté front.
fn branch(chat_id: &str) -> String {
    let short: String = chat_id.chars().take(8).collect();
    format!("nuee/{short}")
}

/// Sur macOS, `/usr/bin/git` n'est qu'un relais vers les outils de développement : sans eux, il ouvre une
/// fenêtre d'installation au lieu de répondre.
pub(crate) fn git_binary() -> Option<PathBuf> {
    let git = shell_env::find_binary("git")?;
    #[cfg(target_os = "macos")]
    if git == Path::new("/usr/bin/git") {
        let tools = std::process::Command::new("/usr/bin/xcode-select")
            .arg("-p")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if !tools.is_ok_and(|status| status.success()) {
            return None;
        }
    }
    Some(git)
}

/// Sortie standard si git réussit ; sinon sa sortie d'erreur, qui dit pourquoi.
pub(crate) async fn run(
    git: &Path,
    dir: &Path,
    args: &[&str],
    limit: Duration,
) -> Result<String, AppError> {
    let mut command = Command::new(git);
    // Un `core.fsmonitor` dans la config du dépôt lancerait sa commande à chaque `status`.
    command
        .arg("-C")
        .arg(dir)
        .args(["-c", "core.fsmonitor=false"])
        .args(args)
        .env("PATH", shell_env::search_path())
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    #[cfg(windows)]
    command.creation_flags(process::CREATE_NO_WINDOW);
    let child = command.spawn()?;
    let pid = child.id();
    let Ok(output) = timeout(limit, child.wait_with_output()).await else {
        if let Some(pid) = pid {
            process::kill_tree(pid, true);
        }
        return Err(AppError::Git(format!(
            "git {} trop long",
            args.first().unwrap_or(&"")
        )));
    };
    let output = output?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    Err(AppError::Git(if stderr.is_empty() {
        format!("git {} a échoué", args.first().unwrap_or(&""))
    } else {
        stderr
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::async_runtime::block_on;

    fn sandbox(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "nuee-worktree-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |time| time.as_nanos())
        ));
        std::fs::create_dir_all(&dir).expect("dossier de test");
        std::fs::canonicalize(dir).expect("chemin")
    }

    fn git(dir: &Path, args: &[&str]) -> String {
        let output = std::process::Command::new(git_binary().expect("git"))
            .arg("-C")
            .arg(dir)
            .args(["-c", "user.name=Nuée", "-c", "user.email=nuee@example.com"])
            .args(args)
            .output()
            .expect("git");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    fn repo(root: &Path) -> PathBuf {
        let repo = root.join("repo");
        std::fs::create_dir_all(repo.join("app")).expect("dépôt");
        git(&repo, &["init", "-q"]);
        std::fs::write(repo.join("app/main.txt"), "salut").expect("fichier");
        git(&repo, &["add", "."]);
        git(&repo, &["commit", "-qm", "départ"]);
        repo
    }

    #[test]
    fn switching_branch_lists_creates_and_reports_blocking_changes() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("switch");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        let main = git(&repo, &["branch", "--show-current"]).trim().to_owned();
        git(&repo, &["branch", "autre"]);
        git(
            &repo,
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                "prise",
                root.join("ailleurs").to_str().expect("chemin"),
            ],
        );

        let refs = block_on(service.refs(&repo, &repo)).expect("branches");
        assert_eq!(refs.current.as_deref(), Some(main.as_str()));
        assert_eq!(refs.branches[0].name, main);
        let taken = refs
            .branches
            .iter()
            .find(|branch| branch.name == "prise")
            .expect("prise");
        assert!(taken.elsewhere);

        let created = block_on(service.switch(&repo, &repo, "nouvelle", true)).expect("créée");
        assert!(matches!(created, SwitchOutcome::Done { ref branch } if branch == "nouvelle"));

        // Un fichier modifié ici et différent sur `autre` bloque le passage : rien ne bouge.
        std::fs::write(repo.join("app/main.txt"), "local").expect("modif");
        git(&repo, &["stash", "-q"]);
        git(&repo, &["switch", "-q", "autre"]);
        std::fs::write(repo.join("app/main.txt"), "sur autre").expect("autre");
        git(&repo, &["commit", "-qam", "autre"]);
        git(&repo, &["switch", "-q", "nouvelle"]);
        git(&repo, &["stash", "pop", "-q"]);
        let blocked = block_on(service.switch(&repo, &repo, "autre", false)).expect("bloqué");
        assert!(
            matches!(blocked, SwitchOutcome::Blocked { ref files } if files == &["app/main.txt"])
        );
        assert_eq!(git(&repo, &["branch", "--show-current"]).trim(), "nouvelle");

        assert!(block_on(service.refs(&repo, &root.join("ailleurs-faux"))).is_err());
        assert!(block_on(service.switch(&repo, &repo, "-x", true)).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn support_follows_the_folder() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("support");
        let service = WorktreeService::new(root.join("worktrees"));
        let plain = root.join("plain");
        std::fs::create_dir_all(&plain).expect("dossier");
        assert_eq!(block_on(service.support(&plain)), WorktreeSupport::NotRepo);
        git(&plain, &["init", "-q"]);
        assert_eq!(block_on(service.support(&plain)), WorktreeSupport::NoCommit);
        assert_eq!(
            block_on(service.support(&repo(&root))),
            WorktreeSupport::Ready
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_clean_worktree_goes_a_changed_one_stays() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("lifecycle");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        let clean = "c1a2b3c4-0000-4000-8000-000000000001";
        let changed = "d1a2b3c4-0000-4000-8000-000000000002";

        let cwd = block_on(service.ensure(clean, &repo.join("app"))).expect("créé");
        assert_eq!(cwd, root.join("worktrees").join(clean).join("app"));
        assert_eq!(
            std::fs::read_to_string(cwd.join("main.txt")).expect("copie"),
            "salut"
        );
        assert!(git(&repo, &["worktree", "list"]).contains(clean));
        // Un second appel reprend le même worktree.
        assert_eq!(
            block_on(service.ensure(clean, &repo.join("app"))).expect("repris"),
            cwd
        );

        let other = block_on(service.ensure(changed, &repo)).expect("créé");
        std::fs::write(other.join("app/main.txt"), "modifié").expect("modif");
        assert_eq!(
            std::fs::read_to_string(repo.join("app/main.txt")).expect("projet"),
            "salut"
        );

        assert_eq!(block_on(service.discard(clean)), None);
        assert!(!root.join("worktrees").join(clean).exists());
        assert!(block_on(service.discard(changed)).is_some());
        assert!(root.join("worktrees").join(changed).exists());
        let branches = git(&repo, &["branch", "--list", "nuee/*"]);
        assert!(branches.contains("nuee/c1a2b3c4") && branches.contains("nuee/d1a2b3c4"));
        assert_eq!(block_on(service.discard("ghost-chat")), None);
        assert!(block_on(service.ensure("../evil", &repo)).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_worktree_deleted_by_hand_comes_back_on_its_branch() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("again");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        let chat = "e1a2b3c4-0000-4000-8000-000000000003";
        let cwd = block_on(service.ensure(chat, &repo)).expect("créé");
        std::fs::write(cwd.join("note.txt"), "commitée").expect("fichier");
        git(&cwd, &["add", "."]);
        git(&cwd, &["commit", "-qm", "travail"]);
        std::fs::remove_dir_all(&cwd).expect("effacé");

        let again = block_on(service.ensure(chat, &repo)).expect("recréé");
        assert_eq!(
            std::fs::read_to_string(again.join("note.txt")).expect("branche"),
            "commitée"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn worktrees_of_a_project_from_new_and_existing_branches() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("project");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        let project = "a1a2b3c4-0000-4000-8000-00000000000a";
        git(&repo, &["branch", "existante"]);

        let fresh = block_on(service.create(project, &repo.join("app"), "feat/carte", false))
            .expect("nouvelle branche");
        assert_eq!(fresh.branch.as_deref(), Some("feat/carte"));
        assert_eq!(
            fresh.path,
            canonical(&root.join("worktrees").join(project).join("feat-carte"))
        );
        let reused =
            block_on(service.create(project, &repo, "existante", true)).expect("branche existante");
        assert_eq!(reused.branch.as_deref(), Some("existante"));

        assert!(block_on(service.create(project, &repo, "feat/carte", false)).is_err());
        assert!(block_on(service.create(project, &repo, "absente", true)).is_err());
        assert!(block_on(service.create(project, &repo, "--force", false)).is_err());
        assert!(block_on(service.create(project, &repo, "a..b", false)).is_err());
        assert!(block_on(service.create("../evil", &repo, "x", false)).is_err());

        let list = block_on(service.list(&repo.join("app"))).expect("liste");
        assert_eq!(list.len(), 3);
        assert!(list[0].main && list[0].path == canonical(&repo));
        assert!(list.iter().all(|tree| tree.state == WorktreeState::Clean));
        let branches = block_on(service.branches(&repo)).expect("branches");
        assert!(
            branches.contains(&"existante".to_owned())
                && branches.contains(&"feat/carte".to_owned())
        );

        let cwd =
            block_on(service.enter(Path::new(&fresh.path), &repo.join("app"))).expect("rejoint");
        assert_eq!(cwd, Path::new(&fresh.path).join("app"));
        assert!(block_on(service.enter(&root, &repo)).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_changed_worktree_is_kept_a_missing_one_is_pruned() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("remove");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        let project = "b1a2b3c4-0000-4000-8000-00000000000b";
        let changed = block_on(service.create(project, &repo, "modifiee", false)).expect("créé");
        let gone = block_on(service.create(project, &repo, "effacee", false)).expect("créé");
        let clean = block_on(service.create(project, &repo, "propre", false)).expect("créé");
        std::fs::write(
            Path::new(&changed.path).join("brouillon.txt"),
            "pas commité",
        )
        .expect("modif");
        std::fs::remove_dir_all(&gone.path).expect("effacé");

        let list = block_on(service.list(&repo)).expect("liste");
        let state = |path: &str| {
            list.iter()
                .find(|tree| tree.path == path)
                .map(|tree| tree.state)
        };
        assert_eq!(state(&changed.path), Some(WorktreeState::Changed));
        assert_eq!(state(&gone.path), Some(WorktreeState::Missing));
        assert!(block_on(service.enter(Path::new(&gone.path), &repo)).is_err());

        assert!(block_on(service.remove(&repo, Path::new(&changed.path))).is_err());
        assert!(Path::new(&changed.path).join("brouillon.txt").exists());
        assert!(block_on(service.remove(&repo, &repo)).is_err());
        block_on(service.remove(&repo, Path::new(&gone.path))).expect("nettoyé");
        block_on(service.remove(&repo, Path::new(&clean.path))).expect("retiré");
        assert!(!Path::new(&clean.path).exists());

        let left: Vec<_> = block_on(service.list(&repo))
            .expect("liste")
            .into_iter()
            .map(|tree| tree.path)
            .collect();
        assert_eq!(left, vec![canonical(&repo), changed.path.clone()]);
        let branches = git(&repo, &["branch", "--list"]);
        assert!(branches.contains("propre") && branches.contains("effacee"));
        let _ = std::fs::remove_dir_all(root);
    }
}
