export interface Shortcut {
  key: string
  alt?: boolean
  // 'any' : symboles qui demandent ⇧ sur certaines dispositions (+ et 0 en AZERTY).
  shift?: boolean | 'any'
  // Autres caractères ou touches physiques qui déclenchent le même raccourci.
  also?: string[]
  codes?: string[]
  // Ce qu'on affiche quand la touche ne se lit pas telle quelle.
  label?: string
}

export const shortcuts = {
  toggleRail: { key: 'b' },
  togglePanel: { key: 'b', shift: true },
  search: { key: 'k' },
  toggleRightDock: { key: 'b', alt: true },
  toggleBottomDock: { key: 'j' },
  newChat: { key: 'n' },
  closeTab: { key: 'w' },
  split: { key: 'd' },
  settings: { key: ',' },
  zoomIn: { key: '=', shift: 'any', also: ['+'], codes: ['NumpadAdd'], label: '+' },
  zoomOut: { key: '-', shift: 'any', codes: ['NumpadSubtract'], label: '−' },
  zoomReset: { key: '0', shift: 'any', codes: ['Digit0', 'Numpad0'] },
} satisfies Record<string, Shortcut>

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
    mod &&
    event.altKey === !!shortcut.alt &&
    (shortcut.shift === 'any' || event.shiftKey === !!shortcut.shift) &&
    key
  )
}

export function shortcutLabel(shortcut: Shortcut) {
  const key = shortcut.label ?? shortcut.key.toUpperCase()
  const shift = shortcut.shift === true
  if (isMac) return `${shortcut.alt ? '⌥' : ''}${shift ? '⇧' : ''}⌘${key}`
  return `Ctrl+${shift ? 'Shift+' : ''}${shortcut.alt ? 'Alt+' : ''}${key}`
}
