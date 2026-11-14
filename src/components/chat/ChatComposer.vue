<script setup lang="ts">
import { ArrowUp, LoaderCircle, NotebookPen, Orchestra, ShieldAlertSolid, ShieldCheckSolid, ShieldQuestionSolid, Square, X } from '@/components/ui/icons'
import { type Component, computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatContextMeter from '@/components/chat/ChatContextMeter.vue'
import ChatMentionMenu from '@/components/chat/ChatMentionMenu.vue'
import ChatModelPicker from '@/components/chat/ChatModelPicker.vue'
import ChatNoteMenu from '@/components/chat/ChatNoteMenu.vue'
import ChatOrchestraBurst from '@/components/chat/ChatOrchestraBurst.vue'
import ChatAsciiWave from '@/components/chat/ChatAsciiWave.vue'
import { type FrameTone, frameLook } from '@/components/chat/composerFrame'
import ChatPlusMenu from '@/components/chat/ChatPlusMenu.vue'
import ChatPromptText from '@/components/chat/ChatPromptText.vue'
import ChatSlashMenu from '@/components/chat/ChatSlashMenu.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import UiMenu, { type UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { attachmentImport, attachmentSave, previewSrc } from '@/ipc/attachment'
import { isAppError } from '@/ipc/agent'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import type { Attachment } from '@/ipc/bindings/Attachment'
import type { Catalog } from '@/ipc/bindings/Catalog'
import type { ContextUsage } from '@/ipc/bindings/ContextUsage'
import type { Effort } from '@/ipc/bindings/Effort'
import type { PermissionMode } from '@/ipc/bindings/PermissionMode'
import type { TurnOptions } from '@/ipc/bindings/TurnOptions'
import { pickFiles } from '@/ipc/dialog'
import { useDraftsStore } from '@/stores/drafts'
import { useGeneralStore } from '@/stores/general'
import { useEffects } from '@/composables/useEffects'
import { useNotesStore } from '@/stores/notes'
import { useOrchestraStore } from '@/stores/orchestra'
import type { Project } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useSkillsStore } from '@/stores/skills'
import { useToastsStore } from '@/stores/toasts'

const props = defineProps<{
  chatId: string
  agent: AgentKind
  // null : chat sans projet.
  project: Project | null
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
const emit = defineEmits<{ send: [prompt: string, attachments: Attachment[], other: boolean]; stop: []; warm: []; compact: [] }>()

const { t } = useI18n()
const toasts = useToastsStore()
const shortcuts = useShortcutsStore()
const general = useGeneralStore()
const drafts = useDraftsStore()
const orchestra = useOrchestraStore()
const orchestrating = computed(() => orchestra.isOn(props.chatId))
// Mode « Résumer en note » : le texte tapé dit ce qu'il faut garder, l'envoi écrit la note au lieu d'un tour.
const notes = useNotesStore()
const summary = computed(() => notes.summaryMode.has(props.chatId))
const summaryWriting = computed(() => notes.summarizing.has(props.chatId))
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
  bypass: { icon: ShieldAlertSolid, iconClass: 'text-warning' },
  auto: { icon: ShieldCheckSolid, iconClass: 'text-info' },
  ask: { icon: ShieldQuestionSolid, iconClass: 'text-content/80' },
} satisfies Record<PermissionMode, { icon: Component; iconClass?: string }>
const modeLook = computed(() => modeLooks[options.value.mode])
const modeSections = computed<UiMenuSection[]>(() => [
  {
    id: 'mode',
    value: options.value.mode,
    options: (['bypass', 'auto', 'ask'] as const).map((mode) => ({
      value: mode,
      label: t(`composer.mode.${mode}`),
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
// Skill sous le curseur : du « / » (en début de mot, en tête de message ou après une espace) jusqu'au curseur.
const slash = computed(() => {
  // Un message rappelé se parcourt aux flèches : le menu les prendrait.
  if (recalled.value || caret.value === null) return null
  const start = prompt.value.slice(0, caret.value).search(/(?<=^|\s)\/[^\s/]*$/)
  if (start === -1) return null
  const end = start + /^\S*/.exec(prompt.value.slice(start))![0].length
  return { start, end, query: prompt.value.slice(start + 1, caret.value) }
})
const slashQuery = computed(() => slash.value?.query ?? null)

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

// Note sous le curseur : du « # » (en début de mot) jusqu'au curseur. « # » suivi d'une espace reste un titre markdown.
const noteMenu = useTemplateRef('noteMenu')
const hash = computed(() => {
  if (caret.value === null || recalled.value) return null
  const start = prompt.value.slice(0, caret.value).search(/(?<=^|\s)#[a-z0-9-]*$/)
  if (start === -1) return null
  const end = start + /^\S*/.exec(prompt.value.slice(start))![0].length
  return { start, end, query: prompt.value.slice(start + 1, caret.value) }
})

async function chooseNote(slug: string) {
  const token = hash.value
  if (!token) return
  const head = `${prompt.value.slice(0, token.start)}#${slug}`
  const rest = prompt.value.slice(token.end)
  prompt.value = head + (/^\s/.test(rest) ? rest : ` ${rest}`)
  const position = head.length + 1
  caret.value = position
  await nextTick()
  input.value?.setSelectionRange(position, position)
}

async function chooseSkill(name: string) {
  const token = slash.value
  if (!token) return
  const head = `${prompt.value.slice(0, token.start)}/${name}`
  const rest = prompt.value.slice(token.end)
  prompt.value = head + (/^\s/.test(rest) ? rest : ` ${rest}`)
  const position = head.length + 1
  caret.value = position
  await nextTick()
  input.value?.setSelectionRange(position, position)
}

const highlight = useTemplateRef('highlight')

// Skill survolé dans le champ : son texte coloré est dans le calque sous le textarea, qui prend la souris. On cherche
// donc le skill sous le pointeur dans ce calque, et sa description s'affiche après un court délai, comme l'app Claude.
const skillsStore = useSkillsStore()
const hoveredSkill = ref<{ name: string; description: string; left: number; top: number } | null>(null)
// Curseur en flèche dès que le pointeur est sur un skill : il se survole, il ne s'édite pas là.
const overSkill = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | undefined
function onFieldPointer(event: PointerEvent) {
  const found = [...(highlight.value?.querySelectorAll<HTMLElement>('[data-skill]') ?? [])].find((span) => {
    const box = span.getBoundingClientRect()
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
  })
  const name = found?.dataset.skill
  overSkill.value = !!name
  if (name === hoveredSkill.value?.name && name) return
  clearTimeout(hoverTimer)
  hoveredSkill.value = null
  if (!found || !name) return
  hoverTimer = setTimeout(() => {
    const box = found.getBoundingClientRect()
    const description = skillsStore.skills.find((skill) => skill.name === name)?.description ?? ''
    hoveredSkill.value = { name, description, left: box.left, top: box.bottom + 6 }
  }, 300)
}
function leaveField() {
  clearTimeout(hoverTimer)
  hoveredSkill.value = null
  overSkill.value = false
}
const syncScroll = () => {
  if (highlight.value && input.value) highlight.value.scrollTop = input.value.scrollTop
}
const canSend = computed(() => (summary.value || !!prompt.value.trim() || attachments.value.length > 0) && !saving.value)

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

function submit(other = false) {
  if (!canSend.value || props.disabled) return
  if (summary.value) {
    void notes.summarize(props.chatId, prompt.value.trim())
    prompt.value = ''
    return
  }
  emit('send', prompt.value.trim(), attachments.value, other)
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

// Le focus d'abord : son écouteur relit la sélection, qui serait encore en fin de texte.
async function placeCaret(position: number) {
  await nextTick()
  input.value?.focus()
  input.value?.setSelectionRange(position, position)
  caret.value = position
}

const form = useTemplateRef('form')
const orchestraChip = useTemplateRef('orchestraChip')
const burst = ref<{ id: number; kind: 'orchestra' | 'ascii'; x: number; y: number; from: FrameTone; to: FrameTone } | null>(null)
const effects = useEffects('interface')

// Centre d'un élément du champ, en coordonnées du formulaire.
function centerOf(element: Element | null | undefined) {
  const target = element?.getBoundingClientRect()
  const box = form.value?.getBoundingClientRect()
  if (!target || !box) return null
  return { x: target.left + target.width / 2 - box.left, y: target.top + target.height / 2 - box.top }
}

// Le menu « + » se ferme d'un coup, dans la même image que le choix : l'éclat part deux images plus tard, une fois
// le menu disparu et la puce posée.
async function afterMenu() {
  await nextTick()
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
}

const frameTone = computed<FrameTone>(() => (summary.value ? 'summary' : orchestrating.value ? 'orchestra' : 'plain'))
// Bord d'avant tenu jusqu'à l'éclat, qui le fait passer à celui du mode : posé d'emblée, il était déjà là avant que
// l'animation ait pu le montrer.
const heldTone = ref<FrameTone | null>(null)

async function setOrchestra(on: boolean, event?: MouseEvent) {
  const from = heldTone.value ?? frameTone.value
  orchestra.set(props.chatId, on)
  burst.value = null
  heldTone.value = on && effects.value ? from : null
  // Validée au clavier, la puce disparaît : le focus va au champ.
  if (!on && event?.detail === 0) input.value?.focus()
  if (!on || !effects.value) return
  await afterMenu()
  const center = orchestrating.value ? centerOf(orchestraChip.value) : null
  if (center) burst.value = { id: Date.now(), kind: 'orchestra', ...center, from, to: frameTone.value }
  else heldTone.value = null
}

const summaryChip = useTemplateRef('summaryChip')

// Le champ se remplit de la consigne par défaut, à compléter ou remplacer ; laissée telle quelle, elle part en quittant.
async function setSummary(on: boolean, event?: MouseEvent) {
  const preset = t('composer.summary.prefill')
  const from = heldTone.value ?? frameTone.value
  if (on) {
    notes.summaryMode.add(props.chatId)
    if (!prompt.value.trim()) prompt.value = preset
  } else {
    notes.summaryMode.delete(props.chatId)
    if (prompt.value.trim() === preset) prompt.value = ''
  }
  burst.value = null
  heldTone.value = on && effects.value ? from : null
  if (on) void placeCaret(prompt.value.length)
  else if (event?.detail === 0) input.value?.focus()
  if (!on || !effects.value) return
  await afterMenu()
  const center = summary.value ? centerOf(summaryChip.value) : null
  if (center) burst.value = { id: Date.now(), kind: 'ascii', ...center, from, to: frameTone.value }
  else heldTone.value = null
}

function burstDone() {
  burst.value = null
  heldTone.value = null
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

// Le presse-papiers n'accepte que du PNG : une autre image est redessinée. Le blob passe en promesse pour que la copie
// reste rattachée au clic (Safari refuse sinon).
async function pngOf(src: string) {
  const blob = await (await fetch(src)).blob()
  if (blob.type === 'image/png') return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}

async function copyImage(attachment: Attachment) {
  if (!attachment.preview) return
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngOf(previewSrc(attachment.preview)) })])
  } catch {
    toasts.push({ kind: 'error', title: t('composer.imageCopyFailed'), body: attachment.name })
  }
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

// Ajouté au bout de la saisie en cours, curseur après lui.
function insert(text: string) {
  const head = prompt.value.trimEnd()
  prompt.value = head ? `${head} ${text}` : text
  void placeCaret(prompt.value.length)
}

defineExpose({ attach, fill, insert, focus: focusInput })

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
  if (event.isComposing || slashMenu.value?.keydown(event) || mentionMenu.value?.keydown(event) || noteMenu.value?.keydown(event)) return
  if (browse(event)) return
  const other = shortcuts.matches(event, 'sendOther')
  if (!other && !shortcuts.matches(event, 'send')) return
  event.preventDefault()
  submit(other)
}
</script>

<template>
  <!-- Le menu des skills est hors du cadre flouté : un flou imbriqué ne verrait que le cadre derrière lui. -->
  <form ref="form" class="group/composer relative" :data-composer="chatId" @submit.prevent="submit()">
    <!-- Pendant l'éclat, le bord est dessiné par ChatModeEdge, posé à côté : le cadre flouté n'anime jamais le sien. -->
    <div
      class="@container rounded-2xl border bg-composer/22 backdrop-blur-xl"
      :class="[burst ? 'border-transparent' : frameLook[heldTone ?? frameTone], { 'opacity-60': disabled }]"
    >
      <ul v-if="attachments.length" class="flex flex-wrap gap-2 px-3 pt-3" :aria-label="t('composer.attachments')">
        <li v-for="(attachment, index) in attachments" :key="attachment.preview ?? attachment.path" class="group relative" :title="attachment.path">
          <UiContextMenu v-if="attachment.preview">
            <UiImagePreview :src="previewSrc(attachment.preview)" :alt="attachment.name" class="size-12 overflow-hidden border border-stroke">
              <img :src="previewSrc(attachment.preview)" :alt="attachment.name" class="size-full object-cover" />
            </UiImagePreview>
            <template #menu>
              <UiMenuItem :label="t('composer.copyImage')" @select="copyImage(attachment)" />
            </template>
          </UiContextMenu>
          <div v-else class="flex h-12 max-w-48 items-center gap-2 rounded-lg bg-content/6 ps-2.5 pe-7 text-xs">
            <UiFileIcon :name="attachment.name" :folder="attachment.kind === 'folder'" class="size-4 shrink-0" />
            <span class="min-w-0 truncate">{{ attachment.name }}</span>
          </div>
          <UiTooltip :label="t('composer.removeAttachment', { name: attachment.name })">
            <button
              type="button"
              class="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-canvas/70 text-content opacity-0 transition-opacity duration-(--hover-duration) motion-reduce:transition-none group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-ring"
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
          class="pointer-events-none absolute inset-0 overflow-hidden px-3.5 pt-3.5 pb-2 text-sm leading-5.5 wrap-break-word whitespace-pre-wrap"
        >
          <ChatPromptText :text="prompt" fit />
        </div>
        <textarea
          :id="id"
          ref="input"
          v-model="prompt"
          rows="1"
          aria-autocomplete="list"
          :aria-controls="slashMenu?.activeId ? `${id}-skills` : mentionMenu?.activeId ? `${id}-files` : noteMenu?.activeId ? `${id}-notes` : undefined"
          :aria-activedescendant="slashMenu?.activeId ?? mentionMenu?.activeId ?? noteMenu?.activeId"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          writingsuggestions="false"
          :disabled="disabled"
          :class="{ 'cursor-default': overSkill }"
          class="prompt-field relative block max-h-60 min-h-18 w-full resize-none bg-transparent px-3.5 pt-3.5 pb-2 text-sm leading-5.5 select-text outline-none placeholder:truncate"
          :placeholder="running ? t(`composer.placeholderBusy.${general.followUp}`, { send: shortcuts.label('send'), other: shortcuts.label('sendOther') }) : t(summary ? 'composer.summary.placeholder' : orchestrating ? 'composer.orchestra.placeholder' : 'composer.placeholder')"
          @keydown="onKeydown"
          @input="syncCaret"
          @keyup="syncCaret"
          @click="syncCaret"
          @focus="syncCaret(); emit('warm')"
          @blur="caret = null"
          @paste="onPaste"
          @scroll="syncScroll(); leaveField()"
          @pointermove="onFieldPointer"
          @pointerleave="leaveField"
          @keydown.capture="leaveField"
        />
        <Teleport to="body">
          <div
            v-if="hoveredSkill"
            class="ui-glass pointer-events-none fixed z-50 w-72 rounded-xl px-3 py-2.5 text-xs text-content"
            :style="{ left: `${hoveredSkill.left}px`, top: `${hoveredSkill.top}px` }"
            role="tooltip"
          >
            <p class="text-muted">/{{ hoveredSkill.name }}</p>
            <p v-if="hoveredSkill.description" class="mt-1 leading-relaxed">{{ hoveredSkill.description }}</p>
          </div>
        </Teleport>
      </div>
      <!-- Étroite (petite fenêtre, écran partagé) : le nom du mode ne reste que pour les lecteurs d'écran. -->
      <div class="flex items-center gap-1 px-2 pb-2">
        <ChatPlusMenu
          :disabled="disabled"
          :loading="saving > 0"
          :orchestra="orchestrating"
          :summary="summary"
          :summary-off="!compactable || summaryWriting"
          :focus-after="focusInput"
          @attach="pick"
          @orchestra="setOrchestra"
          @summary="setSummary"
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
        <!-- Mode Orchestre : son icône et une croix pour en sortir, sans libellé qui prendrait la barre ; après le mode (choix de Jérémy). -->
        <UiTooltip v-if="orchestrating" :label="t('composer.orchestra.off')" side="top">
          <button
            ref="orchestraChip"
            type="button"
            :disabled="disabled"
            class="flex h-7 shrink-0 items-center gap-1 rounded-md bg-violet/15 px-1.5 text-violet hover:bg-violet/25 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40"
            :aria-label="t('composer.orchestra.off')"
            @click="setOrchestra(false, $event)"
          >
            <Orchestra class="size-3.5" aria-hidden="true" />
            <X class="size-3 opacity-70" aria-hidden="true" />
          </button>
        </UiTooltip>
        <UiTooltip v-if="summary" :label="t('composer.summary.off')" side="top">
          <button
            ref="summaryChip"
            type="button"
            :disabled="disabled"
            class="flex h-7 shrink-0 items-center gap-1 rounded-md bg-note/15 px-1.5 text-note hover:bg-note/25 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40"
            :aria-label="t('composer.summary.off')"
            @click="setSummary(false, $event)"
          >
            <NotebookPen class="size-3.5" aria-hidden="true" />
            <X class="size-3 opacity-70" aria-hidden="true" />
          </button>
        </UiTooltip>
        <p v-else-if="summaryWriting" class="page-in flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-note/10 px-2 text-xs text-note" role="status">
          <LoaderCircle class="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span class="truncate @max-sm:sr-only">{{ t('composer.summary.writing') }}</span>
        </p>
        <span class="flex-1" />
        <!-- État de la conversation, à côté de l'envoi ; à gauche, les réglages du prochain message. -->
        <ChatContextMeter :usage="context ?? null" :disabled="disabled || running || !compactable" class="me-1" @compact="emit('compact')" />
        <!-- Pendant une réponse : le message attend la fin du tour ou la rejoint, selon Réglages › Général. -->
        <UiTooltip v-if="running && canSend" :label="t(general.followUp === 'steer' ? 'composer.steer' : 'composer.queue')" :shortcut="shortcuts.label('send')" side="top">
          <button
            type="submit"
            :disabled="disabled"
            data-control="solid"
            class="me-1 grid size-7 shrink-0 place-items-center rounded-full bg-selection text-content hover:bg-content/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            :aria-label="t(general.followUp === 'steer' ? 'composer.steer' : 'composer.queue')"
          >
            <ArrowUp class="size-4" aria-hidden="true" />
          </button>
        </UiTooltip>
        <UiTooltip v-if="running" :label="t('composer.stop')" side="top">
          <button
            type="button"
            data-control="solid"
            class="grid size-7 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            :class="approving ? 'bg-selection text-content hover:bg-content/20' : 'bg-danger text-canvas hover:opacity-90'"
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
            data-control="solid"
            class="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring enabled:hover:opacity-90 disabled:bg-content/12 disabled:text-muted"
            :aria-label="t('composer.send')"
          >
            <ArrowUp class="size-4" aria-hidden="true" />
          </button>
        </UiTooltip>
      </div>
    </div>
    <ChatOrchestraBurst v-if="burst?.kind === 'orchestra'" :key="burst.id" :x="burst.x" :y="burst.y" :from="burst.from" :to="burst.to" @done="burstDone" />
    <ChatAsciiWave v-else-if="burst" :key="burst.id" :x="burst.x" :y="burst.y" :from="burst.from" :to="burst.to" @done="burstDone" />
    <ChatSlashMenu ref="slashMenu" :id="`${id}-skills`" :query="slashQuery" @choose="chooseSkill" />
    <ChatMentionMenu v-if="project" ref="mentionMenu" :id="`${id}-files`" :query="mention?.query ?? null" :chat-id="chatId" :project="project.path" @choose="chooseFile" />
    <ChatNoteMenu ref="noteMenu" :id="`${id}-notes`" :query="hash?.query ?? null" @choose="chooseNote" />
  </form>
</template>
