import { FitAddon } from '@xterm/addon-fit'
import { type ITheme, Terminal } from '@xterm/xterm'
import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import { terminalBusy, terminalClose, terminalCloseChat, terminalOpen, terminalResize, terminalWrite } from '@/ipc/terminal'
import { useAppearanceStore } from '@/stores/appearance'
import type { Place } from '@/stores/conversations'
import { useDialogStore } from '@/stores/dialog'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useToastsStore } from '@/stores/toasts'
import { defaultShortcuts, shortcutIds } from '@/utils/shortcuts'

export interface TerminalTab {
  key: string
  number: number
  // Onglet du panneau où il s'affiche : plusieurs shells d'un même groupe se partagent l'onglet (split).
  group: string
}

export type SplitDirection = 'right' | 'down'

// Comme iTerm et T3 Code : au-delà, les volets deviennent trop étroits pour servir.
export const MAX_SPLIT = 4

interface Instance {
  term: Terminal
  fit: FitAddon
  element: HTMLDivElement
  opened: boolean
  // Id du pty côté Rust, null le temps qu'il démarre.
  id: number | null
}

// Comme T3 Code : au-delà, les plus vieilles lignes partent.
const SCROLLBACK = 5000

// Le terminal reste en mémoire quand on change de session : son historique est là au retour.
export const useTerminalsStore = defineStore('terminals', () => {
  const tabs = reactive<Record<string, TerminalTab[]>>({})
  const active = reactive<Record<string, string>>({})
  // Demande de focus servie par le volet une fois le terminal affiché, même s'il vient de s'ouvrir.
  const wantsFocus = ref(false)
  const splits = reactive<Record<string, SplitDirection>>({})
  const instances = new Map<string, Instance>()
  // Shells créés mais pas encore posés à l'écran : leur pty attend de connaître la taille de leur zone.
  const pending = new Map<string, { chatId: string; place: Place }>()

  // Le curseur et la sélection suivent l'accent du thème.
  watch(
    () => {
      const appearance = useAppearanceStore()
      return [appearance.theme, appearance.accent, appearance.resolvedMode]
    },
    () => requestAnimationFrame(() => {
      const next = theme()
      for (const instance of instances.values()) instance.term.options.theme = next
    }),
  )

  function tabsOf(chatId: string) {
    return tabs[chatId] ?? []
  }

  // Les onglets du terminal : un par groupe, dans l'ordre de création.
  function groupsOf(chatId: string) {
    const groups = new Map<string, TerminalTab[]>()
    for (const tab of tabsOf(chatId)) groups.set(tab.group, [...(groups.get(tab.group) ?? []), tab])
    return [...groups.entries()].map(([group, shells]) => ({ group, shells, direction: splits[group] ?? 'right' }))
  }

  // `group` : partage l'onglet de ce groupe (split) ; sinon un nouvel onglet.
  function create(chatId: string, place: Place, group?: string, focus = true) {
    const list = (tabs[chatId] ??= [])
    const key = crypto.randomUUID()
    list.push({ key, number: Math.max(0, ...list.map((item) => item.number)) + 1, group: group ?? key })
    instances.set(key, build())
    pending.set(key, { chatId, place })
    active[chatId] = key
    if (focus) wantsFocus.value = true
  }

  // Partage l'onglet du shell actif : un shell de plus, à droite ou en bas.
  function split(chatId: string, place: Place, direction: SplitDirection) {
    const current = tabsOf(chatId).find((tab) => tab.key === active[chatId])
    if (!current) return create(chatId, place)
    if (tabsOf(chatId).filter((tab) => tab.group === current.group).length >= MAX_SPLIT) return
    if (tabsOf(chatId).filter((tab) => tab.group === current.group).length === 1) splits[current.group] = direction
    create(chatId, place, current.group)
  }

  function start(key: string) {
    const instance = instances.get(key)
    const waiting = pending.get(key)
    if (!instance || !waiting) return
    pending.delete(key)
    const { chatId, place } = waiting
    const { term } = instance
    term.onData((data) => {
      if (instance.id !== null) terminalWrite(instance.id, data).catch(() => {})
    })
    term.onResize(({ cols, rows }) => {
      if (instance.id !== null) terminalResize(instance.id, cols, rows).catch(() => {})
    })
    terminalOpen(chatId, place, term.cols, term.rows, (event) => {
      if (event.type === 'output') term.write(event.data)
      else discard(chatId, key)
    })
      .then((id) => {
        if (instances.get(key) !== instance) return terminalClose(id)
        instance.id = id
        // Une mise à la taille faite pendant que le pty démarrait n'a pas pu lui parvenir.
        terminalResize(id, term.cols, term.rows).catch(() => {})
      })
      .catch((error) => {
        discard(chatId, key)
        const { t } = i18nGlobal()
        useToastsStore().push({ kind: 'error', title: t('dock.terminal.failed'), body: error?.message ?? String(error) })
      })
  }

  // Les raccourcis de la fenêtre passent avant le shell : ⌃` referme le volet, ⌥↑ change de projet.
  function build(): Instance {
    const shortcuts = useShortcutsStore()
    const term = new Terminal({
      allowTransparency: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: SCROLLBACK,
      theme: theme(),
    })
    term.attachCustomKeyEventHandler(
      (event) =>
        event.type !== 'keydown' || !shortcutIds.some((id) => !('when' in defaultShortcuts[id]) && shortcuts.matches(event, id)),
    )
    const fit = new FitAddon()
    term.loadAddon(fit)
    const element = document.createElement('div')
    element.className = 'size-full'
    return { term, fit, element, opened: false, id: null }
  }

  // xterm mesure ses caractères à l'ouverture : il ne s'ouvre qu'une fois posé dans la page, et son pty démarre
  // alors à la bonne taille.
  function attach(key: string, host: HTMLElement) {
    const instance = instances.get(key)
    if (!instance) return
    if (instance.element.parentElement !== host) host.replaceChildren(instance.element)
    if (!instance.opened) {
      instance.term.open(instance.element)
      instance.opened = true
    }
    fit(key)
    // Juste après `open`, xterm n'a pas encore mesuré ses caractères : la mise à la taille ne prend qu'à l'image
    // suivante, sinon le shell garde ses 80 colonnes et les lignes dépassent sans revenir à la ligne.
    requestAnimationFrame(() => {
      fit(key)
      start(key)
    })
  }

  function fit(key: string) {
    const instance = instances.get(key)
    if (instance?.opened && instance.element.isConnected) instance.fit.fit()
  }

  function focus(key: string) {
    instances.get(key)?.term.focus()
  }

  // Comme ⌘K de Terminal.app : l'historique part, la ligne en cours reste.
  function clear(key: string) {
    instances.get(key)?.term.clear()
  }

  async function close(chatId: string, key: string) {
    const instance = instances.get(key)
    if (!instance) return
    const command = instance.id === null ? null : await terminalBusy(instance.id).catch(() => null)
    if (command) {
      const { t } = i18nGlobal()
      const confirmed = await useDialogStore().confirm({
        title: t('dock.terminal.running.title'),
        message: t('dock.terminal.running.message', { command }),
        confirmLabel: t('dock.terminal.running.confirm'),
        danger: true,
      })
      if (!confirmed) return
    }
    if (instance.id !== null) terminalClose(instance.id)
    discard(chatId, key)
  }

  // Les terminaux d'une session qui n'a plus d'onglet ouvert.
  function closeChat(chatId: string) {
    if (!tabs[chatId]) return
    terminalCloseChat(chatId).catch(() => {})
    for (const tab of [...tabs[chatId]]) discard(chatId, tab.key)
    delete tabs[chatId]
    delete active[chatId]
  }

  function discard(chatId: string, key: string) {
    const instance = instances.get(key)
    if (!instance) return
    instances.delete(key)
    pending.delete(key)
    instance.term.dispose()
    instance.element.remove()
    const list = tabs[chatId] ?? []
    const index = list.findIndex((tab) => tab.key === key)
    const group = list[index]?.group
    if (index !== -1) list.splice(index, 1)
    if (group && !list.some((tab) => tab.group === group)) delete splits[group]
    if (active[chatId] === key) {
      const next = list[index] ?? list[index - 1]
      if (next) active[chatId] = next.key
      else delete active[chatId]
    }
  }

  // Commande au premier plan du shell, null à son invite (ou pas encore démarré).
  async function command(key: string) {
    const instance = instances.get(key)
    return instance?.id == null ? null : await terminalBusy(instance.id).catch(() => null)
  }

  function requestFocus() {
    wantsFocus.value = true
  }

  return { tabs, active, splits, wantsFocus, tabsOf, groupsOf, create, split, attach, fit, focus, clear, close, closeChat, command, requestFocus }
})

// Palette ANSI de Brume (et de monocode) : ces couleurs viennent des programmes, pas de l'interface. En clair,
// celle de GitHub Light : les couleurs vives du sombre ne se lisent pas sur du blanc.
export const ANSI = {
  dark: [
    '#1f2a3f', '#f87171', '#4ade80', '#fbbf24', '#60a5fa', '#c084fc', '#22d3ee', '#dce3ee',
    '#64748b', '#fca5a5', '#86efac', '#fde68a', '#93c5fd', '#d8b4fe', '#67e8f9', '#f8fafc',
  ],
  light: [
    '#24292f', '#cf222e', '#116329', '#4d2d00', '#0969da', '#8250df', '#1b7c83', '#6e7781',
    '#57606a', '#a40e26', '#1a7f37', '#633c01', '#218bff', '#a475f9', '#3192aa', '#8c959f',
  ],
} as const

// Le reste comme Brume, en jetons de main.css ramenés en rgba : xterm ne lit ni color-mix ni var().
export function theme(): ITheme {
  const probe = document.createElement('span')
  document.body.append(probe)
  const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const color = (css: string) => {
    probe.style.color = css
    if (!canvas) return getComputedStyle(probe).color
    canvas.clearRect(0, 0, 1, 1)
    canvas.fillStyle = getComputedStyle(probe).color
    canvas.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data
    return `rgba(${r}, ${g}, ${b}, ${((a ?? 255) / 255).toFixed(3)})`
  }
  const ansi = ANSI[useAppearanceStore().resolvedMode]
  const [black, red, green, yellow, blue, magenta, cyan, white] = ansi
  const [brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] = ansi.slice(8)
  const result: ITheme = {
    background: 'rgba(0, 0, 0, 0)',
    foreground: color('var(--color-content)'),
    cursor: color('var(--color-accent)'),
    cursorAccent: color('var(--color-canvas)'),
    selectionBackground: color('color-mix(in srgb, var(--color-accent) 28%, transparent)'),
    selectionForeground: color('var(--color-content)'),
    black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
  }
  probe.remove()
  return result
}
