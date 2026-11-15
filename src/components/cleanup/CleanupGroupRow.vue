<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useTween } from '@/composables/useTween'
import { formatBytes } from '@/utils/cleanup'

// Ligne d'une catégorie de l'écran Nettoyage. `step` suit le nettoyage : l'interrupteur devient un cercle qui se
// trace pendant que le chiffre descend (`pace` ms), puis une coche ; `dimmed` pour une catégorie décochée.
const props = defineProps<{
  icon: Component
  title: string
  help: string
  value: number
  step?: 'dimmed' | 'pending' | 'working' | 'done'
  pace: number
}>()
const included = defineModel<boolean>('included', { default: false })
const { t, locale } = useI18n()

const shown = useTween(() => props.value, () => props.pace)
const memory = computed(() => formatBytes(shown.value, locale.value))
</script>

<template>
  <li class="row flex items-center gap-3.5 py-3" :data-step="step">
    <component :is="icon" class="size-5 shrink-0 text-muted" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-[13px] font-medium">{{ title }}</p>
      <p class="truncate text-xs text-muted">{{ help }}</p>
    </div>
    <span class="shrink-0 text-[13px] font-medium tabular-nums" :class="{ 'text-muted': value <= 0 }">{{ memory }}</span>
    <span class="grid h-5 w-9 shrink-0 place-items-center">
      <svg v-if="step === 'done'" class="check size-5 text-success" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <svg v-else-if="step === 'working'" class="size-5 -rotate-90 text-signal" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" class="opacity-20" />
        <circle cx="12" cy="12" r="9" pathLength="1" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="trace" :style="{ animationDuration: `${pace}ms` }" />
      </svg>
      <UiSwitch v-else v-model="included" :label="t('cleanup.include', { name: title })" :disabled="!!step" />
    </span>
  </li>
</template>

<style scoped>
.row {
  transition: opacity 300ms var(--motion-ease);
}

.row[data-step='dimmed'] {
  opacity: 0.4;
}

.check path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw 350ms var(--motion-ease) forwards;
}

.trace {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw linear forwards;
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .row {
    transition-duration: 150ms;
  }
  .check {
    animation: fade-in 150ms linear;
  }
  .check path,
  .trace {
    animation: none;
    stroke-dashoffset: 0;
  }
}
</style>
