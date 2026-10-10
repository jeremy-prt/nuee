<script setup lang="ts">
import { ArrowUp, File, Folder, Paperclip, Square, X } from '@lucide/vue'
import { computed, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { attachmentImport, attachmentSave, previewSrc } from '@/ipc/attachment'
import { isAppError } from '@/ipc/agent'
import type { Attachment } from '@/ipc/bindings/Attachment'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { Effort } from '@/ipc/bindings/Effort'
import type { PermissionMode } from '@/ipc/bindings/PermissionMode'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import { pickFiles } from '@/ipc/dialog'

const props = defineProps<{
  chatId: string
  agentName: string
  // null tant que l'agent n'a pas décrit ses modèles : on laisse alors son choix par défaut.
  catalog: Catalog | null
  disabled: boolean
  running: boolean
}>()
// Réglages résolus : modèle et effort sont toujours des valeurs réelles du catalogue.
const options = defineModel<TurnOptions>('options', { required: true })
const emit = defineEmits<{ send: [prompt: string, attachments: Attachment[]]; stop: []; warm: [] }>()

const { t } = useI18n()
const prompt = ref('')
const attachments = ref<Attachment[]>([])
// Fichiers en cours d'écriture sur disque : envoyer avant les perdrait.
const saving = ref(0)
const attachError = ref<string | null>(null)
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

const canSend = computed(() => (!!prompt.value.trim() || attachments.value.length > 0) && !saving.value)

function submit() {
  if (!canSend.value || props.disabled || props.running) return
  emit('send', prompt.value.trim(), attachments.value)
  prompt.value = ''
  attachments.value = []
  attachError.value = null
  // Le bouton cliqué est remplacé par celui d'arrêt : sans ça, le focus clavier tombe sur la page.
  input.value?.focus()
}

async function attachWith(task: () => Promise<Attachment[]>) {
  saving.value++
  try {
    // Un même fichier déposé deux fois ne part qu'une fois.
    const added = (await task()).filter((attachment) => !attachments.value.some((known) => known.path === attachment.path))
    attachments.value = [...attachments.value, ...added]
    attachError.value = null
  } catch (error) {
    attachError.value = t('composer.attachFailed', { detail: isAppError(error) ? error.message : String(error) })
  } finally {
    saving.value--
  }
}

// Fichiers glissés sur le chat ou choisis au trombone : ils ont déjà un chemin sur disque.
function attach(paths: string[]) {
  return attachWith(() => attachmentImport(props.chatId, paths))
}

async function pick() {
  const paths = await pickFiles(t('composer.attach'))
  if (paths.length) await attach(paths)
  input.value?.focus()
}

// Capture d'écran ou fichier copié. WebKit tronque parfois `files` : `items` en a plus.
// macOS ajoute à une capture sa copie TIFF sans nom : on la laisse de côté.
function onPaste(event: ClipboardEvent) {
  const data = event.clipboardData
  const fromItems = [...(data?.items ?? [])].flatMap((item) => (item.kind === 'file' ? [item.getAsFile()] : [])).filter((file) => file !== null)
  const fromList = [...(data?.files ?? [])]
  let files = fromItems.length > fromList.length ? fromItems : fromList
  if (files.some((file) => file.type !== 'image/tiff')) files = files.filter((file) => file.type !== 'image/tiff')
  if (!files.length) return
  event.preventDefault()
  attachWith(() => Promise.all(files.map((file) => attachmentSave(props.chatId, file))))
}

function remove(index: number) {
  attachments.value = attachments.value.filter((_, i) => i !== index)
  input.value?.focus()
}

defineExpose({ attach })

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
    <ul v-if="attachments.length" class="mb-2 flex flex-wrap gap-2" :aria-label="t('composer.attachments')">
      <li
        v-for="(attachment, index) in attachments"
        :key="attachment.preview ?? attachment.path"
        class="relative flex h-14 max-w-56 items-center gap-2 rounded-lg border border-stroke bg-canvas/40"
        :class="attachment.preview ? 'w-14' : 'ps-2 pe-7'"
        :title="attachment.path"
      >
        <img
          v-if="attachment.preview"
          :src="previewSrc(attachment.preview)"
          :alt="attachment.name"
          class="size-full rounded-lg object-cover"
        />
        <template v-else>
          <component :is="attachment.kind === 'folder' ? Folder : File" class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 truncate text-xs">{{ attachment.name }}</span>
        </template>
        <button
          type="button"
          class="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-stroke bg-overlay text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-accent"
          :aria-label="t('composer.removeAttachment', { name: attachment.name })"
          :title="t('composer.removeAttachment', { name: attachment.name })"
          @click="remove(index)"
        >
          <X class="size-3" aria-hidden="true" />
        </button>
      </li>
    </ul>
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
      @paste="onPaste"
    />
    <p v-if="attachError" class="mb-1 text-xs text-danger" role="alert">{{ attachError }}</p>
    <div class="flex items-center gap-1">
      <UiIconButton :label="t('composer.attach')" :disabled="disabled" @click="pick">
        <Paperclip class="size-4" aria-hidden="true" />
      </UiIconButton>
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
        class="grid size-7 place-items-center rounded-md bg-accent text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :aria-label="t('composer.stop')"
        :title="t('composer.stop')"
        @click="emit('stop')"
      >
        <Square class="size-3 fill-current" aria-hidden="true" />
      </button>
      <button
        v-else
        type="submit"
        :disabled="disabled || !canSend"
        class="grid size-7 place-items-center rounded-md bg-accent text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-30"
        :aria-label="t('composer.send')"
        :title="t('composer.send')"
      >
        <ArrowUp class="size-4" aria-hidden="true" />
      </button>
    </div>
  </form>
</template>
