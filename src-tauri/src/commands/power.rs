use tauri::State;

use crate::error::AppError;
use crate::services::power::PowerService;

#[tauri::command]
pub fn power_keep_awake(on: bool, power: State<'_, PowerService>) -> Result<(), AppError> {
    power.keep_awake(on)
}
