// Sans cette ligne, Windows ouvre une console à côté de l'app en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nuee_lib::run()
}
