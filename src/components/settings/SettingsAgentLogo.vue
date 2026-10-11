<script setup lang="ts">
import antigravity from '@/assets/agents/antigravity.svg'
import claude from '@/assets/agents/claude.svg'
import codex from '@/assets/agents/codex.svg'
import cursor from '@/assets/agents/cursor.svg'
import grok from '@/assets/agents/grok.svg'

// Logos repris de monocode (licence dans assets/agents). Cursor et Grok sont monochromes : posés en
// masque, ils prennent la couleur du texte. Les trois premiers ont une marge dans leur dessin, d'où
// une boîte plus grande pour la même taille à l'œil.
const logos = {
  claude: { src: claude, mono: false, size: 'size-6' },
  codex: { src: codex, mono: false, size: 'size-6' },
  cursor: { src: cursor, mono: true, size: 'size-6' },
  antigravity: { src: antigravity, mono: false, size: 'size-4.5' },
  grok: { src: grok, mono: true, size: 'size-4.5' },
}

defineProps<{ id: keyof typeof logos; muted?: boolean }>()
</script>

<template>
  <span class="grid size-6 shrink-0 place-items-center" :class="{ 'opacity-50': muted }" aria-hidden="true">
    <span
      v-if="logos[id].mono"
      class="bg-current"
      :class="logos[id].size"
      :style="{ mask: `url(&quot;${logos[id].src}&quot;) center / contain no-repeat` }"
    />
    <img v-else :src="logos[id].src" alt="" :class="logos[id].size" />
  </span>
</template>
