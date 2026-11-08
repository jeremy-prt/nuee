use tauri::State;

use crate::services::operator::OperatorService;

/// Réponse du front à un outil de sessions ; `ok` faux : `text` est l'erreur rendue à l'agent.
#[tauri::command]
pub fn operator_reply(id: u32, ok: bool, text: String, operator: State<'_, OperatorService>) {
    operator.reply(id, if ok { Ok(text) } else { Err(text) });
}
