use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::{AgentEvent, Driver, Outcome, ToolKind, TurnRequest, TurnStatus};

const OUTPUT_LIMIT: usize = 4000;

/// Claude Code en mode non interactif : `claude -p`, prompt sur stdin, sortie `stream-json`.
pub struct Claude {
    cwd: PathBuf,
    session_sent: bool,
    message_id: String,
    /// Messages dont le texte est arrivé en morceaux : leur copie complète ne doit pas le doubler.
    streamed: HashSet<String>,
    auth_failed: bool,
    outcome: Option<Outcome>,
}

impl Claude {
    pub fn new(cwd: &Path) -> Self {
        Self {
            cwd: cwd.to_owned(),
            session_sent: false,
            message_id: String::new(),
            streamed: HashSet::new(),
            auth_failed: false,
            outcome: None,
        }
    }

    fn stream_event(&mut self, event: &Value, events: &mut Vec<AgentEvent>) {
        match event["type"].as_str() {
            Some("message_start") => {
                self.message_id = str_of(&event["message"]["id"]).to_owned();
            }
            Some("content_block_start") if is_tool(&event["content_block"]) => {
                let name = str_of(&event["content_block"]["name"]);
                events.push(AgentEvent::Tool {
                    id: str_of(&event["content_block"]["id"]).to_owned(),
                    name: name.to_owned(),
                    kind: describe(name, &Value::Null, &self.cwd).0,
                    summary: None,
                });
            }
            Some("content_block_delta") if event["delta"]["type"] == "text_delta" => {
                self.streamed.insert(self.message_id.clone());
                events.push(AgentEvent::Text {
                    id: format!("{}:{}", self.message_id, event["index"]),
                    delta: str_of(&event["delta"]["text"]).to_owned(),
                });
            }
            _ => {}
        }
    }

    fn assistant(&mut self, line: &Value, events: &mut Vec<AgentEvent>) {
        // Message synthétique (pas connecté, quota...) : son texte est repris par le bilan.
        if let Some(error) = line["error"].as_str() {
            self.auth_failed = error == "authentication_failed";
            return;
        }
        let message = &line["message"];
        let id = str_of(&message["id"]);
        for (index, block) in message["content"]
            .as_array()
            .into_iter()
            .flatten()
            .enumerate()
        {
            if block["type"] == "text" && !self.streamed.contains(id) {
                events.push(AgentEvent::Text {
                    id: format!("{id}:{index}"),
                    delta: str_of(&block["text"]).to_owned(),
                });
            } else if is_tool(block) {
                let name = str_of(&block["name"]);
                let (kind, summary) = describe(name, &block["input"], &self.cwd);
                events.push(AgentEvent::Tool {
                    id: str_of(&block["id"]).to_owned(),
                    name: name.to_owned(),
                    kind,
                    summary,
                });
            }
        }
    }

    fn tool_results(&self, content: &Value, events: &mut Vec<AgentEvent>) {
        for block in content.as_array().into_iter().flatten() {
            if block["type"] != "tool_result" {
                continue;
            }
            events.push(AgentEvent::ToolResult {
                id: str_of(&block["tool_use_id"]).to_owned(),
                output: truncate(&text_of(&block["content"])),
                is_error: block["is_error"].as_bool().unwrap_or(false),
            });
        }
    }

    fn result(&mut self, line: &Value) {
        let failed = line["is_error"].as_bool().unwrap_or(false) || line["subtype"] != "success";
        let status = match (failed, self.auth_failed) {
            (false, _) => TurnStatus::Completed,
            (true, true) => TurnStatus::Unauthenticated,
            (true, false) => TurnStatus::Failed,
        };
        let error = failed.then(|| {
            let errors = text_of(&line["errors"]);
            [str_of(&line["result"]), &errors, str_of(&line["subtype"])]
                .into_iter()
                .find(|text| !text.is_empty())
                .unwrap_or_default()
                .to_owned()
        });
        let duration_ms = line["duration_ms"]
            .as_u64()
            .and_then(|ms| u32::try_from(ms).ok());
        self.outcome = Some(Outcome {
            status,
            error,
            duration_ms,
        });
    }
}

impl Driver for Claude {
    fn binary(&self) -> &'static str {
        "claude"
    }

    fn args(&self, request: &TurnRequest) -> Vec<String> {
        let mut args: Vec<String> = [
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
        ]
        .map(String::from)
        .into();
        if let Some(id) = &request.session_id {
            args.extend(["--resume".to_owned(), id.clone()]);
        }
        args
    }

    fn parse_line(&mut self, line: &str) -> Vec<AgentEvent> {
        let Ok(line) = serde_json::from_str::<Value>(line) else {
            return Vec::new();
        };
        // Les sous-agents ont leur propre flux : seul leur appel (outil Task) est affiché.
        if line["parent_tool_use_id"].is_string() {
            return Vec::new();
        }
        let mut events = Vec::new();
        match line["type"].as_str() {
            Some("system") if line["subtype"] == "init" && !self.session_sent => {
                if let Some(id) = line["session_id"].as_str() {
                    self.session_sent = true;
                    events.push(AgentEvent::Session { id: id.to_owned() });
                }
            }
            Some("stream_event") => self.stream_event(&line["event"], &mut events),
            Some("assistant") => self.assistant(&line, &mut events),
            Some("user") => self.tool_results(&line["message"]["content"], &mut events),
            Some("result") => self.result(&line),
            _ => {}
        }
        events
    }

    fn outcome(&self) -> Option<&Outcome> {
        self.outcome.as_ref()
    }
}

fn is_tool(block: &Value) -> bool {
    matches!(
        block["type"].as_str(),
        Some("tool_use" | "server_tool_use" | "mcp_tool_use")
    )
}

/// Famille d'outil (pour l'icône) et le paramètre qui le résume le mieux.
fn describe(name: &str, input: &Value, cwd: &Path) -> (ToolKind, Option<String>) {
    let field = |key: &str| input[key].as_str().filter(|text| !text.is_empty());
    let path = |key: &str| {
        field(key).map(|path| {
            Path::new(path)
                .strip_prefix(cwd)
                .map_or(path.to_owned(), |rel| rel.display().to_string())
        })
    };
    match name {
        "Read" => (ToolKind::Read, path("file_path")),
        "Write" | "Edit" | "MultiEdit" => (ToolKind::Edit, path("file_path")),
        "NotebookEdit" => (ToolKind::Edit, path("notebook_path")),
        "Bash" | "PowerShell" => (
            ToolKind::Command,
            field("command")
                .and_then(|cmd| cmd.lines().next())
                .map(str::to_owned),
        ),
        "Glob" | "Grep" => (ToolKind::Search, field("pattern").map(str::to_owned)),
        "WebFetch" => (ToolKind::Web, field("url").map(str::to_owned)),
        "WebSearch" => (ToolKind::Web, field("query").map(str::to_owned)),
        "Task" | "Agent" => (ToolKind::Agent, field("description").map(str::to_owned)),
        _ => (ToolKind::Other, None),
    }
}

fn str_of(value: &Value) -> &str {
    value.as_str().unwrap_or_default()
}

/// Contenu d'un résultat d'outil : une chaîne, ou une liste de blocs dont on garde le texte.
fn text_of(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| item.as_str().or_else(|| item["text"].as_str()))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn truncate(text: &str) -> String {
    match text.char_indices().nth(OUTPUT_LIMIT) {
        Some((end, _)) => format!("{}…", &text[..end]),
        None => text.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(lines: &[&str]) -> (Claude, Vec<AgentEvent>) {
        let mut claude = Claude::new(Path::new("/projet"));
        let events = lines
            .iter()
            .flat_map(|line| claude.parse_line(line))
            .collect();
        (claude, events)
    }

    #[test]
    fn streamed_text_is_not_repeated_by_the_snapshot() {
        let (_, events) = parse(&[
            r#"{"type":"system","subtype":"init","session_id":"s1"}"#,
            r#"{"type":"stream_event","event":{"type":"message_start","message":{"id":"m1"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Bon"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"jour"}}}"#,
            r#"{"type":"assistant","message":{"id":"m1","content":[{"type":"text","text":"Bonjour"}]}}"#,
        ]);
        assert_eq!(
            events,
            vec![
                AgentEvent::Session { id: "s1".into() },
                AgentEvent::Text {
                    id: "m1:0".into(),
                    delta: "Bon".into()
                },
                AgentEvent::Text {
                    id: "m1:0".into(),
                    delta: "jour".into()
                },
            ]
        );
    }

    #[test]
    fn tool_call_is_announced_then_completed() {
        let (claude, events) = parse(&[
            r#"{"type":"stream_event","event":{"type":"message_start","message":{"id":"m1"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"t1","name":"Read","input":{}}}}"#,
            r#"{"type":"assistant","message":{"id":"m1","content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/projet/src/a.txt"}}]}}"#,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"banane"}]}}"#,
            r#"{"type":"result","subtype":"success","is_error":false,"duration_ms":9631}"#,
        ]);
        assert_eq!(
            events,
            vec![
                AgentEvent::Tool {
                    id: "t1".into(),
                    name: "Read".into(),
                    kind: ToolKind::Read,
                    summary: None
                },
                AgentEvent::Tool {
                    id: "t1".into(),
                    name: "Read".into(),
                    kind: ToolKind::Read,
                    summary: Some("src/a.txt".into())
                },
                AgentEvent::ToolResult {
                    id: "t1".into(),
                    output: "banane".into(),
                    is_error: false
                },
            ]
        );
        assert_eq!(
            claude.outcome(),
            Some(&Outcome {
                status: TurnStatus::Completed,
                error: None,
                duration_ms: Some(9631)
            })
        );
    }

    #[test]
    fn missing_login_is_reported_as_such() {
        let (claude, events) = parse(&[
            r#"{"type":"assistant","error":"authentication_failed","message":{"id":"x","content":[{"type":"text","text":"Not logged in · Please run /login"}]}}"#,
            r#"{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}"#,
        ]);
        assert!(events.is_empty());
        let outcome = claude.outcome().cloned();
        assert_eq!(
            outcome.map(|o| (o.status, o.error)),
            Some((
                TurnStatus::Unauthenticated,
                Some("Not logged in · Please run /login".into())
            ))
        );
    }

    #[test]
    fn subagent_lines_are_ignored() {
        let (_, events) = parse(&[
            r#"{"type":"assistant","parent_tool_use_id":"t1","message":{"id":"m2","content":[{"type":"text","text":"interne"}]}}"#,
        ]);
        assert!(events.is_empty());
    }
}
