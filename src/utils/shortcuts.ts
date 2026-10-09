export interface Shortcut {
  key: string
  alt?: boolean
  shift?: boolean
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
  return (
    mod &&
    event.altKey === !!shortcut.alt &&
    event.shiftKey === !!shortcut.shift &&
    pressedKey(event) === shortcut.key
  )
}

export function shortcutLabel(shortcut: Shortcut) {
  const key = shortcut.key.toUpperCase()
  if (isMac) return `${shortcut.alt ? '⌥' : ''}${shortcut.shift ? '⇧' : ''}⌘${key}`
  return `Ctrl+${shortcut.shift ? 'Shift+' : ''}${shortcut.alt ? 'Alt+' : ''}${key}`
}
