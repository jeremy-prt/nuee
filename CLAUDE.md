# Nuée

App desktop Tauri 2 + Vue pour piloter des agents de code, open source (MIT). Interface et doc interne en français, vitrine GitHub (README, description) en anglais.

## Commandes

- `pnpm tauri dev` : lance l'app (Vite sur le port 1420, imposé par `tauri.conf.json`)
- `pnpm type-check` : vérif TS + Vue
- `cargo check|clippy|test --manifest-path src-tauri/Cargo.toml` : côté Rust. `cargo test` régénère aussi les types TS de `src/ipc/bindings/` (commités, le CI ne les régénère pas) : le relancer après tout changement de struct qui traverse l'IPC
- Avant de pousser : `pnpm build` (vue-tsc ne voit pas les erreurs de syntaxe dans les templates, le build si), puis `cargo fmt` et `cargo clippy --all-targets -- -D warnings` dans `src-tauri/` : le workflow Checks échoue au moindre warning
- Notifications, pastille du Dock et lancement au démarrage ne marchent pas sous `tauri dev` (binaire hors .app) : les tester dans `pnpm tauri build --debug --bundles app` (`src-tauri/target/debug/bundle/macos/Nuee.app`). `Ressources/test/ui.sh` ne pilote que la fenêtre de `tauri dev` : celle de l'app empaquetée appartient à `Nuee`, pas `nuee`. Fenêtre cachée derrière une autre app : WebKit ne la dessine plus, `ui.sh shot` rend un gris uni. Lancé depuis Claude desktop, celui-ci reprend le premier plan entre deux commandes et le premier clic sur une fenêtre inactive ne fait que l'activer : activer `nuee` puis cliquer deux fois dans la même commande
- Lancée depuis une session Claude Code, `pnpm tauri dev` hérite de ses variables `CLAUDE_*` et `ANTHROPIC_*`, que les agents de Nuée reprennent : les retirer (`env -u ...`) pour tester comme depuis le Finder
- Réglages › Skills et MCP écrit dans la config de Claude Code (`settings.json`, `skills/`) : tester les écritures avec `CLAUDE_CONFIG_DIR=<dossier leurre>`, jamais sur la vraie (la CLI n'y est pas connectée, les tours de chat échouent)
- Simuler un outil absent : `NUEE_HIDE_BINARIES=gh,claude pnpm tauri dev` (debug seulement)
- Devtools coupés même en dev (`"devtools": false` dans les deux confs de fenêtre, demande de Jérémy) : les remettre le temps d'un débogage, sans les committer
- Taille et position de la fenêtre retenues dans `.window-state.json` (dossier de données de l'app) : le supprimer pour retester le premier lancement, où la fenêtre s'ouvre presque plein écran (comme ⌥⌘F)
- `pnpm tauri build` : ne builde que pour l'OS courant. Les trois OS passent par le workflow `.github/workflows/build.yml`

## Textes d'interface

Ton pro et clair (choix de Jérémy), dans les 6 langues : les textes ne s'adressent à personne, ni tutoiement ni vouvoiement (infinitif pour une consigne, tournure impersonnelle sinon : « Décrire ce qu'il faut construire… », « Le dossier reste sur le disque »), jamais de « : » pour enchaîner deux idées, pas de tournure qui sonne générée (« c'est X qui s'affiche », « Y à la place »). Un libellé dit ce qu'on règle (« Couleur de la mascotte »), une aide tient en une phrase simple ; un chemin ou un nom en forme spéciale s'insère avec `<Translation>`.

## Pièges

- pnpm uniquement, version figée par `packageManager`.
- TypeScript reste en 6 : create-vue et vue-tsc ne suivent pas encore TS 7 (port natif).
- Tauri 2 uniquement : les crates `tauri*` en 3.x sur crates.io sont des alphas, et aucune recette Tauri 1 (allowlist, `@tauri-apps/api/tauri`).
- Un plugin Tauri ajouté doit avoir sa permission dans `src-tauri/capabilities/default.json`, sinon ses appels sont refusés.
- La fenêtre est définie deux fois : `tauri.conf.json` et `tauri.macos.conf.json` (transparence, barre de titre). Le tableau `windows` est remplacé, pas fusionné : toute modif de fenêtre se fait dans les deux.
- Icône macOS sombre dans toutes les apparences (le style d'icônes « Par défaut » ne suit pas le thème) ; seul le Dock suit le mode de l'app, `window_set_dock_icon` y posant `icons/dock-light.png` en clair. Paquet : `icons/Assets.car`, compilé depuis `icons/Nuee.icon` (Icon Composer) par le workflow manuel « Compiler l'icône macOS » (actool exige Xcode 26, absent en local), puis commité. Changer de logo = `pnpm tauri icon` (supprimer les `android/` et `ios/` qu'il ajoute), régénérer `Nuee.icon` (`~/Pictures/Logos/Nuee/retenue/icon_composer.py`), relancer le workflow, recommiter `Assets.car` et refaire `dock-light.png` (version claire, 512 px)
- Réglages d'apparence (fond d'écran compris) en `localStorage`, propre à l'origine : `tauri dev` et l'app empaquetée ne les partagent pas
- La fenêtre ne s'affiche qu'à la fin du chargement de la page (`on_page_load` dans `lib.rs`, qui pose alors `boot-shown`), sur le logo d'`index.html` que `useBootSplash` retire quand l'app est prête (10 s au plus) : il attend tout chargement passé par `useSlow`, donc un nouveau squelette doit en passer par là. Aucun attribut `style` dans `index.html` : la CSP de l'app empaquetée les bloque sans erreur, ce que `tauri dev` ne montre pas
- `productName` reste en ASCII (`Nuee`) : un accent casse le paquet `.deb`. Le titre de fenêtre garde « Nuée ».
- Pinia 4 exige `@vue/devtools-api` installé à côté.
- Dev et build partagent l'historique (même `identifier`) : `nuee.db` dans le dossier de données de l'app (`~/Library/Application Support/io.github.jeremy-prt.nuee/` sur macOS).
- Nouvelle icône importée pendant `tauri dev` : Vite peut rester bloqué en « 504 Outdated Optimize Dep », fenêtre vide. `touch vite.config.ts` relance Vite.
- En dev, après une grosse modif de composants, le rechargement à chaud peut laisser la fenêtre Tauri dans un état périmé (écouteurs en double, ancien rendu) : recharger la page (`touch src/main.ts`) avant de conclure à un bug.
