use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, Process, ProcessRefreshKind, ProcessesToUpdate, Signal, System, UpdateKind};
use ts_rs::TS;

/// Posée sur chaque process lancé par Nuée (agents, serveurs, terminaux) et héritée par leurs enfants : un reste
/// garde la marque après la mort de son parent (même idée que monocode). macOS 27 cache l'environnement des autres
/// process : là, le registre de parenté (`Ledger`) et le process responsable prennent le relais.
pub const MARKER: &str = "NUEE_PARENT";
/// Instances de Nuée gardées dans le registre : de quoi reconnaître les restes d'un lancement planté.
const APPS_KEPT: usize = 8;

/// Laissé aux process pour se ranger après SIGTERM avant de les compter comme « n'ont pas répondu ».
const GRACE: Duration = Duration::from_secs(5);

pub fn marker_value() -> String {
    std::process::id().to_string()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum CleanupGroup {
    App,
    Agents,
    Servers,
    Terminals,
    Leftovers,
    /// Processus de développement orphelins lancés hors de Nuée (terminal, éditeur, autre agent).
    Others,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CleanupProcess {
    pub pid: u32,
    #[ts(type = "number")]
    pub memory: u64,
    pub group: CleanupGroup,
    /// Agent sans tour ni tâche en cours : le nettoyage l'arrête, le prochain message le relance.
    pub idle: bool,
    /// Process de tête d'un agent, d'un serveur ou d'un terminal (les autres sont ses enfants).
    pub head: bool,
}

#[derive(Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CleanupScan {
    pub processes: Vec<CleanupProcess>,
    #[ts(type = "number")]
    pub total_memory: u64,
    #[ts(type = "number")]
    pub used_memory: u64,
}

#[derive(Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CleanupReport {
    pub stopped: u32,
    #[ts(type = "number")]
    pub freed: u64,
    /// Toujours là après le délai : « Forcer l'arrêt » les vise.
    pub remaining: u32,
    /// Programme et dossier de chacun d'eux, pour savoir ce qu'on force.
    pub left: Vec<String>,
}

/// Process que Nuée suit en ce moment, par PID de tête.
#[derive(Default)]
pub struct Roots {
    pub app: u32,
    /// Autres instances de Nuée encore ouvertes (app empaquetée et `tauri dev`) : leurs process ne sont pas à nous.
    pub others: HashSet<u32>,
    /// Agent et s'il est au repos.
    pub agents: HashMap<u32, bool>,
    pub servers: HashSet<u32>,
    pub terminals: HashSet<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Class {
    group: CleanupGroup,
    idle: bool,
    guessed: bool,
}

/// Ce que le classement lit d'un process : de quoi tester sans vrais process.
struct Row {
    /// Nom du programme en minuscules.
    name: String,
    parent: Option<u32>,
    start: u64,
    marker: Option<u32>,
    /// Vu descendre d'un process suivi (registre), ou dont une instance de Nuée est responsable (macOS).
    known: bool,
    cwd: Option<PathBuf>,
    exe: Option<PathBuf>,
    /// macOS : le process responsable, hérité des enfants (les process WebKit de la fenêtre ont launchd pour parent).
    responsible: Option<u32>,
}

/// PID et date de départ : un PID seul peut avoir été repris par un autre process.
type Stamp = (u32, u64);

/// Gardé sur disque (`cleanup.json`) pour survivre à un plantage de Nuée.
#[derive(Default, Serialize, Deserialize)]
struct Ledger {
    apps: Vec<Stamp>,
    seen: HashSet<Stamp>,
}

#[derive(Clone)]
struct Target {
    pid: Pid,
    start: u64,
    memory: u64,
    label: String,
}

pub struct CleanupService {
    system: Mutex<Option<System>>,
    survivors: Mutex<Vec<Target>>,
    ledger: Mutex<Ledger>,
    file: PathBuf,
    me: Stamp,
}

impl CleanupService {
    pub fn new(data: &Path) -> Self {
        let file = data.join("cleanup.json");
        let mut ledger: Ledger = fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let pid = std::process::id();
        let start = System::new()
            .ok()
            .and_then(|mut system| {
                let me = Pid::from_u32(pid);
                system.refresh_processes(ProcessesToUpdate::Some(&[me]), false);
                system.process(me).map(Process::start_time)
            })
            .unwrap_or_default();
        ledger.apps.push((pid, start));
        let excess = ledger.apps.len().saturating_sub(APPS_KEPT);
        ledger.apps.drain(..excess);
        Self {
            system: Mutex::default(),
            survivors: Mutex::default(),
            ledger: Mutex::new(ledger),
            file,
            me: (pid, start),
        }
    }

    /// Relevé de fond (toutes les 15 s, `lib.rs`) : note la parenté même quand l'écran Nettoyage est fermé.
    pub fn observe(&self, roots: &mut Roots) {
        let mut guard = lock(&self.system);
        if let Some(system) = refreshed(&mut guard) {
            self.classify(system, roots, &[]);
        }
    }

    /// Classe, puis met à jour le registre : descendants des process suivis notés, morts oubliés.
    fn classify(
        &self,
        system: &System,
        roots: &mut Roots,
        folders: &[PathBuf],
    ) -> HashMap<u32, Class> {
        let mut ledger = lock(&self.ledger);
        let mut rows = rows(system);
        let owners = owners(&ledger.apps, self.me, &rows, roots);
        for (&pid, row) in &mut rows {
            row.known = ledger.seen.contains(&(pid, row.start))
                || row.responsible.is_some_and(|owner| {
                    owners
                        .iter()
                        .any(|(app, since)| *app == owner && row.start >= *since)
                });
        }
        let classes = classify(&rows, roots, folders);
        let before = ledger.seen.len();
        ledger
            .seen
            .retain(|(pid, start)| rows.get(pid).is_some_and(|row| row.start == *start));
        let mut changed = ledger.seen.len() != before;
        for (pid, class) in &classes {
            let tracked = matches!(
                class.group,
                CleanupGroup::Agents | CleanupGroup::Servers | CleanupGroup::Terminals
            ) || (class.group == CleanupGroup::Leftovers && !class.guessed);
            if tracked {
                changed |= ledger.seen.insert((*pid, rows[pid].start));
            }
        }
        if changed && let Ok(bytes) = serde_json::to_vec(&*ledger) {
            let _ = fs::write(&self.file, bytes);
        }
        classes
    }

    pub fn scan(&self, roots: &mut Roots, folders: &[PathBuf]) -> CleanupScan {
        let mut guard = lock(&self.system);
        let Some(system) = refreshed(&mut guard) else {
            return CleanupScan::default();
        };
        let classes = self.classify(system, roots, folders);
        let processes = classes
            .iter()
            .filter_map(|(pid, class)| {
                let process = system.process(Pid::from_u32(*pid))?;
                let head = roots.agents.contains_key(pid)
                    || roots.servers.contains(pid)
                    || roots.terminals.contains(pid);
                Some(describe(*pid, process, *class, head))
            })
            .collect();
        CleanupScan {
            processes,
            total_memory: system.total_memory(),
            used_memory: system.used_memory(),
        }
    }

    /// Process des groupes choisis, relevés juste avant l'arrêt, avec s'il faut leur envoyer le signal : la tête
    /// d'un agent ou d'un serveur passe par son service (`AgentService::retire_idle`, `ServerService::stop_everything`).
    pub fn targets(
        &self,
        roots: &mut Roots,
        folders: &[PathBuf],
        groups: &[CleanupGroup],
    ) -> Vec<(u32, bool)> {
        let mut guard = lock(&self.system);
        let Some(system) = refreshed(&mut guard) else {
            return Vec::new();
        };
        self.classify(system, roots, folders)
            .into_iter()
            .filter(|(_, class)| {
                groups.contains(&class.group)
                    && match class.group {
                        CleanupGroup::Leftovers | CleanupGroup::Servers | CleanupGroup::Others => {
                            true
                        }
                        CleanupGroup::Agents => class.idle,
                        CleanupGroup::App | CleanupGroup::Terminals => false,
                    }
            })
            .map(|(pid, _)| {
                let led = roots.agents.contains_key(&pid) || roots.servers.contains(&pid);
                (pid, !led)
            })
            .collect()
    }

    /// SIGTERM, jamais SIGKILL d'office : ce qui reste après le délai est compté et attend « Forcer l'arrêt ».
    pub async fn stop(&self, pids: &[(u32, bool)]) -> CleanupReport {
        let targets: Vec<Target> = {
            let guard = lock(&self.system);
            let Some(system) = guard.as_ref() else {
                return CleanupReport::default();
            };
            pids.iter()
                .filter_map(|(pid, send)| {
                    let process = system.process(Pid::from_u32(*pid))?;
                    if *send {
                        signal(process, false);
                    }
                    Some(Target {
                        pid: process.pid(),
                        start: process.start_time(),
                        memory: footprint(*pid, process),
                        label: label(process),
                    })
                })
                .collect()
        };
        self.settle(targets, false).await
    }

    pub async fn force(&self) -> CleanupReport {
        let survivors = std::mem::take(&mut *lock(&self.survivors));
        {
            let mut guard = lock(&self.system);
            let Some(system) = refreshed(&mut guard) else {
                return CleanupReport::default();
            };
            for target in &survivors {
                // PID repris par un autre process entre-temps : on n'y touche pas.
                if let Some(process) = system
                    .process(target.pid)
                    .filter(|process| process.start_time() == target.start)
                {
                    signal(process, true);
                }
            }
        }
        self.settle(survivors, true).await
    }

    async fn settle(&self, targets: Vec<Target>, forced: bool) -> CleanupReport {
        let deadline = Instant::now() + if forced { GRACE / 5 } else { GRACE };
        let mut alive = targets.clone();
        loop {
            tokio::time::sleep(Duration::from_millis(250)).await;
            alive = {
                let mut guard = lock(&self.system);
                let Some(system) = guard.as_mut() else {
                    break;
                };
                let pids: Vec<Pid> = alive.iter().map(|target| target.pid).collect();
                system.refresh_processes_specifics(
                    ProcessesToUpdate::Some(&pids),
                    true,
                    ProcessRefreshKind::nothing(),
                );
                alive
                    .into_iter()
                    .filter(|target| {
                        system
                            .process(target.pid)
                            .is_some_and(|process| process.start_time() == target.start)
                    })
                    .collect()
            };
            if alive.is_empty() || Instant::now() >= deadline {
                break;
            }
        }
        let gone: Vec<&Target> = targets
            .iter()
            .filter(|target| !alive.iter().any(|left| left.pid == target.pid))
            .collect();
        let report = CleanupReport {
            stopped: u32::try_from(gone.len()).unwrap_or(u32::MAX),
            freed: gone.iter().map(|target| target.memory).sum(),
            remaining: u32::try_from(alive.len()).unwrap_or(u32::MAX),
            left: alive.iter().map(|target| target.label.clone()).collect(),
        };
        *lock(&self.survivors) = alive;
        report
    }
}

/// Gardé d'un relevé à l'autre : environnement, dossier et chemin ne se relisent pas pour un process déjà vu.
fn refreshed(slot: &mut Option<System>) -> Option<&mut System> {
    if slot.is_none() {
        *slot = System::new().ok();
    }
    let system = slot.as_mut()?;
    system.refresh_memory();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_memory()
            .with_user(UpdateKind::OnlyIfNotSet)
            .with_exe(UpdateKind::OnlyIfNotSet)
            .with_cwd(UpdateKind::OnlyIfNotSet)
            .with_environ(UpdateKind::OnlyIfNotSet),
    );
    Some(system)
}

fn rows(system: &System) -> HashMap<u32, Row> {
    let me = current_user();
    system
        .processes()
        .iter()
        .filter(|(_, process)| me.is_none() || process.user_id().map(|uid| uid.to_string()) == me)
        .map(|(pid, process)| {
            let marker = process.environ().iter().find_map(|entry| {
                entry
                    .to_str()?
                    .strip_prefix(MARKER)?
                    .strip_prefix('=')?
                    .parse()
                    .ok()
            });
            let row = Row {
                name: process.name().to_string_lossy().to_lowercase(),
                parent: process.parent().map(Pid::as_u32),
                start: process.start_time(),
                marker,
                known: false,
                cwd: process.cwd().map(Path::to_path_buf),
                exe: process.exe().map(Path::to_path_buf),
                responsible: responsible(pid.as_u32()),
            };
            (pid.as_u32(), row)
        })
        .collect()
}

/// Instances de Nuée dont un process responsable désigne un reste, avec leur date de départ : la nôtre si elle est
/// son propre responsable (app ouverte depuis le Finder ; sous `tauri dev`, c'est l'app qui a lancé la commande), et
/// celles d'avant qui ne tournent plus. Les instances encore ouvertes vont dans `roots.others`.
fn owners(apps: &[Stamp], me: Stamp, rows: &HashMap<u32, Row>, roots: &mut Roots) -> Vec<Stamp> {
    let mut owners = Vec::new();
    for &(pid, start) in apps {
        if (pid, start) == me {
            if rows.get(&pid).is_some_and(|row| row.responsible.is_none()) {
                owners.push((pid, start));
            }
            continue;
        }
        match rows.get(&pid) {
            Some(row) if row.start == start => {
                roots.others.insert(pid);
            }
            // PID repris depuis par un autre process : plus rien ne s'attribue à l'ancienne instance.
            Some(_) => {}
            None => owners.push((pid, start)),
        }
    }
    owners
}

/// Le groupe de chaque process qui regarde Nuée ; les autres n'apparaissent pas.
fn classify(rows: &HashMap<u32, Row>, roots: &Roots, folders: &[PathBuf]) -> HashMap<u32, Class> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut classes = HashMap::new();
    for (&pid, row) in rows {
        let class = match walk(rows, roots, pid, row.marker) {
            Walk::Owned(class) => Some(class),
            Walk::Elsewhere => None,
            // Service XPC de la fenêtre (WebKit) : rattaché à launchd, mais l'app en est responsable.
            Walk::Top(_) if row.responsible == Some(roots.app) && system_binary(row) => {
                Some(owned(CleanupGroup::App, false))
            }
            Walk::Top(top) => {
                let above = &rows[&top];
                let marked =
                    row.marker.is_some() || row.known || above.marker.is_some() || above.known;
                if marked || leftover_by_folder(rows, top, folders) {
                    Some(Class {
                        group: CleanupGroup::Leftovers,
                        idle: false,
                        guessed: !marked,
                    })
                } else {
                    dev_orphan(rows, top, home.as_deref()).then_some(Class {
                        group: CleanupGroup::Others,
                        idle: false,
                        guessed: true,
                    })
                }
            }
        };
        if let Some(class) = class {
            classes.insert(pid, class);
        }
    }
    classes
}

enum Walk {
    Owned(Class),
    /// Enfant d'une autre instance de Nuée encore ouverte (app empaquetée et `tauri dev`).
    Elsewhere,
    /// Plus haut ancêtre vivant, sans rien de suivi au-dessus.
    Top(u32),
}

fn walk(rows: &HashMap<u32, Row>, roots: &Roots, pid: u32, marker: Option<u32>) -> Walk {
    let mut current = pid;
    for _ in 0..128 {
        if let Some(&idle) = roots.agents.get(&current) {
            return Walk::Owned(owned(CleanupGroup::Agents, idle));
        }
        if roots.servers.contains(&current) {
            return Walk::Owned(owned(CleanupGroup::Servers, false));
        }
        if roots.terminals.contains(&current) {
            return Walk::Owned(owned(CleanupGroup::Terminals, false));
        }
        if current == roots.app {
            return Walk::Owned(owned(CleanupGroup::App, false));
        }
        if roots.others.contains(&current) || (current != pid && marker == Some(current)) {
            return Walk::Elsewhere;
        }
        let row = &rows[&current];
        // Parent mort, ou PID repris par un process plus jeune : la chaîne s'arrête là.
        match row.parent.filter(|parent| *parent > 1).and_then(|parent| {
            rows.get(&parent)
                .filter(|above| above.start <= row.start)
                .map(|_| parent)
        }) {
            Some(parent) => current = parent,
            None => return Walk::Top(current),
        }
    }
    Walk::Top(current)
}

/// Programmes de développement qu'un terminal, un éditeur ou un agent laisse derrière lui.
const DEV_PROGRAMS: &[&str] = &[
    "node", "bun", "deno", "npm", "npx", "pnpm", "yarn", "python", "ruby", "php", "java", "go",
    "cargo", "uv", "esbuild", "zsh", "bash", "sh", "fish",
];

/// Reste d'avant la marque (ou qui l'a effacée) : orphelin qui tourne dans un dossier de projet, hors app installée.
fn leftover_by_folder(rows: &HashMap<u32, Row>, top: u32, folders: &[PathBuf]) -> bool {
    let row = &rows[&top];
    let in_folder = row
        .cwd
        .as_ref()
        .is_some_and(|cwd| folders.iter().any(|folder| cwd.starts_with(folder)));
    orphan(rows, row) && in_folder && !installed(row)
}

/// Orphelin de développement venu d'ailleurs (comme Portly) : programme de dev rattaché à launchd, qui travaille dans
/// un dossier de l'utilisateur. Un service lancé par macOS tourne dans `/`, une app range ses aides sous `~/Library`.
fn dev_orphan(rows: &HashMap<u32, Row>, top: u32, home: Option<&Path>) -> bool {
    let row = &rows[&top];
    let program = row.name.trim_start_matches('-');
    let dev = DEV_PROGRAMS
        .iter()
        .any(|name| program == *name || (*name == "python" && program.starts_with("python")));
    let in_home = home.is_some_and(|home| {
        row.cwd.as_ref().is_some_and(|cwd| {
            cwd.starts_with(home) && cwd != home && !cwd.starts_with(home.join("Library"))
        })
    });
    dev && in_home && orphan(rows, row) && !installed(row)
}

fn orphan(rows: &HashMap<u32, Row>, row: &Row) -> bool {
    row.parent
        .is_none_or(|parent| parent <= 1 || !rows.contains_key(&parent))
}

/// Une app installée (éditeur, navigateur) n'est jamais un reste ; Homebrew range pourtant Python dans un `.app`.
fn installed(row: &Row) -> bool {
    system_binary(row)
        || row.exe.as_ref().is_some_and(|exe| {
            exe.starts_with("/Applications")
                || exe
                    .to_str()
                    .is_some_and(|exe| exe.contains("/Applications/"))
        })
}

fn system_binary(row: &Row) -> bool {
    row.exe
        .as_ref()
        .is_some_and(|exe| exe.starts_with("/System") || exe.starts_with("/usr/libexec"))
}

fn owned(group: CleanupGroup, idle: bool) -> Class {
    Class {
        group,
        idle,
        guessed: false,
    }
}

fn describe(pid: u32, process: &Process, class: Class, head: bool) -> CleanupProcess {
    CleanupProcess {
        pid,
        memory: footprint(pid, process),
        group: class.group,
        idle: class.idle,
        head,
    }
}

/// « zsh · mon-projet » : le programme et le dossier où il tourne.
fn label(process: &Process) -> String {
    let name = process
        .name()
        .to_string_lossy()
        .trim_start_matches('-')
        .to_owned();
    match process.cwd().and_then(Path::file_name) {
        Some(folder) => format!("{name} · {}", folder.to_string_lossy()),
        None => name,
    }
}

fn signal(process: &Process, force: bool) {
    let sent = process.kill_with(if force { Signal::Kill } else { Signal::Term });
    // Windows n'a pas de SIGTERM : l'arrêt direct, que l'utilisateur vient de confirmer.
    if sent.is_none() {
        process.kill();
    }
}

#[cfg(unix)]
fn current_user() -> Option<String> {
    // SAFETY: getuid() ne peut pas échouer et ne touche pas à la mémoire.
    Some(unsafe { libc::getuid() }.to_string())
}

#[cfg(not(unix))]
fn current_user() -> Option<String> {
    None
}

/// Mémoire comme le Moniteur d'activité (empreinte physique) : le RSS compte aussi les pages partagées.
#[cfg(target_os = "macos")]
fn footprint(pid: u32, process: &Process) -> u64 {
    let Ok(pid) = libc::c_int::try_from(pid) else {
        return process.memory();
    };
    let mut info = std::mem::MaybeUninit::<libc::rusage_info_v4>::zeroed();
    // SAFETY: le noyau remplit au plus un rusage_info_v4, la taille du tampon passé.
    let status =
        unsafe { libc::proc_pid_rusage(pid, libc::RUSAGE_INFO_V4, info.as_mut_ptr().cast()) };
    if status == 0 {
        // SAFETY: appel réussi, la structure est remplie.
        unsafe { info.assume_init() }.ri_phys_footprint
    } else {
        process.memory()
    }
}

#[cfg(not(target_os = "macos"))]
fn footprint(_pid: u32, process: &Process) -> u64 {
    process.memory()
}

/// Fonction privée de macOS (celle du Moniteur d'activité), cherchée à l'exécution : absente, on s'en passe.
/// `None` aussi quand le process est son propre responsable.
#[cfg(target_os = "macos")]
fn responsible(pid: u32) -> Option<u32> {
    use std::sync::OnceLock;
    type Lookup = unsafe extern "C" fn(libc::pid_t) -> libc::pid_t;
    static LOOKUP: OnceLock<Option<Lookup>> = OnceLock::new();
    let lookup = LOOKUP.get_or_init(|| {
        // SAFETY: dlsym avec un nom C valide ; le symbole, s'il existe, a cette signature.
        let symbol = unsafe {
            libc::dlsym(
                libc::RTLD_DEFAULT,
                c"responsibility_get_pid_responsible_for_pid".as_ptr(),
            )
        };
        // SAFETY: pointeur non nul vers la fonction de la signature ci-dessus.
        (!symbol.is_null())
            .then(|| unsafe { std::mem::transmute::<*mut libc::c_void, Lookup>(symbol) })
    });
    let lookup = (*lookup)?;
    let target = libc::pid_t::try_from(pid).ok()?;
    // SAFETY: la fonction ne lit que le PID passé.
    let owner = unsafe { lookup(target) };
    u32::try_from(owner)
        .ok()
        .filter(|owner| *owner != pid && *owner > 0)
}

#[cfg(not(target_os = "macos"))]
fn responsible(_pid: u32) -> Option<u32> {
    None
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    const APP: u32 = 100;

    fn row(parent: u32, start: u64) -> Row {
        Row {
            name: String::new(),
            parent: Some(parent),
            start,
            marker: None,
            known: false,
            cwd: None,
            exe: None,
            responsible: None,
        }
    }

    fn marked(parent: u32, start: u64, marker: u32) -> Row {
        Row {
            marker: Some(marker),
            ..row(parent, start)
        }
    }

    fn roots() -> Roots {
        Roots {
            app: APP,
            others: HashSet::new(),
            agents: HashMap::from([(200, false), (300, true)]),
            servers: HashSet::from([400]),
            terminals: HashSet::from([500]),
        }
    }

    fn group_of(classes: &HashMap<u32, Class>, pid: u32) -> Option<CleanupGroup> {
        classes.get(&pid).map(|class| class.group)
    }

    #[test]
    fn follows_parents_up_to_a_tracked_root() {
        let rows = HashMap::from([
            (1, row(0, 0)),
            (APP, row(1, 1)),
            (200, marked(APP, 2, APP)),
            (201, marked(200, 3, APP)),
            (300, marked(APP, 2, APP)),
            (301, marked(300, 3, APP)),
            (400, marked(APP, 2, APP)),
            (401, marked(400, 3, APP)),
            (500, marked(APP, 2, APP)),
            (600, row(APP, 2)),
        ]);
        let classes = classify(&rows, &roots(), &[]);
        assert_eq!(group_of(&classes, 201), Some(CleanupGroup::Agents));
        assert!(!classes[&201].idle);
        assert!(classes[&301].idle);
        assert_eq!(group_of(&classes, 401), Some(CleanupGroup::Servers));
        assert_eq!(group_of(&classes, 500), Some(CleanupGroup::Terminals));
        assert_eq!(group_of(&classes, 600), Some(CleanupGroup::App));
        assert_eq!(group_of(&classes, 1), None);
    }

    #[test]
    fn marked_orphan_and_its_children_are_leftovers() {
        // Serveur lancé en tâche de fond par un agent arrêté depuis, puis rattaché à launchd.
        let rows = HashMap::from([
            (APP, row(1, 1)),
            (700, marked(1, 5, APP)),
            (701, marked(700, 6, APP)),
            (800, marked(1, 5, 42)),
        ]);
        let classes = classify(&rows, &roots(), &[]);
        assert_eq!(group_of(&classes, 700), Some(CleanupGroup::Leftovers));
        assert_eq!(group_of(&classes, 701), Some(CleanupGroup::Leftovers));
        assert!(!classes[&701].guessed);
        // Marque d'une instance de Nuée fermée depuis.
        assert_eq!(group_of(&classes, 800), Some(CleanupGroup::Leftovers));
    }

    #[test]
    fn leaves_children_of_another_open_instance_alone() {
        let rows = HashMap::from([
            (APP, row(1, 1)),
            (900, row(1, 1)),
            (901, marked(900, 2, 900)),
            (902, marked(901, 3, 900)),
        ]);
        let classes = classify(&rows, &roots(), &[]);
        assert_eq!(group_of(&classes, 901), None);
        assert_eq!(group_of(&classes, 902), None);
    }

    #[test]
    fn guesses_unmarked_orphans_only_inside_project_folders() {
        let project = PathBuf::from("/Users/me/code/site");
        let in_project = |exe: &str| Row {
            cwd: Some(project.join("web")),
            exe: Some(PathBuf::from(exe)),
            ..row(1, 5)
        };
        let rows = HashMap::from([
            (APP, row(1, 1)),
            (APP + 1, row(1, 1)),
            (700, in_project("/opt/homebrew/bin/node")),
            (701, row(700, 6)),
            (
                710,
                in_project("/Applications/Code.app/Contents/MacOS/Electron"),
            ),
            (
                711,
                in_project(
                    "/opt/homebrew/Frameworks/Python.framework/Resources/Python.app/Contents/MacOS/Python",
                ),
            ),
            (
                720,
                Row {
                    cwd: Some(PathBuf::from("/tmp")),
                    ..row(1, 5)
                },
            ),
            (
                730,
                Row {
                    cwd: Some(project.clone()),
                    ..row(APP + 1, 5)
                },
            ),
        ]);
        let classes = classify(&rows, &roots(), std::slice::from_ref(&project));
        assert_eq!(group_of(&classes, 700), Some(CleanupGroup::Leftovers));
        assert!(classes[&700].guessed);
        assert_eq!(group_of(&classes, 701), Some(CleanupGroup::Leftovers));
        assert_eq!(group_of(&classes, 710), None);
        assert_eq!(group_of(&classes, 711), Some(CleanupGroup::Leftovers));
        assert_eq!(group_of(&classes, 720), None);
        // Parent vivant (un terminal, un éditeur) : pas un reste.
        assert_eq!(group_of(&classes, 730), None);
    }

    #[test]
    fn reused_parent_pid_breaks_the_chain() {
        // Le parent d'origine est mort, son PID a été repris par un process plus jeune que l'enfant.
        let rows = HashMap::from([
            (APP, row(1, 1)),
            (200, row(1, 50)),
            (210, marked(200, 10, APP)),
        ]);
        let classes = classify(&rows, &roots(), &[]);
        assert_eq!(group_of(&classes, 210), Some(CleanupGroup::Leftovers));
    }

    #[test]
    fn webkit_processes_of_the_window_belong_to_the_app() {
        let rows = HashMap::from([
            (APP, row(1, 1)),
            (
                950,
                Row {
                    responsible: Some(APP),
                    exe: Some(PathBuf::from(
                        "/System/Library/Frameworks/WebKit.framework/XPCServices/WebContent",
                    )),
                    ..row(1, 2)
                },
            ),
        ]);
        let classes = classify(&rows, &roots(), &[]);
        assert_eq!(group_of(&classes, 950), Some(CleanupGroup::App));
    }

    #[test]
    fn known_orphans_are_leftovers_and_other_instances_are_left_alone() {
        // macOS 27 : pas de marque lisible, le registre ou le process responsable dit d'où vient le process.
        let mut roots = roots();
        roots.others.insert(900);
        let rows = HashMap::from([
            (APP, row(1, 1)),
            (
                700,
                Row {
                    known: true,
                    ..row(1, 5)
                },
            ),
            (701, row(700, 6)),
            (900, row(1, 1)),
            (901, row(900, 2)),
            (
                902,
                Row {
                    known: true,
                    ..row(900, 2)
                },
            ),
        ]);
        let classes = classify(&rows, &roots, &[]);
        assert_eq!(group_of(&classes, 700), Some(CleanupGroup::Leftovers));
        assert_eq!(group_of(&classes, 701), Some(CleanupGroup::Leftovers));
        assert!(!classes[&701].guessed);
        assert_eq!(group_of(&classes, 901), None);
        assert_eq!(group_of(&classes, 902), None);
    }

    #[test]
    fn owners_are_past_instances_and_ourselves_when_self_responsible() {
        let me = (APP, 10);
        let apps = [(50, 3), (60, 4), (70, 5), me];
        let rows = HashMap::from([
            (APP, row(1, 10)),
            // 60 tourne encore (autre instance), 70 a été repris par un autre process.
            (60, row(1, 4)),
            (70, row(1, 9)),
        ]);
        let mut roots = roots();
        let found = owners(&apps, me, &rows, &mut roots);
        assert_eq!(found, vec![(50, 3), me]);
        assert!(roots.others.contains(&60));

        // Sous `tauri dev`, l'app qui a lancé la commande est responsable de Nuée : on ne se compte pas.
        let mut launched = rows;
        launched.insert(
            APP,
            Row {
                responsible: Some(7),
                ..row(1, 10)
            },
        );
        assert_eq!(
            owners(&apps, me, &launched, &mut Roots::default()),
            vec![(50, 3)]
        );
    }

    #[test]
    fn dev_orphans_from_elsewhere_are_others() {
        let home = PathBuf::from(std::env::var_os("HOME").expect("HOME"));
        let dev = |name: &str, cwd: PathBuf| Row {
            name: name.to_owned(),
            cwd: Some(cwd),
            exe: Some(PathBuf::from("/opt/homebrew/bin/node")),
            ..row(1, 5)
        };
        let rows = HashMap::from([
            (APP, row(1, 1)),
            // `npm run dev` oublié dans un terminal, et son enfant.
            (700, dev("node", home.join("code/site"))),
            (701, row(700, 6)),
            (702, dev("python3.15", home.join("code/api"))),
            (703, dev("-zsh", home.join("code/site"))),
            // Service lancé par macOS, aide d'app, process hors du dossier perso : pas touchés.
            (710, dev("node", PathBuf::from("/"))),
            (
                711,
                dev("node", home.join("Library/Application Support/Outil")),
            ),
            (712, dev("node", home.clone())),
            (713, dev("Finder", home.join("code"))),
        ]);
        let classes = classify(&rows, &roots(), &[]);
        for pid in [700, 701, 702, 703] {
            assert_eq!(group_of(&classes, pid), Some(CleanupGroup::Others), "{pid}");
        }
        for pid in [710, 711, 712, 713] {
            assert_eq!(group_of(&classes, pid), None, "{pid}");
        }
    }
}
