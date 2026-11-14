<script setup lang="ts">
// Ligne de réglage pendant une lecture, aux hauteurs de SettingsRow : la vraie ligne prend sa place sans saut.
// `label` connu d'avance reste écrit ; `avatar` : rond d'un compte. Le slot tient la place du contrôle à droite.
defineProps<{ label?: string; avatar?: boolean }>()
</script>

<template>
  <div class="border-b border-stroke px-4 py-2.5 last:border-b-0" aria-hidden="true">
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="flex min-w-40 flex-1 items-center gap-3">
        <span v-if="avatar" class="skeleton size-8 shrink-0 rounded-full" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">
            <template v-if="label">{{ label }}</template>
            <span v-else class="skeleton inline-block h-2.5 w-28 rounded-full align-middle" />
          </p>
          <p class="mt-0.5 text-xs/relaxed"><span class="skeleton inline-block h-2 w-48 rounded-full align-middle" /></p>
        </div>
      </div>
      <slot />
    </div>
  </div>
</template>
