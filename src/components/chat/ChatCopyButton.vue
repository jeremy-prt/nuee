<script setup lang="ts">
import { Check, Copy } from '@/components/ui/icons'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'

// Copie le texte au clic ; l'icône devient une coche le temps de le voir. `text` est lu au moment du clic.
const props = defineProps<{ text: () => string; label: string }>()

const { t } = useI18n()
const copied = ref(false)
let timer = 0

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text())
  } catch {
    return
  }
  copied.value = true
  clearTimeout(timer)
  timer = window.setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <UiIconButton :label="copied ? t('chat.copy.copied') : label" @click="copy">
    <Check v-if="copied" class="size-3.5" aria-hidden="true" />
    <Copy v-else class="size-3.5" aria-hidden="true" />
  </UiIconButton>
</template>
