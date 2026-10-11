use std::fs;
use std::io;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::{AgentKind, SkillMode, settings, valid_name};
use crate::utils::files::write_atomic;

/// Au-delà, ce n'est plus un SKILL.md mais un fichier collé par erreur.
const MAX_SIZE: usize = 1024 * 1024;

/// Skill de la config globale de l'agent : un dossier avec son SKILL.md.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Skill {
    /// Nom du dossier. C'est lui, et non `name`, que Claude Code attend dans `skillOverrides`.
    pub id: String,
    /// Nom qu'on tape (`/name`), pris dans le SKILL.md.
    pub name: String,
    pub description: String,
    pub path: String,
    pub mode: SkillMode,
    /// `disable-model-invocation` dans le SKILL.md : l'agent ne le lance jamais de lui-même.
    pub manual: bool,
}

pub fn list(kind: AgentKind) -> Result<Vec<Skill>, AppError> {
    let Some(dir) = kind.skills_dir() else {
        return Ok(Vec::new());
    };
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let config = kind
        .settings_file()
        .and_then(|file| settings::read(&file).ok())
        .unwrap_or(Value::Null);
    let mut skills: Vec<Skill> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let id = entry.file_name().to_str()?.to_owned();
            if !valid_id(&id) {
                return None;
            }
            let path = entry.path().join("SKILL.md");
            let front = frontmatter(&fs::read_to_string(&path).ok()?);
            let name = front
                .name
                .filter(|name| valid_name(name))
                .unwrap_or_else(|| id.clone());
            let mode = settings::skill_mode(&config, &id);
            Some(Skill {
                id,
                name,
                description: front.description.unwrap_or_default(),
                path: path.to_string_lossy().into_owned(),
                mode,
                manual: front.manual,
            })
        })
        .collect();
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

pub fn read(kind: AgentKind, id: &str) -> Result<String, AppError> {
    Ok(fs::read_to_string(skill_file(kind, id)?)?)
}

pub fn write(kind: AgentKind, id: &str, content: &str) -> Result<(), AppError> {
    if content.len() > MAX_SIZE {
        return Err(AppError::InvalidInput("SKILL.md trop gros".into()));
    }
    Ok(write_atomic(&skill_file(kind, id)?, content.as_bytes())?)
}

/// Écrit dans les réglages globaux de l'agent : Claude Code lancé ailleurs suit aussi.
pub fn set_mode(kind: AgentKind, id: &str, mode: SkillMode) -> Result<(), AppError> {
    skill_file(kind, id)?;
    let file = kind
        .settings_file()
        .ok_or_else(|| io::Error::other("dossier de config introuvable"))?;
    settings::set_skill(&file, id, mode)
}

/// Le dossier part à la corbeille, d'où on peut le récupérer. Un lien symbolique y part seul :
/// le skill rangé ailleurs (dépôt de dotfiles) n'est pas touché.
pub fn trash(kind: AgentKind, id: &str) -> Result<(), AppError> {
    let file = skill_file(kind, id)?;
    let Some(dir) = file.parent() else {
        return Err(AppError::InvalidInput(
            "dossier du skill introuvable".into(),
        ));
    };
    let mut context = trash::TrashContext::default();
    // La méthode par défaut passe par le Finder, qui fait demander à macOS le droit de le piloter.
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        context.set_delete_method(DeleteMethod::NsFileManager);
    }
    context
        .delete(dir)
        .map_err(|error| io::Error::other(error.to_string()))?;
    // Un réglage resté là s'appliquerait à un futur skill du même nom.
    if let Some(settings) = kind.settings_file() {
        let _ = settings::set_skill(&settings, id, SkillMode::On);
    }
    Ok(())
}

/// SKILL.md d'un skill existant. `id` vient de la webview : un seul nom de dossier, rien qui en sorte.
pub fn skill_file(kind: AgentKind, id: &str) -> Result<PathBuf, AppError> {
    let dir = kind
        .skills_dir()
        .ok_or_else(|| io::Error::other("dossier de config introuvable"))?;
    let file = dir.join(id).join("SKILL.md");
    if !valid_id(id) || !file.is_file() {
        return Err(AppError::InvalidInput(format!("skill introuvable : {id}")));
    }
    Ok(file)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && !id.starts_with('.')
        && !id.contains(['/', '\\'])
        && !id.chars().any(char::is_control)
}

#[derive(Debug, Default, PartialEq)]
struct Front {
    name: Option<String>,
    description: Option<String>,
    manual: bool,
}

/// En-tête YAML d'un SKILL.md, juste les clés que la page montre. Pas de lib YAML pour trois clés :
/// on lit les formes qu'on trouve dans les skills (texte simple, entre guillemets, bloc `>` ou `|`).
fn frontmatter(text: &str) -> Front {
    let mut lines = text.trim_start_matches('\u{feff}').lines();
    let mut front = Front::default();
    if lines.next().map(str::trim_end) != Some("---") {
        return front;
    }
    let body: Vec<&str> = lines.take_while(|line| line.trim_end() != "---").collect();
    let mut index = 0;
    while index < body.len() {
        let line = body[index];
        index += 1;
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if line.starts_with([' ', '\t', '#']) {
            continue;
        }
        let start = index;
        while index < body.len()
            && (body[index].starts_with([' ', '\t']) || body[index].trim().is_empty())
        {
            index += 1;
        }
        let value = scalar(value.trim(), &body[start..index]);
        match key.trim() {
            "name" => front.name = Some(value),
            "description" => front.description = Some(value),
            "disable-model-invocation" => front.manual = value == "true",
            _ => {}
        }
    }
    front
}

/// Valeur sur une ligne : les lignes de suite sont jointes par une espace, la page la montre sur une ligne.
fn scalar(first: &str, rest: &[&str]) -> String {
    let rest = rest
        .iter()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty());
    if first.starts_with(['|', '>']) {
        return rest.collect::<Vec<_>>().join(" ");
    }
    let whole = std::iter::once(first)
        .chain(rest)
        .collect::<Vec<_>>()
        .join(" ");
    if let Some(inner) = whole.strip_prefix('"') {
        let mut value = String::new();
        let mut chars = inner.chars();
        while let Some(c) = chars.next() {
            match c {
                '"' => break,
                '\\' => match chars.next() {
                    Some('n' | 't') => value.push(' '),
                    Some(other) => value.push(other),
                    None => break,
                },
                c => value.push(c),
            }
        }
        return value;
    }
    if let Some(inner) = whole.strip_prefix('\'') {
        let mut value = String::new();
        let mut chars = inner.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '\'' {
                if chars.peek() != Some(&'\'') {
                    break;
                }
                chars.next();
            }
            value.push(c);
        }
        return value;
    }
    whole
        .split(" #")
        .next()
        .unwrap_or_default()
        .trim()
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontmatter_reads_the_common_forms() {
        let front = frontmatter(
            "---\nname: j-commit\ndescription: \"Committer \\\"et\\\" pusher\"\nmetadata:\n  tags: [a]\n---\n# Titre",
        );
        assert_eq!(front.name.as_deref(), Some("j-commit"));
        assert_eq!(
            front.description.as_deref(),
            Some("Committer \"et\" pusher")
        );
        assert!(!front.manual);

        let front = frontmatter(
            "\u{feff}---\r\nname: deploy\r\ndescription: >\r\n  Deploy the app\r\n  to staging.\r\ndisable-model-invocation: true\r\n---\r\n",
        );
        assert_eq!(
            front.description.as_deref(),
            Some("Deploy the app to staging.")
        );
        assert!(front.manual);

        let front = frontmatter("---\ndescription: 'It''s plain' \n---");
        assert_eq!(front.description.as_deref(), Some("It's plain"));

        let front = frontmatter("---\ndescription: Read, merge PDFs # note\n  and split them\n---");
        assert_eq!(front.description.as_deref(), Some("Read, merge PDFs"));

        assert_eq!(frontmatter("# Pas d'en-tête\nname: x"), Front::default());
    }

    #[test]
    fn ids_stay_inside_the_skills_folder() {
        assert!(valid_id("j-commit"));
        assert!(!valid_id(".."));
        assert!(!valid_id(".trash"));
        assert!(!valid_id("a/../../etc"));
        assert!(!valid_id(""));
    }
}
