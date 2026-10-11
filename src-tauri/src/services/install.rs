use serde::Deserialize;
use ts_rs::TS;

use crate::error::AppError;

/// Outils dont Nuée a besoin sans les installer elle-même (choix de Jérémy) : quand l'un manque, elle
/// ouvre sa page d'installation officielle. Le front n'envoie que cet identifiant, jamais une adresse.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum InstallTool {
    Claude,
    Gh,
}

impl InstallTool {
    fn page(self) -> &'static str {
        match self {
            Self::Claude => "https://code.claude.com/docs/en/setup",
            Self::Gh => "https://cli.github.com",
        }
    }
}

/// Ouverte depuis Rust : la capability `opener` du front n'a pas à connaître ces adresses.
pub fn open_page(tool: InstallTool) -> Result<(), AppError> {
    tauri_plugin_opener::open_url(tool.page(), None::<&str>)
        .map_err(|error| std::io::Error::other(error.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pages_are_official_https() {
        for tool in [InstallTool::Claude, InstallTool::Gh] {
            assert!(tool.page().starts_with("https://"), "{tool:?}");
        }
        assert_eq!(InstallTool::Gh.page(), "https://cli.github.com");
    }
}
