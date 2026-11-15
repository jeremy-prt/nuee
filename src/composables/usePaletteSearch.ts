import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAddProject } from '@/composables/useAddProject'
import { useDebounced } from '@/composables/useDebounced'
import { useSettingsSearch } from '@/composables/useSettingsSearch'
import { useShortcutActions } from '@/composables/useShortcutActions'
import { useTabTitle } from '@/composables/useTabTitle'
import { type View, useNavigationStore } from '@/stores/navigation'
import { type Project, useProjectsStore } from '@/stores/projects'
import { useSearchStore } from '@/stores/search'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { matchScore, normalize, searchField, type Snippet, snippet } from '@/utils/search'
import type { ShortcutId } from '@/utils/shortcuts'

export type PaletteRow =
  | { kind: 'session'; key: string; tab: Tab; title: string; project: string; snippet?: Snippet }
  | { kind: 'project'; key: string; project: Project }
  | { kind: 'command'; key: string; title: string; shortcut?: string }
  | { kind: 'setting'; key: string; title: string; path: string }

export interface PaletteGroup {
  id: 'actions' | 'recent' | 'sessions' | 'messages' | 'projects' | 'commands' | 'settings'
  rows: PaletteRow[]
}

const LIMITS = { sessions: 8, messages: 6, projects: 5, settings: 5, recent: 8 }
// Ni la recherche elle-même, ni ce qui demande la touche tapée ou ne vaut qu'en « Projets en menu ».
const HIDDEN: ShortcutId[] = ['search', 'goToTab', 'switchProject', 'previousProject', 'nextProject']
// Champ vide : les actions qu'on cherche le plus.
const STARTERS = ['newChat', 'addProject', 'settings']

interface Command {
  id: string
  label: string
  shortcut?: string
  run: () => void
}

// Résultats de la palette ⌘K, groupés comme T3 Code : sessions, messages, projets, réglages. Les commandes ne
// sortent qu'après `>`, pour ne pas noyer la recherche (les trois plus courantes restent sur le champ vide).
export function usePaletteSearch(query: Ref<string>) {
  const { t } = useI18n()
  const workspace = useWorkspaceStore()
  const projects = useProjectsStore()
  const navigation = useNavigationStore()
  const shortcuts = useShortcutsStore()
  const search = useSearchStore()
  const { tabTitle } = useTabTitle()
  const { actions, run: runAction, inChats } = useShortcutActions()
  const addProject = useAddProject()

  const commandsOnly = computed(() => query.value.trimStart().startsWith('>'))
  const wanted = computed(() => normalize(query.value.replace(/^\s*>/, '')))
  // Le texte des messages est plus lourd à parcourir : il suit la frappe avec un temps de retard.
  const settled = useDebounced(wanted)
  const settings = useSettingsSearch(computed(() => (commandsOnly.value ? '' : wanted.value)))

  const sessions = computed(() => [...workspace.startedChats, ...workspace.archivedChats])
  const projectName = (tab: Tab) => projects.byId(tab.projectId)?.name ?? t('search.noProject')
  const sessionRow = (tab: Tab, found?: Snippet): PaletteRow => ({
    kind: 'session',
    key: `${found ? 'message' : 'session'}:${tab.id}`,
    tab,
    title: tabTitle(tab),
    project: projectName(tab),
    snippet: found,
  })

  function go(view: View) {
    return () => navigation.go(view)
  }

  const commands = computed<Command[]>(() => [
    ...actions
      .filter((action) => !HIDDEN.includes(action.id) && (!action.chats || inChats.value))
      .map((action) => ({
        id: action.id,
        label: t(`settings.shortcuts.items.${action.id}`),
        shortcut: shortcuts.label(action.id),
        run: () => runAction(action),
      })),
    {
      id: 'addProject',
      label: t('search.addProject'),
      run: async () => {
        const project = await addProject()
        if (project) navigation.openChats(project.id)
      },
    },
    { id: 'notes', label: t('search.notes'), run: go('notes') },
    { id: 'github', label: t('search.github'), run: go('github') },
    { id: 'usage', label: t('search.usage'), run: go('usage') },
  ])
  // Ne dépend que du texte posé : la frappe ne refait pas ce parcours à chaque touche.
  const inText = computed(() => {
    const tokens = settled.value.split(' ').filter(Boolean)
    if (!tokens.length) return []
    return sessions.value
      .filter((tab) => tokens.every((token) => search.texts.get(tab.id)?.folded.includes(token)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((tab) => ({ tab, found: snippet(search.texts.get(tab.id)!.raw, tokens[0]!, 24, 80) ?? undefined }))
  })
  // Messages pas encore lus ou frappe pas encore posée : « Aucun résultat » attendrait à tort.
  const pending = computed(() => !!wanted.value && !commandsOnly.value && (!search.ready || settled.value !== wanted.value))

  const commandById = computed(() => new Map(commands.value.map((command) => [command.id, command])))
  const commandRow = (command: Command): PaletteRow => ({ kind: 'command', key: `command:${command.id}`, title: command.label, shortcut: command.shortcut })

  function ranked<T>(items: T[], fields: (item: T) => ReturnType<typeof searchField>[], text = wanted.value, tie?: (item: T) => number) {
    return items
      .flatMap((item) => {
        const score = matchScore(text, fields(item))
        return score === null ? [] : [{ item, score }]
      })
      .sort((a, b) => a.score - b.score || (tie ? tie(b.item) - tie(a.item) : 0))
      .map(({ item }) => item)
  }

  const groups = computed<PaletteGroup[]>(() => {
    if (!wanted.value) {
      if (commandsOnly.value) return [{ id: 'commands', rows: commands.value.map(commandRow) }]
      const recent = [...workspace.startedChats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LIMITS.recent)
      return [
        { id: 'actions', rows: STARTERS.flatMap((id) => commandById.value.get(id) ?? []).map(commandRow) },
        { id: 'recent', rows: recent.map((tab) => sessionRow(tab)) },
      ]
    }

    if (commandsOnly.value) return [{ id: 'commands', rows: ranked(commands.value, (command) => [searchField(command.label, 0)]).map(commandRow) }]

    const titled = ranked(sessions.value, (tab) => [searchField(tabTitle(tab), 0), searchField(projectName(tab), 2)], wanted.value, (tab) => tab.updatedAt)
      .slice(0, LIMITS.sessions)
    const shown = new Set(titled.map((tab) => tab.id))
    const messages = inText.value
      .filter(({ tab }) => !shown.has(tab.id))
      .slice(0, LIMITS.messages)
      .map(({ tab, found }) => sessionRow(tab, found))

    const projectRows = ranked(projects.projects, (project) => [searchField(project.name, 0), searchField(project.path, 2)])
      .slice(0, LIMITS.projects)
      .map((project): PaletteRow => ({ kind: 'project', key: `project:${project.id}`, project }))

    const settingRows = settings.results.value.slice(0, LIMITS.settings).map(
      (result): PaletteRow => ({ kind: 'setting', key: `setting:${result.key}`, title: result.label, path: result.path }),
    )

    return [
      { id: 'sessions' as const, rows: titled.map((tab) => sessionRow(tab)) },
      { id: 'messages' as const, rows: messages },
      { id: 'projects' as const, rows: projectRows },
      { id: 'settings' as const, rows: settingRows },
    ].filter((group) => group.rows.length)
  })

  const settingByKey = computed(() => new Map(settings.results.value.map((result) => [`setting:${result.key}`, result])))

  // Une session archivée revient dans l'historique pour s'ouvrir.
  async function choose(row: PaletteRow) {
    switch (row.kind) {
      case 'session':
        if (row.tab.archived) await workspace.restoreChat(row.tab.id)
        workspace.openTab(row.tab.id)
        break
      case 'project':
        navigation.openChats(row.project.id)
        break
      case 'command':
        commandById.value.get(row.key.slice('command:'.length))?.run()
        break
      case 'setting': {
        const entry = settingByKey.value.get(row.key)?.entry
        if (!entry) break
        if (navigation.view !== 'settings') navigation.go('settings')
        navigation.revealSetting(entry.section, entry.detail ?? null, entry.id, true)
        break
      }
    }
  }

  return { groups, choose, pending }
}
