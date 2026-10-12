<script setup lang="ts">
import { Search } from '@lucide/vue'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectPicker from '@/components/project/ProjectPicker.vue'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { useTabTitle } from '@/composables/useTabTitle'
import { chatArchivedTexts } from '@/ipc/chat'
import { useDialogStore } from '@/stores/dialog'
import { type ArchiveDays, archiveDayChoices, useGeneralStore } from '@/stores/general'
import { useProjectsStore } from '@/stores/projects'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { normalize } from '@/utils/search'

const DAY = 86_400_000
const SNIPPET_BEFORE = 30
const SNIPPET_AFTER = 90

const { t, locale } = useI18n()
const workspace = useWorkspaceStore()
const projects = useProjectsStore()
const dialog = useDialogStore()
const general = useGeneralStore()
const { tabTitle } = useTabTitle()

const retentionOptions = computed(() =>
  archiveDayChoices.map((days) => ({ value: String(days), label: days ? t('settings.archive.after', { n: days }) : t('settings.archive.never') })),
)

// Un délai plus court supprime tout de suite les archives plus anciennes : on prévient avant.
const retention = computed({
  get: () => String(general.archiveDays),
  set: async (value: string) => {
    const days = Number(value) as ArchiveDays
    const expired = workspace.expiredArchives(days).length
    if (
      expired &&
      !(await dialog.confirm({
        title: t('settings.archive.retentionTitle'),
        message: t('settings.archive.retentionMessage', { n: expired, days }, expired),
        confirmLabel: t('settings.archive.deleteConfirm'),
        danger: true,
      }))
    )
      return
    general.archiveDays = days
    await workspace.purgeArchives()
  },
})

const counts = computed(() => {
  const result: Record<string, number> = {}
  for (const tab of workspace.archivedChats) result[tab.projectId ?? ''] = (result[tab.projectId ?? ''] ?? 0) + 1
  return result
})

// À l'ouverture : là où se trouvent des archives, sans projet d'abord.
// '' : les chats sans projet.
const ownerId = ref(counts.value[''] ? '' : (projects.projects.find((project) => counts.value[project.id])?.id ?? ''))
const owner = computed(() => projects.byId(ownerId.value || null)?.id ?? null)
const inScope = computed(() => workspace.archivedChats.filter((tab) => tab.projectId === owner.value))

const query = ref('')
const tokens = computed(() => normalize(query.value).split(' ').filter(Boolean))
// Texte de chaque archive, lu à la première recherche puis à chaque nouvelle archive.
const texts = shallowRef(new Map<string, { raw: string; folded: string }>())

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

watch(
  () => tokens.value.length > 0 && workspace.archivedChats.some((tab) => !texts.value.has(tab.id)),
  async (missing) => {
    if (!missing) return
    try {
      const loaded = await chatArchivedTexts()
      texts.value = new Map(loaded.map(({ id, text }) => [id, { raw: text, folded: fold(text) }]))
      for (const tab of workspace.archivedChats) if (!texts.value.has(tab.id)) texts.value.set(tab.id, { raw: '', folded: '' })
    } catch (error) {
      console.error('archives', error)
    }
  },
  { immediate: true },
)

interface Snippet {
  before: string
  match: string
  after: string
}

// Extrait du message autour du premier mot trouvé ; chaque caractère est replié seul, les positions restent justes.
function snippet(raw: string, token: string): Snippet | null {
  const chars = [...raw]
  const folded = chars.map(fold)
  const flat = folded.join('')
  const at = flat.indexOf(token)
  if (at === -1) return null
  let start = 0
  let offset = 0
  while (start < chars.length && offset + folded[start]!.length <= at) offset += folded[start++]!.length
  let end = start
  let length = 0
  while (end < chars.length && length < token.length) length += folded[end++]!.length
  const clean = (text: string) => text.replace(/\s+/g, ' ')
  const from = Math.max(0, start - SNIPPET_BEFORE)
  return {
    before: (from ? '…' : '') + clean(chars.slice(from, start).join('')).trimStart(),
    match: chars.slice(start, end).join(''),
    after: clean(chars.slice(end, end + SNIPPET_AFTER).join('')),
  }
}

const rows = computed(() => {
  if (!tokens.value.length) return inScope.value.map((tab) => ({ tab, snippet: null as Snippet | null }))
  // Une recherche couvre toutes les archives : la ligne dit alors d'où vient la session.
  return workspace.archivedChats.flatMap((tab) => {
    const title = normalize(tabTitle(tab))
    const text = texts.value.get(tab.id)
    if (!tokens.value.every((token) => title.includes(token) || text?.folded.includes(token))) return []
    const inText = tokens.value.find((token) => !title.includes(token))
    return [{ tab, snippet: inText && text ? snippet(text.raw, inText) : null }]
  })
})

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !query.value) return
  event.stopPropagation()
  query.value = ''
}

const relative = computed(() => new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }))
const shortDate = computed(() => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }))
const longDate = computed(() => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', year: 'numeric' }))

function archivedOn(tab: Tab) {
  const at = new Date(tab.archivedAt ?? Date.now())
  return (at.getFullYear() === new Date().getFullYear() ? shortDate : longDate).value.format(at)
}

function deletion(tab: Tab) {
  if (!general.archiveDays) return null
  const left = Math.max(0, Math.ceil(((tab.archivedAt ?? Date.now()) + general.archiveDays * DAY - Date.now()) / DAY))
  return t('settings.archive.deletedWhen', { when: relative.value.format(left, 'day') })
}

// Ligne sous le titre : d'où vient la session pendant une recherche, puis le temps avant suppression.
function details(tab: Tab) {
  const origin = tokens.value.length ? (projects.byId(tab.projectId)?.name ?? t('rail.chats')) : null
  return [origin, deletion(tab)].filter(Boolean).join(' · ')
}

// La ligne disparaît : validé au clavier, le focus passe à la ligne suivante, sinon à la précédente.
async function settle(event: MouseEvent, tab: Tab, action: () => Promise<unknown>) {
  const byKeyboard = event.detail === 0
  const list = rows.value.map((row) => row.tab)
  const index = list.findIndex((item) => item.id === tab.id)
  const neighbour = list[index + 1] ?? list[index - 1]
  await action()
  if (!byKeyboard || !neighbour) return
  await nextTick()
  document.querySelector<HTMLElement>(`[data-archive-restore="${neighbour.id}"]`)?.focus()
}

async function restore(event: MouseEvent, tab: Tab) {
  const confirmed = await dialog.confirm({
    title: t('settings.archive.restoreTitle'),
    message: t('settings.archive.restoreMessage', { title: tabTitle(tab) }),
    confirmLabel: t('settings.archive.restoreButton'),
  })
  if (confirmed) settle(event, tab, () => workspace.restoreChat(tab.id))
}

async function remove(event: MouseEvent, tab: Tab) {
  const confirmed =
    !general.confirmDelete ||
    (await dialog.confirm({
      title: t('chats.deleteTitle'),
      message: t('chats.deleteMessage', { title: tabTitle(tab) }),
      confirmLabel: t('chats.deleteConfirm'),
      danger: true,
    }))
  if (confirmed) settle(event, tab, () => workspace.deleteChat(tab.id))
}

async function removeAll() {
  const chats = inScope.value
  const confirmed = await dialog.confirm({
    title: t('settings.archive.deleteAllTitle'),
    message: t('settings.archive.deleteAllMessage', { n: chats.length }, chats.length),
    confirmLabel: t('settings.archive.deleteConfirm'),
    danger: true,
  })
  if (confirmed) await Promise.all(chats.map((tab) => workspace.deleteChat(tab.id)))
}

const emptyText = computed(() => {
  if (tokens.value.length) return t('settings.archive.noResults')
  const project = projects.byId(owner.value)
  return project ? t('settings.archive.emptyProject', { name: project.name }) : t('settings.archive.emptyNoProject')
})
</script>

<template>
  <SettingsGroup>
    <SettingsRow data-setting="archive-days" :label="t('settings.archive.retention')" :hint="t('settings.archive.retentionHint')">
      <UiSelect v-model="retention" :label="t('settings.archive.retention')" :options="retentionOptions" />
    </SettingsRow>
  </SettingsGroup>

  <div v-if="!workspace.archivedChats.length" data-setting="archive-list" class="mt-8 rounded-xl border border-stroke bg-content/3 px-4 py-5">
    <p class="text-[13px] font-medium">{{ t('settings.archive.empty') }}</p>
    <p class="mt-0.5 text-xs/relaxed text-muted">{{ t('settings.archive.emptyHint') }}</p>
  </div>

  <section v-else data-setting="archive-list" class="pt-8">
    <div class="flex flex-wrap items-center gap-2 pb-2.5">
      <ProjectPicker v-model="ownerId" :label="t('settings.archive.project')" :none-label="t('rail.chats')" :counts="counts" />
      <label
        data-control
        class="ms-auto flex h-7 w-72 min-w-0 items-center gap-1.5 rounded-md border border-stroke bg-selection/50 px-2 focus-within:border-stroke-focus"
      >
        <Search class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          writingsuggestions="false"
          :aria-label="t('settings.archive.search')"
          :placeholder="t('settings.archive.search')"
          class="min-w-0 flex-1 bg-transparent text-xs outline-none select-text placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          @keydown="onSearchKeydown"
        />
      </label>
    </div>

    <div class="overflow-hidden rounded-xl border border-stroke bg-content/3">
      <div v-if="rows.length" class="flex h-9 items-center gap-3 border-b border-stroke ps-4 pe-2 text-xs text-muted">
        <p class="min-w-0 flex-1 truncate" aria-live="polite">{{ t(tokens.length ? 'settings.archive.found' : 'settings.archive.count', { n: rows.length }, rows.length) }}</p>
        <UiButton v-if="!tokens.length && inScope.length" size="xs" variant="ghost" class="hover:bg-danger/15! hover:text-danger!" @click="removeAll">
          {{ t('settings.archive.deleteAll') }}
        </UiButton>
      </div>
      <p v-if="!rows.length" class="px-4 py-3.5 text-xs text-muted" role="status">{{ emptyText }}</p>
      <ul v-else :aria-label="t('settings.sections.archive')">
        <li v-for="{ tab, snippet: excerpt } in rows" :key="tab.id" class="flex items-center gap-3 border-b border-stroke py-2 ps-4 pe-2 last:border-b-0">
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px]">{{ tabTitle(tab) }}</p>
            <p v-if="excerpt" class="mt-0.5 truncate text-[11px] text-muted">
              {{ excerpt.before }}<mark class="rounded-sm bg-signal/20 text-content">{{ excerpt.match }}</mark>{{ excerpt.after }}
            </p>
            <p v-if="details(tab)" class="mt-0.5 truncate text-[11px] text-muted">{{ details(tab) }}</p>
          </div>
          <span class="shrink-0 text-xs text-muted tabular-nums">
            <span class="sr-only">{{ t('settings.archive.archivedOn') }}</span>{{ archivedOn(tab) }}
          </span>
          <UiButton size="sm" :data-archive-restore="tab.id" @click="restore($event, tab)">{{ t('settings.archive.restoreButton') }}</UiButton>
          <UiButton size="sm" class="text-danger enabled:hover:bg-danger/15!" @click="remove($event, tab)">{{ t('settings.archive.deleteConfirm') }}</UiButton>
        </li>
      </ul>
    </div>
  </section>
</template>
