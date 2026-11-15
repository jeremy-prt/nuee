use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::fs::File;
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::AgentKind;

const STEP_MIN: i64 = 60_000;
const PRICES_URL: &str =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const PRICES_MAX_AGE: Duration = Duration::from_secs(24 * 3600);
/// Taux de la BCE, publiés une fois par jour ouvré.
const RATES_URL: &str = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,BRL,JPY,CNY";
/// Monnaies des langues de l'interface ; le dollar n'a pas besoin de taux.
pub const CURRENCIES: &[&str] = &["EUR", "BRL", "JPY", "CNY"];

/// Tokens d'un modèle sur un pas de temps, avec leur prix au tarif de l'API.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UsageBucket {
    /// Début du pas, en millisecondes depuis 1970.
    #[ts(type = "number")]
    pub at: i64,
    pub model: String,
    #[ts(type = "number")]
    pub input: u64,
    #[ts(type = "number")]
    pub output: u64,
    #[ts(type = "number")]
    pub cache_read: u64,
    #[ts(type = "number")]
    pub cache_write: u64,
    /// En dollars. `None` : modèle absent de la grille de prix.
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
struct Tokens {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
    cache_write_1h: u64,
}

impl Tokens {
    fn max(self, other: Self) -> Self {
        Self {
            input: self.input.max(other.input),
            output: self.output.max(other.output),
            cache_read: self.cache_read.max(other.cache_read),
            cache_write: self.cache_write.max(other.cache_write),
            cache_write_1h: self.cache_write_1h.max(other.cache_write_1h),
        }
    }

    fn add(&mut self, other: Self) {
        self.input += other.input;
        self.output += other.output;
        self.cache_read += other.cache_read;
        self.cache_write += other.cache_write;
        self.cache_write_1h += other.cache_write_1h;
    }
}

#[derive(Debug, Clone)]
struct Record {
    key: u64,
    at: i64,
    model: Arc<str>,
    tokens: Tokens,
}

/// Fichier déjà lu jusqu'à `offset` : un transcript ne fait que grandir, la suite seule est relue.
struct Scan {
    len: u64,
    modified: SystemTime,
    offset: u64,
    records: Vec<Record>,
}

/// Prix par token, comme la grille LiteLLM.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Price {
    input: f64,
    output: f64,
    cache_read: f64,
    cache_write: f64,
    cache_write_1h: f64,
}

impl Price {
    fn cost(&self, tokens: &Tokens) -> f64 {
        let short = tokens.cache_write.saturating_sub(tokens.cache_write_1h);
        tokens.input as f64 * self.input
            + tokens.output as f64 * self.output
            + tokens.cache_read as f64 * self.cache_read
            + short as f64 * self.cache_write
            + tokens.cache_write_1h as f64 * self.cache_write_1h
    }
}

/// Repli hors ligne, relevé dans LiteLLM le 15/11/2026.
const BUILTIN_PRICES: &[(&str, [f64; 5])] = &[
    ("claude-fable-5-2", [8e-6, 4e-5, 2e-7, 1e-5, 1.6e-5]),
    ("claude-opus-5-5", [4e-6, 2e-5, 2e-7, 5e-6, 8e-6]),
    ("claude-sonnet-5-5", [2e-6, 1e-5, 1e-7, 2.5e-6, 4e-6]),
    ("claude-haiku-5-5", [1e-7, 5e-7, 1e-8, 1.25e-7, 2e-7]),
    ("claude-opus-4-5", [5e-6, 2.5e-5, 5e-7, 6.25e-6, 1e-5]),
    ("claude-sonnet-4-5", [3e-6, 1.5e-5, 3e-7, 3.75e-6, 6e-6]),
    ("claude-haiku-4-5", [1e-6, 5e-6, 1e-7, 1.25e-6, 2e-6]),
];

/// Relevé d'une limite (sonde ou message d'un tour) : la courbe de rythme passe par ces points mesurés.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct QuotaSample {
    #[ts(type = "number")]
    pub at: i64,
    /// `session`, `weekly` ou `weekly-<modèle>`.
    pub window: String,
    /// De 0 à 1.
    pub used: f64,
    #[ts(type = "number | null")]
    pub resets_at: Option<i64>,
}

/// Relevés gardés un mois : la plus longue fenêtre dure une semaine.
const SAMPLES_KEPT: i64 = 30 * 24 * 3_600_000;
const SAMPLE_REPEAT: i64 = 30 * 60_000;

/// Historique de consommation lu dans les transcripts de Claude Code (`<config>/projects/**/*.jsonl`).
pub struct UsageService {
    scans: Mutex<HashMap<PathBuf, Scan>>,
    prices: Mutex<Option<(SystemTime, HashMap<String, Price>)>>,
    prices_file: PathBuf,
    rates_file: PathBuf,
    db: Mutex<Connection>,
}

impl UsageService {
    /// Relevés dans `nuee.db`, sur leur propre connexion et leur propre table, comme les notes.
    pub fn open(data: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(data)?;
        let db = Connection::open(data.join("nuee.db"))?;
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS quota_samples (
                at INTEGER NOT NULL,
                window TEXT NOT NULL,
                used REAL NOT NULL,
                resets_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS quota_samples_at ON quota_samples (at)",
        )?;
        Ok(Self {
            scans: Mutex::new(HashMap::new()),
            prices: Mutex::new(None),
            prices_file: data.join("usage-prices.json"),
            rates_file: data.join("usage-rates.json"),
            db: Mutex::new(db),
        })
    }

    /// Un relevé identique au précédent de la même fenêtre n'apprend rien, sauf l'heure : il est gardé toutes les
    /// 30 minutes, pour que la page dise de quand date la valeur affichée.
    pub fn record(&self, sample: &QuotaSample) -> Result<(), AppError> {
        if !(0.0..=1.0).contains(&sample.used)
            || sample.window.is_empty()
            || sample.window.len() > 64
        {
            return Err(AppError::InvalidInput("relevé de quota invalide".into()));
        }
        let db = self.db.lock().unwrap_or_else(|poison| poison.into_inner());
        let last: Option<(f64, i64)> = db
            .query_row(
                "SELECT used, at FROM quota_samples WHERE window = ?1 ORDER BY at DESC LIMIT 1",
                params![sample.window],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        if last.is_some_and(|(used, at)| {
            (used - sample.used).abs() < 0.001 && sample.at - at < SAMPLE_REPEAT
        }) {
            return Ok(());
        }
        db.execute(
            "INSERT INTO quota_samples (at, window, used, resets_at) VALUES (?1, ?2, ?3, ?4)",
            params![sample.at, sample.window, sample.used, sample.resets_at],
        )?;
        db.execute(
            "DELETE FROM quota_samples WHERE at < ?1",
            params![sample.at - SAMPLES_KEPT],
        )?;
        Ok(())
    }

    pub fn samples(&self, since: i64) -> Result<Vec<QuotaSample>, AppError> {
        let db = self.db.lock().unwrap_or_else(|poison| poison.into_inner());
        let mut query = db.prepare(
            "SELECT at, window, used, resets_at FROM quota_samples WHERE at >= ?1 ORDER BY at",
        )?;
        let rows = query.query_map(params![since], |row| {
            Ok(QuotaSample {
                at: row.get(0)?,
                window: row.get(1)?,
                used: row.get(2)?,
                resets_at: row.get(3)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Dollars convertis en `currency`, au taux du jour gardé un jour ; hors ligne, le dernier connu.
    pub fn rate(&self, currency: &str) -> Option<f64> {
        if !CURRENCIES.contains(&currency) {
            return None;
        }
        let fresh = std::fs::metadata(&self.rates_file)
            .and_then(|meta| meta.modified())
            .is_ok_and(|at| at.elapsed().is_ok_and(|age| age < PRICES_MAX_AGE));
        if !fresh
            && let Some(body) = download(RATES_URL, 64 * 1024)
            && rate_of(&body, currency).is_some()
        {
            let _ = std::fs::write(&self.rates_file, &body);
        }
        rate_of(&std::fs::read_to_string(&self.rates_file).ok()?, currency)
    }

    /// Consommation depuis `since` (ms), par pas de `step` ms et par modèle.
    pub fn history(&self, since: i64, step: i64) -> Result<Vec<UsageBucket>, AppError> {
        if step < STEP_MIN {
            return Err(AppError::InvalidInput(format!(
                "pas trop court : {step} ms"
            )));
        }
        let Some(root) = AgentKind::Claude.transcripts_dir() else {
            return Ok(Vec::new());
        };
        let mut files = Vec::new();
        collect(&root, &mut files);
        let floor = UNIX_EPOCH + Duration::from_millis(since.max(0) as u64);

        let mut scans = self
            .scans
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        let mut unique: HashMap<u64, Record> = HashMap::new();
        for (path, meta) in files {
            let modified = meta.modified().unwrap_or(UNIX_EPOCH);
            // Un fichier pas touché depuis `since` n'a rien de plus récent.
            if modified < floor {
                continue;
            }
            let scan = scans.entry(path.clone()).or_insert_with(|| Scan {
                len: 0,
                modified: UNIX_EPOCH,
                offset: 0,
                records: Vec::new(),
            });
            if scan.len != meta.len() || scan.modified != modified {
                if meta.len() < scan.offset {
                    scan.offset = 0;
                    scan.records.clear();
                }
                if let Err(error) = read_from(&path, scan) {
                    eprintln!("utilisation, {} : {error}", path.display());
                }
                scan.len = meta.len();
                scan.modified = modified;
            }
            // Une session reprise ou forkée recopie les messages d'avant : chaque message ne compte qu'une fois.
            for record in scan.records.iter().filter(|record| record.at >= since) {
                unique
                    .entry(record.key)
                    .and_modify(|seen| seen.tokens = seen.tokens.max(record.tokens))
                    .or_insert_with(|| record.clone());
            }
        }
        drop(scans);

        let prices = self.prices();
        let mut buckets: HashMap<(i64, Arc<str>), Tokens> = HashMap::new();
        for record in unique.into_values() {
            buckets
                .entry((record.at - record.at.rem_euclid(step), record.model))
                .or_default()
                .add(record.tokens);
        }
        let mut list: Vec<UsageBucket> = buckets
            .into_iter()
            .map(|((at, model), tokens)| UsageBucket {
                at,
                cost: price_of(&prices, &model).map(|price| price.cost(&tokens)),
                model: model.to_string(),
                input: tokens.input,
                output: tokens.output,
                cache_read: tokens.cache_read,
                cache_write: tokens.cache_write,
            })
            .collect();
        list.sort_by(|a, b| a.at.cmp(&b.at).then_with(|| a.model.cmp(&b.model)));
        Ok(list)
    }

    /// Grille LiteLLM gardée un jour dans le dossier de l'app ; sans réseau, la dernière connue ou celle intégrée.
    fn prices(&self) -> HashMap<String, Price> {
        let mut cached = self
            .prices
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        let fresh = |at: SystemTime| at.elapsed().is_ok_and(|age| age < PRICES_MAX_AGE);
        if let Some((at, prices)) = cached.as_ref()
            && fresh(*at)
        {
            return prices.clone();
        }
        let on_disk = std::fs::metadata(&self.prices_file)
            .and_then(|meta| meta.modified())
            .ok();
        let mut prices = None;
        if !on_disk.is_some_and(fresh)
            && let Some(body) = download(PRICES_URL, 64 * 1024 * 1024)
        {
            let parsed = parse_prices(&body);
            if !parsed.is_empty() {
                let kept: serde_json::Map<String, Value> = parsed
                    .iter()
                    .map(|(name, price)| (name.clone(), price_json(price)))
                    .collect();
                let _ = std::fs::write(&self.prices_file, Value::Object(kept).to_string());
                prices = Some(parsed);
            }
        }
        let prices = prices
            .or_else(|| {
                std::fs::read_to_string(&self.prices_file)
                    .ok()
                    .map(|body| parse_prices(&body))
                    .filter(|parsed| !parsed.is_empty())
            })
            .unwrap_or_default();
        *cached = Some((SystemTime::now(), prices.clone()));
        prices
    }
}

fn collect(dir: &Path, files: &mut Vec<(PathBuf, std::fs::Metadata)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            collect(&path, files);
        } else if path.extension().is_some_and(|ext| ext == "jsonl") {
            files.push((path, meta));
        }
    }
}

fn read_from(path: &Path, scan: &mut Scan) -> std::io::Result<()> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(scan.offset))?;
    let mut reader = BufReader::new(file);
    let mut line = Vec::new();
    loop {
        line.clear();
        let read = reader.read_until(b'\n', &mut line)?;
        // Ligne en cours d'écriture : relue en entier la prochaine fois.
        if read == 0 || line.last() != Some(&b'\n') {
            return Ok(());
        }
        scan.offset += read as u64;
        if let Some(record) = record_of(&line) {
            scan.records.push(record);
        }
    }
}

#[derive(Deserialize)]
struct Line {
    #[serde(rename = "type")]
    kind: String,
    timestamp: Option<String>,
    #[serde(rename = "requestId")]
    request_id: Option<String>,
    uuid: Option<String>,
    message: Option<Message>,
}

#[derive(Deserialize)]
struct Message {
    id: Option<String>,
    model: Option<String>,
    usage: Option<Value>,
}

fn record_of(line: &[u8]) -> Option<Record> {
    // Le gros des lignes (résultats d'outils, messages de l'utilisateur) n'est pas décodé.
    let text = std::str::from_utf8(line).ok()?;
    if !text.contains("\"type\":\"assistant\"") || !text.contains("\"usage\"") {
        return None;
    }
    let line: Line = serde_json::from_str(text).ok()?;
    if line.kind != "assistant" {
        return None;
    }
    let message = line.message?;
    let model = message.model.filter(|model| model != "<synthetic>")?;
    let usage = message.usage?;
    let count = |value: &Value| value.as_u64().unwrap_or(0);
    let tokens = Tokens {
        input: count(&usage["input_tokens"]),
        output: count(&usage["output_tokens"]),
        cache_read: count(&usage["cache_read_input_tokens"]),
        cache_write: count(&usage["cache_creation_input_tokens"]),
        cache_write_1h: count(&usage["cache_creation"]["ephemeral_1h_input_tokens"]),
    };
    let at = chrono::DateTime::parse_from_rfc3339(line.timestamp.as_deref()?)
        .ok()?
        .timestamp_millis();
    let mut hasher = DefaultHasher::new();
    match (&message.id, &line.request_id) {
        (Some(id), request) => (id, request).hash(&mut hasher),
        (None, _) => line.uuid?.hash(&mut hasher),
    }
    Some(Record {
        key: hasher.finish(),
        at,
        model: Arc::from(model.trim_end_matches("[1m]")),
        tokens,
    })
}

fn rate_of(body: &str, currency: &str) -> Option<f64> {
    let rates: Value = serde_json::from_str(body).ok()?;
    rates["rates"][currency].as_f64().filter(|rate| *rate > 0.0)
}

fn download(url: &str, limit: u64) -> Option<String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(15)))
        .build()
        .into();
    agent
        .get(url)
        .header("User-Agent", "Nuee")
        .call()
        .ok()?
        .body_mut()
        .with_config()
        .limit(limit)
        .read_to_string()
        .ok()
}

/// Seules les entrées `claude-*` de l'API Anthropic (sans préfixe de fournisseur ni de région) sont gardées.
fn parse_prices(body: &str) -> HashMap<String, Price> {
    let Ok(Value::Object(table)) = serde_json::from_str::<Value>(body) else {
        return HashMap::new();
    };
    table
        .into_iter()
        .filter(|(name, _)| name.starts_with("claude-") && !name.contains(['/', '.', '@']))
        .filter_map(|(name, entry)| {
            let rate = |key: &str| entry[key].as_f64();
            let input = rate("input_cost_per_token")?;
            let cache_write = rate("cache_creation_input_token_cost").unwrap_or(input * 1.25);
            Some((
                name,
                Price {
                    input,
                    output: rate("output_cost_per_token")?,
                    cache_read: rate("cache_read_input_token_cost").unwrap_or(input * 0.1),
                    cache_write,
                    cache_write_1h: rate("cache_creation_input_token_cost_above_1hr")
                        .unwrap_or(input * 2.0),
                },
            ))
        })
        .collect()
}

fn price_json(price: &Price) -> Value {
    serde_json::json!({
        "input_cost_per_token": price.input,
        "output_cost_per_token": price.output,
        "cache_read_input_token_cost": price.cache_read,
        "cache_creation_input_token_cost": price.cache_write,
        "cache_creation_input_token_cost_above_1hr": price.cache_write_1h,
    })
}

/// Nom exact, puis sans la date de version (`claude-haiku-4-5-20251001`), puis la grille intégrée.
fn price_of(prices: &HashMap<String, Price>, model: &str) -> Option<Price> {
    let undated = model
        .rsplit_once('-')
        .filter(|(_, date)| date.len() == 8 && date.bytes().all(|b| b.is_ascii_digit()))
        .map(|(name, _)| name);
    let builtin = |name: &str| {
        BUILTIN_PRICES.iter().find(|(known, _)| *known == name).map(
            |(_, [input, output, cache_read, cache_write, cache_write_1h])| Price {
                input: *input,
                output: *output,
                cache_read: *cache_read,
                cache_write: *cache_write,
                cache_write_1h: *cache_write_1h,
            },
        )
    };
    prices
        .get(model)
        .copied()
        .or_else(|| undated.and_then(|name| prices.get(name).copied()))
        .or_else(|| builtin(model))
        .or_else(|| undated.and_then(builtin))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LINE: &str = r#"{"type":"assistant","timestamp":"2026-11-15T10:20:00.000Z","requestId":"req_1","uuid":"u1","message":{"id":"msg_1","model":"claude-opus-5-5","usage":{"input_tokens":2,"cache_creation_input_tokens":100,"cache_read_input_tokens":1000,"output_tokens":50,"cache_creation":{"ephemeral_1h_input_tokens":100,"ephemeral_5m_input_tokens":0}}}}"#;

    #[test]
    fn reads_assistant_usage() {
        let record = record_of(LINE.as_bytes()).unwrap();
        assert_eq!(&*record.model, "claude-opus-5-5");
        assert_eq!(record.tokens.cache_write_1h, 100);
        assert_eq!(record.tokens.output, 50);
        assert!(record_of(br#"{"type":"user","message":{"usage":{}}}"#).is_none());
    }

    #[test]
    fn skips_synthetic_messages() {
        let line = LINE.replace("claude-opus-5-5", "<synthetic>");
        assert!(record_of(line.as_bytes()).is_none());
    }

    #[test]
    fn prices_dated_and_builtin_models() {
        let prices = HashMap::new();
        assert!(price_of(&prices, "claude-haiku-4-5-20251001").is_some());
        assert!(price_of(&prices, "opus").is_none());
        let opus = price_of(&prices, "claude-opus-5-5").unwrap();
        let tokens = Tokens {
            input: 1_000_000,
            output: 1_000_000,
            ..Tokens::default()
        };
        assert!((opus.cost(&tokens) - 24.0).abs() < 1e-9);
    }

    #[test]
    fn keeps_only_changed_samples() {
        let dir = std::env::temp_dir().join(format!("nuee-usage-{}", std::process::id()));
        let service = UsageService::open(&dir).unwrap();
        let sample = |at, used| QuotaSample {
            at,
            window: "weekly".into(),
            used,
            resets_at: Some(10),
        };
        service.record(&sample(1, 0.2)).unwrap();
        service.record(&sample(2, 0.2)).unwrap();
        service.record(&sample(3, 0.3)).unwrap();
        assert!(service.record(&sample(4, 1.5)).is_err());
        let kept: Vec<i64> = service
            .samples(0)
            .unwrap()
            .iter()
            .map(|sample| sample.at)
            .collect();
        assert_eq!(kept, vec![1, 3]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_rate() {
        let body = r#"{"base":"USD","rates":{"EUR":0.9,"JPY":160.0}}"#;
        assert_eq!(rate_of(body, "EUR"), Some(0.9));
        assert_eq!(rate_of(body, "BRL"), None);
    }

    #[test]
    fn keeps_only_anthropic_entries() {
        let body = r#"{"claude-opus-5-5":{"input_cost_per_token":4e-6,"output_cost_per_token":2e-5},"anthropic.claude-opus-5-5":{"input_cost_per_token":1,"output_cost_per_token":1},"gpt-5":{"input_cost_per_token":1,"output_cost_per_token":1}}"#;
        let prices = parse_prices(body);
        assert_eq!(prices.len(), 1);
        assert!((prices["claude-opus-5-5"].cache_read - 4e-7).abs() < 1e-12);
    }
}
