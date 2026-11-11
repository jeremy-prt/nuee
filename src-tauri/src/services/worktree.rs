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

/// `worktree add` peut extraire un gros dépôt et lancer ses hooks de checkout ; un commit, ses hooks ; un push, le
/// réseau.
const ADD_TIMEOUT: Duration = Duration::from_secs(120);
const GIT_TIMEOUT: Duration = Duration::from_secs(15);
const LOG_PAGE: u32 = 50;

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

/// Changements non commités d'un dossier, fichiers non suivis compris.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeChanges {
    pub added: u32,
    pub removed: u32,
    pub files: u32,
}

/// Ce que git dit du dossier d'une session après un commit ou un push, pour l'annoncer sans reprendre le texte de
/// l'agent. `origin` : adresse du dépôt distant `origin` sans protocole ni identifiants (`github.com/moi/projet`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HeadInfo {
    pub subject: Option<String>,
    pub branch: Option<String>,
    pub origin: Option<String>,
}

/// État d'un fichier par rapport au dernier commit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ChangeStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
}

/// Un fichier non commité, chemin relatif à la racine du dépôt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChangedFile {
    pub path: String,
    /// Ancien chemin d'un fichier renommé.
    pub old_path: Option<String>,
    pub status: ChangeStatus,
    pub added: u32,
    pub removed: u32,
    pub binary: bool,
}

/// Fichiers non commités du dépôt, triés par chemin ; `root` : la racine du dépôt, d'où partent les chemins.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChangedFiles {
    pub root: String,
    pub files: Vec<ChangedFile>,
}

/// Diff unifié d'un fichier, à partir du premier `@@` ; vide pour un binaire ou un simple changement de droits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FileDiff {
    pub patch: String,
    /// Au-delà de `MAX_DIFF` : rien n'est envoyé.
    pub too_large: bool,
}

/// Un commit de la branche courante.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommitEntry {
    pub sha: String,
    pub short: String,
    pub subject: String,
    pub author: String,
    /// Secondes depuis 1970.
    #[ts(type = "number")]
    pub date: i64,
    /// Branches et étiquettes posées sur lui, celle de HEAD en premier (`main`, `origin/main`, `tag: v1`).
    pub refs: Vec<String>,
}

/// Une page du journal, du plus récent au plus ancien. `next` : où reprendre, `None` à la fin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommitPage {
    pub commits: Vec<CommitEntry>,
    pub next: Option<u32>,
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

    /// Dossier où travaille l'agent du chat : le worktree, créé au premier appel depuis la branche locale `base`,
    /// ou le HEAD du projet. Un projet rangé dans un sous-dossier du dépôt retrouve ce sous-dossier dans le worktree.
    pub async fn ensure(
        &self,
        chat_id: &str,
        project: &Path,
        base: Option<&str>,
    ) -> Result<PathBuf, AppError> {
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
            let start = match base {
                Some(base) if !known => {
                    valid_branch(&git, &project, base).await?;
                    let start = format!("refs/heads/{base}");
                    let verify = ["rev-parse", "--verify", "--quiet", start.as_str()];
                    if run(&git, &project, &verify, GIT_TIMEOUT).await.is_err() {
                        return Err(AppError::InvalidInput(format!(
                            "la branche {base} n'existe pas"
                        )));
                    }
                    start
                }
                _ => "HEAD".to_owned(),
            };
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
                    start.as_str(),
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

    /// Passe le dossier du projet sur une branche existante, avant le premier message d'une session. git refuse
    /// seul si des modifications non commitées seraient écrasées ou si la branche est prise par un worktree.
    pub async fn checkout(&self, project: &Path, branch: &str) -> Result<(), AppError> {
        let git = require_git()?;
        let branch = branch.trim();
        valid_branch(&git, project, branch).await?;
        let reference = format!("refs/heads/{branch}");
        let verify = ["rev-parse", "--verify", "--quiet", reference.as_str()];
        if run(&git, project, &verify, GIT_TIMEOUT).await.is_err() {
            return Err(AppError::InvalidInput(format!(
                "la branche {branch} n'existe pas"
            )));
        }
        run(&git, project, &["switch", branch], GIT_TIMEOUT)
            .await
            .map(|_| ())
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

    /// Lignes ajoutées et retirées depuis le dernier commit dans `dir` (le dossier du projet ou l'un de ses
    /// worktrees). Hors git : rien.
    pub async fn changes(&self, project: &Path, dir: &Path) -> Result<WorktreeChanges, AppError> {
        let files = self.changed_files(project, dir).await?;
        let mut changes = WorktreeChanges::default();
        for file in files.iter().flat_map(|files| &files.files) {
            changes.files += 1;
            changes.added += file.added;
            changes.removed += file.removed;
        }
        Ok(changes)
    }

    /// Fichiers non commités de `dir`, non suivis compris. `None` hors git.
    pub async fn changed_files(
        &self,
        project: &Path,
        dir: &Path,
    ) -> Result<Option<ChangedFiles>, AppError> {
        let Some(git) = git_binary() else {
            return Ok(None);
        };
        let inside = ["rev-parse", "--is-inside-work-tree"];
        if !run(&git, project, &inside, GIT_TIMEOUT)
            .await
            .is_ok_and(|out| out.trim() == "true")
        {
            return Ok(None);
        }
        let (top, base) = repo_base(&git, project, dir).await?;
        let files = collect(&git, &top, &base).await?;
        Ok(Some(ChangedFiles {
            root: top.to_string_lossy().into_owned(),
            files,
        }))
    }

    /// Diff d'un seul fichier de la liste des changements : jamais un autre chemin.
    pub async fn file_diff(
        &self,
        project: &Path,
        dir: &Path,
        file: &str,
    ) -> Result<FileDiff, AppError> {
        let git = require_git()?;
        let (top, base) = repo_base(&git, project, dir).await?;
        let entry = change_of(&git, &top, &base, file).await?;
        let path = Path::new(file);
        if entry.binary {
            return Ok(FileDiff {
                patch: String::new(),
                too_large: false,
            });
        }
        if entry.status == ChangeStatus::Untracked {
            return Ok(untracked_diff(&top.join(path)));
        }
        patch_of(&git, &top, &[base], &entry).await
    }

    /// Des commits de la branche de `dir` manquent au dépôt distant : sur leur branche suivie, ou sur aucune branche
    /// distante si elle n'en suit pas. Faux sans dépôt distant ou HEAD détaché.
    pub async fn unpushed(&self, project: &Path, dir: &Path) -> Result<bool, AppError> {
        let Some(git) = git_binary() else {
            return Ok(false);
        };
        let Ok(dir) = session_dir(&git, project, dir).await else {
            return Ok(false);
        };
        let on_branch = run(&git, &dir, &["symbolic-ref", "-q", "HEAD"], GIT_TIMEOUT).await;
        let remotes = run(&git, &dir, &["remote"], GIT_TIMEOUT).await;
        if on_branch.is_err() || remotes.is_ok_and(|out| out.trim().is_empty()) {
            return Ok(false);
        }
        let upstream = ["rev-parse", "--verify", "--quiet", "@{upstream}"];
        let range: &[&str] = if run(&git, &dir, &upstream, GIT_TIMEOUT).await.is_ok() {
            &["rev-list", "--count", "@{upstream}..HEAD"]
        } else {
            &["rev-list", "--count", "HEAD", "--not", "--remotes"]
        };
        Ok(run(&git, &dir, range, GIT_TIMEOUT)
            .await
            .is_ok_and(|out| out.trim().parse::<u32>().is_ok_and(|count| count > 0)))
    }

    /// Titre du dernier commit, branche et dépôt distant de `dir`. Chaque champ reste vide si git ne le donne pas
    /// (dépôt sans commit, HEAD détaché, pas d'`origin`).
    pub async fn head(&self, project: &Path, dir: &Path) -> Result<HeadInfo, AppError> {
        let git = require_git()?;
        let dir = session_dir(&git, project, dir).await?;
        let subject = run(&git, &dir, &["log", "-1", "--format=%s"], GIT_TIMEOUT)
            .await
            .ok()
            .map(|out| out.trim().to_owned())
            .filter(|subject| !subject.is_empty());
        let branch = current_branch(&git, &dir).await.ok().flatten();
        let origin = run(&git, &dir, &["remote", "get-url", "origin"], GIT_TIMEOUT)
            .await
            .ok()
            .and_then(|url| remote_address(url.trim()));
        Ok(HeadInfo {
            subject,
            branch,
            origin,
        })
    }

    /// Remet un seul fichier de la liste des changements dans l'état du dernier commit : un fichier ajouté ou non
    /// suivi disparaît, un renommage reprend son ancien nom.
    pub async fn revert_file(
        &self,
        project: &Path,
        dir: &Path,
        file: &str,
    ) -> Result<(), AppError> {
        let git = require_git()?;
        let (top, base) = repo_base(&git, project, dir).await?;
        let entry = change_of(&git, &top, &base, file).await?;
        revert_entry(&git, &top, &entry).await
    }

    /// Tous les fichiers de la liste des changements reviennent au dernier commit, un par un comme `revert_file`.
    pub async fn revert_all(&self, project: &Path, dir: &Path) -> Result<(), AppError> {
        let git = require_git()?;
        let (top, base) = repo_base(&git, project, dir).await?;
        for entry in collect(&git, &top, &base).await? {
            revert_entry(&git, &top, &entry).await?;
        }
        Ok(())
    }

    /// Commite tous les changements de la liste, non suivis compris, avec ce message. git le reçoit en argument :
    /// rien n'est interprété.
    pub async fn commit(
        &self,
        project: &Path,
        dir: &Path,
        message: &str,
    ) -> Result<HeadInfo, AppError> {
        let message = message.trim();
        if message.is_empty() {
            return Err(AppError::InvalidInput(
                "le message du commit est vide".into(),
            ));
        }
        let git = require_git()?;
        let (top, base) = repo_base(&git, project, dir).await?;
        if collect(&git, &top, &base).await?.is_empty() {
            return Err(AppError::InvalidInput("rien à commiter".into()));
        }
        run(&git, &top, &["add", "--all"], ADD_TIMEOUT).await?;
        let message = format!("--message={message}");
        run(&git, &top, &["commit", "--quiet", &message], ADD_TIMEOUT).await?;
        self.head(project, dir).await
    }

    /// Pousse la branche courante, jamais en force. Sans branche suivie, la pousse sur `origin` (ou le seul dépôt
    /// distant) et la fait suivre.
    pub async fn push(&self, project: &Path, dir: &Path) -> Result<HeadInfo, AppError> {
        let git = require_git()?;
        let cwd = session_dir(&git, project, dir).await?;
        let Some(branch) = current_branch(&git, &cwd).await? else {
            return Err(AppError::Git(
                "HEAD détaché : aucune branche à pousser".into(),
            ));
        };
        let upstream = ["rev-parse", "--verify", "--quiet", "@{upstream}"];
        if run(&git, &cwd, &upstream, GIT_TIMEOUT).await.is_ok() {
            run(&git, &cwd, &["push", "--quiet"], ADD_TIMEOUT).await?;
            return self.head(project, dir).await;
        }
        let remotes = run(&git, &cwd, &["remote"], GIT_TIMEOUT).await?;
        let remotes: Vec<&str> = remotes
            .lines()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .collect();
        let remote = match remotes.as_slice() {
            [] => {
                return Err(AppError::Git(
                    "aucun dépôt distant : la branche ne peut pas être poussée".into(),
                ));
            }
            [only] => *only,
            _ if remotes.contains(&"origin") => "origin",
            _ => {
                return Err(AppError::Git(format!(
                    "la branche {branch} ne suit aucune branche distante et le dépôt en a plusieurs"
                )));
            }
        };
        if remote.starts_with('-') {
            return Err(AppError::Git(format!("dépôt distant inattendu : {remote}")));
        }
        let args = ["push", "--quiet", "--set-upstream", remote, "HEAD"];
        run(&git, &cwd, &args, ADD_TIMEOUT).await?;
        self.head(project, dir).await
    }

    /// Commits de la branche courante, `LOG_PAGE` à partir de `skip`. `query` : seuls ceux dont le titre la contient.
    /// Dépôt sans commit : une page vide.
    pub async fn log(
        &self,
        project: &Path,
        dir: &Path,
        skip: u32,
        query: Option<&str>,
    ) -> Result<CommitPage, AppError> {
        let git = require_git()?;
        let cwd = session_dir(&git, project, dir).await?;
        let head = ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"];
        if run(&git, &cwd, &head, GIT_TIMEOUT).await.is_err() {
            return Ok(CommitPage {
                commits: Vec::new(),
                next: None,
            });
        }
        let query = query.map(str::trim).filter(|query| !query.is_empty());
        let mut args = vec![
            "log".to_owned(),
            "--no-show-signature".to_owned(),
            "--format=%H%x1f%h%x1f%s%x1f%an%x1f%at%x1f%D%x1e".to_owned(),
            format!("--skip={skip}"),
            format!("--max-count={}", LOG_PAGE + 1),
        ];
        if let Some(query) = query {
            args.extend([
                "--fixed-strings".to_owned(),
                "--regexp-ignore-case".to_owned(),
                format!("--grep={query}"),
            ]);
        }
        args.extend(["HEAD".to_owned(), "--".to_owned()]);
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let out = run(&git, &cwd, &args, GIT_TIMEOUT).await?;
        let mut commits: Vec<CommitEntry> = out
            .split('\x1e')
            .filter_map(|record| parse_commit(record.trim_start_matches('\n')))
            .collect();
        let more = commits.len() > LOG_PAGE as usize;
        commits.truncate(LOG_PAGE as usize);
        // `--grep` lit tout le message : la recherche ne vaut que pour le titre.
        if let Some(query) = query {
            let query = query.to_lowercase();
            commits.retain(|commit| commit.subject.to_lowercase().contains(&query));
        }
        Ok(CommitPage {
            commits,
            next: more.then_some(skip + LOG_PAGE),
        })
    }

    /// Fichiers changés par un commit, comparé à son premier parent (à l'arbre vide pour le premier commit).
    pub async fn commit_files(
        &self,
        project: &Path,
        dir: &Path,
        sha: &str,
    ) -> Result<Vec<ChangedFile>, AppError> {
        let git = require_git()?;
        let (top, _) = repo_base(&git, project, dir).await?;
        let (from, to) = commit_range(&git, &top, sha).await?;
        let mut files = tracked(&git, &top, &[from.as_str(), to.as_str()]).await?;
        files.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(files)
    }

    /// Diff d'un fichier de ce commit : jamais un autre chemin.
    pub async fn commit_diff(
        &self,
        project: &Path,
        dir: &Path,
        sha: &str,
        file: &str,
    ) -> Result<FileDiff, AppError> {
        valid_relative(file)?;
        let git = require_git()?;
        let (top, _) = repo_base(&git, project, dir).await?;
        let (from, to) = commit_range(&git, &top, sha).await?;
        let entry = tracked(&git, &top, &[from.as_str(), to.as_str()])
            .await?
            .into_iter()
            .find(|entry| entry.path == file)
            .ok_or_else(|| {
                AppError::InvalidInput(format!("{file} ne fait pas partie de ce commit"))
            })?;
        if entry.binary {
            return Ok(FileDiff {
                patch: String::new(),
                too_large: false,
            });
        }
        patch_of(&git, &top, &[from, to], &entry).await
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

/// Au-delà, un fichier non suivi compte pour un fichier sans ligne : un gros fichier généré ne se lit pas en entier.
const MAX_COUNTED: u64 = 1024 * 1024;

/// Au-delà, le diff d'un fichier n'est pas envoyé : la webview ramerait à l'afficher.
const MAX_DIFF: usize = 512 * 1024;

/// Contenu d'un fichier régulier d'au plus `max` octets ; `None` pour un lien, un dossier ou un fichier plus gros.
fn small_file(path: &Path, max: u64) -> Option<Vec<u8>> {
    let meta = std::fs::symlink_metadata(path).ok()?;
    if !meta.is_file() || meta.len() > max {
        return None;
    }
    std::fs::read(path).ok()
}

/// Lignes comptées comme git le ferait.
fn lines_of(bytes: &[u8]) -> u32 {
    let breaks = bytes.iter().filter(|&&byte| byte == b'\n').count();
    let last = usize::from(bytes.last().is_some_and(|&byte| byte != b'\n'));
    u32::try_from(breaks + last).unwrap_or(u32::MAX)
}

/// Un fichier non suivi tout en lignes ajoutées, comme `git diff --no-index /dev/null`.
fn untracked_diff(path: &Path) -> FileDiff {
    let too_large = std::fs::symlink_metadata(path).is_ok_and(|meta| meta.len() > MAX_DIFF as u64);
    let text = small_file(path, MAX_DIFF as u64)
        .filter(|bytes| !bytes.contains(&0))
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .unwrap_or_default();
    if text.is_empty() {
        return FileDiff {
            patch: String::new(),
            too_large,
        };
    }
    let lines: Vec<&str> = text.lines().collect();
    let patch = std::iter::once(format!("@@ -0,0 +1,{} @@", lines.len()))
        .chain(lines.iter().map(|line| format!("+{line}")))
        .collect::<Vec<_>>()
        .join("\n");
    FileDiff { patch, too_large }
}

/// Le diff sans ses en-têtes (`diff --git`, `---`, `+++`, que le rendu prendrait pour des lignes) ni les
/// « \\ No newline at end of file ».
fn hunks(out: &str) -> String {
    let Some(start) = out
        .find("\n@@ ")
        .map(|at| at + 1)
        .or_else(|| out.starts_with("@@ ").then_some(0))
    else {
        return String::new();
    };
    out[start..]
        .lines()
        .filter(|line| !line.starts_with('\\'))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Diff unifié d'un fichier entre `range` (une référence et la copie de travail, ou deux commits), renommage compris.
async fn patch_of(
    git: &Path,
    top: &Path,
    range: &[String],
    entry: &ChangedFile,
) -> Result<FileDiff, AppError> {
    let mut args = vec![
        "diff".to_owned(),
        "--no-ext-diff".to_owned(),
        "--no-color".to_owned(),
        "-M".to_owned(),
    ];
    args.extend(range.iter().cloned());
    args.push("--".to_owned());
    args.extend(entry.old_path.iter().map(|old| format!(":(literal){old}")));
    args.push(format!(":(literal){}", entry.path));
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = run(git, top, &args, GIT_TIMEOUT).await?;
    if out.len() > MAX_DIFF {
        return Ok(FileDiff {
            patch: String::new(),
            too_large: true,
        });
    }
    Ok(FileDiff {
        patch: hunks(&out),
        too_large: false,
    })
}

fn valid_relative(file: &str) -> Result<(), AppError> {
    if file.is_empty()
        || !Path::new(file)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
    {
        return Err(AppError::InvalidInput("chemin de fichier invalide".into()));
    }
    Ok(())
}

/// Le commit `sha` (identifiant hexadécimal, jamais une autre expression) et son premier parent, ou l'arbre vide.
async fn commit_range(git: &Path, top: &Path, sha: &str) -> Result<(String, String), AppError> {
    if !(4..=64).contains(&sha.len()) || !sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError::InvalidInput(
            "identifiant de commit invalide".into(),
        ));
    }
    let target = format!("{sha}^{{commit}}");
    let to = run(
        git,
        top,
        &["rev-parse", "--verify", "--quiet", &target],
        GIT_TIMEOUT,
    )
    .await
    .map_err(|_| AppError::InvalidInput(format!("commit {sha} introuvable")))?
    .trim()
    .to_owned();
    let parent = format!("{to}^1");
    let from = match run(
        git,
        top,
        &["rev-parse", "--verify", "--quiet", &parent],
        GIT_TIMEOUT,
    )
    .await
    {
        Ok(out) => out.trim().to_owned(),
        Err(_) => run(
            git,
            top,
            &["hash-object", "-t", "tree", "--stdin"],
            GIT_TIMEOUT,
        )
        .await?
        .trim()
        .to_owned(),
    };
    Ok((from, to))
}

/// Un enregistrement de `log` : champs séparés par 0x1f, refs de `%D`.
fn parse_commit(record: &str) -> Option<CommitEntry> {
    let mut fields = record.split('\x1f');
    let (sha, short, subject, author, date, refs) = (
        fields.next()?,
        fields.next()?,
        fields.next()?,
        fields.next()?,
        fields.next()?,
        fields.next().unwrap_or_default(),
    );
    if sha.is_empty() {
        return None;
    }
    let refs = refs
        .trim()
        .split(", ")
        .filter_map(|name| match name.strip_prefix("HEAD -> ") {
            Some(branch) => Some(branch),
            None => (!name.is_empty() && name != "HEAD").then_some(name),
        })
        .map(str::to_owned)
        .collect();
    Some(CommitEntry {
        sha: sha.to_owned(),
        short: short.to_owned(),
        subject: subject.to_owned(),
        author: author.to_owned(),
        date: date.trim().parse().unwrap_or(0),
        refs,
    })
}

/// Remet une entrée de la liste des changements dans l'état de HEAD.
async fn revert_entry(git: &Path, top: &Path, entry: &ChangedFile) -> Result<(), AppError> {
    let literal = format!(":(literal){}", entry.path);
    match entry.status {
        ChangeStatus::Untracked => {
            let target = top.join(&entry.path);
            // Un dossier parent remplacé par un lien mènerait hors du dépôt.
            let parent = target.parent().map(std::fs::canonicalize).transpose()?;
            let root = std::fs::canonicalize(top)?;
            if !parent.is_some_and(|parent| parent.starts_with(&root)) {
                return Err(AppError::InvalidInput(format!(
                    "{} est hors du dépôt",
                    entry.path
                )));
            }
            std::fs::remove_file(&target)?;
        }
        ChangeStatus::Added => {
            run(git, top, &["rm", "-qf", "--", &literal], GIT_TIMEOUT).await?;
        }
        ChangeStatus::Modified | ChangeStatus::Deleted => {
            restore(git, top, &literal).await?;
        }
        ChangeStatus::Renamed => {
            run(git, top, &["rm", "-qf", "--", &literal], GIT_TIMEOUT).await?;
            if let Some(old) = &entry.old_path {
                restore(git, top, &format!(":(literal){old}")).await?;
            }
        }
    }
    Ok(())
}

/// Le fichier `file` s'il fait partie des changements : jamais un autre chemin.
async fn change_of(
    git: &Path,
    top: &Path,
    base: &str,
    file: &str,
) -> Result<ChangedFile, AppError> {
    valid_relative(file)?;
    collect(git, top, base)
        .await?
        .into_iter()
        .find(|entry| entry.path == file)
        .ok_or_else(|| {
            AppError::InvalidInput(format!("{file} ne fait pas partie des modifications"))
        })
}

/// Index et copie de travail repris de HEAD pour ce chemin.
async fn restore(git: &Path, top: &Path, literal: &str) -> Result<(), AppError> {
    let args = [
        "restore",
        "--source=HEAD",
        "--staged",
        "--worktree",
        "--",
        literal,
    ];
    run(git, top, &args, GIT_TIMEOUT).await.map(|_| ())
}

/// Racine du dépôt vue depuis `dir` et la référence à laquelle comparer : HEAD, ou l'arbre vide d'un dépôt sans
/// commit (son empreinte dépend du format du dépôt).
async fn repo_base(git: &Path, project: &Path, dir: &Path) -> Result<(PathBuf, String), AppError> {
    let dir = session_dir(git, project, dir).await?;
    // Tout le dépôt, même pour un projet rangé dans un sous-dossier : c'est ce que le commit emportera.
    let top = run(git, &dir, &["rev-parse", "--show-toplevel"], GIT_TIMEOUT).await?;
    let top = PathBuf::from(top.trim_end_matches(['\n', '\r']));
    let head = ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"];
    let base = match run(git, &top, &head, GIT_TIMEOUT).await {
        Ok(_) => "HEAD".to_owned(),
        Err(_) => run(
            git,
            &top,
            &["hash-object", "-t", "tree", "--stdin"],
            GIT_TIMEOUT,
        )
        .await?
        .trim()
        .to_owned(),
    };
    Ok((top, base))
}

/// Fichiers suivis qui diffèrent de `base` (renommages repérés), puis fichiers non suivis.
async fn collect(git: &Path, top: &Path, base: &str) -> Result<Vec<ChangedFile>, AppError> {
    let mut files = tracked(git, top, &[base]).await?;
    let others = ["ls-files", "--others", "--exclude-standard", "-z"];
    for path in run(git, top, &others, GIT_TIMEOUT)
        .await?
        .split('\0')
        .filter(|path| !path.is_empty())
    {
        let bytes = small_file(&top.join(path), MAX_COUNTED);
        let binary = bytes.as_ref().is_some_and(|bytes| bytes.contains(&0));
        files.push(ChangedFile {
            path: path.to_owned(),
            old_path: None,
            status: ChangeStatus::Untracked,
            added: bytes
                .filter(|_| !binary)
                .map_or(0, |bytes| lines_of(&bytes)),
            removed: 0,
            binary,
        });
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

/// Fichiers suivis qui diffèrent entre `range` : une référence et la copie de travail, ou deux commits.
async fn tracked(git: &Path, top: &Path, range: &[&str]) -> Result<Vec<ChangedFile>, AppError> {
    let mut names = vec!["diff", "--name-status", "-M", "-z"];
    names.extend_from_slice(range);
    let mut files = Vec::new();
    let out = run(git, top, &names, GIT_TIMEOUT).await?;
    let mut fields = out.split('\0');
    while let Some(code) = fields.next().filter(|code| !code.is_empty()) {
        let (status, old_path) = match code.as_bytes()[0] {
            b'A' => (ChangeStatus::Added, None),
            b'D' => (ChangeStatus::Deleted, None),
            b'R' => (ChangeStatus::Renamed, fields.next().map(str::to_owned)),
            // Une copie (`C`) cite aussi sa source.
            b'C' => {
                fields.next();
                (ChangeStatus::Added, None)
            }
            _ => (ChangeStatus::Modified, None),
        };
        let Some(path) = fields.next() else { break };
        files.push(ChangedFile {
            path: path.to_owned(),
            old_path,
            status,
            added: 0,
            removed: 0,
            binary: false,
        });
    }

    // Avec -z, un renommage s'écrit `ajoutées\tretirées\t\0ancien\0nouveau\0`.
    let mut numstat = vec!["diff", "--numstat", "-M", "-z"];
    numstat.extend_from_slice(range);
    let out = run(git, top, &numstat, GIT_TIMEOUT).await?;
    let mut fields = out.split('\0');
    while let Some(entry) = fields.next().filter(|entry| !entry.is_empty()) {
        let mut parts = entry.splitn(3, '\t');
        let (Some(added), Some(removed), Some(path)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        let path = if path.is_empty() {
            fields.next();
            fields.next().unwrap_or_default()
        } else {
            path
        };
        if let Some(file) = files.iter_mut().find(|file| file.path == path) {
            file.binary = added == "-";
            file.added = added.parse().unwrap_or(0);
            file.removed = removed.parse().unwrap_or(0);
        }
    }
    Ok(files)
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

/// `https://jeton@github.com/moi/projet.git` ou `git@github.com:moi/projet.git` → `github.com/moi/projet`. Un jeton
/// glissé dans l'adresse ne doit jamais atteindre l'interface. Un chemin local reste tel quel.
fn remote_address(url: &str) -> Option<String> {
    let rest = match url.split_once("://") {
        Some((_, rest)) => rest.to_owned(),
        None => match url.split_once(':') {
            // Une lettre seule est un lecteur Windows (`C:\dépôt`), pas un hôte.
            Some((host, path))
                if host.len() > 1 && !host.contains(['/', '\\']) && !path.starts_with('/') =>
            {
                format!("{host}/{path}")
            }
            _ => url.to_owned(),
        },
    };
    let (host, path) = rest.split_once('/').unwrap_or((rest.as_str(), ""));
    let host = host.rsplit_once('@').map_or(host, |(_, host)| host);
    let address = format!("{host}/{path}");
    let address = address.trim_end_matches('/').trim_end_matches(".git");
    (!address.is_empty()).then(|| address.to_owned())
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

    /// Le service lance git sans `-c user.*` : l'identité vient de la config du dépôt.
    fn identity(repo: &Path) {
        git(repo, &["config", "user.name", "Nuée"]);
        git(repo, &["config", "user.email", "nuee@example.com"]);
        git(repo, &["config", "commit.gpgsign", "false"]);
    }

    #[test]
    fn direct_commit_takes_everything_and_keeps_the_message_as_is() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("commit");
        let repo = repo(&root);
        identity(&repo);
        let service = WorktreeService::new(root.join("worktrees"));
        let commit = |message: &str| block_on(service.commit(&repo, &repo, message));

        assert!(
            matches!(commit("titre"), Err(AppError::InvalidInput(_))),
            "rien à commiter"
        );
        std::fs::write(repo.join("app/main.txt"), "modifié").expect("modif");
        std::fs::write(repo.join("app/neuf.txt"), "non suivi").expect("non suivi");
        assert!(matches!(commit("  \n "), Err(AppError::InvalidInput(_))));
        assert_eq!(git(&repo, &["rev-list", "--count", "HEAD"]).trim(), "1");

        let message =
            "Titre \"cité\" et 'apostrophe' $HOME `id`\n\n--amend ; corps\nsur deux lignes";
        let head = commit(message).expect("commit");
        assert_eq!(
            head.subject.as_deref(),
            Some("Titre \"cité\" et 'apostrophe' $HOME `id`")
        );
        assert_eq!(
            git(&repo, &["log", "-1", "--format=%B"]).trim_end(),
            message
        );
        assert_eq!(git(&repo, &["rev-list", "--count", "HEAD"]).trim(), "2");
        let left = block_on(service.changed_files(&repo, &repo))
            .expect("liste")
            .expect("dépôt");
        assert!(left.files.is_empty());
        assert!(git(&repo, &["ls-files"]).contains("app/neuf.txt"));

        std::fs::write(repo.join("app/main.txt"), "encore").expect("modif");
        assert!(block_on(service.commit(&repo, &root, "ailleurs")).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn revert_all_puts_back_every_file() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("revert-all");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        std::fs::write(repo.join("app/main.txt"), "modifié").expect("modif");
        std::fs::write(repo.join("app/neuf.txt"), "non suivi").expect("non suivi");
        block_on(service.revert_all(&repo, &repo)).expect("annulé");
        assert_eq!(
            std::fs::read_to_string(repo.join("app/main.txt")).expect("fichier"),
            "salut"
        );
        assert!(!repo.join("app/neuf.txt").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn push_sets_the_upstream_or_says_there_is_no_remote() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("push");
        let repo = repo(&root);
        identity(&repo);
        let service = WorktreeService::new(root.join("worktrees"));
        let push = || block_on(service.push(&repo, &repo));
        assert!(
            matches!(push(), Err(AppError::Git(_))),
            "sans dépôt distant"
        );

        let remote = root.join("remote.git");
        git(&root, &["init", "-q", "--bare", "remote.git"]);
        git(
            &repo,
            &["remote", "add", "origin", &remote.to_string_lossy()],
        );
        let head = push().expect("premier push");
        let branch = head.branch.expect("branche");
        assert_eq!(
            git(&repo, &["rev-parse", "--abbrev-ref", "@{upstream}"]).trim(),
            format!("origin/{branch}")
        );
        assert!(!block_on(service.unpushed(&repo, &repo)).expect("état"));

        std::fs::write(repo.join("app/main.txt"), "suite").expect("modif");
        block_on(service.commit(&repo, &repo, "suite")).expect("commit");
        assert!(block_on(service.unpushed(&repo, &repo)).expect("état"));
        push().expect("push suivi");
        assert!(!block_on(service.unpushed(&repo, &repo)).expect("état"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn log_pages_through_the_branch_and_searches_titles() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("log");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        for index in 1..=120 {
            git(
                &repo,
                &[
                    "commit",
                    "-q",
                    "--allow-empty",
                    "-m",
                    &format!("Étape {index}"),
                ],
            );
        }
        git(
            &repo,
            &[
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "Autre",
                "-m",
                "parle de l'étape 11",
            ],
        );
        let branch = git(&repo, &["branch", "--show-current"]).trim().to_owned();
        let log = |skip: u32, query: Option<&str>| {
            block_on(service.log(&repo, &repo, skip, query)).expect("journal")
        };

        let first = log(0, None);
        assert_eq!(first.commits.len(), 50);
        assert_eq!(first.next, Some(50));
        assert_eq!(first.commits[0].subject, "Autre");
        assert_eq!(first.commits[0].refs, [branch]);
        assert_eq!(first.commits[0].author, "Nuée");
        assert!(
            first.commits[0].date > 0 && first.commits[0].sha.starts_with(&first.commits[0].short)
        );
        assert!(first.commits[1].refs.is_empty());
        let last = log(100, None);
        assert_eq!(last.commits.len(), 22);
        assert_eq!(last.next, None);
        assert_eq!(
            last.commits.last().map(|commit| commit.subject.as_str()),
            Some("départ")
        );

        let found: Vec<_> = log(0, Some(" ÉTAPE 11 "))
            .commits
            .into_iter()
            .map(|commit| commit.subject)
            .collect();
        assert_eq!(found.len(), 11, "{found:?}");
        assert!(found.iter().all(|subject| subject.starts_with("Étape 11")));
        assert!(log(0, Some("--all")).commits.is_empty());

        let empty = root.join("vide");
        std::fs::create_dir_all(&empty).expect("dossier");
        git(&empty, &["init", "-q"]);
        let page = block_on(service.log(&empty, &empty, 0, None)).expect("dépôt vide");
        assert!(page.commits.is_empty() && page.next.is_none());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_commit_lists_its_files_and_their_diffs() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("commit-files");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        let first = git(&repo, &["rev-parse", "HEAD"]).trim().to_owned();
        std::fs::write(repo.join("app/old.txt"), "garde\n").expect("fichier");
        std::fs::write(repo.join("app/gone.txt"), "a\nb\n").expect("fichier");
        git(&repo, &["add", "."]);
        git(&repo, &["commit", "-qm", "plus"]);
        std::fs::write(repo.join("app/main.txt"), "bonjour\n").expect("modif");
        std::fs::write(repo.join("app/neuf.txt"), "x\ny\nz\n").expect("ajout");
        std::fs::remove_file(repo.join("app/gone.txt")).expect("suppression");
        git(&repo, &["mv", "app/old.txt", "app/new.txt"]);
        git(&repo, &["add", "--all"]);
        git(&repo, &["commit", "-qm", "changements"]);
        let sha = git(&repo, &["rev-parse", "HEAD"]).trim().to_owned();

        let files = block_on(service.commit_files(&repo, &repo, &sha[..10])).expect("fichiers");
        let summary: Vec<_> = files
            .iter()
            .map(|file| (file.path.as_str(), file.status, file.added, file.removed))
            .collect();
        assert_eq!(
            summary,
            [
                ("app/gone.txt", ChangeStatus::Deleted, 0, 2),
                ("app/main.txt", ChangeStatus::Modified, 1, 1),
                ("app/neuf.txt", ChangeStatus::Added, 3, 0),
                ("app/new.txt", ChangeStatus::Renamed, 0, 0),
            ]
        );
        let diff = block_on(service.commit_diff(&repo, &repo, &sha, "app/main.txt")).expect("diff");
        assert_eq!(diff.patch, "@@ -1 +1 @@\n-salut\n+bonjour");

        let root_files =
            block_on(service.commit_files(&repo, &repo, &first)).expect("premier commit");
        assert_eq!(root_files.len(), 1);
        assert_eq!(
            (root_files[0].path.as_str(), root_files[0].status),
            ("app/main.txt", ChangeStatus::Added)
        );
        let diff =
            block_on(service.commit_diff(&repo, &repo, &first, "app/main.txt")).expect("diff");
        assert_eq!(diff.patch, "@@ -0,0 +1 @@\n+salut");

        for sha in ["HEAD", "HEAD~1", "--all", "zz12", "abc", ""] {
            assert!(
                block_on(service.commit_files(&repo, &repo, sha)).is_err(),
                "{sha}"
            );
        }
        assert!(block_on(service.commit_files(&repo, &repo, "abcdef12")).is_err());
        for file in ["app/old.txt", "../secret.txt", "/etc/hosts", ""] {
            assert!(
                block_on(service.commit_diff(&repo, &repo, &sha, file)).is_err(),
                "{file}"
            );
        }
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn checkout_switches_the_project_folder_and_keeps_local_changes_safe() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("checkout");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        git(&repo, &["branch", "autre"]);

        block_on(service.checkout(&repo, "autre")).expect("bascule");
        assert_eq!(git(&repo, &["branch", "--show-current"]).trim(), "autre");

        assert!(block_on(service.checkout(&repo, "absente")).is_err());
        assert!(block_on(service.checkout(&repo, "-x")).is_err());

        let main = git(&repo, &["rev-parse", "--abbrev-ref", "@{-1}"])
            .trim()
            .to_owned();
        std::fs::write(repo.join("app/main.txt"), "sur autre").expect("modif");
        git(&repo, &["commit", "-qam", "autre"]);
        std::fs::write(repo.join("app/main.txt"), "en cours").expect("modif locale");
        assert!(block_on(service.checkout(&repo, &main)).is_err());
        assert_eq!(git(&repo, &["branch", "--show-current"]).trim(), "autre");
    }

    #[test]
    fn changes_count_tracked_and_untracked_lines() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("changes");
        let service = WorktreeService::new(root.join("worktrees"));
        let plain = root.join("plain");
        std::fs::create_dir_all(&plain).expect("dossier");
        assert_eq!(
            block_on(service.changes(&plain, &plain)).expect("hors git"),
            WorktreeChanges::default()
        );

        let fresh = root.join("fresh");
        std::fs::create_dir_all(&fresh).expect("dépôt vide");
        git(&fresh, &["init", "-q"]);
        std::fs::write(fresh.join("a.txt"), "un\ndeux").expect("fichier");
        git(&fresh, &["add", "."]);
        std::fs::write(fresh.join("b.txt"), "un\n").expect("non suivi");
        let changes = block_on(service.changes(&fresh, &fresh)).expect("sans commit");
        assert_eq!((changes.added, changes.removed, changes.files), (3, 0, 2));

        let repo = repo(&root);
        assert_eq!(
            block_on(service.changes(&repo, &repo)).expect("propre"),
            WorktreeChanges::default()
        );
        std::fs::write(repo.join("app/main.txt"), "bonjour\nà tous\n").expect("modif");
        std::fs::write(repo.join("app/neuf.txt"), "a\nb\nc\n").expect("non suivi");
        std::fs::write(repo.join("app/image.bin"), [0u8, 1, 2]).expect("binaire");
        let changes = block_on(service.changes(&repo, &repo.join("app/.."))).expect("modifié");
        assert_eq!((changes.added, changes.removed, changes.files), (5, 1, 3));

        assert!(block_on(service.changes(&repo, &root)).is_err());
    }

    #[test]
    fn changed_files_list_each_file_and_give_its_diff() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("files");
        let service = WorktreeService::new(root.join("worktrees"));
        let plain = root.join("plain");
        std::fs::create_dir_all(&plain).expect("dossier");
        assert_eq!(
            block_on(service.changed_files(&plain, &plain)).expect("hors git"),
            None
        );

        let repo = repo(&root);
        std::fs::write(repo.join("app/old.txt"), "garde\n").expect("fichier");
        std::fs::write(repo.join("app/gone.txt"), "a\nb\n").expect("fichier");
        git(&repo, &["add", "."]);
        git(&repo, &["commit", "-qm", "plus"]);
        let clean = block_on(service.changed_files(&repo, &repo))
            .expect("propre")
            .expect("dépôt");
        assert!(clean.files.is_empty());

        std::fs::write(repo.join("app/main.txt"), "bonjour\n").expect("modif");
        std::fs::write(repo.join("app/neuf.txt"), "a\nb\n").expect("non suivi");
        std::fs::remove_file(repo.join("app/gone.txt")).expect("suppression");
        git(&repo, &["mv", "app/old.txt", "app/new.txt"]);
        let listed = block_on(service.changed_files(&repo, &repo))
            .expect("modifié")
            .expect("dépôt");
        assert_eq!(listed.root, canonical(&repo));
        let summary: Vec<_> = listed
            .files
            .iter()
            .map(|file| (file.path.as_str(), file.status, file.added, file.removed))
            .collect();
        assert_eq!(
            summary,
            [
                ("app/gone.txt", ChangeStatus::Deleted, 0, 2),
                ("app/main.txt", ChangeStatus::Modified, 1, 1),
                ("app/neuf.txt", ChangeStatus::Untracked, 2, 0),
                ("app/new.txt", ChangeStatus::Renamed, 0, 0),
            ]
        );
        assert_eq!(listed.files[3].old_path.as_deref(), Some("app/old.txt"));

        let diff = block_on(service.file_diff(&repo, &repo, "app/main.txt")).expect("diff");
        assert_eq!(diff.patch, "@@ -1 +1 @@\n-salut\n+bonjour");
        let diff = block_on(service.file_diff(&repo, &repo, "app/neuf.txt")).expect("non suivi");
        assert_eq!(diff.patch, "@@ -0,0 +1,2 @@\n+a\n+b");
        let diff = block_on(service.file_diff(&repo, &repo, "app/gone.txt")).expect("supprimé");
        assert_eq!(diff.patch, "@@ -1,2 +0,0 @@\n-a\n-b");

        std::fs::write(root.join("secret.txt"), "non").expect("hors dépôt");
        for path in [
            "../secret.txt",
            "app/../app/main.txt",
            "/etc/hosts",
            "app/old.txt",
            "",
        ] {
            assert!(
                block_on(service.file_diff(&repo, &repo, path)).is_err(),
                "{path}"
            );
        }
        assert!(block_on(service.file_diff(&repo, &root, "app/main.txt")).is_err());
    }

    #[test]
    fn revert_file_puts_back_only_that_file() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("revert");
        let service = WorktreeService::new(root.join("worktrees"));
        let repo = root.join("repo");
        std::fs::create_dir_all(repo.join("app")).expect("dépôt");
        git(&repo, &["init", "-q", "-b", "main"]);
        for name in ["main.txt", "gone.txt", "old.txt", "other.txt"] {
            std::fs::write(repo.join("app").join(name), name).expect("fichier");
        }
        git(&repo, &["add", "."]);
        git(&repo, &["commit", "-qm", "départ"]);

        std::fs::write(repo.join("app/main.txt"), "modifié").expect("modif");
        git(&repo, &["add", "app/main.txt"]);
        std::fs::write(repo.join("app/main.txt"), "encore").expect("modif");
        std::fs::remove_file(repo.join("app/gone.txt")).expect("suppression");
        std::fs::write(repo.join("app/added.txt"), "ajouté").expect("ajout");
        git(&repo, &["add", "app/added.txt"]);
        std::fs::write(repo.join("app/neuf.txt"), "non suivi").expect("non suivi");
        git(&repo, &["mv", "app/old.txt", "app/new.txt"]);
        std::fs::write(repo.join("app/other.txt"), "garde").expect("modif");

        let revert = |file: &str| block_on(service.revert_file(&repo, &repo, file));
        std::fs::write(root.join("secret.txt"), "non").expect("hors dépôt");
        for path in [
            "../secret.txt",
            "app/../app/main.txt",
            "/etc/hosts",
            "",
            "app/absent.txt",
        ] {
            assert!(revert(path).is_err(), "{path}");
        }
        assert!(root.join("secret.txt").exists());
        assert!(block_on(service.revert_file(&repo, &root, "app/main.txt")).is_err());

        for file in [
            "app/main.txt",
            "app/gone.txt",
            "app/added.txt",
            "app/neuf.txt",
            "app/new.txt",
        ] {
            revert(file).expect(file);
        }
        let read = |name: &str| std::fs::read_to_string(repo.join("app").join(name)).ok();
        assert_eq!(read("main.txt").as_deref(), Some("main.txt"));
        assert_eq!(read("gone.txt").as_deref(), Some("gone.txt"));
        assert_eq!(read("old.txt").as_deref(), Some("old.txt"));
        assert_eq!(read("added.txt"), None);
        assert_eq!(read("neuf.txt"), None);
        assert_eq!(read("new.txt"), None);
        let left: Vec<_> = block_on(service.changed_files(&repo, &repo))
            .expect("liste")
            .expect("dépôt")
            .files
            .into_iter()
            .map(|file| file.path)
            .collect();
        assert_eq!(left, ["app/other.txt"]);
    }

    #[test]
    fn unpushed_follows_the_remote() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("unpushed");
        let service = WorktreeService::new(root.join("worktrees"));
        let repo = repo(&root);
        let unpushed = || block_on(service.unpushed(&repo, &repo)).expect("état");
        assert!(!unpushed(), "sans dépôt distant");

        let remote = root.join("remote.git");
        git(&root, &["init", "-q", "--bare", "-b", "main", "remote.git"]);
        git(
            &repo,
            &["remote", "add", "origin", &remote.to_string_lossy()],
        );
        git(&repo, &["push", "-q", "-u", "origin", "HEAD"]);
        assert!(!unpushed());

        std::fs::write(repo.join("app/main.txt"), "suite").expect("modif");
        git(&repo, &["commit", "-qam", "suite"]);
        assert!(unpushed());
        git(&repo, &["push", "-q"]);
        assert!(!unpushed());

        git(&repo, &["switch", "-qc", "neuve"]);
        assert!(!unpushed(), "branche neuve sans commit à elle");
        std::fs::write(repo.join("app/main.txt"), "neuve").expect("modif");
        git(&repo, &["commit", "-qam", "neuve"]);
        assert!(unpushed(), "branche sans suivi");
    }

    #[test]
    fn head_gives_the_last_commit_the_branch_and_a_clean_origin() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("head");
        let service = WorktreeService::new(root.join("worktrees"));
        let repo = repo(&root);
        git(&repo, &["switch", "-qc", "ma-branche"]);
        let head = block_on(service.head(&repo, &repo)).expect("état");
        assert_eq!(head.subject.as_deref(), Some("départ"));
        assert_eq!(head.branch.as_deref(), Some("ma-branche"));
        assert_eq!(head.origin, None);

        git(
            &repo,
            &[
                "remote",
                "add",
                "origin",
                "https://jeton:secret@github.com/moi/projet.git",
            ],
        );
        std::fs::write(repo.join("app/main.txt"), "suite").expect("modif");
        git(&repo, &["commit", "-qam", "Ajout de la suite"]);
        let head = block_on(service.head(&repo, &repo)).expect("état");
        assert_eq!(head.subject.as_deref(), Some("Ajout de la suite"));
        assert_eq!(head.origin.as_deref(), Some("github.com/moi/projet"));

        assert!(block_on(service.head(&repo, &root.join("ailleurs"))).is_err());
    }

    #[test]
    fn remote_addresses_lose_protocol_and_credentials() {
        assert_eq!(
            remote_address("git@github.com:moi/projet.git").as_deref(),
            Some("github.com/moi/projet")
        );
        assert_eq!(
            remote_address("ssh://git@gitlab.com/groupe/projet").as_deref(),
            Some("gitlab.com/groupe/projet")
        );
        assert_eq!(
            remote_address("https://x-access-token:abc@github.com/moi/projet/").as_deref(),
            Some("github.com/moi/projet")
        );
        assert_eq!(remote_address("").as_deref(), None);
    }

    #[test]
    fn refs_list_the_current_branch_first_and_flag_taken_ones() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("refs");
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
        assert!(
            refs.branches
                .iter()
                .any(|branch| branch.name == "autre" && !branch.elsewhere)
        );
        assert!(block_on(service.refs(&repo, &root.join("ailleurs-faux"))).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_new_worktree_starts_from_the_chosen_branch() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("base");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        git(&repo, &["switch", "-q", "-c", "feat/base"]);
        std::fs::write(repo.join("app/main.txt"), "sur la base").expect("fichier");
        git(&repo, &["commit", "-qam", "base"]);
        git(&repo, &["switch", "-q", "-"]);

        let chat = "f1a2b3c4-0000-4000-8000-000000000004";
        let cwd = block_on(service.ensure(chat, &repo, Some("feat/base"))).expect("créé");
        assert_eq!(
            std::fs::read_to_string(cwd.join("app/main.txt")).expect("copie"),
            "sur la base"
        );
        assert_eq!(
            git(&cwd, &["branch", "--show-current"]).trim(),
            "nuee/f1a2b3c4"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn an_unknown_base_is_refused() {
        if git_binary().is_none() {
            return;
        }
        let root = sandbox("nobase");
        let repo = repo(&root);
        let service = WorktreeService::new(root.join("worktrees"));
        let chat = "a2a2b3c4-0000-4000-8000-000000000005";
        let error = block_on(service.ensure(chat, &repo, Some("absente"))).expect_err("refusé");
        assert!(matches!(error, AppError::InvalidInput(_)));
        assert!(block_on(service.ensure(chat, &repo, Some("-x"))).is_err());
        assert!(block_on(service.ensure(chat, &repo, Some("@{-1}"))).is_err());
        assert!(!root.join("worktrees").join(chat).join(".git").exists());
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

        let cwd = block_on(service.ensure(clean, &repo.join("app"), None)).expect("créé");
        assert_eq!(cwd, root.join("worktrees").join(clean).join("app"));
        assert_eq!(
            std::fs::read_to_string(cwd.join("main.txt")).expect("copie"),
            "salut"
        );
        assert!(git(&repo, &["worktree", "list"]).contains(clean));
        // Un second appel reprend le même worktree.
        assert_eq!(
            block_on(service.ensure(clean, &repo.join("app"), None)).expect("repris"),
            cwd
        );

        let other = block_on(service.ensure(changed, &repo, None)).expect("créé");
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
        assert!(block_on(service.ensure("../evil", &repo, None)).is_err());
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
        let cwd = block_on(service.ensure(chat, &repo, None)).expect("créé");
        std::fs::write(cwd.join("note.txt"), "commitée").expect("fichier");
        git(&cwd, &["add", "."]);
        git(&cwd, &["commit", "-qm", "travail"]);
        std::fs::remove_dir_all(&cwd).expect("effacé");

        let again = block_on(service.ensure(chat, &repo, None)).expect("recréé");
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
