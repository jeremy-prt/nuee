<script setup lang="ts">
import { GitCommit, LoaderCircle, Sparkles } from '@/components/ui/icons'
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatGitRun from '@/components/chat/ChatGitRun.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { field, fieldText } from '@/components/ui/field'
import { useGitActions } from '@/composables/useGitActions'
import { useRefocus } from '@/composables/useRefocus'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useGitActionsStore } from '@/stores/gitActions'
import { useGitPanelStore } from '@/stores/gitPanel'
import { useShortcutsStore } from '@/stores/shortcuts'

// Champ de message et bouton Commit du volet Git, comme T3 Code : rempli, le commit prend ce message ; vide, Haiku
// l'écrit d'abord aux règles du skill de commit de l'utilisateur. Push et pull sont sur la ligne de la branche.
const { t } = useI18n()
const { chat } = useTerminalChat()
const { changed, run, commit, runCommit } = useGitActions()
const gitActions = useGitActionsStore()
const gitPanel = useGitPanelStore()
const shortcuts = useShortcutsStore()
const STOP = '[data-git-run="changes"] [data-git-stop]'
const MESSAGE = '[data-git-message]'
const refocusAfter = useRefocus()

const message = computed({
  get: () => (chat.value ? gitPanel.of(chat.value.id).message : ''),
  set: (value: string) => chat.value && gitPanel.setMessage(chat.value.id, value),
})
const typed = computed(() => !!message.value.trim())
const readOnly = computed(() => !chat.value?.started)
const folder = computed(() => gitActions.folderOf(chat.value))
const committing = computed(() => !!folder.value && gitActions.manual.has(folder.value))
const commitKey = computed(() => shortcuts.label('sendOther') ?? '')

// Le skill de commit de l'utilisateur, s'il en a un, donne ses règles au titre généré.
const skill = computed(() => (chat.value ? gitActions.skillOf('message', chat.value.agent) : null))
const generateLabel = computed(() => (skill.value ? t('dock.changes.generateWith', { skill: `/${skill.value.name}` }) : t('dock.changes.generate')))
function generate() {
  if (chat.value && changed.value && !run.value && !committing.value) gitActions.start('message', chat.value)
}

// Une ligne qui grandit jusqu'à trois (16 px par ligne et 10 px de marge), puis défile.
const input = useTemplateRef('input')
function fit() {
  const element = input.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 58)}px`
}
watch(message, () => nextTick(fit))
onMounted(fit)

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || !shortcuts.matches(event, 'sendOther')) return
  event.preventDefault()
  runCommit(false, STOP)
}

const help = computed(() => (typed.value ? t('dock.changes.commitHelp', { key: commitKey.value }) : t('dock.changes.commitAuto')))
// Pendant le commit, le bouton désactivé perd le focus : il revient au champ.
function onCommit(event: MouseEvent) {
  if (typed.value) refocusAfter(event, () => runCommit(false, STOP), MESSAGE)
  else runCommit(event.detail === 0, STOP)
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="relative" :class="field" data-control>
      <textarea
        ref="input"
        v-model="message"
        rows="1"
        data-git-message
        class="resize-none py-[5px] pe-5 leading-4"
        :class="fieldText"
        :placeholder="t('dock.changes.messagePlaceholder', { key: commitKey })"
        :aria-label="t('dock.changes.messageLabel')"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        writingsuggestions="false"
        :disabled="readOnly"
        @keydown="onKeydown"
      />
      <UiIconButton
        :label="generateLabel"
        class="absolute end-px top-px size-6!"
        inner
        :loading="run?.action === 'message'"
        :disabled="!changed || !!run || committing || readOnly"
        @click="generate"
      >
        <Sparkles class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>

    <div data-git-run="changes">
      <ChatGitRun v-if="run" :run="run" class="h-7! text-xs!" />
      <UiTooltip v-else-if="readOnly" :label="t('dock.changes.readOnly')" side="bottom">
        <span class="flex">
          <button
            type="button"
            class="flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-stroke px-2 text-xs font-medium text-muted opacity-40 disabled:pointer-events-none"
            data-control
            disabled
          >
            <GitCommit class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ t('dock.changes.commit') }}</span>
          </button>
        </span>
      </UiTooltip>
      <!-- Même cadre et même hauteur que le champ : le bouton ne pèse pas plus que lui. -->
      <UiTooltip v-else :label="help" side="bottom">
        <button
          type="button"
          class="flex h-7 w-full min-w-0 items-center justify-center gap-1.5 rounded-md border border-stroke px-2 text-xs font-medium text-content enabled:hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:text-muted disabled:opacity-40"
          data-control
          :disabled="commit.disabled"
          @click="onCommit"
        >
          <LoaderCircle v-if="committing" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <GitCommit v-else class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ t('dock.changes.commit') }}</span>
        </button>
      </UiTooltip>
    </div>
  </div>
</template>
