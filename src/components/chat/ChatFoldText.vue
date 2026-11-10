<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'

// Texte d'une autre session (consigne, message reçu) : long, il est coupé avec « Afficher plus », comme l'app Claude.
const props = defineProps<{ text: string }>()

const LONG_TEXT = 400
const LONG_LINES = 6

const { t } = useI18n()
const long = computed(() => props.text.length > LONG_TEXT || props.text.split('\n').length > LONG_LINES)
const full = ref(false)
</script>

<template>
  <div>
    <div class="select-text" :class="{ 'max-h-32 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]': long && !full }">
      <ChatMarkdown :text="text" />
    </div>
    <button
      v-if="long"
      type="button"
      class="mt-1 rounded text-xs text-content/85 hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
      :aria-expanded="full"
      @click="full = !full"
    >
      {{ full ? t('chat.fromSession.less') : t('chat.fromSession.more') }}
    </button>
  </div>
</template>
