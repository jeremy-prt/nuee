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
