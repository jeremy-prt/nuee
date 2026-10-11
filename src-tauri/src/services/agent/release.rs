use std::time::Duration;

use serde_json::Value;

const REGISTRY: &str = "https://registry.npmjs.org/-/package";
const TIMEOUT: Duration = Duration::from_secs(10);

/// Dernière version publiée sous l'étiquette `tag` (`latest`, `stable`). `None` hors ligne.
pub async fn latest(package: &'static str, tag: &'static str) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || fetch(package, tag))
        .await
        .ok()
        .flatten()
}

fn fetch(package: &str, tag: &str) -> Option<String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        .build()
        .into();
    let body = agent
        .get(format!("{REGISTRY}/{package}/dist-tags"))
        .header("User-Agent", "Nuee")
        .call()
        .ok()?
        .body_mut()
        .read_to_string()
        .ok()?;
    version_of(&serde_json::from_str(&body).ok()?, tag)
}

fn version_of(tags: &Value, tag: &str) -> Option<String> {
    let version = tags[tag].as_str()?.trim();
    parse(version).map(|_| version.to_owned())
}

/// Une version d'avance seulement : un agent installé depuis un canal plus récent n'est pas « à mettre à jour ».
pub fn is_newer(candidate: &str, installed: &str) -> bool {
    match (parse(candidate), parse(installed)) {
        (Some(candidate), Some(installed)) => candidate > installed,
        _ => false,
    }
}

/// `2.1.296` ou `2.1.296 (Claude Code)` ; une préversion (`-beta`) est ignorée.
fn parse(version: &str) -> Option<Vec<u64>> {
    let core = version.split_whitespace().next()?;
    let core = core.split(['-', '+']).next()?;
    core.split('.').map(|part| part.parse().ok()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn compares_numerically() {
        assert!(is_newer("2.1.296", "2.1.287"));
        assert!(is_newer("2.10.0", "2.9.9"));
        assert!(!is_newer("2.1.287", "2.1.296"));
        assert!(!is_newer("2.1.296", "2.1.296 (Claude Code)"));
        assert!(!is_newer("n/a", "2.1.0"));
    }

    #[test]
    fn reads_the_requested_tag() {
        let tags = json!({ "stable": "2.1.287", "latest": "2.1.296" });
        assert_eq!(version_of(&tags, "stable").as_deref(), Some("2.1.287"));
        assert_eq!(version_of(&tags, "next"), None);
        assert_eq!(version_of(&json!({ "latest": "--evil" }), "latest"), None);
    }
}
