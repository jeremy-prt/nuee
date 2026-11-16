use crate::error::AppError;

// La webview ne connaît pas la vraie langue du système (WebView2 renvoie toujours en-US).
#[tauri::command]
pub fn system_locales() -> Vec<String> {
    sys_locale::get_locales().collect()
}

// Nom de la machine tel que le système l'affiche (« MacBook Jeremy » sur macOS, pas le nom réseau).
#[tauri::command]
pub async fn system_machine_name() -> String {
    let output = if cfg!(target_os = "macos") {
        tokio::process::Command::new("scutil")
            .args(["--get", "ComputerName"])
            .output()
            .await
    } else {
        tokio::process::Command::new("hostname").output().await
    };
    output
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_default()
}

// Lien d'une réponse d'agent, ouvert dans le navigateur par défaut. Côté Rust, hors du scope `opener` du front,
// et seulement en http(s) : un `file:` ou un schéma d'app lancerait autre chose qu'une page.
#[tauri::command]
pub fn system_open_link(url: String) -> Result<(), AppError> {
    let parsed = web_url(&url)?;
    tauri_plugin_opener::open_url(parsed.as_str(), None::<&str>)
        .map_err(|error| std::io::Error::other(error.to_string()))?;
    Ok(())
}

fn web_url(url: &str) -> Result<tauri::Url, AppError> {
    let parsed = tauri::Url::parse(url)
        .map_err(|_| AppError::InvalidInput(format!("adresse invalide : {url}")))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::InvalidInput(format!(
            "seuls les liens http et https s'ouvrent : {url}"
        )));
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::web_url;

    #[test]
    fn only_web_links() {
        assert!(web_url("https://github.com/jeremy-prt/nuee").is_ok());
        assert!(web_url("http://localhost:3000/").is_ok());
        assert!(web_url("file:///etc/passwd").is_err());
        assert!(web_url("javascript:alert(1)").is_err());
        assert!(web_url("vscode://file/x").is_err());
        assert!(web_url("pas une adresse").is_err());
    }
}
