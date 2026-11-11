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

const STORAGE_KEY = 'nuee.shortcuts.v2'
const V1_KEY = 'nuee.shortcuts.v1'
// Valeurs par défaut changées depuis la v1 : seuls les écarts aux valeurs par défaut sont enregistrés.
const CHANGED_IN_V2: ShortcutId[] = ['toggleRightDock', 'toggleBrowser']

// Le terminal capte ses raccourcis avant la fenêtre : son ⌘D ne gêne pas celui du reste de l'app.
function sameZone(a: Shortcut['when'], b: Shortcut['when']) {
  if (a === 'terminal' || b === 'terminal') return a === b
  return !a || !b || a === b
}

function parse(saved: Record<string, unknown>): Overrides {
  const overrides: Overrides = {}
  for (const id of shortcutIds) {
    const value = saved[id] as Partial<Combo> | null | undefined
    if (value === null) overrides[id] = null
    else if (typeof value?.key === 'string') {
      overrides[id] = { key: value.key, mod: !!value.mod, ctrl: !!value.ctrl, alt: !!value.alt, shift: !!value.shift }
    }
  }
  return overrides
}

// Un choix de l'utilisateur qui tombe sur une nouvelle valeur par défaut garde la priorité : l'autre raccourci est
// désactivé, sinon la même touche déclencherait le premier de la liste d'App.vue sans prévenir.
function migrateV1(overrides: Overrides) {
  for (const id of CHANGED_IN_V2) {
    if (overrides[id] !== undefined) continue
    const base: Shortcut = defaultShortcuts[id]
    const taken = shortcutIds.some((other) => {
      const combo = overrides[other]
      return other !== id && !!combo && sameZone((defaultShortcuts[other] as Shortcut).when, base.when) && overlaps(combo, base)
    })
    if (taken) overrides[id] = null
  }
  return overrides
}

function load(): Overrides {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) return parse(JSON.parse(saved))
    const v1 = localStorage.getItem(V1_KEY)
    if (v1 === null) return {}
    const overrides = migrateV1(parse(JSON.parse(v1)))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
    localStorage.removeItem(V1_KEY)
    return overrides
  } catch {
    // Raccourcis illisibles : on garde ceux par défaut.
    return {}
  }
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
    if (!override) return null
    // Un raccourci à plusieurs touches (⌘1…9) ne se règle que par ses modificateurs : il garde ses chiffres.
    if (id === 'goToTab') return { ...base, mod: override.mod, ctrl: override.ctrl, alt: override.alt }
    return { group: base.group, when: base.when, ...override }
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
    if (combo.mod !== true && !combo.ctrl && (combo.key.length === 1 || (base.mod ?? true) === true)) return { kind: 'needsMod' }
    if (isReserved(combo)) return { kind: 'reserved' }
    const by = shortcutIds.find((other) => {
      const shortcut = get(other)
      return (
        other !== id &&
        !!shortcut &&
        sameZone(shortcut.when, base.when) &&
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
