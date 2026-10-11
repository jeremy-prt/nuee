<script setup lang="ts">
import { computed } from 'vue'
import antigravity from '@/assets/agents/antigravity.svg'
import claude from '@/assets/agents/claude.svg'
import codex from '@/assets/agents/codex.svg'
import cursor from '@/assets/agents/cursor.svg'
import grok from '@/assets/agents/grok.svg'

// Logos repris de monocode (licence dans assets/agents). Cursor et Grok sont monochromes : posés en
// masque, ils prennent la couleur du texte. Les trois premiers ont une marge dans leur dessin, d'où
// une boîte plus grande pour la même taille à l'œil.
const logos = {
  claude: { src: claude, mono: false, padded: true },
  codex: { src: codex, mono: false, padded: true },
  cursor: { src: cursor, mono: true, padded: true },
  antigravity: { src: antigravity, mono: false, padded: false },
  grok: { src: grok, mono: true, padded: false },
}

const props = defineProps<{ id: keyof typeof logos; muted?: boolean; small?: boolean }>()

const box = computed(() => (props.small ? 'size-5' : 'size-6'))
const size = computed(() => {
  if (logos[props.id].padded) return box.value
  return props.small ? 'size-3.75' : 'size-4.5'
})
</script>

<template>
  <span class="grid shrink-0 place-items-center" :class="[box, { 'opacity-50': muted }]" aria-hidden="true">
    <span
      v-if="logos[id].mono"
      class="bg-current"
      :class="size"
      :style="{ mask: `url(&quot;${logos[id].src}&quot;) center / contain no-repeat` }"
    />
    <img v-else :src="logos[id].src" alt="" :class="size" />
  </span>
</template>
