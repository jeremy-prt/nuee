use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use ts_rs::TS;

use crate::error::AppError;
use crate::utils::files::write_atomic;

/// Réglage `skillOverrides` de Claude Code, rien d'écrit valant `On`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SkillMode {
    On,
    /// Montré à l'agent sans sa description : moins de contexte pris.
    NameOnly,
    /// Caché à l'agent, lancé seulement par `/name`.
    UserInvocableOnly,
    Off,
}

impl SkillMode {
    pub fn value(self) -> &'static str {
        match self {
            Self::On => "on",
            Self::NameOnly => "name-only",
            Self::UserInvocableOnly => "user-invocable-only",
            Self::Off => "off",
        }
    }

    fn from_value(value: &str) -> Self {
        match value {
            "name-only" => Self::NameOnly,
            "user-invocable-only" => Self::UserInvocableOnly,
            "off" => Self::Off,
            _ => Self::On,
        }
    }
}

/// `skillOverrides` du fichier, par nom de dossier du skill.
pub fn skill_mode(settings: &Value, id: &str) -> SkillMode {
    settings["skillOverrides"][id]
        .as_str()
        .map_or(SkillMode::On, SkillMode::from_value)
}

pub fn denied_servers(settings: &Value) -> Vec<String> {
    settings["deniedMcpServers"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| entry["serverName"].as_str().map(str::to_owned))
        .collect()
}

/// `Null` si le fichier n'existe pas encore.
pub fn read(file: &Path) -> Result<Value, AppError> {
    let text = match fs::read_to_string(file) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Value::Null),
        Err(error) => return Err(error.into()),
    };
    serde_json::from_str(&text)
        .map_err(|error| AppError::InvalidInput(format!("{} illisible : {error}", file.display())))
}

pub fn set_skill(file: &Path, id: &str, mode: SkillMode) -> Result<(), AppError> {
    update(file, |root| {
        let overrides = root
            .entry("skillOverrides")
            .or_insert_with(|| Value::Object(Map::new()));
        let Some(overrides) = overrides.as_object_mut() else {
            return Err(AppError::InvalidInput(
                "skillOverrides n'est pas un objet".into(),
            ));
        };
        if mode == SkillMode::On {
            overrides.shift_remove(id);
        } else {
            overrides.insert(id.to_owned(), mode.value().into());
        }
        if overrides.is_empty() {
            root.shift_remove("skillOverrides");
        }
        Ok(())
    })
}

/// `deniedMcpServers` est fait pour l'admin d'une entreprise, mais c'est le seul réglage qui coupe un
/// serveur dans toutes ses portées (utilisateur, projet, plugin, claude.ai).
pub fn set_server(file: &Path, name: &str, enabled: bool) -> Result<(), AppError> {
    update(file, |root| {
        let denied = root
            .entry("deniedMcpServers")
            .or_insert_with(|| Value::Array(Vec::new()));
        let Some(denied) = denied.as_array_mut() else {
            return Err(AppError::InvalidInput(
                "deniedMcpServers n'est pas une liste".into(),
            ));
        };
        let listed = denied.iter().any(|entry| entry["serverName"] == name);
        if enabled {
            denied.retain(|entry| entry["serverName"] != name);
        } else if !listed {
            denied.push(serde_json::json!({ "serverName": name }));
        }
        if denied.is_empty() {
            root.shift_remove("deniedMcpServers");
        }
        Ok(())
    })
}

/// Change le fichier sans toucher au reste : ordre des clés et forme gardés (indentation de deux
/// espaces, comme Claude Code l'écrit). Rien n'est écrit si rien ne change.
fn update(
    file: &Path,
    change: impl FnOnce(&mut Map<String, Value>) -> Result<(), AppError>,
) -> Result<(), AppError> {
    let before = read(file)?;
    let mut settings = match &before {
        Value::Null => Value::Object(Map::new()),
        settings => settings.clone(),
    };
    let Some(root) = settings.as_object_mut() else {
        return Err(AppError::InvalidInput(format!(
            "{} n'est pas un objet JSON",
            file.display()
        )));
    };
    change(root)?;
    let empty = root.is_empty();
    if settings == before || (before.is_null() && empty) {
        return Ok(());
    }
    let mut output = serde_json::to_string_pretty(&settings)
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    output.push('\n');
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir)?;
    }
    Ok(write_atomic(file, output.as_bytes())?)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nuee-settings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn skills_change_one_key_and_keep_the_rest() {
        let dir = temp_dir("skills");
        let file = dir.join("settings.json");
        let original = "{\n  \"model\": \"opus\",\n  \"skillOverrides\": {\n    \"dataviz\": \"off\"\n  },\n  \"effortLevel\": \"high\"\n}\n";
        fs::write(&file, original).unwrap();

        set_skill(&file, "j-commit", SkillMode::UserInvocableOnly).unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "{\n  \"model\": \"opus\",\n  \"skillOverrides\": {\n    \"dataviz\": \"off\",\n    \"j-commit\": \"user-invocable-only\"\n  },\n  \"effortLevel\": \"high\"\n}\n"
        );
        assert_eq!(
            skill_mode(&read(&file).unwrap(), "j-commit"),
            SkillMode::UserInvocableOnly
        );
        set_skill(&file, "j-commit", SkillMode::On).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), original);
        set_skill(&file, "dataviz", SkillMode::On).unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "{\n  \"model\": \"opus\",\n  \"effortLevel\": \"high\"\n}\n"
        );

        let missing = dir.join("missing.json");
        set_skill(&missing, "x", SkillMode::On).unwrap();
        assert!(!missing.exists());

        fs::write(&file, "{ broken").unwrap();
        assert!(set_skill(&file, "x", SkillMode::Off).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "{ broken");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn servers_are_denied_once_and_allowed_again() {
        let dir = temp_dir("servers");
        let file = dir.join("settings.json");
        fs::write(&file, "{\n  \"model\": \"opus\"\n}\n").unwrap();

        set_server(&file, "claude.ai Notion", false).unwrap();
        set_server(&file, "claude.ai Notion", false).unwrap();
        assert_eq!(denied_servers(&read(&file).unwrap()), ["claude.ai Notion"]);
        set_server(&file, "claude.ai Notion", true).unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "{\n  \"model\": \"opus\"\n}\n"
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
