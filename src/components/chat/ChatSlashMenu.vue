<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSkillsStore } from '@/stores/skills'
import { matchScore, normalize, searchField } from '@/utils/search'

// `query` : le premier mot du message sans son « / », null quand on n'y tape pas.
const props = defineProps<{ id: string; query: string | null }>()
const emit = defineEmits<{ choose: [name: string] }>()

const { t } = useI18n()
const store = useSkillsStore()
const active = ref(0)
const dismissed = ref(false)
const list = useTemplateRef('list')

// Début du nom d'abord, dans l'ordre alphabétique de la liste, puis correspondance tolérante.
const results = computed(() => {
  if (props.query === null) return []
  const wanted = normalize(props.query)
  const scored = store.skills.flatMap((skill) => {
    if (store.mode(skill) === 'off') return []
    if (normalize(skill.name).startsWith(wanted)) return [{ skill, score: -1 }]
    const score = matchScore(wanted, [searchField(skill.name, 0), searchField(skill.description, 2)])
    return score === null ? [] : [{ skill, score }]
  })
  return scored.sort((a, b) => a.score - b.score).map(({ skill }) => skill)
})

const open = computed(() => !dismissed.value && results.value.length > 0)
const optionId = (index: number) => `${props.id}-${index}`
const activeId = computed(() => (open.value ? optionId(active.value) : undefined))

watch(
  () => props.query,
  (query, previous) => {
    dismissed.value = false
    if (query !== null && previous === null) store.loadSkills()
  },
)
watch(results, () => (active.value = 0))

// Défile la liste seule : scrollIntoView ferait aussi défiler les cadres parents, même ceux sans barre.
watch(
  [active, results],
  () => {
    const box = list.value
    const option = box?.children[active.value] as HTMLElement | undefined
    if (!box || !option) return
    const bottom = option.offsetTop + option.offsetHeight
    if (option.offsetTop < box.scrollTop) box.scrollTop = option.offsetTop
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight
  },
  { flush: 'post' },
)

// Navigation standard d'une liste, hors raccourcis réglables. Avec un modificateur, la touche garde son
// rôle habituel (⌘Entrée envoie le message tel quel). Vrai si la touche a servi au menu.
function keydown(event: KeyboardEvent) {
  if (!open.value || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  const count = results.value.length
  if (event.key === 'ArrowDown') active.value = (active.value + 1) % count
  else if (event.key === 'ArrowUp') active.value = (active.value - 1 + count) % count
  else if (event.key === 'Enter' || event.key === 'Tab') emit('choose', results.value[active.value]!.name)
  else if (event.key === 'Escape') dismissed.value = true
  else return false
  event.preventDefault()
  return true
}

defineExpose({ open, activeId, keydown })
</script>

<template>
  <!-- mousedown empêché : le focus reste dans le champ de saisie. -->
  <div v-if="open" class="ui-glass absolute -inset-x-px bottom-full z-10 mb-2 rounded-lg p-1 text-xs select-none">
    <ul
      :id="id"
      ref="list"
      role="listbox"
      :aria-label="t('composer.skills')"
      class="relative max-h-60 overflow-y-auto"
      @mousedown.prevent
    >
      <li
        v-for="(skill, index) in results"
        :id="optionId(index)"
        :key="skill.id"
        role="option"
        :aria-selected="index === active"
        class="flex cursor-pointer items-baseline gap-3 rounded-md px-2 py-1.5 text-content/75 aria-selected:bg-selection aria-selected:text-content"
        @pointermove="active = index"
        @click="emit('choose', skill.name)"
      >
        <span class="max-w-1/2 shrink-0 truncate">/{{ skill.name }}</span>
        <span class="min-w-0 flex-1 truncate text-muted">{{ skill.description }}</span>
      </li>
    </ul>
  </div>
</template>
