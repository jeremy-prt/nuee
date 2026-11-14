use tauri::State;

use crate::error::AppError;
use crate::services::agent::{AgentKind, AgentService};
use crate::services::note::{Note, NoteInput, NoteService, TITLE_MAX};

/// Une consigne de quelques phrases ; au-delà, ce n'est plus une consigne mais un second transcript.
const FOCUS_MAX: usize = 4000;

#[tauri::command]
pub async fn note_list(notes: State<'_, NoteService>) -> Result<Vec<Note>, AppError> {
    notes.list()
}

#[tauri::command]
pub async fn note_save(note: NoteInput, notes: State<'_, NoteService>) -> Result<Note, AppError> {
    notes.save(&note)
}

#[tauri::command]
pub async fn note_delete(id: String, notes: State<'_, NoteService>) -> Result<(), AppError> {
    notes.delete(&id)
}

/// Résume une session en note (`id` choisi par le front) et l'enregistre. `focus` : ce que l'utilisateur veut garder.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn note_summarize(
    id: String,
    agent: AgentKind,
    headings: Vec<String>,
    focus: String,
    transcript: String,
    project_id: Option<String>,
    chat_id: String,
    notes: State<'_, NoteService>,
    agents: State<'_, AgentService>,
) -> Result<Note, AppError> {
    if headings.len() != 6 || headings.iter().any(|heading| heading.len() > 80) {
        return Err(AppError::InvalidInput("headings".into()));
    }
    let focus: String = focus.chars().take(FOCUS_MAX).collect();
    let text = agents
        .session_note(agent, &headings, &focus, &transcript)
        .await
        .ok_or_else(|| AppError::AgentFailed("résumé de la session impossible".into()))?;
    let (title, body) = split_title(&text);
    notes.save(&NoteInput {
        id,
        title,
        body,
        project_id,
        source_chat_id: Some(chat_id),
    })
}

/// Le `# titre` de tête devient le titre de la note ; le reste, son corps.
fn split_title(text: &str) -> (String, String) {
    let (first, rest) = text.split_once('\n').unwrap_or((text, ""));
    match first.trim().strip_prefix("# ") {
        Some(title) => (
            title.trim().chars().take(TITLE_MAX).collect(),
            rest.trim().to_owned(),
        ),
        None => (String::new(), text.trim().to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_heading_becomes_the_title() {
        assert_eq!(
            split_title("# Notes P4\n\n## Décisions\n- SQLite"),
            ("Notes P4".into(), "## Décisions\n- SQLite".into())
        );
        assert_eq!(
            split_title("## Décisions"),
            (String::new(), "## Décisions".into())
        );
    }
}
