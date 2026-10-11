use crate::error::AppError;
use crate::services::agent::{AgentKind, SkillMode};
use crate::services::skills::{self, Skill};

#[tauri::command]
pub async fn skills_list(agent: AgentKind) -> Result<Vec<Skill>, AppError> {
    skills::list(agent)
}

#[tauri::command]
pub async fn skills_read(agent: AgentKind, id: String) -> Result<String, AppError> {
    skills::read(agent, &id)
}

#[tauri::command]
pub async fn skills_write(agent: AgentKind, id: String, content: String) -> Result<(), AppError> {
    skills::write(agent, &id, &content)
}

#[tauri::command]
pub async fn skills_set_mode(
    agent: AgentKind,
    id: String,
    mode: SkillMode,
) -> Result<(), AppError> {
    skills::set_mode(agent, &id, mode)
}

#[tauri::command]
pub async fn skills_trash(agent: AgentKind, id: String) -> Result<(), AppError> {
    skills::trash(agent, &id)
}

#[tauri::command]
pub async fn skills_reveal(agent: AgentKind, id: String) -> Result<(), AppError> {
    let file = skills::skill_file(agent, &id)?;
    tauri_plugin_opener::reveal_item_in_dir(file)
        .map_err(|error| std::io::Error::other(error.to_string()).into())
}
