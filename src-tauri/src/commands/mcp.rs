use tauri::State;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::services::agent::{AgentKind, AgentService, McpServer};

/// Les serveurs démarrent en quelques secondes : chaque relevé part sur `on_update` au fil de l'eau.
#[tauri::command]
pub async fn mcp_status(
    agent: AgentKind,
    on_update: Channel<Vec<McpServer>>,
    agents: State<'_, AgentService>,
) -> Result<Vec<McpServer>, AppError> {
    agents
        .mcp_status(agent, |servers| {
            let _ = on_update.send(servers.to_vec());
        })
        .await
}

#[tauri::command]
pub async fn mcp_check(
    agent: AgentKind,
    name: String,
    agents: State<'_, AgentService>,
) -> Result<McpServer, AppError> {
    agents.mcp_check(agent, &name).await
}

/// Rend la main une fois l'autorisation validée dans le navigateur (ou refusée, annulée).
#[tauri::command]
pub async fn mcp_login(
    agent: AgentKind,
    name: String,
    agents: State<'_, AgentService>,
) -> Result<McpServer, AppError> {
    agents.mcp_login(agent, &name).await
}

#[tauri::command]
pub async fn mcp_set_enabled(
    agent: AgentKind,
    name: String,
    enabled: bool,
    agents: State<'_, AgentService>,
) -> Result<(), AppError> {
    agents.mcp_set_enabled(agent, &name, enabled)
}

#[tauri::command]
pub fn mcp_cancel_login(name: String, agents: State<'_, AgentService>) {
    agents.mcp_cancel_login(&name);
}
