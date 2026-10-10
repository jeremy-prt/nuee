import type en from '@/i18n/locales/en'

type Labels = (typeof en)['settings']['shortcuts']

export interface Combo {
  key: string
  // ⌘ sur Mac, Ctrl ailleurs : exigé par défaut, `false` l'interdit, 'any' l'accepte sans l'afficher.
  mod?: boolean | 'any'
  alt?: boolean
  // 'any' : symboles qui demandent ⇧ sur certaines dispositions (+ et 0 en AZERTY).
  shift?: boolean | 'any'
  // Autres caractères ou touches physiques qui déclenchent le même raccourci.
  also?: string[]
  codes?: string[]
  // Ce qu'on affiche quand la touche ne se lit pas telle quelle.
  label?: string
}

export interface Shortcut extends Combo {
  // Rubrique de Réglages > Raccourcis clavier ; les rubriques s'affichent dans l'ordre de cette liste.
  group: keyof Labels['groups']
  // Écouté seulement là, sinon sur toute la fenêtre : deux contextes différents peuvent partager une touche.
  when?: 'composer' | 'approval' | 'settings'
  fixed?: boolean
}

// Clés = libellés de settings.shortcuts.items dans en.ts : vue-tsc bloque si l'un manque d'un côté.
// Les modifs de l'utilisateur s'appliquent dans stores/shortcuts.ts : c'est lui qu'on lit ailleurs.
export const defaultShortcuts = {
  search: { group: 'navigation', key: 'k' },
  settings: { group: 'navigation', key: ',' },
  closeSettings: { group: 'navigation', key: 'Escape', mod: false, when: 'settings' },
  searchSettings: { group: 'navigation', key: 'f', when: 'settings' },
  newChat: { group: 'chats', key: 'n' },
  closeTab: { group: 'chats', key: 'w' },
  split: { group: 'chats', key: 'd' },
  send: { group: 'message', key: 'Enter', mod: 'any', when: 'composer' },
  // Comportement natif du champ, laissé libre par `send` : listé pour qu'on le trouve.
  newline: { group: 'message', key: 'Enter', mod: false, shift: true, when: 'composer', fixed: true },
  approve: { group: 'message', key: 'Enter', when: 'approval' },
  deny: { group: 'message', key: 'Escape', mod: false, when: 'approval' },
  toggleRail: { group: 'interface', key: 'b' },
  togglePanel: { group: 'interface', key: 'b', shift: true },
  toggleBottomDock: { group: 'interface', key: 'j' },
  toggleRightDock: { group: 'interface', key: 'b', alt: true },
  zoomIn: { group: 'interface', key: '=', shift: 'any', also: ['+'], codes: ['NumpadAdd'], label: '+' },
  zoomOut: { group: 'interface', key: '-', shift: 'any', codes: ['NumpadSubtract'], label: '−' },
  zoomReset: { group: 'interface', key: '0', shift: 'any', codes: ['Digit0', 'Numpad0'] },
} satisfies Record<keyof Labels['items'], Shortcut>

export type ShortcutId = keyof typeof defaultShortcuts

export const shortcutIds = Object.keys(defaultShortcuts) as ShortcutId[]

export const isMac = navigator.userAgent.includes('Mac')

const MODIFIERS = ['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Fn', 'OS', 'Dead', 'Unidentified']

const KEY_NAMES: Record<string, string> = {
  Enter: '↵',
  Escape: 'Esc',
  ' ': 'Space',
  Backspace: '⌫',
  Delete: '⌦',
  Tab: '⇥',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

// Copier, coller, annuler, quitter… : le menu Édition ou le système les prend avant l'app.
const reserved: Combo[] = [
  ...['a', 'c', 'v', 'x', 'z', 'q'].map((key) => ({ key })),
  { key: 'z', shift: true },
  ...(isMac ? [{ key: 'h' }, { key: 'h', alt: true }, { key: 'm' }] : [{ key: 'y' }]),
]

// La lettre tapée suit la disposition du clavier (en AZERTY, W est sur la touche physique KeyZ).
// Sur macOS, ⌥ remplace la lettre par un symbole (⌥B donne « ∫ ») : on retombe alors sur la touche physique.
function pressedKey(event: KeyboardEvent) {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase()
  return event.code.replace(/^Key/, '').toLowerCase()
}

export function matchesShortcut(event: KeyboardEvent, combo: Combo) {
  const mod = isMac ? event.metaKey : event.ctrlKey
  const key =
    pressedKey(event) === combo.key ||
    event.key === combo.key ||
    !!combo.also?.includes(event.key) ||
    !!combo.codes?.includes(event.code)
  return (
    (combo.mod === 'any' || mod === (combo.mod ?? true)) &&
    event.altKey === !!combo.alt &&
    (combo.shift === 'any' || event.shiftKey === !!combo.shift) &&
    key
  )
}

// Combinaison tapée pendant l'enregistrement d'un raccourci ; null tant qu'on ne tient que des modificateurs.
export function comboFromEvent(event: KeyboardEvent): Combo | null {
  const letter = /^[a-z]$/i.test(event.key) || (event.altKey && /^Key[A-Z]$/.test(event.code))
  if (!letter && MODIFIERS.includes(event.key)) return null
  return {
    key: letter ? pressedKey(event) : event.key,
    mod: isMac ? event.metaKey : event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  }
}

function either<T>(a: T | 'any', b: T | 'any') {
  return a === 'any' || b === 'any' || a === b
}

// Vrai si une même frappe déclencherait les deux.
export function overlaps(a: Combo, b: Combo) {
  const keys = [b.key, ...(b.also ?? [])]
  return (
    [a.key, ...(a.also ?? [])].some((key) => keys.includes(key)) &&
    either(a.mod ?? true, b.mod ?? true) &&
    either(a.shift ?? false, b.shift ?? false) &&
    !!a.alt === !!b.alt
  )
}

export function isReserved(combo: Combo) {
  return reserved.some((item) => overlaps(combo, item))
}

export function shortcutKeys(combo: Combo) {
  const key = combo.label ?? KEY_NAMES[combo.key] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key)
  const mod = (combo.mod ?? true) === true
  const shift = combo.shift === true
  const keys = isMac
    ? [combo.alt && '⌥', shift && '⇧', mod && '⌘', key]
    : [mod && 'Ctrl', shift && 'Shift', combo.alt && 'Alt', key]
  return keys.filter((part): part is string => !!part)
}

export function shortcutLabel(combo: Combo) {
  return shortcutKeys(combo).join(isMac ? '' : '+')
}

// Format de aria-keyshortcuts : noms de touches de KeyboardEvent.key, joints par « + ».
export function shortcutAria(combo: Combo) {
  const key = combo.key === ' ' ? 'Space' : combo.key.length === 1 ? combo.key.toUpperCase() : combo.key
  const mod = (combo.mod ?? true) === true && (isMac ? 'Meta' : 'Control')
  return [mod, combo.alt && 'Alt', combo.shift === true && 'Shift', key].filter(Boolean).join('+')
}
