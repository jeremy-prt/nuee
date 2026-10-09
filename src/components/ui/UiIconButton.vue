<script setup lang="ts">
defineProps<{ label: string; shortcut?: string; active?: boolean }>()
</script>

<template>
  <button
    type="button"
    class="grid size-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
    :class="{ 'bg-selection text-content': active }"
    :aria-label="label"
    :title="shortcut ? `${label} (${shortcut})` : label"
  >
    <slot />
  </button>
</template>
