<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatSuggest from '@/components/chat/ChatSuggest.vue'
import { useSkillsStore } from '@/stores/skills'
import { matchScore, normalize, searchField } from '@/utils/search'

// `query` : le premier mot du message sans son « / », null quand on n'y tape pas.
const props = defineProps<{ id: string; query: string | null }>()
const emit = defineEmits<{ choose: [name: string] }>()

const { t } = useI18n()
const store = useSkillsStore()
const suggest = useTemplateRef('suggest')

// Début du nom d'abord, dans l'ordre alphabétique de la liste, puis correspondance tolérante.
const items = computed(() => {
  if (props.query === null) return []
  const wanted = normalize(props.query)
  const scored = store.skills.flatMap((skill) => {
    if (store.mode(skill) === 'off') return []
    if (normalize(skill.name).startsWith(wanted)) return [{ skill, score: -1 }]
    const score = matchScore(wanted, [searchField(skill.name, 0), searchField(skill.description, 2)])
    return score === null ? [] : [{ skill, score }]
  })
  return scored.sort((a, b) => a.score - b.score).map(({ skill }) => ({ key: skill.name, label: `/${skill.name}`, hint: skill.description }))
})

watch(
  () => props.query,
  (query, previous) => {
    if (query !== null && previous === null) store.loadSkills()
  },
)

defineExpose({
  open: computed(() => suggest.value?.open ?? false),
  activeId: computed(() => suggest.value?.activeId),
  keydown: (event: KeyboardEvent) => suggest.value?.keydown(event) ?? false,
})
</script>

<template>
  <ChatSuggest :id="id" ref="suggest" :label="t('composer.skills')" :query="query" :items="items" @choose="emit('choose', $event)" />
</template>
