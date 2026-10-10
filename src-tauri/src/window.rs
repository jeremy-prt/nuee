use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

// Marge autour de la fenêtre au lancement, en points logiques.
const MARGIN: f64 = 16.0;

// Occupe tout l'écran utile (hors barre des menus et Dock) moins la marge, puis affiche la fenêtre,
// créée invisible pour éviter un saut de taille.
pub fn fit_to_screen(window: &WebviewWindow) -> tauri::Result<()> {
    let monitor = match window.current_monitor()? {
        Some(monitor) => Some(monitor),
        None => window.primary_monitor()?,
    };

    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let margin = (MARGIN * monitor.scale_factor()).round() as u32;
        // set_size règle l'intérieur : on retire la barre de titre native (Windows, Linux).
        let (outer, inner) = (window.outer_size()?, window.inner_size()?);
        let decorations = PhysicalSize::new(
            outer.width.saturating_sub(inner.width),
            outer.height.saturating_sub(inner.height),
        );

        window.set_size(PhysicalSize::new(
            area.size
                .width
                .saturating_sub(2 * margin + decorations.width),
            area.size
                .height
                .saturating_sub(2 * margin + decorations.height),
        ))?;
        window.set_position(PhysicalPosition::new(
            area.position.x + margin as i32,
            area.position.y + margin as i32,
        ))?;
    }

    window.show()
}

// Flou du bureau derrière la fenêtre transparente. Aucune API publique ne règle son rayon : comme
// monocode et Brume, on passe par la fonction privée de WindowServer, cherchée à l'exécution pour
// qu'une version de macOS qui la retirerait laisse simplement la fenêtre sans flou.
#[cfg(target_os = "macos")]
pub fn set_blur(window: &WebviewWindow, radius: u8) {
    use std::ffi::{c_int, c_void};
    use std::sync::OnceLock;

    type ConnectionFn = unsafe extern "C" fn() -> c_int;
    type SetBlurFn = unsafe extern "C" fn(c_int, c_int, c_int) -> c_int;

    fn lookup(symbol: &std::ffi::CStr) -> Option<*mut c_void> {
        let ptr = unsafe { libc::dlsym(libc::RTLD_DEFAULT, symbol.as_ptr()) };
        (!ptr.is_null()).then_some(ptr)
    }

    static FUNCTIONS: OnceLock<Option<(ConnectionFn, SetBlurFn)>> = OnceLock::new();
    let functions = FUNCTIONS.get_or_init(|| {
        let connection = lookup(c"CGSMainConnectionID")?;
        let set_blur = lookup(c"CGSSetWindowBackgroundBlurRadius")?;
        Some(unsafe {
            (
                std::mem::transmute::<*mut c_void, ConnectionFn>(connection),
                std::mem::transmute::<*mut c_void, SetBlurFn>(set_blur),
            )
        })
    });
    let (Some((connection, set_blur)), Ok(ns_window)) = (functions, window.ns_window()) else {
        return;
    };

    let ns_window = unsafe { &*ns_window.cast::<objc2::runtime::AnyObject>() };
    // Comme Brume : sur un fond tout à fait transparent, le flou déborde des coins arrondis de la fenêtre.
    unsafe {
        let color: *mut objc2::runtime::AnyObject =
            objc2::msg_send![objc2::class!(NSColor), colorWithWhite: 1.0f64, alpha: 0.001f64];
        let _: () = objc2::msg_send![ns_window, setBackgroundColor: color];
        let _: () = objc2::msg_send![ns_window, invalidateShadow];
    }
    let number: isize = unsafe { objc2::msg_send![ns_window, windowNumber] };
    if number > 0 {
        unsafe { set_blur(connection(), number as c_int, c_int::from(radius)) };
    }
}
