<script setup lang="ts">
import { ArrowUp } from '@lucide/vue'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const prompt = ref('')
const id = useId()
</script>

<template>
  <form
    class="rounded-xl border border-stroke bg-selection/50 p-3 focus-within:border-accent"
    @submit.prevent
  >
    <label :for="id" class="sr-only">{{ t('composer.label') }}</label>
    <textarea
      :id="id"
      v-model="prompt"
      rows="3"
      class="w-full resize-none bg-transparent text-sm select-text outline-none placeholder:text-muted"
      :placeholder="t('composer.placeholder')"
    />
    <div class="flex justify-end">
      <!-- Pas encore relié à un agent. -->
      <button
        type="submit"
        disabled
        class="grid size-7 place-items-center rounded-md bg-content text-canvas disabled:opacity-30"
        :aria-label="t('composer.send')"
      >
        <ArrowUp class="size-4" aria-hidden="true" />
      </button>
    </div>
  </form>
</template>
