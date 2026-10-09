---
paths:
  - "src/**"
  - "src-tauri/src/**"
  - "src-tauri/capabilities/**"
---

# Architecture Tauri + Vue

Même logique que l'archi Nuxt : depuis un bouton, on retrouve vite la commande Rust puis le service qui fait le travail. Ni repository, ni DTO, ni injection de dépendances. Noms de fichiers en anglais, commentaires en français.

| WebDev / Nuxt | Ici |
|---|---|
| Classe et ses méthodes (`server/services/XxxService.ts`) | `src-tauri/src/services/<domaine>.rs` : `struct XxxService` + `impl` |
| Route API d'un bouton (`server/api/`) | `src-tauri/src/commands/<domaine>.rs` : commande mince |
| `$fetch('/api/...')` | `src/ipc/<domaine>.ts` : wrapper typé autour de `invoke` |
| Schéma Zod partagé (`shared/schemas/`) | struct Rust, type TS généré par ts-rs |
| Variable globale (`gcl...`) | store Pinia |
| Page | `src/views/XxxView.vue` |

```
src/
  views/                    # 1 fichier = 1 écran ; bandeau `// ===== Initialisation =====` pour l'init
  components/<domaine>/     # <Domaine>Xxx.vue
  components/ui/            # UiXxx.vue : nos briques stylées, reka-ui (headless) dessous
  composables/              # useXxx : données réactives + chargement, une instance par appel
  stores/                   # Pinia, un store par domaine, un seul exemplaire partagé
  ipc/                      # seul dossier qui importe @tauri-apps/api
    <domaine>.ts            # 1 fonction = 1 commande Rust
    bindings/               # généré par ts-rs, jamais édité à la main
  i18n/                     # createI18n + choix de la langue au démarrage
    locales/<langue>.ts     # en.ts fait référence, les autres finissent par `satisfies typeof en`
  utils/                    # fonctions pures ; shortcuts.ts = tous les raccourcis clavier
  assets/css/main.css       # Tailwind 4 : jetons de couleur dans @theme, pas de tailwind.config.js
src-tauri/src/
  main.rs                   # n'appelle que nuee_lib::run()
  lib.rs                    # Builder : plugins, manage(state), generate_handler!
  error.rs                  # AppError (thiserror), sérialisé en { kind, message }
  state.rs                  # état partagé passé à manage()
  menu.rs, window.rs        # réglages natifs au démarrage : menu macOS, taille de la fenêtre
  commands/<domaine>.rs     # valider, appeler le service (ou la lib si c'est une ligne), répondre
  services/<domaine>.rs     # la logique métier
  utils/                    # helpers techniques (chemins, env shell)
```

## Pont Vue <-> Rust

- F12 ne traverse pas `invoke` : le nom de commande est une chaîne. Pour s'y retrouver, même nom de domaine partout (`ipc/session.ts` -> `commands/session.rs` -> `services/session.rs`) et commande nommée `<domaine>_<action>` (`session_start`) : un grep sur ce nom trouve les deux côtés.
- Composants, composables et stores n'appellent jamais `invoke` : ils passent par `src/ipc/`.
- La struct Rust est la source de vérité des types : `#[derive(Serialize, Deserialize, TS)]`, `#[serde(rename_all = "camelCase")]` sur tout ce qui traverse l'IPC. ts-rs exporte pendant `cargo test` ; le dossier de sortie se fixe avec `TS_RS_EXPORT_DIR` dans `src-tauri/.cargo/config.toml`.
- Flux continu (sortie d'agent, logs) : un `tauri::ipc::Channel<T>` passé en paramètre de la commande. `emit` seulement pour les notifications rares. Côté Vue, accumuler dans un `shallowRef` et pousser une fois par frame (`requestAnimationFrame`), sinon la réactivité rame.

## Rust

- Commandes `pub` dans leur module, `async` dès qu'elles font des I/O, retour `Result<T, AppError>` dès qu'elles peuvent échouer. Un seul `generate_handler!` dans `lib.rs` : un second appel écrase le premier.
- Pas de `unwrap()` / `expect()` hors démarrage : on remonte une `AppError`.
- État : `std::sync::Mutex` par défaut, celui de tokio seulement si le verrou doit traverser un `.await`. Jamais de verrou tenu pendant un `.await`. Pas d'`Arc` autour de ce qu'on passe à `manage()`, Tauri l'enveloppe déjà.
- Process enfants (CLI d'agents) : le front envoie un id d'agent et des options, jamais une ligne de commande. Rust construit la commande depuis une liste connue, garde le PID et tue par ce PID (`kill_on_drop`).
- Lancée depuis le Finder, l'app n'a pas le PATH du shell : résoudre les binaires d'agents via un login shell.

## Textes et langues

- Aucun texte d'interface en dur : la clé va dans `src/i18n/locales/en.ts`, puis traduite dans toutes les autres langues. vue-tsc bloque si une traduction manque, mais pas si `t('...')` cite une clé qui n'existe pas : la copier depuis `en.ts`.
- Traductions précompilées au build (`@intlify/unplugin-vue-i18n`, compilateur retiré du bundle) : un texte chargé à l'exécution (API, fichier) ne sera pas interprété en production.
- Langue du système : la commande Rust `system_locales`, jamais `navigator.language` (WebView2 renvoie toujours en-US). Dates et nombres : `Intl.*` avec la locale de vue-i18n, jamais `undefined`.
- Marges et positions en propriétés logiques Tailwind (`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`) plutôt que gauche/droite : ça garde la porte ouverte aux langues écrites de droite à gauche.

## Interface

- Composants accessibles : reka-ui (headless) habillé dans `components/ui/`, jamais une lib de composants déjà stylés.
- Couleurs uniquement via les jetons de `main.css` (`canvas`, `content`, `muted`, `stroke`, `selection`, `accent`). Pas de couleur nommée `base` : `text-base` est déjà la taille de texte de Tailwind.
- Transparence et flou : macOS seulement, via la variante `macos:` (classe `is-macos` posée au démarrage). Windows et Linux restent opaques.
- Raccourcis : déclarés dans `utils/shortcuts.ts`, comparés sur la lettre tapée (en AZERTY, W n'est pas sur la touche physique `KeyW`). Un raccourci ⌘ porté par un élément du menu natif (`src-tauri/src/menu.rs`) n'atteint jamais la webview.
- Disposition (panneaux, tailles) mémorisée en localStorage par `stores/layout.ts` : confort local, rien de critique. Une nouvelle valeur par défaut ne touche pas une disposition déjà enregistrée : changer `STORAGE_KEY` pour repartir de zéro.

## Sécurité

- Capabilities ciblées sur `"main"`, jamais `"*"`. Pas de permission `fs:` ni `shell:` exposée au front : tout passe par nos commandes, qui canonisent les chemins sous la racine du workspace.
- Pas de `v-html` sur une sortie d'agent (markdown assaini) : une XSS dans la webview donne accès aux commandes, donc au lancement de process.
- CSP définie dans `tauri.conf.json` : ne pas la repasser à `null`, ne pas charger de CDN.

## Divers

- vue-router (hash history) quand un deuxième écran arrive, pas avant.
- On crée un dossier quand il a un premier fichier à contenir.
