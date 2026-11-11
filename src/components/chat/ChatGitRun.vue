<script setup lang="ts">
import { ExternalLink, LoaderCircle, Square } from '@/components/ui/icons'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useConversationsStore } from '@/stores/conversations'
import { type GitRun, useGitActionsStore } from '@/stores/gitActions'
import { lastStep } from '@/utils/activity'
import { formatDuration } from '@/utils/duration'

// Action git de fond en cours, à la place de son bouton, comme T3 Code : l'étape tirée de l'activité de sa session, le
// temps écoulé, et de quoi l'arrêter (ou l'ouvrir, une fois révélée). `compact` : ligne d'outils d'un volet.
const props = defineProps<{ run: GitRun; compact?: boolean }>()
const { t, locale } = useI18n()
const conversations = useConversationsStore()
const gitActions = useGitActionsStore()

const GIT_STEPS: [RegExp, string][] = [
  [/\bgit\s+push\b/, 'pushing'],
  [/\bgit\s+commit\b/, 'committing'],
  [/\bgh\s+repo\s+create\b/, 'creatingRepo'],
  [/\bgit\s+init\b/, 'initializing'],
]

const action = computed(() => gitActions.label(props.run.action))
// L'étape, et la commande en cours en entier pour l'infobulle (la dernière ligne de sortie de T3 Code).
const step = computed(() => {
  const conversation = conversations.find(props.run.chatId)
  const items = conversation?.items ?? []
  const approval = conversation?.approvals[0]
  if (approval) return { text: t(approval.questions ? 'chat.waitingAnswer' : 'chat.waitingApproval'), name: null, command: null }
  if (items.at(-1)?.kind === 'thinking') return { text: t('chat.activity.thinking'), name: null, command: null }
  let command: string | null = null
  for (let i = items.length - 1; i >= 0 && command === null; i--) {
    const item = items[i]
    if (item?.kind === 'tool') command = item.tool === 'command' ? (item.detail?.text ?? item.summary ?? '') : ''
  }
  const git = command && GIT_STEPS.find(([pattern]) => pattern.test(command))
  if (git) return { text: t(`gitActions.steps.${git[1]}`), name: null, command }
  const found = lastStep(items)
  // La description que l'agent donne à sa commande est en anglais : nos verbes, elle reste dans l'infobulle.
  if (found) return { text: t(`chat.activity.doing.${found.doing}`), name: found.name, command: command || found.description || null }
  return { text: t('gitActions.steps.starting'), name: null, command: null }
})

const now = ref(Date.now())
const timer = window.setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(timer))
const elapsed = computed(() => formatDuration(Math.max(0, now.value - props.run.startedAt), locale.value))
const tooltip = computed(() => [`${step.value.text}${step.value.name ? ` ${step.value.name}` : ''}`, step.value.command].filter(Boolean).join('\n'))
</script>

<template>
  <div
    class="flex shrink-0 items-center"
    :class="compact ? 'h-7 gap-1 ps-1.5 text-xs text-muted' : 'h-8 w-full min-w-0 gap-2.5 rounded-lg ps-2 pe-0.5 text-[13px]'"
    :aria-label="t('gitActions.running', { action })"
    role="group"
  >
    <LoaderCircle class="shrink-0 animate-spin text-muted motion-reduce:animate-none" :class="compact ? 'size-3.5' : 'size-4'" aria-hidden="true" />
    <UiTooltip :label="tooltip" side="bottom">
      <!-- Annoncé poliment à chaque étape ; le temps écoulé reste hors de la zone, sinon il serait lu chaque seconde. -->
      <span class="min-w-0 truncate" :class="compact ? 'max-w-36' : 'flex-1'" role="status" aria-live="polite">
        <span class="sr-only">{{ action }} · </span>{{ step.text }}<template v-if="step.name">&#32;<span class="text-content">{{ step.name }}</span></template>
      </span>
    </UiTooltip>
    <span class="shrink-0 text-xs text-muted tabular-nums" aria-hidden="true">{{ elapsed }}</span>
    <UiIconButton v-if="run.revealed" :label="t('attention.open')" :class="{ 'size-6!': !compact }" @click="gitActions.open(run.chatId)">
      <ExternalLink class="size-3.5" aria-hidden="true" />
    </UiIconButton>
    <UiIconButton :label="t('gitActions.stop', { action })" data-git-stop :class="{ 'size-6!': !compact }" @click="gitActions.stop(run)">
      <Square class="size-3" aria-hidden="true" />
    </UiIconButton>
  </div>
</template>
