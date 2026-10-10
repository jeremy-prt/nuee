use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::{
    AgentEvent, Attached, Catalog, Driver, Effort, ModelInfo, PermissionMode, SessionSpec,
    ToolKind, TurnStatus,
};

const OUTPUT_LIMIT: usize = 4000;

/// Claude Code en mode non interactif gardé ouvert : messages et sortie en `stream-json`.
pub struct Claude {
    cwd: PathBuf,
    session_sent: bool,
    message_id: String,
    /// Messages dont le texte est arrivé en morceaux : leur copie complète ne doit pas le doubler.
    streamed: HashSet<String>,
    auth_failed: bool,
}

impl Claude {
    pub fn new(cwd: &Path) -> Self {
        Self {
            cwd: cwd.to_owned(),
            session_sent: false,
            message_id: String::new(),
            streamed: HashSet::new(),
            auth_failed: false,
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
            // Fin d'un message qui n'appelle pas d'outil : la réponse est là, le reste n'est que rangement.
            Some("message_delta")
                if event["delta"]["stop_reason"]
                    .as_str()
                    .is_some_and(|reason| reason != "tool_use" && reason != "pause_turn") =>
            {
                events.push(AgentEvent::Answered);
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

    fn approval(&self, line: &Value) -> AgentEvent {
        let request = &line["request"];
        let tool = str_of(&request["tool_name"]);
        let input = request["input"].clone();
        let (kind, summary) = describe(tool, &input, &self.cwd);
        let name = request["display_name"]
            .as_str()
            .filter(|name| !name.is_empty())
            .unwrap_or(tool);
        AgentEvent::Approval {
            id: str_of(&line["request_id"]).to_owned(),
            name: name.to_owned(),
            kind,
            detail: input["command"].as_str().map(str::to_owned).or(summary),
            description: request["description"]
                .as_str()
                .filter(|text| !text.is_empty())
                .map(str::to_owned),
            input,
        }
    }

    fn result(&mut self, line: &Value, events: &mut Vec<AgentEvent>) {
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
        events.push(AgentEvent::TurnEnd {
            status,
            error,
            duration_ms,
        });
        self.streamed.clear();
        self.auth_failed = false;
    }
}

impl Driver for Claude {
    fn binary(&self) -> &'static str {
        "claude"
    }

    fn catalog_probe(&self) -> (Vec<String>, String) {
        let args = [
            "-p",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--verbose",
            "--no-session-persistence",
            // Sans serveurs MCP : la réponse arrive sans attendre qu'ils démarrent.
            "--strict-mcp-config",
            "--mcp-config",
            r#"{"mcpServers":{}}"#,
        ];
        let request = r#"{"type":"control_request","request_id":"nuee-catalog","request":{"subtype":"initialize"}}"#;
        (args.map(String::from).into(), request.to_owned())
    }

    fn parse_catalog(&self, line: &str) -> Option<Catalog> {
        let line: Value = serde_json::from_str(line).ok()?;
        let response = &line["response"];
        if line["type"] != "control_response" || response["request_id"] != "nuee-catalog" {
            return None;
        }
        let rows = response["response"]["models"].as_array()?;
        // La ligne « default » ne sert qu'à dire lequel des vrais modèles est choisi par défaut.
        let default_target = rows
            .iter()
            .find(|row| row["value"] == "default")
            .map(|row| &row["resolvedModel"]);
        let models: Vec<ModelInfo> = rows
            .iter()
            .filter(|row| row["value"] != "default" && row["disabled"] != true)
            .map(|row| ModelInfo {
                value: str_of(&row["value"]).to_owned(),
                label: str_of(&row["displayName"]).to_owned(),
                description: str_of(&row["description"]).to_owned(),
                efforts: row["supportedEffortLevels"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|level| effort_of(level.as_str()?))
                    .collect(),
            })
            .filter(|model| !model.value.is_empty())
            .collect();
        let default_model = default_target.and_then(|target| {
            rows.iter()
                .find(|row| row["value"] != "default" && &row["resolvedModel"] == target)
                .map(|row| str_of(&row["value"]).to_owned())
        });
        Some(Catalog {
            models,
            default_model,
            default_effort: user_effort().unwrap_or(Effort::High),
        })
    }

    fn args(&self, spec: &SessionSpec) -> Vec<String> {
        let mut args: Vec<String> = [
            "-p",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            // Les demandes d'autorisation du mode Auto arrivent sur stdout et attendent la réponse de Nuée.
            "--permission-prompt-tool",
            "stdio",
        ]
        .map(String::from)
        .into();
        let options = &spec.options;
        // Le flag dédié plutôt que `--permission-mode bypassPermissions` : il ne dépend pas
        // d'une acceptation préalable du mode dans la config de l'utilisateur.
        match options.mode {
            PermissionMode::Bypass => args.push("--dangerously-skip-permissions".into()),
            PermissionMode::Auto => args.extend(["--permission-mode".into(), "auto".into()]),
        }
        if let Some(model) = &options.model {
            args.extend(["--model".into(), model.clone()]);
        }
        if let Some(effort) = options.effort {
            let level = match effort {
                Effort::Low => "low",
                Effort::Medium => "medium",
                Effort::High => "high",
                Effort::Xhigh => "xhigh",
                Effort::Max => "max",
            };
            args.extend(["--effort".into(), level.into()]);
        }
        if let Some(id) = &spec.session_id {
            args.extend(["--resume".to_owned(), id.clone()]);
        }
        args
    }

    fn user_message(&self, prompt: &str, attachments: &[Attached]) -> String {
        // Images d'abord, texte ensuite : une commande slash suivie d'une image n'est plus reconnue.
        let mut content: Vec<Value> = Vec::new();
        let mut references = Vec::new();
        for attached in attachments {
            match attached {
                Attached::Image {
                    path,
                    media_type,
                    base64,
                } => {
                    content.push(serde_json::json!({
                        "type": "image",
                        "source": { "type": "base64", "media_type": media_type, "data": base64 },
                    }));
                    // Le chemin sert si l'agent doit manipuler le fichier (le copier dans le projet...).
                    references.push(format!("[Image: {path}]"));
                }
                Attached::Path(path) => references.push(mention(path)),
            }
        }
        // Avant le message : une phrase en anglais à la fin ferait répondre Claude en anglais.
        let text = if references.is_empty() {
            prompt.to_owned()
        } else {
            format!("{}\n\n{prompt}", references.join("\n"))
        };
        let content = if content.is_empty() {
            Value::String(text)
        } else {
            if !text.trim().is_empty() {
                content.push(serde_json::json!({ "type": "text", "text": text }));
            }
            Value::Array(content)
        };
        serde_json::json!({
            "type": "user",
            "message": { "role": "user", "content": content },
            "parent_tool_use_id": null,
        })
        .to_string()
    }

    fn approval_message(&self, id: &str, input: &Value, allow: bool) -> String {
        let response = if allow {
            serde_json::json!({ "behavior": "allow", "updatedInput": input })
        } else {
            serde_json::json!({ "behavior": "deny", "message": "The user denied this action in Nuée." })
        };
        serde_json::json!({
            "type": "control_response",
            "response": { "subtype": "success", "request_id": id, "response": response },
        })
        .to_string()
    }

    fn interrupt_message(&self) -> String {
        r#"{"type":"control_request","request_id":"nuee-interrupt","request":{"subtype":"interrupt"}}"#.to_owned()
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
            Some("result") => self.result(&line, &mut events),
            Some("control_request") if line["request"]["subtype"] == "can_use_tool" => {
                events.push(self.approval(&line));
            }
            Some("control_cancel_request") => {
                events.push(AgentEvent::ApprovalCancelled {
                    id: str_of(&line["request_id"]).to_owned(),
                });
            }
            _ => {}
        }
        events
    }
}

/// `@"chemin"` : Claude Code lit lui-même le fichier (ou liste le dossier) avant de répondre.
/// Un guillemet dans le nom casserait la mention : l'agent reçoit alors le chemin seul.
fn mention(path: &str) -> String {
    if path.contains('"') {
        path.to_owned()
    } else {
        format!("@\"{path}\"")
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

fn effort_of(level: &str) -> Option<Effort> {
    match level {
        "low" => Some(Effort::Low),
        "medium" => Some(Effort::Medium),
        "high" => Some(Effort::High),
        "xhigh" => Some(Effort::Xhigh),
        "max" => Some(Effort::Max),
        _ => None,
    }
}

/// Effort réglé dans la config Claude de l'utilisateur : Nuée l'affiche comme valeur de départ.
fn user_effort() -> Option<Effort> {
    let dir = std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::home_dir().map(|home| home.join(".claude")))?;
    let settings: Value =
        serde_json::from_str(&std::fs::read_to_string(dir.join("settings.json")).ok()?).ok()?;
    effort_of(settings["effortLevel"].as_str()?)
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
        let (_, events) = parse(&[
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
                AgentEvent::TurnEnd {
                    status: TurnStatus::Completed,
                    error: None,
                    duration_ms: Some(9631)
                },
            ]
        );
    }

    #[test]
    fn the_answer_is_complete_before_the_agent_closes_its_turn() {
        let (_, events) = parse(&[
            r#"{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"tool_use"}}}"#,
            r#"{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"}}}"#,
        ]);
        assert_eq!(events, vec![AgentEvent::Answered]);
    }

    #[test]
    fn missing_login_is_reported_as_such() {
        let (_, events) = parse(&[
            r#"{"type":"assistant","error":"authentication_failed","message":{"id":"x","content":[{"type":"text","text":"Not logged in · Please run /login"}]}}"#,
            r#"{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}"#,
        ]);
        assert_eq!(
            events,
            vec![AgentEvent::TurnEnd {
                status: TurnStatus::Unauthenticated,
                error: Some("Not logged in · Please run /login".into()),
                duration_ms: None
            }]
        );
    }

    #[test]
    fn options_become_cli_flags() {
        let request = SessionSpec {
            chat_id: "c".into(),
            agent: super::super::AgentKind::Claude,
            cwd: Some("/projet".into()),
            session_id: Some("s1".into()),
            options: super::super::TurnOptions {
                mode: PermissionMode::Auto,
                model: Some("opus".into()),
                effort: Some(Effort::Xhigh),
            },
        };
        let args = Claude::new(Path::new("/projet")).args(&request);
        let tail: Vec<&str> = args.iter().skip(9).map(String::as_str).collect();
        assert_eq!(
            tail,
            [
                "--permission-mode",
                "auto",
                "--model",
                "opus",
                "--effort",
                "xhigh",
                "--resume",
                "s1"
            ]
        );
    }

    #[test]
    fn catalog_hides_the_default_row_but_remembers_its_target() {
        let line = r#"{"type":"control_response","response":{"subtype":"success","request_id":"nuee-catalog","response":{"models":[
            {"value":"default","resolvedModel":"claude-opus-5-5","displayName":"Default (recommended)"},
            {"value":"opus","resolvedModel":"claude-opus-5-5","displayName":"Opus 5.5","description":"Complexe","supportedEffortLevels":["low","high","xhigh"]},
            {"value":"claude-haiku-4-5","resolvedModel":"claude-haiku-4-5","displayName":"Haiku 4.5","description":"Rapide"}
        ]}}}"#;
        let catalog = Claude::new(Path::new("/"))
            .parse_catalog(&line.replace('\n', ""))
            .expect("catalogue");
        assert_eq!(catalog.default_model.as_deref(), Some("opus"));
        let labels: Vec<&str> = catalog
            .models
            .iter()
            .map(|model| model.label.as_str())
            .collect();
        assert_eq!(labels, ["Opus 5.5", "Haiku 4.5"]);
        assert_eq!(
            catalog.models[0].efforts,
            [Effort::Low, Effort::High, Effort::Xhigh]
        );
        assert!(catalog.models[1].efforts.is_empty());
    }

    #[test]
    fn a_permission_request_becomes_an_approval_and_its_answer_keeps_the_input() {
        let (claude, events) = parse(&[
            r#"{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool","tool_name":"Bash","display_name":"Bash","input":{"command":"rm -rf /tmp/x"},"description":"Delete x"}}"#,
        ]);
        let [
            AgentEvent::Approval {
                id,
                detail,
                description,
                input,
                ..
            },
        ] = events.as_slice()
        else {
            panic!("une demande attendue : {events:?}");
        };
        assert_eq!(
            (id.as_str(), detail.as_deref(), description.as_deref()),
            ("r1", Some("rm -rf /tmp/x"), Some("Delete x"))
        );
        let answer: Value =
            serde_json::from_str(&claude.approval_message(id, input, true)).expect("json");
        assert_eq!(answer["response"]["request_id"], "r1");
        assert_eq!(
            answer["response"]["response"]["updatedInput"]["command"],
            "rm -rf /tmp/x"
        );
    }

    #[test]
    fn attachments_come_before_the_text() {
        let message = Claude::new(Path::new("/projet")).user_message(
            "Et ça ?",
            &[
                Attached::Image {
                    path: "/a/capture.png".into(),
                    media_type: "image/png",
                    base64: "iVBO".into(),
                },
                Attached::Path("/a/mon fichier.txt".into()),
            ],
        );
        let message: Value = serde_json::from_str(&message).expect("json");
        let content = &message["message"]["content"];
        assert_eq!(content[0]["source"]["media_type"], "image/png");
        assert_eq!(
            content[1]["text"],
            "[Image: /a/capture.png]\n@\"/a/mon fichier.txt\"\n\nEt ça ?"
        );
    }

    #[test]
    fn a_message_without_image_stays_plain_text() {
        let message = Claude::new(Path::new("/")).user_message("Salut", &[]);
        let message: Value = serde_json::from_str(&message).expect("json");
        assert_eq!(message["message"]["content"], "Salut");
    }

    #[test]
    fn subagent_lines_are_ignored() {
        let (_, events) = parse(&[
            r#"{"type":"assistant","parent_tool_use_id":"t1","message":{"id":"m2","content":[{"type":"text","text":"interne"}]}}"#,
        ]);
        assert!(events.is_empty());
    }
}
