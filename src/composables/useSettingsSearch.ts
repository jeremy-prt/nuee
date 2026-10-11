import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { isMacosApp } from '@/ipc/system'
import { backgroundOptions, glassOptions, glassSettings, useAppearanceStore, type WindowStyle } from '@/stores/appearance'
import { type SettingsDetail, settingsDetailTitle } from '@/stores/navigation'
import { type SettingsSection, settingsGroups } from '@/utils/settings'
import { matchScore, normalize, searchField } from '@/utils/search'
import { agents } from '@/utils/agents'
import { shortcutIds } from '@/utils/shortcuts'
import { themeIds } from '@/utils/themes'

// Un réglage qu'on retrouve par la recherche. `id` est l'attribut `data-setting` posé sur sa ligne :
// SettingsView y fait défiler. Vide pour une page entière. Textes = clés i18n.
interface SettingEntry {
  id: string
  section: SettingsSection
  detail?: SettingsDetail
  label: string
  hint?: string
  // Valeurs proposées (noms des thèmes, des effets…), synonymes de settings.search.keywords, noms propres.
  terms?: string[]
  keywords?: string[]
  names?: string[]
  needs?: 'macos' | 'image'
  // Moins prioritaire : les raccourcis passent après les réglages.
  secondary?: boolean
}

export interface SettingResult {
  key: string
  entry: SettingEntry
  label: string
  path: string
}

const WINDOW_STYLES: WindowStyle[] = ['transparent', 'mixed', 'opaque']

const options = (base: string, values: readonly string[]) => values.map((value) => `${base}.${value}`)

// Une ligne de réglages ajoutée doit l'être ici aussi, avec le même `data-setting` sur sa ligne.
const entries: SettingEntry[] = [
  ...settingsGroups.flatMap((group) =>
    group.sections.map((section) => ({ id: '', section, label: `settings.sections.${section}`, hint: `settings.hints.${section}` })),
  ),
  { id: 'language', section: 'general', label: 'settings.general.system.language', keywords: ['language'] },
  { id: 'autostart', section: 'general', label: 'settings.general.system.autostart', keywords: ['autostart'] },
  {
    id: 'keepAwake',
    section: 'general',
    label: 'settings.general.system.keepAwake',
    hint: 'settings.general.system.keepAwakeHint',
    keywords: ['keepAwake'],
  },
  { id: 'confirmDelete', section: 'general', label: 'settings.general.system.confirmDelete', keywords: ['confirmDelete'] },
  {
    id: 'systemNotifications',
    section: 'general',
    label: 'settings.general.notifications.system',
    hint: 'settings.general.notifications.systemHint',
    keywords: ['notifications'],
  },
  { id: 'appNotifications', section: 'general', label: 'settings.general.notifications.app', hint: 'settings.general.notifications.appHint' },
  {
    id: 'sounds',
    section: 'general',
    label: 'settings.general.notifications.sounds',
    hint: 'settings.general.notifications.soundsHint',
    terms: ['settings.general.notifications.preview'],
    keywords: ['sounds'],
  },
  {
    id: 'badge',
    section: 'general',
    label: 'settings.general.notifications.badge',
    hint: 'settings.general.notifications.badgeHint',
    needs: 'macos',
  },
  {
    id: 'version',
    section: 'general',
    label: 'settings.general.updates.version',
    terms: ['settings.general.updates.title', 'settings.general.updates.notes', 'updates.check'],
  },
  {
    id: 'checkUpdates',
    section: 'general',
    label: 'settings.general.updates.checkOnLaunch',
    hint: 'settings.general.updates.checkOnLaunchHint',
    keywords: ['updates'],
  },
  {
    id: 'about',
    section: 'general',
    label: 'settings.general.about.title',
    hint: 'settings.general.about.openSource',
    terms: options('settings.general.about', ['source', 'issue', 'license']),
  },
  { id: 'resetAll', section: 'general', label: 'settings.general.reset.label', hint: 'settings.general.reset.hint', keywords: ['reset'] },
  {
    id: 'theme',
    section: 'appearance',
    label: 'settings.themes.title',
    terms: options('settings.themes.names', themeIds),
    keywords: ['theme'],
  },
  {
    id: 'themeScope',
    section: 'appearance',
    detail: 'theme',
    label: 'settings.themes.scope.label',
    terms: options('settings.themes.scope', ['accent', 'full']),
    keywords: ['theme'],
  },
  {
    id: 'themeIntensity',
    section: 'appearance',
    detail: 'theme',
    label: 'settings.themes.intensity.label',
    hint: 'settings.themes.intensity.hint',
    keywords: ['theme'],
  },
  {
    id: 'windowStyle',
    section: 'appearance',
    label: 'settings.appearance.window',
    terms: options('settings.appearance.styles', WINDOW_STYLES),
    keywords: ['transparency'],
  },
  ...WINDOW_STYLES.flatMap((style) =>
    glassSettings(style).map((setting) => ({
      id: `glass-${setting}`,
      section: 'appearance' as const,
      detail: style,
      label: setting === 'opacity' && style === 'mixed' ? 'settings.glass.opacity.bars' : `settings.glass.${setting}.label`,
      terms: options(`settings.glass.${setting}`, glassOptions[setting]),
      keywords: [setting === 'blur' ? 'blur' : 'transparency'],
      needs: 'macos' as const,
    })),
  ),
  {
    id: 'background',
    section: 'appearance',
    label: 'settings.background.title',
    terms: options('settings.background', ['choose', 'change', 'remove']),
    keywords: ['background'],
  },
  ...Object.entries(backgroundOptions).map(([row, values]) => ({
    id: `background-${row}`,
    section: 'appearance' as const,
    detail: 'background' as const,
    label: `settings.background.${row}.label`,
    hint: row === 'intensity' ? 'settings.background.intensity.hint' : undefined,
    terms: options(`settings.background.${row}`, values),
    keywords: ['background'],
    needs: 'image' as const,
  })),
  { id: 'agents', section: 'agents', label: 'settings.agents.title', keywords: ['agents'] },
  ...Object.keys(agents).flatMap((kind) => [
    {
      id: `${kind}-cli`,
      section: 'agents' as const,
      detail: kind as AgentKind,
      label: 'settings.agents.location',
      terms: ['settings.agents.retry', 'settings.agents.choose'],
      keywords: ['cli'],
      names: [agents[kind as AgentKind].name],
    },
    {
      id: `${kind}-version`,
      section: 'agents' as const,
      detail: kind as AgentKind,
      label: 'settings.agents.version',
      terms: ['settings.agents.update'],
      keywords: ['updates'],
      names: [agents[kind as AgentKind].name],
    },
    {
      id: `${kind}-account`,
      section: 'agents' as const,
      detail: kind as AgentKind,
      label: 'settings.agents.account',
      keywords: ['account'],
      names: [agents[kind as AgentKind].name],
    },
    ...(['session', 'weekly'] as const).map((quota) => ({
      id: `${kind}-${quota}`,
      section: 'agents' as const,
      detail: kind as AgentKind,
      label: `settings.agents.${quota}`,
      keywords: ['quota'],
      names: [agents[kind as AgentKind].name],
    })),
    ...(['model', 'effort', 'mode'] as const).map((row) => ({
      id: `${kind}-${row}`,
      section: 'agents' as const,
      detail: kind as AgentKind,
      label: `settings.agents.${row}`,
      hint: 'settings.agents.defaults',
      terms: row === 'mode' ? ['composer.mode.bypass', 'composer.mode.auto'] : undefined,
      keywords: ['agentDefaults'],
      names: [agents[kind as AgentKind].name],
    })),
  ]),
  { id: 'zoom', section: 'appearance', label: 'settings.interface.zoom', keywords: ['zoom'] },
  {
    id: 'chatWidth',
    section: 'appearance',
    label: 'settings.interface.chatWidth.label',
    terms: options('settings.interface.chatWidth', ['normal', 'wide', 'full']),
    keywords: ['chatWidth'],
  },
  ...shortcutIds.map((id) => ({
    id: `shortcut-${id}`,
    section: 'shortcuts' as const,
    label: `settings.shortcuts.items.${id}`,
    secondary: true,
  })),
]

const LIMIT = 8

export function useSettingsSearch(query: Ref<string>) {
  const { t, locale } = useI18n()
  const appearance = useAppearanceStore()

  // Sans image de fond, ses réglages mènent à la section qui permet d'en choisir une.
  const background = entries.find((entry) => entry.id === 'background')!
  const available = (entry: SettingEntry) => {
    if (entry.needs === 'macos') return isMacosApp() ? entry : null
    if (entry.needs === 'image') return appearance.background.path ? entry : background
    return entry
  }

  // Où mène le résultat : le groupe pour une page, la section (et sa sous-page) pour un réglage.
  function path(entry: SettingEntry) {
    if (!entry.id) {
      const group = settingsGroups.find((item) => (item.sections as readonly string[]).includes(entry.section))!
      return t(`settings.groups.${group.id}`)
    }
    const section = t(`settings.sections.${entry.section}`)
    return entry.detail ? `${section} › ${settingsDetailTitle(entry.detail, t)}` : section
  }

  // Le libellé anglais reste cherchable dans toutes les langues : « zoom » ou « shortcuts » trouvent toujours.
  const index = computed(() =>
    entries.map((entry) => {
      const label = t(entry.label)
      const fields = [
        searchField(label, 0),
        searchField(
          [...(entry.terms ?? []), ...(entry.keywords ?? []).map((key) => `settings.search.keywords.${key}`)]
            .map((key) => t(key))
            .concat(entry.names ?? [])
            .join(' '),
          1,
        ),
        searchField(`${path(entry)} ${entry.hint ? t(entry.hint) : ''}`, 2),
      ]
      if (locale.value !== 'en') {
        const english = [entry.label, ...(entry.keywords ?? []).map((key) => `settings.search.keywords.${key}`)]
        fields.push(searchField(english.map((key) => t(key, {}, { locale: 'en' })).join(' '), 2))
      }
      return { entry, fields, normalized: normalize(label) }
    }),
  )

  const results = computed<SettingResult[]>(() => {
    const wanted = normalize(query.value)
    if (!wanted) return []
    const scored = index.value.flatMap((item, order) => {
      const score = matchScore(wanted, item.fields)
      if (score === null) return []
      const bonus = item.normalized === wanted ? 2 : item.normalized.startsWith(wanted) ? 1 : 0
      return [{ item, order, score: score - bonus + (item.entry.secondary ? 1.5 : 0) }]
    })
    scored.sort((a, b) => a.score - b.score || a.order - b.order)
    // Une même destination n'apparaît qu'une fois (plusieurs réglages d'image renvoient à la même section).
    const found = new Map<string, SettingResult>()
    for (const { item } of scored) {
      const entry = available(item.entry)
      if (!entry) continue
      const key = `${entry.section}/${entry.detail ?? ''}/${entry.id}`
      if (!found.has(key)) found.set(key, { key, entry, label: t(entry.label), path: path(entry) })
      if (found.size === LIMIT) break
    }
    return [...found.values()]
  })

  return { results }
}
