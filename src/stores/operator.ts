import { defineStore } from 'pinia'
import { watch } from 'vue'
import { i18nGlobal } from '@/i18n'
import type { OperatorRequest } from '@/ipc/bindings/OperatorRequest'
import { onOperatorRequest, operatorReply } from '@/ipc/operator'
import { isTauriApp } from '@/ipc/system'
import type { Effort } from '@/ipc/bindings/Effort'
import { useCatalogStore } from '@/stores/catalog'
import { type ChatItem, type Place, useConversationsStore } from '@/stores/conversations'
import { useOrchestraStore } from '@/stores/orchestra'
import { useProjectsStore } from '@/stores/projects'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

// Messages de Nuée envoyés d'affilée à une session sans que l'utilisateur y écrive : au-delà, deux agents qui se
// répondent tourneraient en boucle.
const MAX_REPORTS = 3
// Mode Orchestre : sessions lancées qui travaillent en même temps, au plus (règle de j-orchestre).
const MAX_WORKERS = 3
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const READ_LIMIT = 20
const CLIP = 2000

const clip = (text: string) => (text.length > CLIP ? `${text.slice(0, CLIP)}…` : text)

// Outils de sessions du serveur MCP `nuee` : un agent liste, lit, lance, renomme et archive d'autres sessions, et leur
// écrit. Une session lancée ainsi (`parentId`, gardé en base) prévient celle qui l'a lancée à chaque fin de tour.
export const useOperatorStore = defineStore('operator', () => {
  const workspace = useWorkspaceStore()
  const conversations = useConversationsStore()
  const projects = useProjectsStore()
  const catalog = useCatalogStore()
  const orchestra = useOrchestraStore()

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
      case 'rename_session':
        return rename(caller, String(args.id ?? ''), String(args.title ?? ''))
      case 'archive_session':
        return archive(caller, String(args.id ?? ''))
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
    if (item.kind === 'user' && item.from) return `Session ${item.from.id} : ${clip(item.text)}`
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
    if (orchestra.isOn(caller)) {
      const working = workspace.tabs.filter((tab) => tab.parentId === caller && !tab.archived && (conversations.find(tab.id)?.phase ?? 'idle') !== 'idle')
      if (working.length >= MAX_WORKERS) throw new Error(`${MAX_WORKERS} sessions lancées travaillent déjà : attendre un retour avant d'en lancer une autre`)
    }
    const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : null
    const agent = projects.chatAgent(projectId)
    const model = typeof args.model === 'string' && args.model.trim() ? pickModel(agent, args.model.trim()) : null
    const effort = EFFORTS.find((value) => value === args.effort) ?? null
    const tab = workspace.addChat(projectId, title, undefined, caller)
    const conversation = conversations.find(tab.id)
    if (conversation && (model || effort)) conversations.setOptions(tab.id, { ...conversation.options, ...(model ? { model } : {}), ...(effort ? { effort } : {}) })
    const project = projects.byId(projectId)
    if (args.worktree === true && project) await projects.checkWorktree(project)
    const worktree = args.worktree === true && !!project && projects.support[project.id] === 'ready'
    workspace.setWorktree(tab.id, worktree)
    workspace.startChat(tab.id, prompt, [])
    conversations.send(tab.id, placeOf(tab), prompt, [], false, { id: caller, title: from?.title ?? null, task: true })
    const options = conversations.find(tab.id)?.options
    const where = [projectName(projectId), worktree && 'dans son propre worktree', options && catalog.modelLabel(agent, catalog.resolve(agent, options).model)]
    // Début gardé tel quel : `ChatMessage` en tire l'id de la carte « Tâche ».
    return `Session ${tab.id} lancée (${where.filter(Boolean).join(', ')}). L'utilisateur la voit déjà en carte « Tâche » : ne pas annoncer ce lancement ni citer cet id. Elle préviendra ici à la fin de chaque tour.`
  }

  // Modèle demandé par l'agent : valeur exacte du catalogue, sinon famille (« sonnet ») trouvée dans les libellés.
  function pickModel(agent: Tab['agent'], wanted: string) {
    catalog.load(agent)
    const models = catalog.get(agent)?.models
    if (!models) return wanted
    const name = wanted.toLowerCase()
    const found =
      models.find((model) => model.value.toLowerCase() === name) ??
      models.find((model) => !model.legacy && model.label.toLowerCase().startsWith(name)) ??
      models.find((model) => model.label.toLowerCase().includes(name))
    if (!found) throw new Error(`modèle ${wanted} inconnu (${models.filter((model) => !model.legacy).map((model) => model.value).join(', ')})`)
    return found.value
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

  async function message(caller: string, id: string, text: string, report = false) {
    if (!text.trim()) throw new Error('`text` manquant')
    if (id === caller) throw new Error('une session ne peut pas s\'écrire à elle-même')
    const tab = chat(id)
    const conversation = await loaded(tab)
    if (!tab.started) workspace.startChat(id, text, [])
    const busy = conversation?.phase !== 'idle'
    const sender = workspace.tabs.find((item) => item.id === caller)
    const from = { id: caller, title: sender?.title ?? null, ...(report ? { report } : {}) }
    conversations.send(id, conversation?.lastPlace ?? placeOf(tab), text, [], false, from)
    return busy ? `Message mis en file : la session ${id} travaille encore.` : `Message envoyé à la session ${id}.`
  }

  async function rename(caller: string, id: string, title: string) {
    if (!title.trim()) throw new Error('`title` manquant')
    const tab = id === caller ? workspace.tabs.find((item) => item.id === id) : chat(id)
    if (!tab) throw new Error(`pas de session ${id}`)
    await workspace.renameChat(id, title)
    return `Session ${id} renommée « ${tab.title} ».`
  }

  async function archive(caller: string, id: string) {
    if (id === caller) throw new Error('une session ne peut pas s\'archiver elle-même')
    const tab = chat(id)
    if (!tab.started) throw new Error(`la session ${id} n'a pas encore commencé`)
    await workspace.archiveChat(id)
    return `Session ${id} archivée (Réglages › Archives la restaure).`
  }

  // Fin de tour d'une session lancée par un agent : celle qui l'a lancée reçoit sa dernière réponse.
  function turnEnded(chatId: string, items: readonly ChatItem[]) {
    const parent = workspace.tabs.find((tab) => tab.id === chatId)?.parentId
    if (!parent || !workspace.tabs.some((tab) => tab.id === parent && !tab.archived)) return
    const count = reports.get(parent) ?? 0
    if (count >= MAX_REPORTS) return
    reports.set(parent, count + 1)
    let answer = ''
    for (let i = items.length - 1; i >= 0 && !answer; i--) {
      const item = items[i]
      if (item?.kind === 'text') answer = clip(item.text)
    }
    message(chatId, parent, answer || '…', true).catch((error) => console.error('session', error))
  }

  // L'utilisateur a écrit dans la session : les messages de Nuée peuvent reprendre.
  function userSpoke(chatId: string) {
    reports.delete(chatId)
  }

  return { turnEnded, userSpoke }
})
