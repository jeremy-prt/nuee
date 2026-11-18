<script setup lang="ts">
// Barre des touches en bas d'une palette (Ajouter un projet, Recherche).
defineProps<{ items: { id: string; keys: string[]; label: string }[] }>()
</script>

<template>
  <ul class="flex min-w-0 flex-1 items-center gap-3.5 overflow-hidden text-xs whitespace-nowrap text-muted" aria-hidden="true">
    <li v-for="item in items" :key="item.id" class="flex items-center gap-1.5">
      <kbd v-for="label in item.keys" :key="label" class="grid h-5 min-w-5 place-items-center rounded-sm bg-content/8 px-1 light:bg-content/5 font-sans text-[11px] text-content/80">
        {{ label }}
      </kbd>
      {{ item.label }}
    </li>
  </ul>
</template>
