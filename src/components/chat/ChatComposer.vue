<script setup lang="ts">
import { ArrowUp, ShieldAlert, ShieldCheck, Square, X } from '@/components/ui/icons'
import { type Component, computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatContextMeter from '@/components/chat/ChatContextMeter.vue'
import ChatMentionMenu from '@/components/chat/ChatMentionMenu.vue'
import ChatModelPicker from '@/components/chat/ChatModelPicker.vue'
import ChatPlaceBar from '@/components/chat/ChatPlaceBar.vue'
import ChatPlusMenu from '@/components/chat/ChatPlusMenu.vue'
import ChatPromptText from '@/components/chat/ChatPromptText.vue'
import ChatSlashMenu from '@/components/chat/ChatSlashMenu.vue'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import UiMenu, { type UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { attachmentCapture, attachmentImport, attachmentSave, previewSrc } from '@/ipc/attachment'
import { isAppError } from '@/ipc/agent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Attachment } from '@/ipc/bindings/Attachment'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { ContextUsage } from '@/ipc/bindings/ContextUsage'
import type { Effort } from '@/ipc/bindings/Effort'
import type { PermissionMode } from '@/ipc/bindings/PermissionMode'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import type { Worktree } from '@/ipc/bindings/Worktree'
import type { WorktreeSupport } from '@/ipc/bindings/WorktreeSupport'
import { pickFiles } from '@/ipc/dialog'
import { useDraftsStore } from '@/stores/drafts'
import { useGeneralStore } from '@/stores/general'
import type { Project } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useSkillsStore } from '@/stores/skills'

const props = defineProps<{
  chatId: string
  agent: AgentKind
  // null : chat sans projet.
  project: Project | null
  // Worktree du chat : choisi avant le premier message, affiché ensuite. `choice` : 'project', 'new' ou le chemin
  // d'un worktree de `trees` ; `blocked` : pourquoi il est impossible.
  worktree: {
    choice: string
    started: boolean
    blocked: Exclude<WorktreeSupport, 'ready'> | null
    branch: string
    trees: Worktree[]
  } | null
  // null tant que l'agent n'a pas décrit ses modèles : on laisse alors son choix par défaut.
  catalog: Catalog | null
  // null tant que l'agent n'a pas relevé son contexte pour ce modèle.
  context: ContextUsage | null
  // Rien à compacter avant le premier échange.
  compactable: boolean
  // Messages envoyés dans la session, du plus ancien au plus récent, que ↑ et ↓ parcourent.
  sent?: () => { text: string; attachments: Attachment[] }[]
  disabled: boolean
  running: boolean
  // Une demande d'autorisation attend : son bouton Autoriser est l'action principale, Arrêter passe au second plan.
  approving?: boolean
}>()
// Réglages résolus : modèle et effort sont toujours des valeurs réelles du catalogue.
const options = defineModel<TurnOptions>('options', { required: true })
const emit = defineEmits<{ send: [prompt: string, attachments: Attachment[]]; stop: []; warm: []; worktree: [choice: string]; compact: [] }>()

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const general = useGeneralStore()
const skills = useSkillsStore()
const drafts = useDraftsStore()
const prompt = ref(drafts.get(props.chatId)?.text ?? '')
const attachments = ref<Attachment[]>(drafts.get(props.chatId)?.attachments ?? [])
watch([prompt, attachments], () => drafts.set(props.chatId, prompt.value, attachments.value))
// Fichiers en cours d'écriture sur disque : envoyer avant les perdrait.
const saving = ref(0)
const attachError = ref<string | null>(null)
const id = useId()
const input = useTemplateRef('input')
// Après un choix de mode, de modèle ou d'effort, on reprend la saisie là où on l'avait laissée.
const focusInput = () => input.value?.focus()

const modeLooks = {
  bypass: { icon: ShieldAlert, iconClass: 'text-warning' },
  auto: { icon: ShieldCheck, iconClass: undefined },
} satisfies Record<PermissionMode, { icon: Component; iconClass?: string }>
const modeLook = computed(() => modeLooks[options.value.mode])
const modeSections = computed<UiMenuSection[]>(() => [
  {
    id: 'mode',
    value: options.value.mode,
    options: (['bypass', 'auto'] as const).map((mode) => ({
      value: mode,
      label: t(`composer.mode.${mode}`),
      hint: t(`composer.mode.${mode}Hint`),
      ...modeLooks[mode],
    })),
  },
])

const chosenModel = computed({
  get: () => options.value.model,
  set: (value: string | null) => {
    options.value = { ...options.value, model: value }
  },
})
const chosenEffort = computed({
  get: () => options.value.effort,
  set: (value: Effort | null) => {
    options.value = { ...options.value, effort: value }
  },
})
const chosenFast = computed({
  get: () => options.value.fast,
  set: (value: boolean) => {
    options.value = { ...options.value, fast: value }
  },
})

function chooseMode(_: string, value: string) {
  options.value = { ...options.value, mode: value as PermissionMode }
}

// Position du curseur, null hors du champ : le menu des skills ne suit que la frappe en cours.
const caret = ref<number | null>(null)
const syncCaret = () => (caret.value = input.value?.selectionStart ?? null)
const slashMenu = useTemplateRef('slashMenu')
const slashQuery = computed(() => {
  // Un message rappelé se parcourt aux flèches : le menu les prendrait.
  if (recalled.value) return null
  const word = /^\/\S*/.exec(prompt.value)?.[0]
  if (!word || caret.value === null || caret.value > word.length) return null
  return word.slice(1)
})

// Mention sous le curseur : du « @ » (en début de mot) jusqu'au curseur. La forme entre guillemets ne s'y prête pas.
const mentionMenu = useTemplateRef('mentionMenu')
const mention = computed(() => {
  if (caret.value === null || !props.project || recalled.value) return null
  const start = prompt.value.slice(0, caret.value).search(/(?<=^|\s)@[^\s"]*$/)
  if (start === -1) return null
  const end = start + /^\S*/.exec(prompt.value.slice(start))![0].length
  return { start, end, query: prompt.value.slice(start + 1, caret.value) }
})

async function chooseFile(path: string) {
  const token = mention.value
  if (!token) return
  const head = `${prompt.value.slice(0, token.start)}@${/\s/.test(path) ? `"${path}"` : path}`
  const rest = prompt.value.slice(token.end)
  prompt.value = head + (/^\s/.test(rest) ? rest : ` ${rest}`)
  const position = head.length + 1
  caret.value = position
  await nextTick()
  input.value?.setSelectionRange(position, position)
}

async function chooseSkill(name: string) {
  const head = `/${name}`
  const rest = prompt.value.replace(/^\/\S*/, '')
  prompt.value = head + (/^\s/.test(rest) ? rest : ` ${rest}`)
  const position = head.length + 1
  caret.value = position
  await nextTick()
  input.value?.setSelectionRange(position, position)
}

const highlight = useTemplateRef('highlight')
// Le skill est toujours en tête : son icône prend place dans un retrait de première ligne, posé sur les deux
// couches pour qu'elles passent à la ligne au même endroit.
const indent = computed(() => (skills.names.has(/^\/(\S+)/.exec(prompt.value)?.[1] ?? '') ? { textIndent: '1.125rem' } : undefined))
const syncScroll = () => {
  if (highlight.value && input.value) highlight.value.scrollTop = input.value.scrollTop
}
const canSend = computed(() => (!!prompt.value.trim() || attachments.value.length > 0) && !saving.value)

// Le champ suit la hauteur du texte jusqu'à son max-h, puis défile.
watch(
  prompt,
  () => {
    const field = input.value
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
    syncScroll()
  },
  { flush: 'post' },
)

function submit() {
  if (!canSend.value || props.disabled) return
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

// Fichiers glissés sur le chat ou choisis par le bouton + : ils ont déjà un chemin sur disque.
function attach(paths: string[]) {
  return attachWith(() => attachmentImport(props.chatId, paths))
}

async function pick() {
  const paths = await pickFiles(t('composer.attach'))
  if (paths.length) await attach(paths)
  input.value?.focus()
}

function capture() {
  return attachWith(async () => {
    const shot = await attachmentCapture(props.chatId)
    return shot ? [shot] : []
  })
}

// Depuis le menu « + » : le déclencheur tapé à la place de l'utilisateur, menu ouvert au curseur.
// Le focus d'abord : son écouteur relit la sélection, qui serait encore en fin de texte.
async function placeCaret(position: number) {
  await nextTick()
  input.value?.focus()
  input.value?.setSelectionRange(position, position)
  caret.value = position
}

function startMention() {
  const at = input.value?.selectionEnd ?? prompt.value.length
  const before = prompt.value.slice(0, at)
  const after = prompt.value.slice(at)
  const head = `${before}${before && !/\s$/.test(before) ? ' ' : ''}@`
  // Collé au mot suivant, le « @ » le prendrait pour sa recherche, et le choix d'un fichier l'écraserait.
  prompt.value = head + (after && !/^\s/.test(after) ? ` ${after}` : after)
  placeCaret(head.length)
}

// Un skill ne se lit qu'en tête de message : « / » y est ajouté, le texte déjà tapé le suit.
function startSkill() {
  if (!prompt.value.startsWith('/')) prompt.value = `/${prompt.value ? ` ${prompt.value}` : ''}`
  placeCaret(/^\/\S*/.exec(prompt.value)![0].length)
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

function remove(index: number, event: MouseEvent) {
  attachments.value = attachments.value.filter((_, i) => i !== index)
  // Validée au clavier, la croix disparaît avec sa pièce jointe : le focus va au champ.
  if (event.detail === 0) input.value?.focus()
}

// Message repris après un retour en arrière : il remplace la saisie en cours.
function fill(text: string, files: Attachment[]) {
  prompt.value = text
  attachments.value = files
  focusInput()
}

defineExpose({ attach, fill, focus: focusInput })

// Historique comme dans un terminal : ↑ depuis un champ vide remonte les messages envoyés, ↓ redescend jusqu'au
// champ d'origine. Le texte ou les pièces jointes modifiés, les flèches redeviennent celles du texte ; dans un
// texte de plusieurs lignes, elles ne naviguent que depuis la première ou la dernière.
const recalled = ref<{ index: number; text: string; attachments: Attachment[] } | null>(null)
watch([prompt, attachments], ([text, files]) => {
  if (recalled.value && (text !== recalled.value.text || files !== recalled.value.attachments)) recalled.value = null
})

function browse(event: KeyboardEvent) {
  const up = shortcuts.matches(event, 'recall')
  if (!up && !shortcuts.matches(event, 'recallNext')) return false
  const sent = props.sent?.() ?? []
  const at = input.value?.selectionStart ?? 0
  const current = recalled.value
  if (!current) {
    if (!up || prompt.value || attachments.value.length || saving.value || !sent.length) return false
  } else if (up ? prompt.value.slice(0, at).includes('\n') : prompt.value.slice(at).includes('\n')) {
    return false
  }
  const next = current ? current.index + (up ? -1 : 1) : sent.length - 1
  if (next < 0) return false
  event.preventDefault()
  const message = sent[next]
  if (!message) {
    recalled.value = null
    fill('', [])
    return true
  }
  fill(message.text, message.attachments)
  recalled.value = { index: next, text: message.text, attachments: attachments.value }
  placeCaret(up ? 0 : message.text.length)
  return true
}

// Maj+Entrée va à la ligne (natif). Pendant une saisie IME, Entrée valide le mot.
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || slashMenu.value?.keydown(event) || mentionMenu.value?.keydown(event)) return
  if (browse(event)) return
  if (!shortcuts.matches(event, 'send')) return
  event.preventDefault()
  submit()
}
</script>

<template>
  <!-- Le menu des skills est hors du cadre flouté : un flou imbriqué ne verrait que le cadre derrière lui. -->
  <form class="relative" @submit.prevent="submit">
    <div
      class="@container rounded-2xl border border-stroke bg-selection/50 backdrop-blur-sm has-[textarea:focus]:border-stroke-focus"
      :class="{ 'opacity-60': disabled }"
    >
      <ul v-if="attachments.length" class="flex flex-wrap gap-2 px-3 pt-3" :aria-label="t('composer.attachments')">
        <li v-for="(attachment, index) in attachments" :key="attachment.preview ?? attachment.path" class="group relative" :title="attachment.path">
          <UiImagePreview v-if="attachment.preview" :src="previewSrc(attachment.preview)" :alt="attachment.name" class="size-12 overflow-hidden border border-stroke">
            <img :src="previewSrc(attachment.preview)" :alt="attachment.name" class="size-full object-cover" />
          </UiImagePreview>
          <div v-else class="flex h-12 max-w-48 items-center gap-2 rounded-lg bg-content/6 ps-2.5 pe-7 text-xs">
            <UiFileIcon :name="attachment.name" :folder="attachment.kind === 'folder'" class="size-4 shrink-0" />
            <span class="min-w-0 truncate">{{ attachment.name }}</span>
          </div>
          <UiTooltip :label="t('composer.removeAttachment', { name: attachment.name })">
            <button
              type="button"
              class="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-canvas/85 text-content opacity-0 duration-(--hover-duration) group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-ring"
              :aria-label="t('composer.removeAttachment', { name: attachment.name })"
              @click="remove(index, $event)"
            >
              <X class="size-3" aria-hidden="true" />
            </button>
          </UiTooltip>
        </li>
      </ul>
      <p v-if="attachError" class="px-3 pt-2 text-xs text-danger" role="alert">{{ attachError }}</p>
      <label :for="id" class="sr-only">{{ t('composer.label') }}</label>
      <div class="relative">
        <div
          ref="highlight"
          aria-hidden="true"
          :style="indent"
          class="pointer-events-none absolute inset-0 overflow-hidden px-3.5 pt-3.5 pb-2 text-sm leading-5.5 wrap-break-word whitespace-pre-wrap"
        >
          <ChatPromptText :text="prompt" fit :typing="mention?.start" />
        </div>
        <textarea
          :id="id"
          ref="input"
          v-model="prompt"
          rows="1"
          aria-autocomplete="list"
          :aria-controls="slashMenu?.activeId ? `${id}-skills` : mentionMenu?.activeId ? `${id}-files` : undefined"
          :aria-activedescendant="slashMenu?.activeId ?? mentionMenu?.activeId"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          writingsuggestions="false"
          :disabled="disabled"
          :style="indent"
          class="prompt-field relative block max-h-60 min-h-18 w-full resize-none bg-transparent px-3.5 pt-3.5 pb-2 text-sm leading-5.5 select-text outline-none placeholder:truncate"
          :placeholder="t('composer.placeholder')"
          @keydown="onKeydown"
          @input="syncCaret"
          @keyup="syncCaret"
          @click="syncCaret"
          @focus="syncCaret(); emit('warm')"
          @blur="caret = null"
          @paste="onPaste"
          @scroll="syncScroll"
        />
      </div>
      <!-- Étroite (petite fenêtre, écran partagé) : le nom du mode ne reste que pour les lecteurs d'écran. -->
      <div class="flex items-center gap-1 px-2 pb-2">
        <ChatPlusMenu
          :disabled="disabled"
          :loading="saving > 0"
          :mention="!!project"
          :focus-after="focusInput"
          @attach="pick"
          @capture="capture"
          @mention="startMention"
          @skill="startSkill"
        />
        <ChatModelPicker
          v-model="chosenModel"
          v-model:effort="chosenEffort"
          v-model:fast="chosenFast"
          :agent="agent"
          :catalog="catalog"
          :disabled="disabled"
          :focus-after="focusInput"
        />
        <UiMenu
          :label="t('composer.mode.label')"
          :sections="modeSections"
          :disabled="disabled"
          :focus-after="focusInput"
          @select="chooseMode"
        >
          <component :is="modeLook.icon" class="size-3.5 shrink-0" :class="modeLook.iconClass" aria-hidden="true" />
          <span class="@max-sm:sr-only">{{ t(`composer.mode.${options.mode}`) }}</span>
        </UiMenu>
        <span class="flex-1" />
        <ChatContextMeter v-if="context" :usage="context" :disabled="disabled || running || !compactable" class="me-1" @compact="emit('compact')" />
        <!-- Pendant une réponse : le message attend la fin du tour ou la rejoint, selon Réglages › Général. -->
        <UiTooltip v-if="running && canSend" :label="t(general.followUp === 'steer' ? 'composer.steer' : 'composer.queue')" :shortcut="shortcuts.label('send')" side="top">
          <button
            type="submit"
            :disabled="disabled"
            class="me-1 grid size-7 shrink-0 place-items-center rounded-full bg-selection text-content hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            :aria-label="t(general.followUp === 'steer' ? 'composer.steer' : 'composer.queue')"
          >
            <ArrowUp class="size-4" aria-hidden="true" />
          </button>
        </UiTooltip>
        <UiTooltip v-if="running" :label="t('composer.stop')" side="top">
          <button
            type="button"
            class="grid size-7 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            :class="approving ? 'bg-selection text-content hover:bg-selection-hover' : 'bg-accent text-canvas hover:opacity-90'"
            :aria-label="t('composer.stop')"
            @click="emit('stop')"
          >
            <Square class="size-3 fill-current" aria-hidden="true" />
          </button>
        </UiTooltip>
        <UiTooltip v-else :label="t('composer.send')" :shortcut="shortcuts.label('send')" side="top">
          <button
            type="submit"
            :disabled="disabled || !canSend"
            class="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring enabled:hover:opacity-90 disabled:bg-content/12 disabled:text-muted"
            :aria-label="t('composer.send')"
          >
            <ArrowUp class="size-4" aria-hidden="true" />
          </button>
        </UiTooltip>
      </div>
    </div>
    <ChatPlaceBar
      v-if="project"
      :chat-id="chatId"
      :project="project"
      :worktree="worktree"
      :disabled="disabled"
      :running="running"
      :focus-after="focusInput"
      @worktree="emit('worktree', $event)"
    />
    <ChatSlashMenu ref="slashMenu" :id="`${id}-skills`" :query="slashQuery" @choose="chooseSkill" />
    <ChatMentionMenu v-if="project" ref="mentionMenu" :id="`${id}-files`" :query="mention?.query ?? null" :chat-id="chatId" :project="project.path" @choose="chooseFile" />
  </form>
</template>
