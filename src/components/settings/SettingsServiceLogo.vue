<script setup lang="ts">
import github from '@/assets/integrations/github.svg'

// Logos monochromes (licence dans assets/integrations) : posés en masque, ils prennent la couleur du texte.
const logos = { github }

defineProps<{ id: keyof typeof logos; muted?: boolean }>()
</script>

<template>
  <span class="grid size-6 shrink-0 place-items-center" :class="{ 'opacity-50': muted }" aria-hidden="true">
    <span class="size-5 bg-current" :style="{ mask: `url(&quot;${logos[id]}&quot;) center / contain no-repeat` }" />
  </span>
</template>
