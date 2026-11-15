use tauri::State;

use crate::error::AppError;
use crate::services::tools::{DevTool, ToolUpdate, ToolsService};

#[tauri::command]
pub async fn tools_check(tools: State<'_, ToolsService>) -> Result<Vec<ToolUpdate>, AppError> {
    Ok(tools.check().await)
}

#[tauri::command]
pub async fn tools_update(
    tools: State<'_, ToolsService>,
    tool: DevTool,
) -> Result<String, AppError> {
    tools.update(tool).await
}

#[tauri::command]
pub fn tools_open_release(tools: State<'_, ToolsService>, tool: DevTool) -> Result<(), AppError> {
    tools.open_release(tool)
}
