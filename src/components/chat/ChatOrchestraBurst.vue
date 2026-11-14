<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import ChatModeEdge from '@/components/chat/ChatModeEdge.vue'
import type { FrameTone } from '@/components/chat/composerFrame'

// Mode Orchestre activé : une onde de lumière part de la puce pendant que le bord passe au violet, puis tout est
// retiré. Le relais suit la fin réelle du fondu (`animationend`), pas une minuterie qui le coupait en route.
const props = defineProps<{ x: number; y: number; from: FrameTone; to: FrameTone }>()
const emit = defineEmits<{ done: [] }>()

const wave = useTemplateRef('wave')

// L'onde est peinte petite puis agrandie (un dégradé flou ne perd rien à l'échelle) jusqu'au coin le plus loin.
onMounted(() => {
  const box = wave.value!.parentElement!.getBoundingClientRect()
  const reach = Math.hypot(Math.max(props.x, box.width - props.x), Math.max(props.y, box.height - props.y))
  wave.value!.style.setProperty('--wave-scale', String(reach / 60))
})
</script>

<template>
  <div class="orchestra-burst" aria-hidden="true">
    <span class="orchestra-wave-clip">
      <span ref="wave" class="orchestra-wave" :style="{ left: `${x}px`, top: `${y}px` }" />
    </span>
    <ChatModeEdge :from="from" :to="to" @done="emit('done')" />
  </div>
</template>
