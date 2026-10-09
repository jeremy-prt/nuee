# Nuée

App desktop Tauri 2 + Vue pour piloter des agents de code, open source (MIT). Interface et doc interne en français, vitrine GitHub (README, description) en anglais.

## Commandes

- `pnpm tauri dev` : lance l'app (Vite sur le port 1420, imposé par `tauri.conf.json`)
- `pnpm type-check` : vérif TS + Vue
- `cargo check|clippy|test --manifest-path src-tauri/Cargo.toml` : côté Rust
- Avant de pousser : `cargo fmt` et `cargo clippy --all-targets -- -D warnings` dans `src-tauri/`, le workflow Checks échoue au moindre warning
- `pnpm tauri build` : ne builde que pour l'OS courant. Les trois OS passent par le workflow `.github/workflows/build.yml`

## Pièges

- pnpm uniquement, version figée par `packageManager`.
- TypeScript reste en 6 : create-vue et vue-tsc ne suivent pas encore TS 7 (port natif).
- Tauri 2 uniquement : les crates `tauri*` en 3.x sur crates.io sont des alphas, et aucune recette Tauri 1 (allowlist, `@tauri-apps/api/tauri`).
- Un plugin Tauri ajouté doit avoir sa permission dans `src-tauri/capabilities/default.json`, sinon ses appels sont refusés.
- La fenêtre est définie deux fois : `tauri.conf.json` et `tauri.macos.conf.json` (transparence, barre de titre). Le tableau `windows` est remplacé, pas fusionné : toute modif de fenêtre se fait dans les deux.
- `productName` reste en ASCII (`Nuee`) : un accent casse le paquet `.deb`. Le titre de fenêtre garde « Nuée ».
- Pinia 4 exige `@vue/devtools-api` installé à côté.
