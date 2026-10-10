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
  utils/                    # fonctions pures ; shortcuts.ts = tous les raccourcis clavier ; `*.worker.ts` : Web Worker qui n'appelle que ces fonctions (effets de l'image de fond)
  assets/css/main.css       # Tailwind 4 : jetons de couleur dans @theme, pas de tailwind.config.js
src-tauri/src/
  main.rs                   # n'appelle que nuee_lib::run()
  lib.rs                    # Builder : plugins, manage(XxxService), generate_handler!
  error.rs                  # AppError (thiserror), sérialisé en { kind, message }
  menu.rs, window.rs        # réglages natifs au démarrage : menu macOS, taille de la fenêtre
  commands/<domaine>.rs     # valider, appeler le service (ou la lib si c'est une ligne), répondre
  services/<domaine>.rs     # la logique métier ; un domaine à plusieurs fichiers devient services/<domaine>/mod.rs
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
- macOS : notifications et pastille du Dock par `UNUserNotificationCenter` (`services/notification.rs`), pas `tauri-plugin-notification` (son `NSUserNotification` est refusé par macOS 27) ; lancement au démarrage par `auto-launch` en SMAppService, pas `tauri-plugin-autostart` (son LaunchAgent range l'app en tâche de fond). Les deux exigent l'app empaquetée et signée avec `signingIdentity: "-"` (sinon l'identifiant de signature ne correspond pas et macOS refuse sans demander).
- Brancher un agent (Codex, Cursor...) : une variante dans `AgentKind`, un `Driver` dans `services/agent/<agent>.rs` (arguments de la CLI, sonde qui liste ses modèles, traduction de sa sortie en `AgentEvent`), son nom et sa commande dans `src/utils/agents.ts`. Un process par chat gardé ouvert (`services/agent/session.rs`) : messages et interruption écrits sur stdin, relancé avec `--resume` si le mode, le modèle, l'effort ou le dossier change, arrêté après 5 min sans tour. Il démarre dès le focus du champ de saisie (`agent_warm`).
- Mode Auto : les demandes d'autorisation passent par `--permission-prompt-tool stdio` (`control_request` `can_use_tool`) et s'affichent dans `ChatApproval` ; Rust garde les paramètres de l'outil pour les renvoyer avec l'accord. Pas de consigne système ajoutée à Claude : une phrase en anglais en fin de prompt le fait répondre en anglais.
- Fin de tour en deux temps : `answered` dès que la réponse est complète (le front affiche « Terminé »), `turnEnd` quand l'agent a fini de ranger (résumé, hooks : plusieurs secondes). Un message envoyé entre les deux attend `turnEnd`. Après un arrêt, le texte coupé est rappelé à l'agent si son process est neuf (paramètre `recap`).
- Modèles et efforts : jamais codés en dur, l'agent installé les décrit (Claude : `control_request` `initialize`, lu une fois par lancement). L'interface montre toujours une valeur réelle (« Opus 5.5 », « Élevé »), jamais « par défaut ». Modes de permission : Bypass et Auto seulement (choix de Jérémy), passés en flag à chaque tour : ils priment sur la config Claude de l'utilisateur.
- Pièces jointes vers Claude : images en bloc base64 (la CLI redimensionne), autres fichiers en `@"chemin"` placé avant le message. Pas d'image en `@` : au-delà de ~3 Mo, elle est ignorée sans erreur.
- Chat sans projet : Rust le lance dans `<données de l'app>/scratch/<id du chat>`, supprimé avec le chat.
- Historique : SQLite (`services/chat.rs`), une ligne par chat ; les messages sont un JSON que seul le front lit. Un chat n'entre dans l'historique qu'à son premier message (`started`). Fermer un onglet garde le chat (`layout.tabs` = onglets ouverts, `tabs` = tous les chats), sauf s'il n'a jamais servi ; sinon seule la corbeille de la barre latérale le supprime. Nouvelle colonne = nouvelle entrée dans `MIGRATIONS`, jamais une modif d'une entrée passée.

## Textes et langues

- Aucun texte d'interface en dur : la clé va dans `src/i18n/locales/en.ts`, puis traduite dans toutes les autres langues. vue-tsc bloque si une traduction manque, mais pas si `t('...')` cite une clé qui n'existe pas : la copier depuis `en.ts`.
- Traductions précompilées au build (`@intlify/unplugin-vue-i18n`, compilateur retiré du bundle) : un texte chargé à l'exécution (API, fichier) ne sera pas interprété en production.
- Langue du système : la commande Rust `system_locales`, jamais `navigator.language` (WebView2 renvoie toujours en-US). Dates et nombres : `Intl.*` avec la locale de vue-i18n, jamais `undefined`.
- Marges et positions en propriétés logiques Tailwind (`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`) plutôt que gauche/droite : ça garde la porte ouverte aux langues écrites de droite à gauche.

## Interface

- Composants accessibles : reka-ui (headless) habillé dans `components/ui/`, jamais une lib de composants déjà stylés. Confirmation : `useDialogStore().confirm()`, jamais le `ask` natif ; message en bas de fenêtre : `useToastsStore().push()`.
- Couleurs uniquement via les jetons de `main.css` (`canvas`, `chrome`, `surface`, `popover`, `content`, `muted`, `stroke`, `selection`, `accent`, `ring`, `stroke-focus`, `danger`). Pas de couleur nommée `base` : `text-base` est déjà la taille de texte de Tailwind.
- Focus et éléments choisis (carte sélectionnée, zone de dépôt survolée, pane actif) : `ring` (accent adouci), jamais `accent` plein, blanc vif dans le thème Nuée (choix de Jérémy). Champ de saisie : sa bordure passe à `stroke-focus` (gris à peine plus clair, comme monocode), pas d'anneau.
- Le code ne déplace le focus que si le bouton validé au clavier disparaît (`event.detail === 0` sur le clic) : jamais après un clic souris, Échap ou un raccourci, sinon un anneau surgit ailleurs. Exceptions : la confirmation et la demande d'autorisation, qui prennent le focus en s'ouvrant.
- Barre latérale repliable : l'icône reste à 16 px du bord dans les deux états (rail `p-2` + item `px-2`, replié à 48 px), jamais de `justify-center`. Repli instantané, sans animation ; les libellés restent dans le DOM, masqués. Choix de Jérémy : dépliée, son bouton est dans la barre de titre ; repliée, il devient la première icône de la colonne.
- Boutons de colonne (barre latérale, panneau) : au-dessus du bord droit de leur colonne, sans fond « actif », seulement survol et infobulle. Le bouton de la barre latérale montre l'action (flèche gauche pour replier, droite pour déplier).
- Navigation : `stores/navigation.ts` choisit la vue centrale. Seule la vue `chats` a des onglets, l'historique des chats et les panneaux bas/droite ; Accueil, Issues, Notes, Réglages… sont des pages pleine largeur dans `views/`.
- Les onglets de la barre de titre démarrent au bord de la colonne centrale : `ShellTitleBar` additionne les largeurs des colonnes de gauche. Une nouvelle colonne à gauche doit entrer dans ce calcul.
- Barre de titre pleine largeur : une bordure verticale de colonne n'y monte que si elle ne croise pas les boutons de fenêtre macOS (calcul dans `ShellTitleBar`).
- Transparence et flou : macOS seulement (classe `is-macos` posée au démarrage), Windows et Linux restent opaques. Fond d'une colonne : `bg-chrome` (cadre : barres, liste des chats, terminal, panneau de droite) ou `bg-surface` (le chat ou la page au centre), jamais une opacité en dur : le style de fenêtre choisi dans les réglages (`stores/appearance.ts`, `data-window` sur `<html>`) les rend transparents dans `main.css`.
- Thèmes (`utils/themes.ts`) : un thème fixe `--color-accent`. Bouton principal en `bg-accent text-canvas`, jamais `bg-content` : il doit suivre le thème. Les fonds d'éléments actifs passent par `bg-selection`, que le mode « Toute l'interface » teinte avec l'accent.
- Flou du bureau : commande `window_set_blur` (API privée `CGSSetWindowBackgroundBlurRadius`, comme monocode et Brume). Pas de `windowEffects` dans `tauri.macos.conf.json` : le matériau natif écrase le rayon choisi. `set_blur` donne aussi à la NSWindow un fond blanc à alpha 0,001, sans quoi le flou déborde des coins arrondis.
- Raccourcis : déclarés une fois dans `defaultShortcuts` (`utils/shortcuts.ts`), d'où se construit Réglages > Raccourcis clavier. Chacun y porte sa rubrique (`group`), son contexte (`when`, sinon toute la fenêtre : sert à détecter les conflits) et son libellé sous la même clé dans `settings.shortcuts.items` d'`en.ts` (vue-tsc bloque s'il manque). Modifiables par l'utilisateur : toujours lus via `useShortcutsStore()` (`matches`, `label`), jamais `defaultShortcuts` ni un `event.key` en dur, Entrée et Échap compris. Hors liste : raccourcis natifs de macOS (⌘Q, ⌘H, copier-coller) et navigation clavier standard (flèches, Échap qui ferme un menu ou annule un glisser).
- Touches comparées sur la lettre tapée (en AZERTY, W n'est pas sur la touche physique `KeyW`). Un raccourci ⌘ porté par un élément du menu natif (`src-tauri/src/menu.rs`) n'atteint jamais la webview. Symboles (⌘, ⌘+ ⌘0) : `also`, `codes` et `shift: 'any'`, car ils demandent ⇧ sur certaines dispositions.
- Verre des menus, confirmations et messages : fond et flou sur un cadre fixe (`[data-reka-popper-content-wrapper]` ou `.ui-glass`), seul le contenu s'anime dedans (WebKit peint un fond périmé si l'élément flouté est animé). Échap dans un menu reka n'est pas marqué `defaultPrevented` : un écouteur global d'Échap doit ignorer les cibles situées dans un menu.
- Recherche des réglages : liste dans `composables/useSettingsSearch.ts`. Une ligne de réglage ajoutée y entre aussi, avec le même `data-setting` sur sa ligne, sinon la recherche mène à la page sans la montrer ; les raccourcis y entrent seuls. Correspondance tolérante maison (`utils/search.ts`, sans lib) : accents, fautes, libellé anglais en repli.
- Transitions des réglages : fondu enchaîné par l'API View Transitions (`crossfade` dans `stores/navigation.ts`). Changer de vue ou de sous-page des réglages passe par `go`, `showSettingsSection` ou `showSettingsDetail`, jamais en écrivant la ref directement : sinon pas de fondu.
- Taille de l'interface : zoom natif de la webview (`setZoom`). Les boutons macOS et les positions du glisser-déposer ne suivent pas : `ShellTitleBar` et `useFileDrop` compensent avec `zoomFactor`.
- Champs de texte : pas de correction ni de suggestions de macOS (choix de Jérémy). `autocorrect`, `autocapitalize`, `spellcheck` et `writingsuggestions` coupés sur `<html>` (`index.html`) et rappelés sur chaque `input`/`textarea` : WebKit ne les hérite pas tous.
- Fichiers glissés depuis le Finder : les événements HTML5 ne les reçoivent pas (Tauri capte le dépôt), passer par `useFileDrop` qui teste la position contre la zone.
- Glisser-déposer des onglets et panneaux : `composables/useLayoutDrag.ts` (seuil de 4 px, Échap annule). Il repère les zones par `data-tab-strip`, `data-tab-id`, `data-pane-index`, `#workspace-area` et `#workspace-column` : renommer l'un casse le dépôt sans erreur.
- Disposition (panneaux, tailles) mémorisée en localStorage par `stores/layout.ts` : confort local, rien de critique. Une nouvelle valeur par défaut ne touche pas une disposition déjà enregistrée : changer `STORAGE_KEY` pour repartir de zéro.

## Sécurité

- Capabilities ciblées sur `"main"`, jamais `"*"`. Pas de permission `fs:` ni `shell:` exposée au front : tout passe par nos commandes, qui canonisent les chemins sous la racine du workspace.
- Pas de `v-html` sur une sortie d'agent : le markdown passe par `ChatMarkdown` (lexer marked rendu en nœuds Vue). Une XSS dans la webview donne accès aux commandes, donc au lancement de process.
- La webview n'affiche un fichier local que via le protocole asset, limité à `$APPDATA/attachments/**` et `$APPDATA/backgrounds/**` (image de fond, lue aussi en `fetch` pour ses effets, d'où `asset:` dans `connect-src`) : ne pas élargir ce scope, copier l'image dedans.
- CSP définie dans `tauri.conf.json` : ne pas la repasser à `null`, ne pas charger de CDN. Seul domaine externe autorisé : `api.github.com` (vérification des mises à jour).
- `opener` n'ouvre que les pages du dépôt listées dans la capability (releases, issues/new, LICENSE) : élargir ce scope au cas par cas.

## Divers

- vue-router (hash history) quand un deuxième écran arrive, pas avant.
- On crée un dossier quand il a un premier fichier à contenir.
