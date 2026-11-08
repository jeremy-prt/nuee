import { defineStore } from 'pinia'
import { watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import type { OperatorRequest } from '@/ipc/bindings/OperatorRequest'
import { onOperatorRequest, operatorReply } from '@/ipc/operator'
import { isTauriApp } from '@/ipc/system'
import { type ChatItem, type Place, useConversationsStore } from '@/stores/conversations'
import { useProjectsStore } from '@/stores/projects'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

// Messages de Nuée envoyés d'affilée à une session sans que l'utilisateur y écrive : au-delà, deux agents qui se
// répondent tourneraient en boucle.
const MAX_REPORTS = 3
const READ_LIMIT = 20
const CLIP = 2000

const clip = (text: string) => (text.length > CLIP ? `${text.slice(0, CLIP)}…` : text)

// Outils de sessions du serveur MCP `nuee` : un agent liste, lit et lance d'autres sessions, et leur écrit. Une session
// lancée ainsi prévient celle qui l'a lancée à chaque fin de tour.
export const useOperatorStore = defineStore('operator', () => {
  const workspace = useWorkspaceStore()
  const conversations = useConversationsStore()
  const projects = useProjectsStore()

  // Session lancée -> celle qui l'a lancée. En mémoire seulement : un redémarrage coupe le lien.
  const parents = new Map<string, string>()
  const reports = new Map<string, number>()

  if (isTauriApp()) onOperatorRequest(answer)

  async function answer(request: OperatorRequest) {
    try {
      operatorReply(request.id, true, await run(request))
    } catch (error) {
      operatorReply(request.id, false, error instanceof Error ? error.message : String(error))
    }
  }

  function run({ tool, args, caller }: OperatorRequest) {
    switch (tool) {
      case 'list_sessions':
        return list(caller, args.all === true)
      case 'read_session':
        return read(String(args.id ?? ''), typeof args.limit === 'number' ? args.limit : READ_LIMIT)
      case 'start_session':
        return start(caller, args)
      case 'send_message':
        return message(caller, String(args.id ?? ''), String(args.text ?? ''))
      default:
        throw new Error(`outil inconnu : ${tool}`)
    }
  }

  function chat(id: string) {
    const tab = workspace.tabs.find((item) => item.id === id && !item.archived)
    if (!tab) throw new Error(`pas de session ${id} (voir list_sessions)`)
    return tab
  }

  function projectName(projectId: string | null) {
    return projects.byId(projectId)?.name ?? i18nGlobal().t('rail.chats')
  }

  function status(id: string) {
    const conversation = conversations.find(id)
    if (conversation?.approvals.length) return 'attend une autorisation'
    return conversation && conversation.phase !== 'idle' ? 'travaille' : 'au repos'
  }

  function list(caller: string, all: boolean) {
    const projectId = workspace.tabs.find((tab) => tab.id === caller)?.projectId ?? null
    const chats = workspace.startedChats.filter((tab) => tab.id !== caller && (all || tab.projectId === projectId))
    if (!chats.length) return 'Aucune autre session.'
    return [...chats]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((tab) => `- ${tab.id} · ${tab.title ?? 'sans titre'} · ${projectName(tab.projectId)} · ${status(tab.id)} · ${new Date(tab.updatedAt).toISOString()}`)
      .join('\n')
  }

  function line(item: ChatItem) {
    if (item.kind === 'user') return `Utilisateur : ${clip(item.text)}`
    if (item.kind === 'text') return `Agent : ${clip(item.text)}`
    if (item.kind === 'end' && item.status !== 'completed') return `(tour ${item.status}${item.error ? ` : ${item.error}` : ''})`
    if (item.kind === 'error') return `(erreur : ${item.error.message})`
    return null
  }

  async function read(id: string, limit: number) {
    const tab = chat(id)
    const lines = (await conversations.itemsOf(id)).map(line).filter((text) => text !== null)
    const shown = lines.slice(-Math.max(1, limit))
    return [`${tab.title ?? 'sans titre'} · ${projectName(tab.projectId)} · ${status(id)}`, '', ...shown].join('\n\n')
  }

  function placeOf(tab: Tab): Place {
    const project = projects.byId(tab.projectId)
    const worktree = !!project && tab.worktree
    return { cwd: project?.path ?? null, worktree, worktreePath: worktree ? tab.worktreePath : null, worktreeBase: null }
  }

  async function start(caller: string, args: Record<string, unknown>) {
    const prompt = String(args.prompt ?? '').trim()
    if (!prompt) throw new Error('`prompt` manquant')
    const from = workspace.tabs.find((tab) => tab.id === caller)
    let projectId = from?.projectId ?? null
    if (typeof args.project === 'string' && args.project) {
      const wanted = args.project.toLowerCase()
      if (wanted === 'none') projectId = null
      else {
        const project = projects.projects.find((item) => item.name.toLowerCase() === wanted)
        if (!project) throw new Error(`pas de projet ${args.project} (${projects.projects.map((item) => item.name).join(', ')})`)
        projectId = project.id
      }
    }
    const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : null
    const tab = workspace.addChat(projectId, title)
    const project = projects.byId(projectId)
    if (args.worktree === true && project) await projects.checkWorktree(project)
    const worktree = args.worktree === true && !!project && projects.support[project.id] === 'ready'
    workspace.setWorktree(tab.id, worktree)
    workspace.startChat(tab.id, prompt, [])
    parents.set(tab.id, caller)
    conversations.send(tab.id, placeOf(tab), prompt, [])
    return `Session ${tab.id} lancée (${projectName(projectId)}${worktree ? ', dans son propre worktree' : ''}). Elle préviendra ici à la fin de chaque tour.`
  }

  async function loaded(tab: Tab) {
    conversations.open(tab.id, tab.agent, tab.projectId)
    const conversation = conversations.find(tab.id)
    if (!conversation || conversation.loaded) return conversation
    await new Promise<void>((resolve) => {
      const stop = watch(
        () => conversation.loaded,
        (ready) => {
          if (!ready) return
          stop()
          resolve()
        },
      )
    })
    return conversation
  }

  async function message(caller: string, id: string, text: string) {
    if (!text.trim()) throw new Error('`text` manquant')
    if (id === caller) throw new Error('une session ne peut pas s\'écrire à elle-même')
    const tab = chat(id)
    const conversation = await loaded(tab)
    if (!tab.started) workspace.startChat(id, text, [])
    const busy = conversation?.phase !== 'idle'
    conversations.send(id, conversation?.lastPlace ?? placeOf(tab), text, [])
    return busy ? `Message mis en file : la session ${id} travaille encore.` : `Message envoyé à la session ${id}.`
  }

  // Fin de tour d'une session lancée par un agent : celle qui l'a lancée reçoit sa dernière réponse.
  function turnEnded(chatId: string, items: readonly ChatItem[]) {
    const parent = parents.get(chatId)
    if (!parent || !workspace.tabs.some((tab) => tab.id === parent && !tab.archived)) return
    const count = reports.get(parent) ?? 0
    if (count >= MAX_REPORTS) return
    reports.set(parent, count + 1)
    const tab = workspace.tabs.find((item) => item.id === chatId)
    let answer = ''
    for (let i = items.length - 1; i >= 0 && !answer; i--) {
      const item = items[i]
      if (item?.kind === 'text') answer = clip(item.text)
    }
    const note = i18nGlobal().t('operator.reported', { title: tab?.title ?? chatId, id: chatId, answer })
    message(chatId, parent, note).catch((error) => console.error('session', error))
  }

  // L'utilisateur a écrit dans la session : les messages de Nuée peuvent reprendre.
  function userSpoke(chatId: string) {
    reports.delete(chatId)
  }

  return { turnEnded, userSpoke }
})
