import { defineStore } from 'pinia'
import { type ComputedRef, type InjectionKey, reactive } from 'vue'
import { terminalRun, terminalStop } from '@/ipc/terminal'
import type { Place } from '@/stores/conversations'

export type CodeRunStatus = 'running' | 'stopping' | 'done' | 'failed' | 'stopped' | 'error'

export interface CodeRun {
  chatId: string
  command: string
  status: CodeRunStatus
  code: number | null
  text: string
}

// Session dont la conversation est affichée, donnée par `ChatPane` aux blocs de code de ses réponses.
export const codeRunPlaceKey: InjectionKey<ComputedRef<{ chatId: string; place: Place }>> = Symbol('codeRunPlace')

// Au-delà, le début de la sortie part.
const MAX_TEXT = 200_000

function capped(text: string) {
  if (text.length <= MAX_TEXT) return text
  const start = text.length - MAX_TEXT
  const line = text.indexOf('\n', start)
  return text.slice(line === -1 ? start : line + 1)
}

// Sorties des commandes lancées depuis les blocs de code, par session et par bloc. Elles appartiennent à l'affichage :
// jamais envoyées à l'agent, gardées en mémoire tant que la session a un onglet ouvert.
export const useCodeRunsStore = defineStore('codeRuns', () => {
  const runs = reactive<Record<string, CodeRun>>({})
  const ids = new Map<string, number>()

  const keyOf = (chatId: string, block: string) => `${chatId}\n${block}`

  function get(chatId: string, block: string) {
    return runs[keyOf(chatId, block)] ?? null
  }

  function active(run: CodeRun | undefined) {
    return run?.status === 'running' || run?.status === 'stopping'
  }

  async function start(chatId: string, place: Place, block: string, command: string) {
    const key = keyOf(chatId, block)
    if (active(runs[key])) return
    runs[key] = { chatId, command, status: 'running', code: null, text: '' }
    const run = runs[key]!
    let pending = ''
    let frame = 0
    const flush = () => {
      frame = 0
      if (pending) run.text = capped(run.text + pending)
      pending = ''
    }
    try {
      const id = await terminalRun(chatId, place, command, (event) => {
        if (runs[key] !== run) return
        if (event.type === 'output') {
          pending += event.data
          frame ||= requestAnimationFrame(flush)
          return
        }
        cancelAnimationFrame(frame)
        flush()
        ids.delete(key)
        run.code = event.code
        run.status = run.status === 'stopping' || event.code === null ? 'stopped' : event.code === 0 ? 'done' : 'failed'
      })
      // Retiré ou arrêté avant que Rust ne rende l'id ; déjà fini, il n'y a rien à garder.
      if (runs[key] !== run) terminalStop(id).catch(() => {})
      else if (active(run)) {
        ids.set(key, id)
        if (run.status === 'stopping') terminalStop(id).catch(() => {})
      }
    } catch {
      if (runs[key] === run) run.status = 'error'
    }
  }

  function stop(chatId: string, block: string) {
    const key = keyOf(chatId, block)
    const run = runs[key]
    if (!run || run.status !== 'running') return
    run.status = 'stopping'
    const id = ids.get(key)
    if (id !== undefined) terminalStop(id).catch(() => {})
  }

  function dismiss(chatId: string, block: string) {
    const key = keyOf(chatId, block)
    const id = ids.get(key)
    if (id !== undefined) terminalStop(id).catch(() => {})
    ids.delete(key)
    delete runs[key]
  }

  // La session n'a plus d'onglet : ses commandes s'arrêtent et leurs sorties partent.
  function closeChat(chatId: string) {
    for (const [key, run] of Object.entries(runs)) if (run.chatId === chatId) dismiss(chatId, key.slice(chatId.length + 1))
  }

  return { get, start, stop, dismiss, closeChat }
})
