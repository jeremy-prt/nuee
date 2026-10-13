<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, X } from '@/components/ui/icons'
import { ToastAction, ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import { type Toast, type ToastKind, useToastsStore } from '@/stores/toasts'

// Messages en bas de la fenêtre, dans un seul cadre de verre : WebKit peint un fond périmé si le cadre flouté
// s'anime, alors ce sont les lignes qui entrent et sortent dedans. Survol, focus et fenêtre en arrière-plan
// suspendent la disparition ; F8 y amène le clavier.
const { t } = useI18n()
const store = useToastsStore()

const KINDS: Record<ToastKind, { icon: Component; tint: string; duration: number }> = {
  info: { icon: Info, tint: 'text-info', duration: 8000 },
  success: { icon: CircleCheck, tint: 'text-success', duration: 5000 },
  error: { icon: CircleAlert, tint: 'text-danger', duration: 12000 },
}

function onOpenChange(toast: Toast, open: boolean) {
  if (!open) store.dismiss(toast.id)
}

// ToastAction ferme le message de lui-même.
function run(toast: Toast) {
  toast.action?.run()
}
</script>

<template>
  <ToastProvider :label="t('toast.region')" swipe-direction="right">
    <!-- foreground : le lecteur d'écran annonce l'erreur tout de suite (assertive), le reste poliment. -->
    <ToastRoot
      v-for="toast in store.toasts"
      :key="toast.id"
      :open="toast.open"
      :duration="KINDS[toast.kind].duration"
      :type="toast.kind === 'error' ? 'foreground' : 'background'"
      class="ui-toast grid grid-rows-[1fr] rounded-lg ease-[cubic-bezier(0.16,1,0.3,1)] starting:grid-rows-[0fr] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=closed]:grid-rows-[0fr] data-[state=closed]:ease-in data-[swipe=end]:translate-x-(--reka-toast-swipe-end-x) data-[swipe=move]:translate-x-(--reka-toast-swipe-move-x) motion-safe:transition-[grid-template-rows,translate] motion-safe:duration-200 motion-safe:data-[state=closed]:animate-[ui-fade-out_160ms_ease-in] motion-safe:data-[state=closed]:duration-160 data-[swipe=move]:transition-none"
      @update:open="(open) => onOpenChange(toast, open)"
    >
      <!-- Ce contenu ne quitte le DOM qu'après l'animation de sortie : le message peut alors partir du store. -->
      <div class="ui-toast-body min-h-0 overflow-hidden border-stroke in-[li+li]:border-t" @vue:unmounted="store.remove(toast.id)">
        <div class="flex items-start gap-3 p-3 ps-3.5">
          <component :is="KINDS[toast.kind].icon" class="mt-1 size-4 shrink-0" :class="KINDS[toast.kind].tint" aria-hidden="true" />
          <div class="min-w-0 flex-1 py-0.5">
            <ToastTitle class="truncate text-sm font-medium">{{ toast.title }}</ToastTitle>
            <ToastDescription class="mt-0.5 text-xs wrap-break-word text-muted">{{ toast.body }}</ToastDescription>
          </div>
          <ToastAction v-if="toast.action" :alt-text="toast.action.label" as-child>
            <UiButton size="sm" @click="run(toast)">{{ toast.action.label }}</UiButton>
          </ToastAction>
          <ToastClose
            class="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('toast.close')"
          >
            <X class="size-3.5" aria-hidden="true" />
          </ToastClose>
        </div>
      </div>
    </ToastRoot>
    <ToastViewport
      :label="(hotkey) => t('toast.viewport', { hotkey })"
      class="ui-glass fixed end-4 bottom-4 z-50 w-[min(22rem,calc(100%-2rem))] rounded-xl text-content not-has-[>li]:hidden focus-visible:outline-2 focus-visible:outline-ring"
    />
  </ToastProvider>
</template>
