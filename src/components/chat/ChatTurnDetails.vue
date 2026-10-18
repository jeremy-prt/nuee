<script setup lang="ts">
import { Ellipsis } from '@/components/ui/icons'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { formatClock, formatDuration } from '@/utils/duration'

// « … » de fin de tour : ce qui sert moins souvent que l'heure, la durée et la date complète.
defineProps<{ durationMs: number | null; at?: number }>()

const { t, locale } = useI18n()
</script>

<template>
  <UiTooltip :label="t('chat.end.details')">
    <span class="flex">
      <PopoverRoot>
        <PopoverTrigger
          class="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-selection-hover aria-expanded:text-content"
          :aria-label="t('chat.end.details')"
        >
          <Ellipsis class="size-3.5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent side="top" align="start" :side-offset="6" :collision-padding="8" class="ui-pop z-50 flex flex-col gap-1 px-3 py-2 text-xs text-content">
            <p v-if="durationMs !== null">{{ t('chat.end.completed', { duration: formatDuration(durationMs, locale, true) }) }}</p>
            <p v-if="at" class="text-muted">{{ t('chat.end.answeredAt', { date: formatClock(at, locale, true) }) }}</p>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </span>
  </UiTooltip>
</template>
