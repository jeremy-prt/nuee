use tauri::{AppHandle, Manager, State};

use crate::error::AppError;
use crate::services::usage::{QuotaSample, UsageBucket, UsageService};

/// Tokens et coût par pas de `step` ms et par modèle depuis `since` (ms). Des Go de transcripts à lire : hors du fil async.
#[tauri::command]
pub async fn usage_history(
    since: i64,
    step: i64,
    app: AppHandle,
) -> Result<Vec<UsageBucket>, AppError> {
    tauri::async_runtime::spawn_blocking(move || app.state::<UsageService>().history(since, step))
        .await
        .map_err(|error| AppError::AgentFailed(error.to_string()))?
}

/// Taux pour afficher les coûts dans la monnaie de la langue. `None` : dollars.
#[tauri::command]
pub async fn usage_rate(currency: String, app: AppHandle) -> Result<Option<f64>, AppError> {
    tauri::async_runtime::spawn_blocking(move || app.state::<UsageService>().rate(&currency))
        .await
        .map_err(|error| AppError::AgentFailed(error.to_string()))
}

#[tauri::command]
pub async fn usage_record(
    sample: QuotaSample,
    usage: State<'_, UsageService>,
) -> Result<(), AppError> {
    usage.record(&sample)
}

/// Relevés de quota depuis `since` (ms), du plus ancien au plus récent.
#[tauri::command]
pub async fn usage_samples(
    since: i64,
    usage: State<'_, UsageService>,
) -> Result<Vec<QuotaSample>, AppError> {
    usage.samples(since)
}
