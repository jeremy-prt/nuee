use tauri::State;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::services::agent::{AgentEvent, AgentService, TurnRequest};

/// Rend la main dès que l'agent est lancé ; la suite arrive sur `on_event` jusqu'à `turnEnd`.
#[tauri::command]
pub async fn agent_send(
    request: TurnRequest,
    on_event: Channel<AgentEvent>,
    agents: State<'_, AgentService>,
) -> Result<(), AppError> {
    agents.send(request, on_event)
}

#[tauri::command]
pub fn agent_stop(chat_id: String, agents: State<'_, AgentService>) {
    agents.stop(&chat_id);
}
