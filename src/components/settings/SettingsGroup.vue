<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <section class="pt-8">
    <div v-if="title" class="flex items-end gap-4 pb-2.5">
      <h3 class="min-w-0 flex-1 text-sm font-semibold">{{ title }}</h3>
      <slot name="action" />
    </div>
    <div class="overflow-hidden rounded-xl border border-stroke bg-content/3">
      <slot />
    </div>
  </section>
</template>
