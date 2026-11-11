<script setup lang="ts">
import { ChevronDown, GitCommit, LoaderCircle, Sparkles } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatGitRun from '@/components/chat/ChatGitRun.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { field, fieldText } from '@/components/ui/field'
import { menuPanel, menuTitle } from '@/components/ui/menuRow'
import { useGitActions } from '@/composables/useGitActions'
import { useMenuToggle } from '@/composables/useMenuToggle'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useGitActionsStore } from '@/stores/gitActions'
import { useGitPanelStore } from '@/stores/gitPanel'
import { useShortcutsStore } from '@/stores/shortcuts'

// Champ de message et bouton de commit du volet Git. Champ vide : le bouton lance l'action de fond avec le skill de
// l'utilisateur, comme Environnement. Champ rempli : il commite directement avec ce message (l'app, sans agent), et sa
// flèche propose aussi de pousser, puis les actions par un agent.
const { t } = useI18n()
const { chat } = useTerminalChat()
const { changed, run, main, others, start } = useGitActions()
const gitActions = useGitActionsStore()
const gitPanel = useGitPanelStore()
const shortcuts = useShortcutsStore()
const STOP = '[data-git-run="changes"] [data-git-stop]'

const message = computed({
  get: () => (chat.value ? gitPanel.of(chat.value.id).message : ''),
  set: (value: string) => chat.value && gitPanel.setMessage(chat.value.id, value),
})
const typed = computed(() => !!message.value.trim())
const folder = computed(() => gitActions.folderOf(chat.value))
const committing = computed(() => !!folder.value && gitActions.manual.has(folder.value))
const commitKey = computed(() => shortcuts.label('sendOther') ?? '')

async function commit(push: boolean) {
  if (!chat.value || !typed.value || !changed.value || committing.value || run.value) return
  await gitActions.commitNow(chat.value, message.value, push)
}

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
  commit(false)
}

const mainLabel = computed(() => (typed.value ? t('dock.changes.commit') : main.value.label))
const mainDisabled = computed(() => (typed.value ? !changed.value || committing.value : main.value.disabled || committing.value))
const hasMenu = computed(() => typed.value || others.value.length > 0)
// Champ rempli : toutes les actions par un agent passent dans le menu, la principale comprise.
const agentItems = computed(() => (typed.value ? [...(main.value.id ? [main.value] : []), ...others.value] : others.value))
function runMain(event: MouseEvent) {
  if (typed.value) commit(false)
  else start(main.value.id, event.detail === 0, STOP)
}

let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}
const keyboardOpened = () => !byPointer
function onCloseAutoFocus(event: Event) {
  if (byPointer) event.preventDefault()
}
const { open: menuOpen, onTriggerDown, onOpenChange } = useMenuToggle()
const group = useTemplateRef('group')
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="relative" :class="field" data-control>
      <textarea
        ref="input"
        v-model="message"
        rows="1"
        class="resize-none py-[5px] pe-5 leading-4"
        :class="fieldText"
        :placeholder="t('dock.changes.messagePlaceholder', { key: commitKey })"
        :aria-label="t('dock.changes.messageLabel')"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        writingsuggestions="false"
        @keydown="onKeydown"
      />
      <UiIconButton
        :label="generateLabel"
        class="absolute end-px top-px size-6!"
        inner
        :loading="run?.action === 'message'"
        :disabled="!changed || !!run || committing"
        @click="generate"
      >
        <Sparkles class="size-3.5" aria-hidden="true" />
      </UiIconButton>
    </div>

    <div data-git-run="changes">
      <ChatGitRun v-if="run" :run="run" class="h-7! text-xs!" />
      <!-- Même cadre et même hauteur que le champ : le bouton ne pèse pas plus que lui. -->
      <div
        v-else
        ref="group"
        class="flex h-7 items-stretch rounded-md border border-stroke text-content"
        :class="{ 'opacity-40': mainDisabled && !hasMenu }"
        data-control
      >
        <UiTooltip :label="typed ? t('dock.changes.commitHelp', { key: commitKey }) : (main.hint ?? mainLabel)" side="bottom">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-xs font-medium enabled:hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:text-muted"
            :class="hasMenu ? 'rounded-s-[5px]' : 'rounded-[5px]'"
            :disabled="mainDisabled"
            @click="runMain"
          >
            <LoaderCircle v-if="committing" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <component :is="typed ? GitCommit : main.icon" v-else class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ mainLabel }}</span>
          </button>
        </UiTooltip>
        <template v-if="hasMenu">
          <span class="my-1.5 w-px shrink-0 bg-stroke" aria-hidden="true" />
          <UiTooltip :label="t('dock.session.gitActions')" side="bottom">
            <span class="flex">
              <DropdownMenuRoot :open="menuOpen" :modal="false" @update:open="onOpenChange">
                <DropdownMenuTrigger
                  class="grid w-7 place-items-center rounded-e-[5px] text-muted enabled:hover:bg-selection-hover enabled:hover:text-content aria-expanded:bg-selection-hover aria-expanded:text-content focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50"
                  :disabled="committing"
                  :aria-label="t('dock.session.gitActions')"
                  @pointerdown="(openedBy(true), onTriggerDown())"
                  @keydown="openedBy(false)"
                >
                  <ChevronDown class="size-3" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    :reference="group ?? undefined"
                    align="end"
                    :side-offset="4"
                    :collision-padding="8"
                    :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) min-w-56']"
                    @close-auto-focus="onCloseAutoFocus"
                  >
                    <template v-if="typed">
                      <DropdownMenuLabel :class="menuTitle">{{ t('dock.changes.withMessage') }}</DropdownMenuLabel>
                      <UiMenuItem :label="t('dock.changes.commit')" :icon="GitCommit" :shortcut="commitKey" :disabled="!changed" @select="commit(false)" />
                      <UiMenuItem :label="t('dock.changes.commitPush')" :icon="GitCommit" :disabled="!changed" @select="commit(true)" />
                      <UiMenuSeparator v-if="agentItems.length" />
                    </template>
                    <DropdownMenuLabel v-if="agentItems.length" :class="menuTitle">{{ t('dock.changes.byAgent') }}</DropdownMenuLabel>
                    <UiMenuItem
                      v-for="item in agentItems"
                      :key="item.id!"
                      :label="item.label"
                      :icon="item.icon"
                      :hint="item.hint"
                      :disabled="item.disabled"
                      @select="start(item.id, keyboardOpened(), STOP)"
                    />
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
            </span>
          </UiTooltip>
        </template>
      </div>
    </div>
  </div>
</template>
