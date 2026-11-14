<script setup lang="ts">
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui'
import { computed, inject, watch } from 'vue'
import { mentionPlaceKey, useMentionsStore } from '@/stores/mentions'
import { useSkillsStore } from '@/stores/skills'
import { promptParts } from '@/utils/prompt'

// Texte d'un message, le skill et les `@fichier` en couleur. `fit` : calque du champ de saisie, posé sous le
// texte transparent du textarea ; seule la couleur change, rien n'y modifie la largeur, sinon le curseur se décale.
const props = defineProps<{ text: string; fit?: boolean }>()

const skills = useSkillsStore()
const describe = (name: string) => skills.skills.find((skill) => skill.name === name)?.description ?? ''
const mentions = useMentionsStore()
const place = inject(mentionPlaceKey, null)
const files = computed(() => (place?.value ? mentions.known.get(place.value.chatId) : undefined))
// Un saut de ligne final n'ouvre pas de ligne dans une div : sans l'espace ajoutée, le calque en aurait une de moins.
const parts = computed(() => promptParts(props.fit && props.text.endsWith('\n') ? `${props.text} ` : props.text, skills.names, files.value))

// Message repris, rempli ou rouvert sans passer par le menu « / » : ses skills ne sont pas encore lus.
watch(
  () => props.text.includes('/') && !skills.loaded && !skills.loading,
  (missing) => missing && skills.loadSkills(),
  { immediate: true },
)
// De même pour les fichiers du projet, lus une fois par session.
watch(
  () => (props.text.includes('@') ? place?.value : null),
  (current) => current && mentions.ensure(current.chatId, current.project),
  { immediate: true },
)
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <span v-if="part.kind === 'skill' && fit" class="text-skill" :data-skill="part.name">{{ part.text }}</span>
    <!-- Dans un message, la description du skill au survol, comme l'app Claude. -->
    <HoverCardRoot v-else-if="part.kind === 'skill'" :open-delay="300" :close-delay="100">
      <HoverCardTrigger as="span" class="text-skill">{{ part.text }}</HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side="bottom" align="start" :side-offset="6" :collision-padding="8" class="ui-pop z-50 w-72 px-3 py-2.5 text-xs text-content">
          <p class="text-muted">{{ part.text }}</p>
          <p v-if="describe(part.name)" class="mt-1 leading-relaxed">{{ describe(part.name) }}</p>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCardRoot>
    <span v-else-if="part.kind === 'file'" class="text-mention" :title="fit ? undefined : part.path">{{ part.text }}</span>
    <template v-else>{{ part.text }}</template>
  </template>
</template>
