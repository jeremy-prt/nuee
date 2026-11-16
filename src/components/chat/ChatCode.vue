<script setup lang="ts">
import { ref, watch } from 'vue'
import { type CodeSegment, highlightCode } from '@/utils/highlight'

// Texte d'un code coloré selon son langage ; tant que les couleurs chargent (ou sans `colored`, pendant l'écriture),
// le texte brut. `prefix` : un « $ » d'invite, gardé hors des couleurs.
const props = defineProps<{ code: string; lang?: string; colored?: boolean; prefix?: string }>()
const segments = ref<CodeSegment[] | null>(null)

watch(
  () => [props.code, props.lang, props.colored] as const,
  async ([code, lang, colored]) => {
    segments.value = null
    if (!colored || !lang) return
    const found = await highlightCode(code, lang).catch(() => null)
    if (props.code === code) segments.value = found
  },
  { immediate: true },
)
</script>

<template>
  <code><span v-if="prefix" class="tok-prompt">{{ prefix }}</span><template v-if="segments"><span v-for="(segment, index) in segments" :key="index" :class="segment.class">{{ segment.text }}</span></template><template v-else>{{ code }}</template></code>
</template>
