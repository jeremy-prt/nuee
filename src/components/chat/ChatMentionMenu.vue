<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatSuggest from '@/components/chat/ChatSuggest.vue'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import { projectFiles } from '@/ipc/project'
import { useGeneralStore } from '@/stores/general'
import { normalize } from '@/utils/search'

const LIMIT = 50

// `query` : ce qui suit le « @ » sous le curseur, null hors d'une mention. Rust choisit le dossier de la session.
const props = defineProps<{ id: string; query: string | null; chatId: string; project: string }>()
const emit = defineEmits<{ choose: [path: string] }>()

const { t } = useI18n()
const general = useGeneralStore()
const suggest = useTemplateRef('suggest')
// Fichiers et dossiers relatifs (un dossier finit par « / »), mis à plat au chargement : la liste suit chaque frappe.
type Entry = { path: string; name: string; parent: string; depth: number; folder: boolean; searchName: string; searchPath: string }
const entries = shallowRef<Entry[]>([])
// Évite d'annoncer « aucun fichier » avant la fin du chargement.
const loaded = ref(false)

function entry(path: string): Entry {
  const folder = path.endsWith('/')
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()!
  const parent = parts.length ? `${parts.join('/')}/` : ''
  return { path, name, parent, depth: parts.length, folder, searchName: normalize(name), searchPath: normalize(path) }
}

async function load() {
  loaded.value = false
  try {
    const files = await projectFiles(props.chatId, props.project, general.mentionIgnored)
    const folders = new Set<string>()
    for (const file of files) {
      for (let cut = file.indexOf('/'); cut !== -1; cut = file.indexOf('/', cut + 1)) folders.add(file.slice(0, cut + 1))
    }
    entries.value = [...folders, ...files].map(entry)
  } catch {
    // Dossier du projet effacé ou déplacé : rien à proposer.
    entries.value = []
  }
  loaded.value = true
}

watch(
  () => props.query !== null,
  (opened) => opened && load(),
)

// Nom qui commence par la saisie, puis nom qui la contient, puis chemin ; à égalité, le moins profond, les
// dossiers avant les fichiers comme l'app Claude.
const items = computed(() => {
  if (props.query === null) return []
  const wanted = normalize(props.query)
  const scored = entries.value.flatMap((entry) => {
    const score = entry.searchName.startsWith(wanted) ? 0 : entry.searchName.includes(wanted) ? 1 : entry.searchPath.includes(wanted) ? 2 : null
    return score === null ? [] : [{ entry, score }]
  })
  scored.sort((a, b) => a.score - b.score || a.entry.depth - b.entry.depth || Number(b.entry.folder) - Number(a.entry.folder) || a.entry.path.localeCompare(b.entry.path))
  return scored.slice(0, LIMIT).map(({ entry }) => ({
    key: entry.path,
    label: entry.folder ? `${entry.name}/` : entry.name,
    hint: entry.parent || undefined,
    icon: UiFileIcon,
    iconProps: { name: entry.name, folder: entry.folder },
  }))
})

defineExpose({
  open: computed(() => suggest.value?.open ?? false),
  activeId: computed(() => suggest.value?.activeId),
  keydown: (event: KeyboardEvent) => suggest.value?.keydown(event) ?? false,
})
</script>

<template>
  <ChatSuggest :id="id" ref="suggest" :label="t('composer.files')" :query="query" :items="items" :empty="loaded ? t('composer.noFiles') : undefined" @choose="emit('choose', $event)" />
</template>
