import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Attachment } from '@/ipc/bindings/Attachment'
import { chatList, chatRename, chatSetArchived, chatSetPinned, chatSetWorktree, chatTitle } from '@/ipc/chat'
import { i18nGlobal } from '@/i18n'
import { useDraftsStore } from '@/stores/drafts'
import { useGitPanelStore } from '@/stores/gitPanel'
import { useLayoutStore } from '@/stores/layout'
import { useMentionsStore } from '@/stores/mentions'
import { useConversationsStore } from '@/stores/conversations'
import { useGeneralStore } from '@/stores/general'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useBrowserStore } from '@/stores/browser'
import { useCodeRunsStore } from '@/stores/codeRuns'
import { useTerminalsStore } from '@/stores/terminals'
import { useToastsStore } from '@/stores/toasts'
import { useWorktreesStore } from '@/stores/worktrees'

export interface Tab {
  id: string
  kind: 'chat'
  number: number
  projectId: string | null
  agent: AgentKind
  // null jusqu'au premier message : on affiche alors « Chat <number> ».
  title: string | null
  // Un chat n'entre dans l'historique qu'une fois son premier message envoyé.
  started: boolean
  // L'agent travaille dans un worktree du projet. Réglable jusqu'au premier message.
  worktree: boolean
  // Worktree rejoint, ou le sien une fois créé. null avec worktree : le sien, créé au premier message.
  worktreePath: string | null
  // Masqué de l'historique, retrouvé dans Réglages › Archives.
  archived: boolean
  archivedAt: number | null
  createdAt: number
  // Dernier message ou fin de tour (ms) : affiché dans la liste, point de départ de l'archivage automatique.
  updatedAt: number
  // En haut de la liste du contexte ; l'archivage automatique le laisse.
  pinned: boolean
  // Recopiés de la conversation à chaque enregistrement : la liste les montre sans la charger.
  model: string | null
  added: number
  removed: number
  // Session dont l'agent a lancé celle-ci : la liste l'imbrique dessous.
  parentId: string | null
  // Lancée par une action git de fond (`stores/gitActions.ts`), sous sa session d'origine (`parentId`).
  background: boolean
}

interface PaneLayout {
  // Onglets ouverts dans la barre de titre. Fermer un onglet garde le chat dans l'historique.
  tabs: string[]
  // Onglet affiché dans chaque pane, de gauche à droite.
  panes: string[]
  focused: number
}

const MAX_PANES = 2
const SEED_LENGTH = 50
const DAY = 86_400_000
const PURGE_EVERY = 3_600_000
const RESUME_WITHIN = 3_600_000

// Titre affiché tout de suite, le temps que l'agent en propose un meilleur.
function titleSeed(prompt: string, attachments: Attachment[]) {
  const line = prompt.split('\n').find((text) => text.trim())?.trim() ?? attachments.map((attachment) => attachment.name).join(', ')
  return line.length > SEED_LENGTH ? `${line.slice(0, SEED_LENGTH - 1).trimEnd()}…` : line
}

// Chaque contexte (un projet, ou les chats sans projet) a ses onglets et sa disposition.
export const useWorkspaceStore = defineStore('workspace', () => {
  const navigation = useNavigationStore()
  const conversations = useConversationsStore()
  const projects = useProjectsStore()
  const general = useGeneralStore()
  // Tous les chats enregistrés, ouverts ou non.
  const tabs = ref<Tab[]>([])
  const layouts = reactive<Record<string, PaneLayout>>({})
  // Sessions d'actions git qui se déroulent sans accroc : hors de la liste, de la recherche et des outils de sessions.
  // En mémoire seulement : après un redémarrage, une action interrompue réapparaît sous sa session d'origine.
  const hidden = reactive(new Set<string>())

  // Onglets non repris au lancement (choix de Jérémy) : l'app repart sur « Nouvel espace de travail ».
  chatList()
    .then((chats) => {
      const known = new Set(chats.map((chat) => chat.id))
      tabs.value = [...chats.map((chat) => ({ ...chat, kind: 'chat' as const })), ...tabs.value.filter((tab) => !known.has(tab.id))]
      // Les vierges d'un lancement précédent ne sont dans aucun onglet ni dans l'historique : rien n'y ramène.
      for (const chat of chats) if (!chat.started && !Object.values(layouts).some((layout) => layout.tabs.includes(chat.id))) void deleteChat(chat.id)
      useDraftsStore().prune(new Set(tabs.value.map((tab) => tab.id)))
    })
    .then(() => {
      tidy()
      setInterval(tidy, PURGE_EVERY)
      ready.value = true
    })
    .catch((error) => console.error('historique', error))

  const contextKey = computed(() => navigation.projectId ?? '')

  // Une session vierge quittée sans brouillon est fermée au départ, pour ne pas retomber dessus au retour. Rien
  // avant le chargement de l'historique : `land` ouvrirait une session neuve au lieu de la dernière.
  const ready = ref(false)
  watch([ready, () => navigation.view, () => navigation.projectId], ([isReady], [, , from]) => {
    if (!isReady) return
    const switched = from !== navigation.projectId
    const left = switched ? layouts[from ?? ''] : null
    if (left) {
      for (const id of left.panes) seenAt[id] = Date.now()
      for (const id of [...left.tabs]) if (isBlank(id)) closeTab(id, left)
    }
    land(switched)
  })

  function layoutOf(key: string) {
    layouts[key] ??= { tabs: [], panes: [], focused: 0 }
    return layouts[key] as PaneLayout
  }

  function current() {
    return layoutOf(contextKey.value)
  }

  const panes = computed(() => layouts[contextKey.value]?.panes ?? [])
  const focusedPane = computed({
    get: () => layouts[contextKey.value]?.focused ?? 0,
    set: (index: number) => {
      current().focused = index
    },
  })
  const activeTabId = computed(() => panes.value[focusedPane.value] ?? null)
  const contextTabs = computed(() =>
    (layouts[contextKey.value]?.tabs ?? []).flatMap((id) => tabs.value.find((tab) => tab.id === id) ?? []),
  )
  const pinnedTabs = computed(() =>
    useLayoutStore().pinnedTabs.flatMap((id) => tabs.value.find((tab) => tab.id === id && tab.started && !tab.archived) ?? []),
  )
  // Bande d'onglets : les épinglés, quel que soit leur projet, puis ceux du contexte.
  const stripTabs = computed(() => [...pinnedTabs.value, ...contextTabs.value.filter((tab) => !isTabPinned(tab.id))])
  const startedChats = computed(() => tabs.value.filter((tab) => tab.started && !tab.archived && !hidden.has(tab.id)))
  const archivedChats = computed(() =>
    tabs.value.filter((tab) => tab.archived).sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
  )
  // Historique de la barre latérale, le plus récent en haut, les sessions épinglées à part.
  const contextChats = computed(() => tabsFor(navigation.projectId).filter((tab) => tab.started && !tab.archived && !hidden.has(tab.id)).reverse())
  // Sessions lancées par l'agent d'une autre, rangées sous la plus haute de leurs ancêtres visibles dans la liste,
  // dans l'ordre de lancement. Une épinglée, ou dont l'ancêtre est ailleurs (archivé, autre projet), reste à sa place.
  const nestedChats = computed(() => {
    const shown = new Map(contextChats.value.map((tab) => [tab.id, tab]))
    const byParent = new Map<string, Tab[]>()
    const childIds = new Set<string>()
    for (const tab of [...contextChats.value].reverse()) {
      if (tab.pinned) continue
      let root = tab.parentId ? shown.get(tab.parentId) : undefined
      const seen = new Set([tab.id])
      while (root?.parentId && !root.pinned && !seen.has(root.id) && shown.has(root.parentId)) {
        seen.add(root.id)
        root = shown.get(root.parentId)
      }
      if (!root || root.id === tab.id) continue
      childIds.add(tab.id)
      byParent.set(root.id, [...(byParent.get(root.id) ?? []), tab])
    }
    return { byParent, childIds }
  })
  const pinnedChats = computed(() => contextChats.value.filter((tab) => tab.pinned))
  const recentChats = computed(() => contextChats.value.filter((tab) => !tab.pinned && !nestedChats.value.childIds.has(tab.id)))

  function tabsFor(projectId: string | null) {
    return tabs.value.filter((tab) => tab.projectId === projectId)
  }

  // Premier numéro libre du contexte : supprimer « Chat 2 » puis en créer un autre redonne « Chat 2 ».
  function nextChatNumber(projectId: string | null) {
    const used = new Set(tabsFor(projectId).map((tab) => tab.number))
    let number = 1
    while (used.has(number)) number++
    return number
  }

  // `title` : titre fixé d'avance (chat ouvert par une commande), l'agent n'en propose pas d'autre.
  // `worktreePath` : worktree rejoint dès la création ; le poser ensuite partirait avant la ligne en base.
  function createChat(title: string | null = null, worktreePath: string | null | undefined = undefined) {
    const tab = addChat(navigation.projectId, title, worktreePath)
    current().tabs.push(tab.id)
    return tab
  }

  // Session ajoutée à la liste sans ouvrir d'onglet : celle qu'un agent lance depuis une autre (`parentId`), ou celle
  // d'une action git de fond (`background`, cachée dès sa création, avec l'agent de sa session d'origine).
  function addChat(
    projectId: string | null,
    title: string | null = null,
    worktreePath: string | null | undefined = undefined,
    parentId: string | null = null,
    background: { agent: AgentKind } | null = null,
  ) {
    const agent = background?.agent ?? projects.chatAgent(projectId)
    const worktree = worktreePath !== undefined && worktreePath !== null
    const summary = { id: crypto.randomUUID(), projectId, number: nextChatNumber(projectId), agent, title, started: false, worktree, worktreePath: worktreePath ?? null, archived: false, archivedAt: null, createdAt: Date.now(), updatedAt: Date.now(), pinned: false, model: null, added: 0, removed: 0, parentId, background: !!background }
    if (background) hidden.add(summary.id)
    const tab: Tab = { ...summary, kind: 'chat' }
    tabs.value.push(tab)
    conversations.create(summary)
    return tab
  }

  // Comme monocode : un onglet ouvert s'insère juste après l'actif. Afficher une session commencée ferme les
  // onglets vierges non affichés ; une vierge les laisse, sinon « + » répété n'en garderait qu'un.
  function show(id: string) {
    seenAt[id] = Date.now()
    const layout = current()
    const active = layout.panes[layout.focused]
    if (!layout.tabs.includes(id)) {
      const at = active ? layout.tabs.indexOf(active) : -1
      layout.tabs.splice(at === -1 ? layout.tabs.length : at + 1, 0, id)
    }
    const index = layout.panes.indexOf(id)
    if (index !== -1) {
      layout.focused = index
    } else if (!layout.panes.length) {
      layout.panes = [id]
      layout.focused = 0
    } else {
      layout.panes[layout.focused] = id
    }
    if (!tabs.value.some((tab) => tab.id === id && tab.started)) return
    // Pas seulement l'actif : la vierge de « Nouvel espace de travail » est dans les onglets sans être affichée.
    for (const other of [...layout.tabs]) if (other !== id && isBlank(other) && !layout.panes.includes(other)) closeTab(other, layout)
  }

  // « + » (bande d'onglets, barre latérale) et ⌘T, comme un navigateur : toujours un onglet vierge de plus.
  function newTab() {
    show(createChat().id)
  }

  // « Nouvelle session » du menu d'un projet, ou « + » et ⌘T hors des sessions : la vierge du contexte plutôt qu'une
  // de plus.
  function showBlank() {
    show(blankChat().id)
  }

  // `worktreePath` : null pour le dossier du projet, le chemin d'un worktree pour le rejoindre.
  function openChat(title: string | null = null, worktreePath?: string | null) {
    const tab = createChat(title, worktreePath)
    show(tab.id)
    return tab
  }

  function isBlank(id: string) {
    return tabs.value.some((tab) => tab.id === id && !tab.started) && !useDraftsStore().get(id)
  }

  // Arrivée sur un contexte (changement de projet, première fois depuis le lancement) : sa session si elle a servi
  // il y a moins d'une heure ou travaille encore, sinon une nouvelle, comme les apps de chat. Une session ouverte
  // juste avant (clic dans l'historique, notification) compte comme vue à l'instant et reste.
  const seenAt: Record<string, number> = {}
  const visited = new Set<string>()

  function land(switched: boolean) {
    if (navigation.view !== 'chats') return
    const arriving = switched || !visited.has(contextKey.value)
    visited.add(contextKey.value)
    const layout = current()
    const shown = layout.panes[layout.focused]
    if (shown && (!arriving || isRecent(shown))) return
    const latest = contextChats.value.reduce<Tab | null>((best, tab) => (!best || tab.updatedAt > best.updatedAt ? tab : best), null)
    if (!shown && latest && isRecent(latest.id)) return show(latest.id)
    const blank = blankChat()
    show(blank.id)
  }

  // Session vierge du contexte, reprise plutôt que doublée : celle de « Nouvel espace de travail » sert ensuite ici.
  function blankChat() {
    const layout = current()
    const unstarted = (id: string | undefined) => tabs.value.some((tab) => tab.id === id && !tab.started)
    const active = layout.panes[layout.focused]
    const id = unstarted(active) ? active : layout.tabs.find(unstarted)
    return tabs.value.find((tab) => tab.id === id) ?? createChat()
  }

  function isRecent(id: string) {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab?.started || conversations.working(id) || conversations.find(id)?.approvals.length) return true
    return Date.now() - Math.max(tab.updatedAt, seenAt[id] ?? 0) < RESUME_WITHIN
  }

  // Dans le second pane, ouvert au besoin ; avec deux panes, la session remplace celle qui n'a pas le focus.
  function openBeside(id: string) {
    seenAt[id] = Date.now()
    const layout = current()
    const index = layout.panes.indexOf(id)
    if (index !== -1 && layout.panes.length > 1) return void (layout.focused = index)
    if (!layout.panes.length || index !== -1) return show(id)
    if (!layout.tabs.includes(id)) layout.tabs.push(id)
    if (layout.panes.length < MAX_PANES) layout.panes.push(id)
    else layout.panes[layout.focused === 0 ? 1 : 0] = id
    layout.focused = layout.panes.indexOf(id)
  }

  function split() {
    const layout = current()
    if (layout.panes.length >= MAX_PANES) return
    layout.panes.push(createChat().id)
    layout.focused = layout.panes.length - 1
  }

  function closePane(index: number, layout = current()) {
    layout.panes.splice(index, 1)
    layout.focused = Math.max(0, Math.min(layout.focused, layout.panes.length - 1))
  }

  // Onglets de sessions lancées fermés récemment, par disposition : ⌘⇧T rouvre le dernier.
  const closed = new WeakMap<PaneLayout, string[]>()

  function closeTab(id: string, layout = current()) {
    const index = layout.tabs.indexOf(id)
    if (index === -1) return
    if (tabs.value.some((tab) => tab.id === id && tab.started)) closed.set(layout, [...(closed.get(layout) ?? []), id].slice(-10))
    layout.tabs.splice(index, 1)
    if (!Object.values(layouts).some((other) => other.tabs.includes(id))) {
      useTerminalsStore().closeChat(id)
      useBrowserStore().closeChat(id)
      useCodeRunsStore().closeChat(id)
    }
    // Fermé sans message, il ne serait plus visible nulle part : on ne le garde pas.
    if (tabs.value.some((tab) => tab.id === id && !tab.started)) deleteChat(id)
    else if (!Object.values(layouts).some((other) => other.tabs.includes(id))) {
      conversations.release(id)
      useMentionsStore().forget(id)
    }

    const paneIndex = layout.panes.indexOf(id)
    if (paneIndex === -1) return
    const remaining = layout.tabs
    const neighbours = [remaining[index], remaining[index - 1], ...remaining]
    const replacement = neighbours.find((tabId) => tabId && !layout.panes.includes(tabId))
    if (replacement) layout.panes[paneIndex] = replacement
    else closePane(paneIndex, layout)
  }

  function isTabPinned(id: string) {
    return useLayoutStore().pinnedTabs.includes(id)
  }

  function togglePinTab(id: string) {
    const layout = useLayoutStore()
    layout.pinnedTabs = isTabPinned(id) ? layout.pinnedTabs.filter((other) => other !== id) : [...layout.pinnedTabs, id]
  }

  // Un onglet épinglé peut venir d'un autre projet, ou d'une autre vue : on bascule d'abord sur sa session.
  function openTab(id: string) {
    const tab = tabs.value.find((item) => item.id === id)
    if (tab && (tab.projectId !== navigation.projectId || navigation.view !== 'chats')) navigation.openChats(tab.projectId)
    show(id)
  }

  // Menu d'un onglet, comme monocode : les autres, ceux d'un côté, ou tous. Jamais les épinglés.
  function closeTabs(id: string, which: 'others' | 'right' | 'left' | 'all') {
    const open = current().tabs.filter((other) => !isTabPinned(other))
    const index = open.indexOf(id)
    const targets = open.filter((other, i) =>
      which === 'all' ? true : which === 'others' ? other !== id : which === 'right' ? i > index : i < index,
    )
    for (const target of targets) closeTab(target)
  }

  function reopenTab() {
    const stack = closed.get(current()) ?? []
    while (stack.length) {
      const id = stack.pop()!
      if (tabs.value.some((tab) => tab.id === id && !tab.archived)) return show(id)
    }
  }

  // `step` : suivant (1) ou précédent (-1), en boucle.
  function stepTab(step: 1 | -1) {
    const open = stripTabs.value.map((tab) => tab.id)
    if (!open.length) return
    const at = open.indexOf(activeTabId.value ?? '')
    openTab(open[(at + step + open.length) % open.length]!)
  }

  // ⌘1…8 : l'onglet de ce rang ; ⌘9 : le dernier, comme les navigateurs.
  function goToTab(rank: number) {
    const open = stripTabs.value.map((tab) => tab.id)
    const id = rank === 9 ? open.at(-1) : open[rank - 1]
    if (id) openTab(id)
  }

  function closeActiveTab() {
    if (activeTabId.value) closeTab(activeTabId.value)
  }

  async function deleteChat(id: string) {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab) return null
    const layout = layouts[tab.projectId ?? '']
    if (layout) closeTab(id, layout)
    useLayoutStore().forget(id)
    tabs.value = tabs.value.filter((item) => item.id !== id)
    hidden.delete(id)
    useDraftsStore().set(id, '', [])
    useGitPanelStore().forget(id)
    useWorktreesStore().setBase(id, null)
    return conversations.remove(id)
  }

  // Le worktree d'un chat supprimé reste s'il a des changements : le message dit où.
  function warnKept(paths: string[]) {
    if (!paths.length) return
    const { t } = i18nGlobal()
    useToastsStore().push({ title: t('chats.worktreeKept', paths.length), body: t('chats.worktreeKeptBody', { paths: paths.join(', ') }, paths.length) })
  }

  async function deleteChatWithWorktree(id: string) {
    const kept = await deleteChat(id)
    warnKept(kept ? [kept] : [])
  }

  // Tous les chats d'un projet supprimé, ouverts ou dans l'historique, et sa disposition.
  async function deleteProjectChats(projectId: string) {
    const kept = await Promise.all(tabsFor(projectId).map((tab) => deleteChat(tab.id)))
    delete layouts[projectId]
    warnKept(kept.filter((path) => path !== null))
  }

  // path : worktree existant rejoint par le chat ; null avec worktree : le sien, créé au premier message.
  function setWorktree(id: string, worktree: boolean, path: string | null = null) {
    const tab = tabs.value.find((item) => item.id === id)
    path = worktree ? path : null
    if (!tab || tab.started || (tab.worktree === worktree && tab.worktreePath === path)) return
    tab.worktree = worktree
    tab.worktreePath = path
    chatSetWorktree(id, worktree, path).catch((error) => console.error('historique', error))
  }

  // Rust a créé le worktree du chat au premier message, et l'a déjà enregistré.
  function adoptWorktree(id: string, path: string) {
    const tab = tabs.value.find((item) => item.id === id)
    if (tab?.worktree) tab.worktreePath = path
  }

  function leaveWorktree(ids: string[]) {
    for (const tab of tabs.value) {
      if (!ids.includes(tab.id)) continue
      tab.worktree = false
      tab.worktreePath = null
    }
  }

  // Les chats quittent l'historique et leurs onglets se ferment.
  async function archive(chats: Tab[]) {
    if (!chats.length) return
    const at = await chatSetArchived(chats.map((tab) => tab.id), true)
    for (const tab of chats) {
      tab.archived = true
      tab.archivedAt = at
      const layout = layouts[tab.projectId ?? '']
      if (layout) closeTab(tab.id, layout)
    }
  }

  async function archiveChat(id: string) {
    await archive(tabs.value.filter((tab) => tab.id === id && tab.started && !tab.archived))
  }

  // Rend le nombre de chats archivés.
  async function archiveProjectChats(projectId: string | null) {
    const chats = tabsFor(projectId).filter((tab) => tab.started && !tab.archived)
    await archive(chats)
    return chats.length
  }

  async function restoreChat(id: string) {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab?.archived) return
    await chatSetArchived([id], false)
    tab.archived = false
    tab.archivedAt = null
  }

  // Archives plus vieilles que `days` jours ; aucune si elles sont gardées sans limite.
  function expiredArchives(days: number = general.archiveDays) {
    if (!days) return []
    const limit = Date.now() - days * DAY
    return archivedChats.value.filter((tab) => (tab.archivedAt ?? 0) < limit)
  }

  async function purgeArchives() {
    const kept = await Promise.all(expiredArchives().map((tab) => deleteChat(tab.id)))
    warnKept(kept.filter((path) => path !== null))
  }

  function touch(id: string) {
    const tab = tabs.value.find((item) => item.id === id)
    if (tab) tab.updatedAt = Date.now()
  }

  function setSummary(id: string, summary: Pick<Tab, 'model' | 'added' | 'removed'>) {
    const tab = tabs.value.find((item) => item.id === id)
    if (tab) Object.assign(tab, summary)
  }

  // Sessions sans nouveau message depuis le délai choisi. Un onglet ouvert, un agent au travail ou une épingle les garde.
  async function autoArchive() {
    const days = general.autoArchiveDays
    if (!days) return
    const limit = Date.now() - days * DAY
    const open = new Set(Object.values(layouts).flatMap((layout) => layout.tabs))
    const idle = tabs.value.filter(
      (tab) => tab.started && !tab.archived && !tab.pinned && tab.updatedAt < limit && !open.has(tab.id) && (conversations.find(tab.id)?.phase ?? 'idle') === 'idle',
    )
    await archive(idle).catch((error) => console.error('archivage', error))
  }

  async function tidy() {
    await autoArchive()
    await purgeArchives()
  }

  // Premier message du chat : il entre dans l'historique, et l'agent résume le message en titre
  // (quelques secondes) ; le début du message sert de titre en attendant.
  function startChat(id: string, prompt: string, attachments: Attachment[]) {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab) return
    tab.started = true
    if (tab.title !== null) return
    const seed = titleSeed(prompt, attachments)
    if (!seed) return
    tab.title = seed
    chatTitle(id, tab.agent, prompt, seed)
      .then((title) => {
        const current = tabs.value.find((item) => item.id === id)
        if (!current) return
        // Renommée à la main pendant que l'agent cherchait : son titre, déjà en base, ne doit pas l'emporter.
        if (current.title === seed) current.title = title
        else if (current.title) chatRename(id, current.title).catch((error) => console.error('titre', error))
      })
      .catch((error) => console.error('titre', error))
  }

  // Session que sa ligne de la barre latérale doit passer en renommage (raccourci).
  const renamingId = ref<string | null>(null)

  function requestRename() {
    const tab = tabs.value.find((item) => item.id === activeTabId.value)
    if (tab?.started && !tab.archived) renamingId.value = tab.id
  }

  // Un titre vide est ignoré : la session garde le sien.
  async function renameChat(id: string, title: string) {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab || !title.trim() || title.trim() === tab.title) return
    const previous = tab.title
    tab.title = title.trim()
    try {
      tab.title = await chatRename(id, title)
    } catch (error) {
      tab.title = previous
      throw error
    }
  }

  async function setPinned(id: string, pinned: boolean) {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab || tab.pinned === pinned) return
    tab.pinned = pinned
    try {
      await chatSetPinned(id, pinned)
    } catch (error) {
      tab.pinned = !pinned
      throw error
    }
  }

  // Réordonne les onglets ouverts en plaçant `id` juste avant `beforeId` (ou en fin de liste).
  function moveTab(id: string, beforeId: string | null) {
    const layout = current()
    if (!layout.tabs.includes(id) || beforeId === id) return
    const rest = layout.tabs.filter((tabId) => tabId !== id)
    const target = beforeId ? rest.indexOf(beforeId) : -1
    rest.splice(target === -1 ? rest.length : target, 0, id)
    if (rest.some((tabId, i) => tabId !== layout.tabs[i])) layout.tabs = rest
  }

  // Dépôt d'un onglet glissé sur un pane : au centre il s'y affiche, sur un côté il ouvre le second pane.
  function dropTab(id: string, paneIndex: number, side: 'left' | 'right' | 'center') {
    const layout = current()
    if (side === 'center') {
      const existing = layout.panes.indexOf(id)
      if (existing !== -1) layout.panes[existing] = layout.panes[paneIndex] ?? id
      layout.panes[paneIndex] = id
      layout.focused = paneIndex
      return
    }
    if (layout.panes.length >= MAX_PANES) return
    const kept = layout.panes[0] === id ? contextTabs.value.find((tab) => tab.id !== id)?.id : layout.panes[0]
    if (!kept) return
    layout.panes = side === 'right' ? [kept, id] : [id, kept]
    layout.focused = side === 'right' ? 1 : 0
  }

  function reveal(id: string) {
    hidden.delete(id)
  }

  return {
    tabs,
    hidden,
    reveal,
    panes,
    focusedPane,
    activeTabId,
    contextTabs,
    stripTabs,
    pinnedTabs,
    isTabPinned,
    togglePinTab,
    openTab,
    contextChats,
    nestedChats,
    pinnedChats,
    recentChats,
    startedChats,
    archivedChats,
    tabsFor,
    show,
    openChat,
    addChat,
    blankChat,
    openBeside,
    split,
    closePane,
    closeTab,
    closeActiveTab,
    newTab,
    showBlank,
    reopenTab,
    stepTab,
    goToTab,
    closeTabs,
    deleteChat: deleteChatWithWorktree,
    deleteProjectChats,
    setWorktree,
    adoptWorktree,
    leaveWorktree,
    archiveChat,
    archiveProjectChats,
    restoreChat,
    expiredArchives,
    purgeArchives,
    tidy,
    touch,
    setSummary,
    startChat,
    renameChat,
    renamingId,
    requestRename,
    setPinned,
    moveTab,
    dropTab,
  }
})
