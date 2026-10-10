import type en from '@/i18n/locales/en'

type Labels = (typeof en)['settings']['shortcuts']

export interface Shortcut {
  // Rubrique de Réglages > Raccourcis clavier ; les rubriques s'affichent dans l'ordre de cette liste.
  group: keyof Labels['groups']
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

// Clés = libellés de settings.shortcuts.items dans en.ts : vue-tsc bloque si l'un manque d'un côté.
export const shortcuts = {
  search: { group: 'navigation', key: 'k' },
  settings: { group: 'navigation', key: ',' },
  closeSettings: { group: 'navigation', key: 'Escape', mod: false, label: 'Esc' },
  newChat: { group: 'chats', key: 'n' },
  closeTab: { group: 'chats', key: 'w' },
  split: { group: 'chats', key: 'd' },
  send: { group: 'message', key: 'Enter', mod: 'any', label: '↵' },
  // Comportement natif du champ, laissé libre par `send` : listé pour qu'on le trouve.
  newline: { group: 'message', key: 'Enter', mod: false, shift: true, label: '↵' },
  approve: { group: 'message', key: 'Enter', label: '↵' },
  deny: { group: 'message', key: 'Escape', mod: false, label: 'Esc' },
  toggleRail: { group: 'interface', key: 'b' },
  togglePanel: { group: 'interface', key: 'b', shift: true },
  toggleBottomDock: { group: 'interface', key: 'j' },
  toggleRightDock: { group: 'interface', key: 'b', alt: true },
  zoomIn: { group: 'interface', key: '=', shift: 'any', also: ['+'], codes: ['NumpadAdd'], label: '+' },
  zoomOut: { group: 'interface', key: '-', shift: 'any', codes: ['NumpadSubtract'], label: '−' },
  zoomReset: { group: 'interface', key: '0', shift: 'any', codes: ['Digit0', 'Numpad0'] },
} satisfies Record<keyof Labels['items'], Shortcut>

export type ShortcutId = keyof typeof shortcuts

const isMac = navigator.userAgent.includes('Mac')

// La lettre tapée suit la disposition du clavier (en AZERTY, W est sur la touche physique KeyZ).
// Sur macOS, ⌥ remplace la lettre par un symbole (⌥B donne « ∫ ») : on retombe alors sur la touche physique.
function pressedKey(event: KeyboardEvent) {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase()
  return event.code.replace(/^Key/, '').toLowerCase()
}

export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut) {
  const mod = isMac ? event.metaKey : event.ctrlKey
  const key =
    pressedKey(event) === shortcut.key ||
    event.key === shortcut.key ||
    !!shortcut.also?.includes(event.key) ||
    !!shortcut.codes?.includes(event.code)
  return (
    (shortcut.mod === 'any' || mod === (shortcut.mod ?? true)) &&
    event.altKey === !!shortcut.alt &&
    (shortcut.shift === 'any' || event.shiftKey === !!shortcut.shift) &&
    key
  )
}

export function shortcutKeys(shortcut: Shortcut) {
  const key = shortcut.label ?? shortcut.key.toUpperCase()
  const mod = (shortcut.mod ?? true) === true
  const shift = shortcut.shift === true
  const keys = isMac
    ? [shortcut.alt && '⌥', shift && '⇧', mod && '⌘', key]
    : [mod && 'Ctrl', shift && 'Shift', shortcut.alt && 'Alt', key]
  return keys.filter((part): part is string => !!part)
}

export function shortcutLabel(shortcut: Shortcut) {
  return shortcutKeys(shortcut).join(isMac ? '' : '+')
}
