#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Tue l'agent et ce qu'il a lancé : le process a été créé en tête de son propre groupe.
#[cfg(unix)]
pub fn kill_tree(pid: u32, force: bool) {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return;
    };
    if pid <= 0 {
        return;
    }
    let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
    // SAFETY: kill() ne touche pas à la mémoire ; au pire le PID n'existe plus et l'appel échoue.
    unsafe {
        libc::kill(-pid, signal);
        libc::kill(pid, signal);
    }
}

/// Windows n'a pas de groupe à signaler : taskkill /T descend l'arbre des enfants.
#[cfg(windows)]
pub fn kill_tree(pid: u32, _force: bool) {
    use std::os::windows::process::CommandExt;
    if pid == 0 {
        return;
    }
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}
