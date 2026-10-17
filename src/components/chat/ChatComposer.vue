<script setup lang="ts">
import { ArrowUp, File, Folder, GitBranch, GitBranchPlus, Plus, ShieldAlert, ShieldCheck, Sparkles, Square, X } from '@/components/ui/icons'
import { type Component, computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatContextMeter from '@/components/chat/ChatContextMeter.vue'
import ChatSlashMenu from '@/components/chat/ChatSlashMenu.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiMenu, { type UiMenuSection } from '@/components/ui/UiMenu.vue'
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
import type { Worktree } from '@/ipc/bindings/Worktree'
import type { WorktreeSupport } from '@/ipc/bindings/WorktreeSupport'
import { pickFiles } from '@/ipc/dialog'
import { useGeneralStore } from '@/stores/general'
import type { Project } from '@/stores/projects'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useSkillsStore } from '@/stores/skills'
import { agents } from '@/utils/agents'
import { promptParts } from '@/utils/prompt'

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
const prompt = ref('')
const attachments = ref<Attachment[]>([])
// Fichiers en cours d'écriture sur disque : envoyer avant les perdrait.
const saving = ref(0)
const attachError = ref<string | null>(null)
const id = useId()
const input = useTemplateRef('input')
// Après un choix de mode, de modèle ou d'effort, on reprend la saisie là où on l'avait laissée.
const focusInput = () => input.value?.focus()

const agentName = computed(() => agents[props.agent].name)

const worktreeLabel = computed(() => {
  const blocked = props.worktree?.blocked
  return blocked ? t(`settings.projects.worktreeSupport.${blocked}`) : t('composer.worktree.menu')
})
const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
const worktreeSections = computed<UiMenuSection[]>(() => {
  const worktree = props.worktree
  if (!worktree) return []
  return [
    {
      id: 'worktree',
      label: t('composer.worktree.menu'),
      value: worktree.choice,
      options: [
        { value: 'project', label: t('composer.worktree.project'), hint: t('composer.worktree.projectHint'), icon: Folder },
        { value: 'new', label: t('composer.worktree.new'), hint: t('composer.worktree.newHint'), icon: GitBranchPlus },
        ...worktree.trees.map((tree) => ({
          value: tree.path,
          label: tree.branch ?? folderName(tree.path),
          icon: GitBranch,
        })),
      ],
    },
  ]
})
const chosenTree = computed(() => props.worktree?.trees.find((tree) => tree.path === props.worktree?.choice) ?? null)

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

const currentModel = computed(() => props.catalog?.models.find((model) => model.value === options.value.model) ?? null)
const modelSections = computed<UiMenuSection[]>(() => {
  const catalog = props.catalog
  if (!catalog?.models.length) return []
  const sections: UiMenuSection[] = [
    {
      id: 'model',
      label: t('composer.model.label'),
      value: options.value.model ?? '',
      options: catalog.models.map((model) => ({
        value: model.value,
        label: model.label,
        hint: model.value === catalog.defaultModel ? t('composer.default') : undefined,
      })),
    },
  ]
  const efforts = currentModel.value?.efforts ?? []
  if (efforts.length)
    sections.push({
      id: 'effort',
      label: t('composer.effort.label'),
      value: options.value.effort ?? '',
      options: efforts.map((effort) => ({
        value: effort,
        label: t(`composer.effort.${effort}`),
        hint: effort === catalog.defaultEffort ? t('composer.default') : undefined,
      })),
    })
  return sections
})

function choose(section: string, value: string) {
  if (section === 'mode') options.value = { ...options.value, mode: value as PermissionMode }
  else if (section === 'model') options.value = { ...options.value, model: value }
  else if (section === 'effort') options.value = { ...options.value, effort: value as Effort }
}

// Position du curseur, null hors du champ : le menu des skills ne suit que la frappe en cours.
const caret = ref<number | null>(null)
const syncCaret = () => (caret.value = input.value?.selectionStart ?? null)
const slashMenu = useTemplateRef('slashMenu')
const slashQuery = computed(() => {
  const word = /^\/\S*/.exec(prompt.value)?.[0]
  if (!word || caret.value === null || caret.value > word.length) return null
  return word.slice(1)
})

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
const skillNames = computed(() => new Set(skills.skills.filter((skill) => skills.mode(skill) !== 'off').map((skill) => skill.name)))
// Un saut de ligne final n'ouvre pas de ligne dans une div : sans l'espace ajoutée, le calque en aurait une de moins.
const parts = computed(() => promptParts(prompt.value.endsWith('\n') ? `${prompt.value} ` : prompt.value, skillNames.value))
// Le skill est toujours en tête : son icône prend place dans un retrait de première ligne, posé sur les deux
// couches pour qu'elles passent à la ligne au même endroit.
const indent = computed(() => (parts.value[0]?.kind === 'skill' ? { textIndent: '1.125rem' } : undefined))
const syncScroll = () => {
  if (highlight.value && input.value) highlight.value.scrollTop = input.value.scrollTop
}
// Message repris ou rempli sans passer par le menu « / » : ses skills ne sont pas encore lus.
watch(
  () => prompt.value.startsWith('/') && !skills.skills.length,
  (missing) => missing && skills.loadSkills(),
)

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

// Message repris après un retour en arrière : il remplace la saisie en cours.
function fill(text: string, files: Attachment[]) {
  prompt.value = text
  attachments.value = files
  focusInput()
}

defineExpose({ attach, fill, focus: focusInput })

// Maj+Entrée va à la ligne (natif). Pendant une saisie IME, Entrée valide le mot.
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || slashMenu.value?.keydown(event) || !shortcuts.matches(event, 'send')) return
  event.preventDefault()
  submit()
}
</script>

<template>
  <!-- Le menu des skills est hors du cadre flouté : un flou imbriqué ne verrait que le cadre derrière lui. -->
  <form class="relative" @submit.prevent="submit">
    <div
      class="@container rounded-xl border border-stroke bg-selection/50 backdrop-blur-sm has-[textarea:focus]:border-stroke-focus"
      :class="{ 'opacity-60': disabled }"
    >
      <div v-if="project" class="mx-3 mt-2.5 flex h-6 min-w-0 items-center gap-2 text-xs text-muted">
        <p class="flex min-w-0 items-center gap-1.5" :title="project.path">
          <ProjectIcon :project="project" class="size-3.5 shrink-0" />
          <span class="sr-only">{{ t('composer.project') }}</span>
          <span class="truncate">{{ project.name }}</span>
        </p>
        <template v-if="worktree">
          <p v-if="worktree.started && worktree.choice !== 'project'" class="ms-auto flex shrink-0 items-center gap-1">
            <GitBranch class="size-3.5" aria-hidden="true" />
            <span class="sr-only">{{ t('composer.worktree.label') }}</span>{{ worktree.branch }}
          </p>
          <span v-else-if="!worktree.started" class="ms-auto flex min-w-0 shrink-0">
            <UiMenu
              :label="worktreeLabel"
              :sections="worktreeSections"
              :disabled="!!worktree.blocked || disabled"
              :focus-after="focusInput"
              :look="worktree.choice === 'project' ? 'h-6 ps-1.5 pe-1 text-muted hover:bg-selection-hover hover:text-content aria-expanded:bg-selection-hover' : 'h-6 ps-1.5 pe-1 bg-signal/15 text-signal-text'"
              @select="(_, value) => emit('worktree', value)"
            >
              <component :is="worktree.choice === 'new' ? GitBranchPlus : GitBranch" class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate">
                {{ worktree.choice === 'project' ? t('composer.worktree.label') : worktree.choice === 'new' ? t('composer.worktree.new') : (chosenTree?.branch ?? folderName(worktree.choice)) }}
              </span>
            </UiMenu>
          </span>
        </template>
      </div>
      <ul v-if="attachments.length" class="flex flex-wrap gap-2 px-3 pt-3" :aria-label="t('composer.attachments')">
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
          <UiTooltip :label="t('composer.removeAttachment', { name: attachment.name })">
            <button
              type="button"
              class="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-stroke bg-overlay text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
              :aria-label="t('composer.removeAttachment', { name: attachment.name })"
              @click="remove(index)"
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
          class="pointer-events-none absolute inset-0 overflow-hidden px-3 py-3 text-sm leading-5.5 wrap-break-word whitespace-pre-wrap"
        >
          <!-- Fonds et icônes ne changent aucune largeur (marges négatives, « @ » transparent) : le calque reste calé sur le texte du champ. -->
          <template v-for="(part, index) in parts" :key="index">
            <span v-if="part.kind === 'skill'" class="relative -ms-4.5 -me-1 rounded-md bg-skill/15 py-0.5 ps-4.5 pe-1 text-skill"><Sparkles class="absolute start-1 top-1/2 size-3 -translate-y-1/2" aria-hidden="true" />{{ part.text }}</span>
            <span v-else-if="part.kind" class="-mx-0.5 rounded-md bg-mention/15 px-0.5 py-0.5 text-mention"><span class="relative text-transparent">@<component :is="part.kind === 'folder' ? Folder : File" class="absolute start-1/2 top-1/2 size-3.5 -translate-1/2 text-mention" aria-hidden="true" /></span>{{ part.text.slice(1) }}</span>
            <template v-else>{{ part.text }}</template>
          </template>
        </div>
        <textarea
          :id="id"
          ref="input"
          v-model="prompt"
          rows="1"
          aria-autocomplete="list"
          :aria-controls="slashMenu?.open ? `${id}-skills` : undefined"
          :aria-activedescendant="slashMenu?.activeId"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          writingsuggestions="false"
          :disabled="disabled"
          :style="indent"
          class="prompt-field relative block max-h-60 min-h-20 w-full resize-none bg-transparent px-3 py-3 text-sm leading-5.5 select-text outline-none placeholder:truncate"
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
      <!-- Étroite (petite fenêtre, écran partagé) : l'effort et le nom du mode ne restent que pour les lecteurs d'écran. -->
      <div class="flex items-center gap-1 px-2 pb-2">
        <UiIconButton class="bg-selection" :label="t('composer.attach')" :disabled="disabled" :loading="saving > 0" @click="pick">
          <Plus class="size-4" aria-hidden="true" />
        </UiIconButton>
        <UiMenu
          :label="t('composer.model.menu', { agent: agentName })"
          :sections="modelSections"
          :disabled="disabled || !modelSections.length"
          :focus-after="focusInput"
          @select="choose"
        >
          <SettingsAgentLogo :id="agent" small class="-mx-0.5" />
          <span class="min-w-0 truncate">{{ currentModel?.label ?? agentName }}</span>
          <span v-if="options.effort" class="text-muted @max-sm:sr-only">{{ t(`composer.effort.${options.effort}`) }}</span>
        </UiMenu>
        <ChatContextMeter v-if="context" :usage="context" :disabled="disabled || running || !compactable" @compact="emit('compact')" />
        <UiMenu
          :label="t('composer.mode.label')"
          :sections="modeSections"
          :disabled="disabled"
          :focus-after="focusInput"
          @select="choose"
        >
          <component :is="modeLook.icon" class="size-3.5 shrink-0" :class="modeLook.iconClass" aria-hidden="true" />
          <span class="@max-sm:sr-only">{{ t(`composer.mode.${options.mode}`) }}</span>
        </UiMenu>
        <span class="flex-1" />
        <!-- Pendant une réponse : le message attend la fin du tour ou la rejoint, selon Réglages › Général. -->
        <UiTooltip v-if="running && canSend" :label="t(general.followUp === 'steer' ? 'composer.steer' : 'composer.queue')" :shortcut="shortcuts.label('send')">
          <button
            type="submit"
            :disabled="disabled"
            class="grid size-7 shrink-0 place-items-center rounded-md bg-selection text-content hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            :aria-label="t(general.followUp === 'steer' ? 'composer.steer' : 'composer.queue')"
          >
            <ArrowUp class="size-4" aria-hidden="true" />
          </button>
        </UiTooltip>
        <UiTooltip v-if="running" :label="t('composer.stop')">
          <button
            type="button"
            class="grid size-7 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            :class="approving ? 'bg-selection text-content hover:bg-selection-hover' : 'bg-accent text-canvas hover:opacity-90'"
            :aria-label="t('composer.stop')"
            @click="emit('stop')"
          >
            <Square class="size-3 fill-current" aria-hidden="true" />
          </button>
        </UiTooltip>
        <UiTooltip v-else :label="t('composer.send')" :shortcut="shortcuts.label('send')">
          <button
            type="submit"
            :disabled="disabled || !canSend"
            class="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring enabled:hover:opacity-90 disabled:bg-accent/30 disabled:text-canvas/60"
            :aria-label="t('composer.send')"
          >
            <ArrowUp class="size-4" aria-hidden="true" />
          </button>
        </UiTooltip>
      </div>
    </div>
    <ChatSlashMenu ref="slashMenu" :id="`${id}-skills`" :query="slashQuery" @choose="chooseSkill" />
  </form>
</template>
