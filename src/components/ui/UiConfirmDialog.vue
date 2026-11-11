<script setup lang="ts">
import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'
import { useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import { useDialogStore } from '@/stores/dialog'

// Les confirmations de toute l'app, posées par useDialogStore().confirm. Échap annule. Le focus va sur le
// bouton de confirmation, sauf pour une action qu'on ne défait pas : une Entrée de trop ne doit rien effacer.
// Pas d'AlertDialogAction : sa fermeture répondrait « non » avant notre « oui ».
const { t } = useI18n()
const dialog = useDialogStore()
const confirmButton = useTemplateRef<{ $el: HTMLElement }>('confirmButton')

function onOpenAutoFocus(event: Event) {
  if (dialog.request?.danger) return
  event.preventDefault()
  confirmButton.value?.$el.focus()
}
</script>

<template>
  <AlertDialogRoot :open="dialog.open" @update:open="(open) => open || dialog.answer(false)">
    <AlertDialogPortal>
      <AlertDialogOverlay class="ui-overlay fixed inset-0 z-50 bg-black/50" />
      <AlertDialogContent
        v-if="dialog.request"
        class="ui-glass ui-glass-raised fixed inset-0 z-50 m-auto h-fit w-[min(22.5rem,calc(100%-2rem))] rounded-2xl text-content outline-none select-none"
        @open-auto-focus="onOpenAutoFocus"
      >
        <div class="ui-dialog-body p-5">
          <AlertDialogTitle class="text-[15px]/5 font-semibold">{{ dialog.request.title }}</AlertDialogTitle>
          <AlertDialogDescription class="mt-1.5 text-[13px]/[19px] text-muted">{{ dialog.request.message }}</AlertDialogDescription>
          <div class="mt-5 flex justify-end gap-2">
            <UiButton @click="dialog.answer(false)">{{ t('dialog.cancel') }}</UiButton>
            <!-- Comme monocode : une suppression se confirme sur un rouge plein, plus lisible que le rouge doux des réglages. -->
            <UiButton
              ref="confirmButton"
              :variant="dialog.request.danger ? 'danger' : 'primary'"
              :class="{ 'bg-danger! text-on-danger! enabled:hover:bg-danger/85!': dialog.request.danger }"
              @click="dialog.answer(true)"
            >
              {{ dialog.request.confirmLabel }}
            </UiButton>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
