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
}

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
  const instances = new Map<string, Instance>()
  // Zone du volet où se pose le terminal affiché, null volet fermé.
  let host: HTMLElement | null = null

  // Le curseur et la sélection suivent l'accent du thème.
  watch(
    () => useAppearanceStore().theme,
    () => requestAnimationFrame(() => {
      const next = theme()
      for (const instance of instances.values()) instance.term.options.theme = next
    }),
  )

  function setHost(element: HTMLElement | null) {
    host = element
  }

  // Le volet qui se démonte peut le faire après celui qui le remplace : il ne retire que sa propre zone.
  function releaseHost(element: HTMLElement | null) {
    if (host === element) host = null
  }

  function tabsOf(chatId: string) {
    return tabs[chatId] ?? []
  }

  function create(chatId: string, place: Place) {
    if (!host) return
    const list = (tabs[chatId] ??= [])
    const tab = { key: crypto.randomUUID(), number: Math.max(0, ...list.map((item) => item.number)) + 1 }
    const instance = build()
    instances.set(tab.key, instance)
    list.push(tab)
    active[chatId] = tab.key
    attach(tab.key)
    wantsFocus.value = true

    const { term } = instance
    term.onData((data) => {
      if (instance.id !== null) terminalWrite(instance.id, data).catch(() => {})
    })
    term.onResize(({ cols, rows }) => {
      if (instance.id !== null) terminalResize(instance.id, cols, rows).catch(() => {})
    })
    terminalOpen(chatId, place, term.cols, term.rows, (event) => {
      if (event.type === 'output') term.write(event.data)
      else discard(chatId, tab.key)
    })
      .then((id) => {
        if (instances.get(tab.key) === instance) instance.id = id
        else terminalClose(id)
      })
      .catch((error) => {
        discard(chatId, tab.key)
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

  // xterm mesure ses caractères à l'ouverture : il ne s'ouvre qu'une fois posé dans la page.
  function attach(key: string) {
    const instance = instances.get(key)
    if (!instance || !host) return
    if (instance.element.parentElement !== host) host.replaceChildren(instance.element)
    if (!instance.opened) {
      instance.term.open(instance.element)
      instance.opened = true
    }
    fit(key)
  }

  function fit(key: string) {
    const instance = instances.get(key)
    if (instance?.opened && instance.element.isConnected) instance.fit.fit()
  }

  function focus(key: string) {
    instances.get(key)?.term.focus()
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
    instance.term.dispose()
    instance.element.remove()
    const list = tabs[chatId] ?? []
    const index = list.findIndex((tab) => tab.key === key)
    if (index !== -1) list.splice(index, 1)
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

  return { tabs, active, wantsFocus, tabsOf, setHost, releaseHost, create, attach, fit, focus, close, closeChat, command, requestFocus }
})

// Palette ANSI de Brume (et de monocode) : ces couleurs viennent des programmes, pas de l'interface.
const ANSI = [
  '#1f2a3f', '#f87171', '#4ade80', '#fbbf24', '#60a5fa', '#c084fc', '#22d3ee', '#dce3ee',
  '#64748b', '#fca5a5', '#86efac', '#fde68a', '#93c5fd', '#d8b4fe', '#67e8f9', '#f8fafc',
] as const

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
  const [black, red, green, yellow, blue, magenta, cyan, white] = ANSI
  const [brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] = ANSI.slice(8)
  const result: ITheme = {
    background: 'rgba(0, 0, 0, 0)',
    foreground: color('var(--color-content)'),
    cursor: color('var(--color-accent)'),
    cursorAccent: color('var(--color-canvas)'),
    selectionBackground: color('color-mix(in srgb, var(--color-accent) 28%, transparent)'),
    selectionForeground: ANSI[15],
    black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
  }
  probe.remove()
  return result
}
