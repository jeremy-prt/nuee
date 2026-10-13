<script setup lang="ts">
import { Hourglass } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'

// Tour arrêté par une limite d'utilisation. resetsAt : remise à zéro annoncée (ms) ; resumeAt : reprise programmée.
const props = defineProps<{ resetsAt: number | null; resumeAt: number | null }>()
const emit = defineEmits<{ schedule: []; cancel: [] }>()

const { t, locale } = useI18n()

function when(at: number) {
  const sameDay = new Date(at).toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat(locale.value, sameDay ? { timeStyle: 'short' } : { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(at)
}

const hint = computed(() => {
  if (props.resumeAt) return t('chat.limit.resuming', { time: when(props.resumeAt) })
  if (props.resetsAt) return t('chat.limit.resets', { time: when(props.resetsAt) })
  return t('chat.limit.unknown')
})
</script>

<template>
  <section class="flex w-full items-center gap-3 rounded-xl border border-stroke bg-content/3 py-2 ps-3 pe-2" role="status">
    <Hourglass class="size-4 shrink-0 text-warning" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-[13px] font-medium">{{ t('chat.limit.title') }}</p>
      <p class="text-xs text-muted">{{ hint }}</p>
    </div>
    <UiButton v-if="resumeAt" size="sm" @click="emit('cancel')">{{ t('chat.limit.cancel') }}</UiButton>
    <UiButton v-else-if="resetsAt" size="sm" @click="emit('schedule')">{{ t('chat.limit.schedule') }}</UiButton>
  </section>
</template>
