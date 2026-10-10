import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import {
  type Combo,
  defaultShortcuts,
  isReserved,
  matchesShortcut,
  overlaps,
  type Shortcut,
  shortcutAria,
  type ShortcutId,
  shortcutIds,
  shortcutLabel,
} from '@/utils/shortcuts'

// null : raccourci désactivé.
type Overrides = Partial<Record<ShortcutId, Combo | null>>

export type ComboProblem = { kind: 'needsMod' | 'reserved' } | { kind: 'taken'; by: ShortcutId }

const STORAGE_KEY = 'nuee.shortcuts.v1'

function load(): Overrides {
  const overrides: Overrides = {}
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    for (const id of shortcutIds) {
      const value = saved[id]
      if (value === null) overrides[id] = null
      else if (typeof value?.key === 'string') {
        overrides[id] = { key: value.key, mod: !!value.mod, alt: !!value.alt, shift: !!value.shift }
      }
    }
  } catch {
    // Raccourcis illisibles : on garde ceux par défaut.
  }
  return overrides
}

// Raccourcis modifiés dans Réglages > Raccourcis clavier, par-dessus ceux de utils/shortcuts.ts.
export const useShortcutsStore = defineStore('shortcuts', () => {
  const overrides = reactive(load())

  watch(
    overrides,
    () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
      } catch {
        // Stockage indisponible : les raccourcis restent valables pour la session.
      }
    },
    { deep: true },
  )

  function get(id: ShortcutId): Shortcut | null {
    const base: Shortcut = defaultShortcuts[id]
    const override = overrides[id]
    if (override === undefined) return base
    return override && { group: base.group, when: base.when, ...override }
  }

  function matches(event: KeyboardEvent, id: ShortcutId) {
    const shortcut = get(id)
    return !!shortcut && matchesShortcut(event, shortcut)
  }

  function label(id: ShortcutId) {
    const shortcut = get(id)
    return shortcut ? shortcutLabel(shortcut) : undefined
  }

  function aria(id: ShortcutId) {
    const shortcut = get(id)
    return shortcut ? shortcutAria(shortcut) : undefined
  }

  // Une lettre seule casserait la saisie ; Entrée ou Échap seuls ne vont qu'aux raccourcis qui n'avaient pas ⌘.
  // Deux raccourcis se gênent s'ils écoutent au même endroit, ou si l'un écoute toute la fenêtre.
  function check(id: ShortcutId, combo: Combo): ComboProblem | null {
    const base: Shortcut = defaultShortcuts[id]
    if (combo.mod !== true && (combo.key.length === 1 || (base.mod ?? true) === true)) return { kind: 'needsMod' }
    if (isReserved(combo)) return { kind: 'reserved' }
    const by = shortcutIds.find((other) => {
      const shortcut = get(other)
      return (
        other !== id &&
        !!shortcut &&
        (!shortcut.when || !base.when || shortcut.when === base.when) &&
        overlaps(combo, shortcut)
      )
    })
    return by ? { kind: 'taken', by } : null
  }

  function set(id: ShortcutId, combo: Combo | null) {
    if (combo && overlaps(combo, defaultShortcuts[id])) delete overrides[id]
    else overrides[id] = combo
  }

  function reset(id?: ShortcutId) {
    for (const key of id ? [id] : shortcutIds) delete overrides[key]
  }

  return { overrides, get, matches, label, aria, check, set, reset }
})
