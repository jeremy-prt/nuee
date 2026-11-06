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
