<script setup lang="ts">
import SettingsHeading from '@/components/settings/SettingsHeading.vue'

// danger : l'aide prévient qu'un réglage du groupe touche plus que Nuée.
defineProps<{ title?: string; hint?: string; danger?: boolean }>()
</script>

<template>
  <section class="pt-8">
    <SettingsHeading v-if="title" :title="title">
      <slot name="action" />
    </SettingsHeading>
    <p v-if="hint" class="-mt-1 pb-2.5 text-xs/relaxed" :class="danger ? 'text-danger' : 'text-muted'">{{ hint }}</p>
    <div class="overflow-hidden rounded-xl border border-stroke bg-content/3">
      <slot />
    </div>
  </section>
</template>
