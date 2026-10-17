<script setup lang="ts">
import { computed, watch } from 'vue'
import { Sparkles } from '@/components/ui/icons'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import { useSkillsStore } from '@/stores/skills'
import { promptParts } from '@/utils/prompt'

// Texte d'un message avec le skill et les `@fichier` en pastilles. `fit` : calque du champ de saisie, posé sous
// le texte transparent du textarea. Rien n'y change de largeur (marges négatives, « @ » gardé transparent sous
// l'icône), sinon le curseur se décale ; le retrait de l'icône du skill est posé par le champ.
const props = defineProps<{ text: string; fit?: boolean }>()

const skills = useSkillsStore()
// Un saut de ligne final n'ouvre pas de ligne dans une div : sans l'espace ajoutée, le calque en aurait une de moins.
const parts = computed(() => promptParts(props.fit && props.text.endsWith('\n') ? `${props.text} ` : props.text, skills.names))

// Message repris, rempli ou rouvert sans passer par le menu « / » : ses skills ne sont pas encore lus.
watch(
  () => props.text.startsWith('/') && !skills.loaded && !skills.loading,
  (missing) => missing && skills.loadSkills(),
  { immediate: true },
)
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <span v-if="part.kind === 'skill' && fit" class="relative -ms-4.5 -me-1 rounded-md bg-skill/15 py-0.5 ps-4.5 pe-1 text-skill"><Sparkles class="absolute start-1 top-1/2 size-3 -translate-y-1/2" aria-hidden="true" />{{ part.text }}</span>
    <span v-else-if="part.kind === 'skill'" class="box-decoration-clone rounded-md bg-skill/15 px-1 py-0.5 text-skill"><Sparkles class="me-1 inline size-3 align-[-1px]" aria-hidden="true" />{{ part.text }}</span>
    <span v-else-if="(part.kind === 'file' || part.kind === 'folder') && fit" class="-mx-0.5 rounded-md bg-mention/15 px-0.5 py-0.5 text-mention"><span class="relative text-transparent">@<UiFileIcon :name="part.name" :folder="part.kind === 'folder'" class="absolute start-1/2 top-1/2 size-3.5 -translate-1/2" /></span>{{ part.text.slice(1) }}</span>
    <span v-else-if="part.kind === 'file' || part.kind === 'folder'" class="box-decoration-clone rounded-md bg-mention/15 px-1 py-0.5 text-mention" :title="part.path"><UiFileIcon :name="part.name" :folder="part.kind === 'folder'" class="me-1 inline size-3.5 align-[-2px]" />{{ part.path }}</span>
    <template v-else>{{ part.text }}</template>
  </template>
</template>
