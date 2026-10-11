<script setup lang="ts">
import SettingsHeading from '@/components/settings/SettingsHeading.vue'

defineProps<{ title?: string; hint?: string }>()
</script>

<template>
  <section class="pt-8">
    <SettingsHeading v-if="title" :title="title">
      <slot name="action" />
    </SettingsHeading>
    <p v-if="hint" class="-mt-1 pb-2.5 text-xs/relaxed text-muted">{{ hint }}</p>
    <div class="overflow-hidden rounded-xl border border-stroke bg-content/3">
      <slot />
    </div>
  </section>
</template>
