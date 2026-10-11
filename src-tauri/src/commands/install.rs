use crate::error::AppError;
use crate::services::install::{self, InstallTool};

#[tauri::command]
pub fn install_open(tool: InstallTool) -> Result<(), AppError> {
    install::open_page(tool)
}
