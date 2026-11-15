use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::process::Command;
use tokio::time::timeout;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::release::is_newer;
use crate::utils::shell_env;

const FETCH_TIMEOUT: Duration = Duration::from_secs(10);
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);
// Homebrew se met à jour lui-même avant d'installer : plusieurs minutes sur une connexion lente.
const UPDATE_TIMEOUT: Duration = Duration::from_secs(600);

/// Outils de travail suivis à côté des agents. Comme pour `InstallTool`, le front n'envoie que cet identifiant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum DevTool {
    Gh,
    Node,
    Pnpm,
}

impl DevTool {
    const ALL: [Self; 3] = [Self::Gh, Self::Node, Self::Pnpm];

    fn binary(self) -> &'static str {
        match self {
            Self::Gh => "gh",
            Self::Node => "node",
            Self::Pnpm => "pnpm",
        }
    }

    fn release_page(self, version: &str) -> String {
        match self {
            Self::Gh => format!("https://github.com/cli/cli/releases/tag/v{version}"),
            Self::Node => format!("https://nodejs.org/en/blog/release/v{version}"),
            Self::Pnpm => format!("https://github.com/pnpm/pnpm/releases/tag/v{version}"),
        }
    }
}

/// Une version plus récente d'un outil installé.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ToolUpdate {
    pub tool: DevTool,
    pub version: String,
    pub latest: String,
    /// Gestionnaire qui a installé l'outil (« Homebrew », « nvm »), quand on le reconnaît.
    pub manager: Option<String>,
    /// Faux : Nuée ne la fait pas elle-même, la page de la version s'ouvre.
    pub updatable: bool,
}

/// Comment l'outil a été installé, d'après le chemin réel de son binaire.
#[derive(Debug, Clone, PartialEq)]
enum Method {
    Brew {
        brew: PathBuf,
        formula: String,
    },
    /// Script officiel de pnpm, dans `PNPM_HOME`.
    PnpmStandalone,
    /// `npm i -g pnpm`, dans un préfixe que l'utilisateur peut écrire.
    NpmGlobal {
        npm: PathBuf,
    },
    /// Gestionnaire reconnu mais que Nuée ne pilote pas (nvm, Corepack, mise…).
    Other(&'static str),
    Unknown,
}

impl Method {
    fn label(&self) -> Option<String> {
        match self {
            Self::Brew { .. } => Some("Homebrew".into()),
            Self::PnpmStandalone => Some("pnpm".into()),
            Self::NpmGlobal { .. } => Some("npm".into()),
            Self::Other(name) => Some((*name).into()),
            Self::Unknown => None,
        }
    }
}

struct Plan {
    program: PathBuf,
    method: Method,
    latest: String,
}

/// Ne met à jour que par le gestionnaire qui a installé l'outil, jamais une installation de son cru.
#[derive(Default)]
pub struct ToolsService {
    plans: Mutex<HashMap<DevTool, Plan>>,
    // Deux `brew upgrade` en même temps se bloquent sur le verrou de Homebrew.
    running: tokio::sync::Mutex<()>,
}

impl ToolsService {
    /// Outils installés qui ont une version plus récente dans leur ligne (même version majeure).
    pub async fn check(&self) -> Vec<ToolUpdate> {
        let found =
            futures_join(DevTool::ALL.map(|tool| async move { (tool, inspect(tool).await) })).await;
        let mut plans = self.plans.lock().unwrap_or_else(|error| error.into_inner());
        plans.clear();
        let mut updates = Vec::new();
        for (tool, inspected) in found {
            let Some((plan, version)) = inspected else {
                continue;
            };
            updates.push(ToolUpdate {
                tool,
                version,
                latest: plan.latest.clone(),
                manager: plan.method.label(),
                updatable: runs_update(&plan.method),
            });
            plans.insert(tool, plan);
        }
        updates
    }

    /// Renvoie la version installée ensuite. Réussie si la version a bien changé : certains gestionnaires
    /// sortent sans erreur sans rien installer.
    pub async fn update(&self, tool: DevTool) -> Result<String, AppError> {
        let (program, method, latest) = {
            let plans = self.plans.lock().unwrap_or_else(|error| error.into_inner());
            let plan = plans
                .get(&tool)
                .ok_or_else(|| AppError::AgentFailed("aucune mise à jour connue".into()))?;
            (
                plan.program.clone(),
                plan.method.clone(),
                plan.latest.clone(),
            )
        };
        let (program_to_run, args, dir) = match &method {
            Method::Brew { brew, formula } => {
                (brew.clone(), vec!["upgrade".into(), formula.clone()], None)
            }
            Method::PnpmStandalone => (
                program.clone(),
                vec!["self-update".into(), latest.clone()],
                home(),
            ),
            Method::NpmGlobal { npm } => (
                npm.clone(),
                vec![
                    "install".into(),
                    "--global".into(),
                    format!("pnpm@{latest}"),
                ],
                home(),
            ),
            _ => {
                return Err(AppError::AgentFailed(
                    "mise à jour à faire hors de Nuée".into(),
                ));
            }
        };

        let _running = self.running.lock().await;
        let mut command = quiet(&program_to_run, &args);
        // pnpm self-update réécrit le `packageManager` du projet où il tourne : jamais dans un projet.
        command.current_dir(dir.unwrap_or_else(std::env::temp_dir));
        let output = timeout(UPDATE_TIMEOUT, command.output())
            .await
            .map_err(|_| AppError::AgentFailed("mise à jour trop longue".into()))??;
        let installed = version_of(tool, &program).await;
        if installed
            .as_deref()
            .is_some_and(|version| !is_newer(&latest, version))
        {
            self.plans
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .remove(&tool);
            return Ok(installed.unwrap_or(latest));
        }
        let message = last_line(&output.stderr)
            .or_else(|| last_line(&output.stdout))
            .unwrap_or_else(|| "la version n'a pas changé".into());
        Err(AppError::AgentFailed(message))
    }

    /// Page de la nouvelle version, pour ce que Nuée ne met pas à jour elle-même.
    pub fn open_release(&self, tool: DevTool) -> Result<(), AppError> {
        let latest = self
            .plans
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get(&tool)
            .map(|plan| plan.latest.clone())
            .ok_or_else(|| AppError::AgentFailed("aucune mise à jour connue".into()))?;
        tauri_plugin_opener::open_url(tool.release_page(&latest), None::<&str>)
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        Ok(())
    }
}

async fn futures_join<F: std::future::Future>(futures: [F; 3]) -> [F::Output; 3] {
    let [a, b, c] = futures;
    let (a, b, c) = tokio::join!(a, b, c);
    [a, b, c]
}

fn runs_update(method: &Method) -> bool {
    matches!(
        method,
        Method::Brew { .. } | Method::PnpmStandalone | Method::NpmGlobal { .. }
    )
}

/// `None` : outil absent, version illisible, hors ligne ou déjà à jour.
async fn inspect(tool: DevTool) -> Option<(Plan, String)> {
    let program = shell_env::find_binary(tool.binary())?;
    let real = std::fs::canonicalize(&program).unwrap_or_else(|_| program.clone());
    let version = version_of(tool, &program).await?;
    let method = detect(tool, &program, &real, &version);
    let latest = latest_for(tool, &method, &version).await?;
    is_newer(&latest, &version).then_some((
        Plan {
            program,
            method,
            latest,
        },
        version,
    ))
}

fn detect(tool: DevTool, program: &Path, real: &Path, version: &str) -> Method {
    let real_text = real.to_string_lossy().replace('\\', "/");
    if let Some(formula) = brew_formula(&real_text)
        && let Some(brew) = brew_of(&real_text)
    {
        return Method::Brew { brew, formula };
    }
    for (marker, name) in [
        ("/.nvm/", "nvm"),
        ("fnm", "fnm"),
        ("/.volta/", "Volta"),
        ("/mise/", "mise"),
        ("/.asdf/", "asdf"),
        ("/.nodenv/", "nodenv"),
        ("/nix/store/", "Nix"),
        ("/opt/local/", "MacPorts"),
        ("/scoop/", "Scoop"),
        ("chocolatey", "Chocolatey"),
    ] {
        if real_text.contains(marker) && !(tool == DevTool::Pnpm && marker == "/.nvm/") {
            return Method::Other(name);
        }
    }
    if tool == DevTool::Pnpm {
        if real_text.contains("/corepack/") {
            return Method::Other("Corepack");
        }
        if real_text.contains("/node_modules/pnpm/")
            || real_text.contains("/node_modules/@pnpm/exe/")
        {
            let npm = program.with_file_name(if cfg!(windows) { "npm.cmd" } else { "npm" });
            let modules = real_text.split("/node_modules/").next().map(PathBuf::from);
            if npm.exists() && modules.is_some_and(|dir| writable(&dir.join("node_modules"))) {
                return Method::NpmGlobal { npm };
            }
            return Method::Other("npm");
        }
        if is_pnpm_home(program, real) && !is_newer("11.10.0", version) {
            return Method::PnpmStandalone;
        }
    }
    if tool == DevTool::Pnpm && real_text.contains("/.nvm/") {
        return Method::Other("nvm");
    }
    Method::Unknown
}

/// `…/Cellar/node@24/24.11.0/bin/node` donne `node@24`.
fn brew_formula(real: &str) -> Option<String> {
    let after = real.split("/Cellar/").nth(1)?;
    Some(after.split('/').next()?.to_owned()).filter(|formula| !formula.is_empty())
}

/// Le `brew` du même préfixe que le binaire : `/opt/homebrew`, `/usr/local` ou celui de Linux.
fn brew_of(real: &str) -> Option<PathBuf> {
    let prefix = real.split("/Cellar/").next()?;
    let brew = Path::new(prefix).join("bin/brew");
    brew.exists().then_some(brew)
}

fn is_pnpm_home(program: &Path, real: &Path) -> bool {
    let mut homes: Vec<PathBuf> = std::env::var_os("PNPM_HOME")
        .map(PathBuf::from)
        .into_iter()
        .collect();
    if let Some(home) = home() {
        homes.push(home.join("Library/pnpm"));
        homes.push(home.join(".local/share/pnpm"));
    }
    homes
        .iter()
        .any(|dir| program.starts_with(dir) || real.starts_with(dir))
}

fn writable(dir: &Path) -> bool {
    std::fs::metadata(dir).is_ok_and(|meta| !meta.permissions().readonly()) && tempfile_probe(dir)
}

// `readonly` ne regarde que les bits du propriétaire : seul un essai dit si l'utilisateur peut y écrire.
fn tempfile_probe(dir: &Path) -> bool {
    let probe = dir.join(format!(".nuee-write-{}", std::process::id()));
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

fn home() -> Option<PathBuf> {
    std::env::home_dir()
}

async fn latest_for(tool: DevTool, method: &Method, version: &str) -> Option<String> {
    let major = version.split('.').next()?.to_owned();
    let latest = match (tool, method) {
        // Homebrew suit GitHub avec un peu de retard : on ne propose que ce qu'il sait installer.
        (_, Method::Brew { formula, .. }) => {
            let formula = formula.clone();
            fetch_json(format!(
                "https://formulae.brew.sh/api/formula/{formula}.json"
            ))
            .await
            .and_then(|json| json["versions"]["stable"].as_str().map(str::to_owned))
        }
        (DevTool::Gh, _) => {
            fetch_json("https://api.github.com/repos/cli/cli/releases/latest".into())
                .await
                .and_then(|json| {
                    json["tag_name"]
                        .as_str()
                        .map(|tag| tag.trim_start_matches('v').to_owned())
                })
        }
        (DevTool::Node, _) => fetch_json("https://nodejs.org/dist/index.json".into())
            .await
            .and_then(|json| node_latest(&json, &major)),
        (DevTool::Pnpm, _) => {
            fetch_json("https://registry.npmjs.org/-/package/pnpm/dist-tags".into())
                .await
                .and_then(|json| json[format!("latest-{major}")].as_str().map(str::to_owned))
        }
    }?;
    // Jamais de saut de version majeure : il casse les modules natifs (Node) ou change les commandes.
    // Chiffres et points seulement : la version part en argument de brew, npm ou pnpm.
    (latest.split('.').next() == Some(major.as_str())
        && latest.chars().all(|c| c.is_ascii_digit() || c == '.'))
    .then_some(latest)
}

/// Dernière version stable de la même version majeure ; la liste de nodejs.org va de la plus récente à la plus ancienne.
fn node_latest(index: &Value, major: &str) -> Option<String> {
    index.as_array()?.iter().find_map(|release| {
        let version = release["version"].as_str()?.trim_start_matches('v');
        (!version.contains('-') && version.split('.').next() == Some(major))
            .then(|| version.to_owned())
    })
}

async fn fetch_json(url: String) -> Option<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(FETCH_TIMEOUT))
            .build()
            .into();
        let body = agent
            .get(&url)
            .header("User-Agent", "Nuee")
            .call()
            .ok()?
            .body_mut()
            .read_to_string()
            .ok()?;
        serde_json::from_str(&body).ok()
    })
    .await
    .ok()
    .flatten()
}

async fn version_of(tool: DevTool, program: &Path) -> Option<String> {
    let mut command = quiet(program, &["--version".to_owned()]);
    command.current_dir(home().unwrap_or_else(std::env::temp_dir));
    let output = timeout(VERSION_TIMEOUT, command.output())
        .await
        .ok()?
        .ok()?;
    parse_version(tool, &String::from_utf8_lossy(&output.stdout))
}

/// « gh version 2.88.1 (2026-03-12) », « v24.18.0 », « 12.10.1 ».
fn parse_version(tool: DevTool, stdout: &str) -> Option<String> {
    let line = stdout.lines().next()?.trim();
    let word = match tool {
        DevTool::Gh => line
            .strip_prefix("gh version ")?
            .split_whitespace()
            .next()?,
        _ => line.split_whitespace().next()?,
    };
    let version = word.trim_start_matches('v');
    (version.split('.').count() == 3 && version.split('.').all(|part| part.parse::<u64>().is_ok()))
        .then(|| version.to_owned())
}

/// Sans terminal ni question : un gestionnaire qui voudrait demander quelque chose échoue au lieu d'attendre.
fn quiet(program: &Path, args: &[String]) -> Command {
    let mut command = Command::new(program);
    command
        .args(args)
        .env("PATH", shell_env::search_path())
        .env("CI", "1")
        .env("NONINTERACTIVE", "1")
        .env("COREPACK_ENABLE_DOWNLOAD_PROMPT", "0")
        // Le dossier de l'ancienne version reste : un serveur Node lancé depuis lui ne perd pas son binaire.
        .env("HOMEBREW_NO_INSTALL_CLEANUP", "1")
        .env("HOMEBREW_NO_ENV_HINTS", "1")
        // Sans ça, `brew upgrade gh` met aussi à jour tout ce qui dépend des bibliothèques touchées.
        .env("HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK", "1")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

fn last_line(output: &[u8]) -> Option<String> {
    String::from_utf8_lossy(output)
        .lines()
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn detect_path(tool: DevTool, real: &str, version: &str) -> Method {
        detect(tool, Path::new(real), Path::new(real), version)
    }

    #[test]
    fn reads_each_version_format() {
        assert_eq!(
            parse_version(DevTool::Gh, "gh version 2.88.1 (2026-03-12)\nhttps://…"),
            Some("2.88.1".into())
        );
        assert_eq!(
            parse_version(DevTool::Node, "v24.18.0\n"),
            Some("24.18.0".into())
        );
        assert_eq!(
            parse_version(DevTool::Pnpm, "12.10.1\n"),
            Some("12.10.1".into())
        );
        assert_eq!(
            parse_version(DevTool::Pnpm, "Corepack is about to download…"),
            None
        );
    }

    #[test]
    fn finds_the_homebrew_formula() {
        assert_eq!(
            brew_formula("/opt/homebrew/Cellar/gh/2.88.1/bin/gh"),
            Some("gh".into())
        );
        assert_eq!(
            brew_formula("/opt/homebrew/Cellar/node@24/24.11.0/bin/node"),
            Some("node@24".into())
        );
        assert_eq!(brew_formula("/usr/local/bin/node"), None);
    }

    #[test]
    fn version_managers_are_left_alone() {
        assert_eq!(
            detect_path(
                DevTool::Node,
                "/Users/a/.nvm/versions/node/v24.18.0/bin/node",
                "24.18.0"
            ),
            Method::Other("nvm")
        );
        assert_eq!(
            detect_path(DevTool::Node, "/Users/a/.volta/bin/node", "24.18.0"),
            Method::Other("Volta")
        );
        assert_eq!(
            detect_path(
                DevTool::Pnpm,
                "/Users/a/.nvm/versions/node/v24.18.0/lib/node_modules/corepack/dist/pnpm.js",
                "12.10.1"
            ),
            Method::Other("Corepack")
        );
        assert_eq!(
            detect_path(DevTool::Gh, "/usr/local/bin/gh", "2.88.1"),
            Method::Unknown
        );
    }

    #[test]
    fn each_install_method_is_recognized() {
        for (tool, real, name) in [
            (
                DevTool::Node,
                "/Users/a/.local/share/fnm/node-versions/v24.18.0/installation/bin/node",
                "fnm",
            ),
            (
                DevTool::Node,
                "/Users/a/.local/share/mise/installs/node/24.18.0/bin/node",
                "mise",
            ),
            (
                DevTool::Node,
                "/Users/a/.asdf/installs/nodejs/24.18.0/bin/node",
                "asdf",
            ),
            (
                DevTool::Node,
                "/Users/a/.nodenv/versions/24.18.0/bin/node",
                "nodenv",
            ),
            (
                DevTool::Node,
                "/nix/store/abc-nodejs-24.18.0/bin/node",
                "Nix",
            ),
            (DevTool::Node, "/opt/local/bin/node", "MacPorts"),
            (
                DevTool::Pnpm,
                "/Users/a/.volta/tools/image/packages/pnpm/bin/pnpm",
                "Volta",
            ),
            (
                DevTool::Pnpm,
                "/Users/a/.local/share/mise/installs/pnpm/12.10.1/pnpm",
                "mise",
            ),
        ] {
            assert_eq!(
                detect_path(tool, real, "24.18.0"),
                Method::Other(name),
                "{real}"
            );
        }
    }

    #[test]
    fn npm_global_pnpm_needs_a_writable_folder() {
        let root = std::env::temp_dir().join(format!("nuee-npm-{}", std::process::id()));
        let bin = root.join("bin");
        let package = root.join("lib/node_modules/pnpm/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::create_dir_all(&package).unwrap();
        std::fs::write(bin.join("npm"), b"").unwrap();
        let method = detect(
            DevTool::Pnpm,
            &bin.join("pnpm"),
            &package.join("pnpm.cjs"),
            "12.10.1",
        );
        assert_eq!(
            method,
            Method::NpmGlobal {
                npm: bin.join("npm")
            }
        );
        // Un npm sans npm à côté (ou dans /usr/lib sans droits) ne se met pas à jour d'ici.
        std::fs::remove_file(bin.join("npm")).unwrap();
        let method = detect(
            DevTool::Pnpm,
            &bin.join("pnpm"),
            &package.join("pnpm.cjs"),
            "12.10.1",
        );
        assert_eq!(method, Method::Other("npm"));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn standalone_pnpm_needs_self_update() {
        let pnpm = home().unwrap().join("Library/pnpm/pnpm");
        assert_eq!(
            detect(DevTool::Pnpm, &pnpm, &pnpm, "11.10.0"),
            Method::PnpmStandalone
        );
        assert_eq!(
            detect(DevTool::Pnpm, &pnpm, &pnpm, "10.33.0"),
            Method::Unknown
        );
    }

    #[test]
    fn node_stays_on_its_major() {
        let index = json!([
            { "version": "v27.0.0-alpha.1" },
            { "version": "v26.13.1" },
            { "version": "v24.22.3" },
            { "version": "v24.22.2" },
        ]);
        assert_eq!(node_latest(&index, "24"), Some("24.22.3".into()));
        assert_eq!(node_latest(&index, "27"), None);
    }

    #[test]
    fn only_three_methods_run_an_update() {
        assert!(runs_update(&Method::PnpmStandalone));
        assert!(!runs_update(&Method::Other("nvm")));
        assert!(!runs_update(&Method::Unknown));
    }
}
