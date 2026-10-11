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

/// Worktrees des chats, dans `<données de l'app>/worktrees/<id du chat>`, chacun sur sa branche `nuee/<id court>`.
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
        let git = git_binary()
            .ok_or_else(|| AppError::Git("git est introuvable sur cet ordinateur".into()))?;
        let prefix = run(&git, &project, &["rev-parse", "--show-prefix"], GIT_TIMEOUT).await?;
        let prefix = PathBuf::from(prefix.trim());
        if !prefix
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
        {
            return Err(AppError::Git("emplacement du dépôt inattendu".into()));
        }
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

/// Même règle que `worktreeBranch` côté front.
fn branch(chat_id: &str) -> String {
    let short: String = chat_id.chars().take(8).collect();
    format!("nuee/{short}")
}

/// Sur macOS, `/usr/bin/git` n'est qu'un relais vers les outils de développement : sans eux, il ouvre une
/// fenêtre d'installation au lieu de répondre.
fn git_binary() -> Option<PathBuf> {
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
async fn run(git: &Path, dir: &Path, args: &[&str], limit: Duration) -> Result<String, AppError> {
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
}
