<script setup lang="ts">
import { X } from '@lucide/vue'
import { ToastAction, ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import { type Toast, useToastsStore } from '@/stores/toasts'

// Messages en bas de la fenêtre. Survol et focus suspendent la disparition ; F8 y amène le clavier.
const { t } = useI18n()
const store = useToastsStore()

function onOpenChange(toast: Toast, open: boolean) {
  if (!open) store.dismiss(toast.id)
}

// ToastAction ferme le message de lui-même.
function run(toast: Toast) {
  toast.action?.run()
}
</script>

<template>
  <ToastProvider :duration="8000" :label="t('toast.region')" swipe-direction="right">
    <ToastRoot
      v-for="toast in store.toasts"
      :key="toast.id"
      class="ui-toast ui-glass rounded-xl text-content select-none"
      @update:open="(open) => onOpenChange(toast, open)"
    >
      <div class="ui-toast-body flex items-start gap-3 p-3 ps-3.5">
        <div class="min-w-0 flex-1 py-0.5">
          <ToastTitle class="truncate text-sm font-medium">{{ toast.title }}</ToastTitle>
          <ToastDescription class="mt-0.5 text-xs text-muted">{{ toast.body }}</ToastDescription>
        </div>
        <ToastAction v-if="toast.action" :alt-text="toast.action.label" as-child>
          <UiButton size="sm" @click="run(toast)">{{ toast.action.label }}</UiButton>
        </ToastAction>
        <ToastClose
          class="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-accent"
          :aria-label="t('toast.close')"
        >
          <X class="size-3.5" aria-hidden="true" />
        </ToastClose>
      </div>
    </ToastRoot>
    <ToastViewport class="fixed end-4 bottom-4 z-50 flex w-[min(22rem,calc(100%-2rem))] flex-col gap-2 outline-none" />
  </ToastProvider>
</template>
