<script setup lang="ts">
import { ArrowUp, Square } from '@lucide/vue'
import { computed, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import UiSelect from '@/components/ui/UiSelect.vue'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { Effort } from '@/ipc/bindings/Effort'
import type { PermissionMode } from '@/ipc/bindings/PermissionMode'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'

const props = defineProps<{
  agentName: string
  // null tant que l'agent n'a pas décrit ses modèles : on laisse alors son choix par défaut.
  catalog: Catalog | null
  disabled: boolean
  running: boolean
}>()
// Réglages résolus : modèle et effort sont toujours des valeurs réelles du catalogue.
const options = defineModel<TurnOptions>('options', { required: true })
const emit = defineEmits<{ send: [prompt: string]; stop: []; warm: [] }>()

const { t } = useI18n()
const prompt = ref('')
const id = useId()
const input = useTemplateRef('input')

const modeOptions = computed(() =>
  (['bypass', 'auto'] as const).map((mode) => ({
    value: mode,
    label: t(`composer.mode.${mode}`),
    hint: t(`composer.mode.${mode}Hint`),
  })),
)
const modelOptions = computed(() =>
  (props.catalog?.models ?? []).map((model) => ({
    value: model.value,
    label: model.label,
    hint: model.value === props.catalog?.defaultModel ? t('composer.default') : undefined,
  })),
)
const efforts = computed(() => props.catalog?.models.find((model) => model.value === options.value.model)?.efforts ?? [])
const effortOptions = computed(() =>
  efforts.value.map((effort) => ({
    value: effort,
    label: t(`composer.effort.${effort}`),
    hint: effort === props.catalog?.defaultEffort ? t('composer.default') : undefined,
  })),
)

const mode = computed({
  get: () => options.value.mode,
  set: (value: string) => (options.value = { ...options.value, mode: value as PermissionMode }),
})
const model = computed({
  get: () => options.value.model ?? '',
  set: (value: string) => (options.value = { ...options.value, model: value }),
})
const effort = computed({
  get: () => options.value.effort ?? '',
  set: (value: string) => (options.value = { ...options.value, effort: value as Effort }),
})

function submit() {
  const text = prompt.value.trim()
  if (!text || props.disabled || props.running) return
  emit('send', text)
  prompt.value = ''
  // Le bouton cliqué est remplacé par celui d'arrêt : sans ça, le focus clavier tombe sur la page.
  input.value?.focus()
}

// Entrée envoie, Maj+Entrée va à la ligne. Pendant une saisie IME, Entrée valide le mot.
function onEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.isComposing) return
  event.preventDefault()
  submit()
}
</script>

<template>
  <form
    class="rounded-xl border border-stroke bg-selection/50 p-3 focus-within:border-accent"
    :class="{ 'opacity-60': disabled }"
    @submit.prevent="submit"
  >
    <label :for="id" class="sr-only">{{ t('composer.label') }}</label>
    <textarea
      :id="id"
      ref="input"
      v-model="prompt"
      rows="3"
      :disabled="disabled"
      class="w-full resize-none bg-transparent text-sm select-text outline-none placeholder:text-muted"
      :placeholder="t('composer.placeholder')"
      @keydown.enter="onEnter"
      @focus="emit('warm')"
    />
    <div class="flex items-center gap-1">
      <span class="pe-1 text-xs text-muted">{{ agentName }}</span>
      <UiSelect v-model="mode" :label="t('composer.mode.label')" :options="modeOptions" :disabled="disabled" />
      <UiSelect
        v-if="modelOptions.length"
        v-model="model"
        :label="t('composer.model.label')"
        :options="modelOptions"
        :disabled="disabled"
      />
      <UiSelect
        v-if="effortOptions.length"
        v-model="effort"
        :label="t('composer.effort.label')"
        :options="effortOptions"
        :disabled="disabled"
      />
      <span class="flex-1" />
      <button
        v-if="running"
        type="button"
        class="grid size-7 place-items-center rounded-md bg-content text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :aria-label="t('composer.stop')"
        :title="t('composer.stop')"
        @click="emit('stop')"
      >
        <Square class="size-3 fill-current" aria-hidden="true" />
      </button>
      <button
        v-else
        type="submit"
        :disabled="disabled || !prompt.trim()"
        class="grid size-7 place-items-center rounded-md bg-content text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-30"
        :aria-label="t('composer.send')"
        :title="t('composer.send')"
      >
        <ArrowUp class="size-4" aria-hidden="true" />
      </button>
    </div>
  </form>
</template>
