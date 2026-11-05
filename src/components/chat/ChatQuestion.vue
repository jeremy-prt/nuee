<script setup lang="ts">
import { MessageQuestion } from '@/components/ui/icons'
import { computed, nextTick, onMounted, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import type { Question } from '@/ipc/bindings/Question'
import { useShortcutsStore } from '@/stores/shortcuts'

// Questions à choix de l'agent, une page à la fois. Rend une réponse par question (null : passée), ou null si toutes
// ont été passées.
const props = defineProps<{ questions: Question[] }>()
const emit = defineEmits<{ answer: [answers: (string | null)[] | null] }>()

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const titleId = useId()
const promptId = useId()

const step = ref(0)
const picked = ref<number[][]>(props.questions.map(() => []))
const custom = ref<string[]>(props.questions.map(() => ''))
const skipped = ref<boolean[]>(props.questions.map(() => false))

const question = computed(() => props.questions[step.value])
const last = computed(() => step.value === props.questions.length - 1)
const ready = computed(() => answerAt(step.value) !== null)
const options = useTemplateRef<HTMLButtonElement[]>('options')
const other = useTemplateRef<HTMLInputElement>('other')

function answerAt(index: number) {
  const question = props.questions[index]
  if (!question || skipped.value[index]) return null
  const labels = [...(picked.value[index] ?? [])].sort((a, b) => a - b).map((option) => question.options[option]?.label ?? '')
  const text = custom.value[index]?.trim()
  if (text) labels.push(text)
  return labels.length ? labels.join(', ') : null
}

function pick(option: number) {
  const index = step.value
  const current = picked.value[index] ?? []
  skipped.value[index] = false
  if (question.value?.multiple) {
    picked.value[index] = current.includes(option) ? current.filter((value) => value !== option) : [...current, option]
  } else {
    picked.value[index] = [option]
    custom.value[index] = ''
  }
}

// En choix unique, une réponse écrite remplace le choix coché.
function onCustom() {
  const index = step.value
  skipped.value[index] = false
  if (!question.value?.multiple && custom.value[index]?.trim()) picked.value[index] = []
}

function go(index: number) {
  step.value = index
  nextTick(focusFirst)
}

function finish() {
  const answers = props.questions.map((_, index) => answerAt(index))
  emit('answer', answers.every((answer) => answer === null) ? null : answers)
}

function next() {
  if (!ready.value) return
  if (last.value) finish()
  else go(step.value + 1)
}

function skip() {
  skipped.value[step.value] = true
  if (last.value) finish()
  else go(step.value + 1)
}

function focusFirst() {
  const chosen = picked.value[step.value]?.[0] ?? 0
  ;(options.value?.[chosen] ?? other.value)?.focus()
}

// Flèches entre les choix ; 1 à 9 coche directement ; Entrée sur un choix unique le prend et passe à la suite.
function onOptionKeydown(event: KeyboardEvent, option: number) {
  const count = question.value?.options.length ?? 0
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const target = option + (event.key === 'ArrowDown' ? 1 : -1)
    if (target >= count) other.value?.focus()
    else options.value?.[(target + count) % count]?.focus()
  } else if (shortcuts.matches(event, 'approve') && !question.value?.multiple) {
    event.preventDefault()
    event.stopPropagation()
    pick(option)
    next()
  }
}

// Écouté sur la carte : avec deux panes, seule la carte qui a le focus répond.
function onKeydown(event: KeyboardEvent) {
  if (shortcuts.matches(event, 'deny')) {
    event.preventDefault()
    skip()
  } else if (shortcuts.matches(event, 'approve')) {
    event.preventDefault()
    next()
  } else if (event.target !== other.value && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= Math.min(9, question.value?.options.length ?? 0)) {
      event.preventDefault()
      pick(digit - 1)
      options.value?.[digit - 1]?.focus()
    }
  }
}

function onOtherKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp' && question.value?.options.length) {
    event.preventDefault()
    options.value?.[question.value.options.length - 1]?.focus()
  }
}

onMounted(focusFirst)
</script>

<template>
  <section
    role="dialog"
    :aria-labelledby="titleId"
    :aria-describedby="promptId"
    class="rounded-xl border border-stroke bg-overlay p-3 shadow-lg"
    @keydown="onKeydown"
  >
    <div class="flex items-center gap-2 ps-1">
      <MessageQuestion class="size-4 shrink-0 text-muted" aria-hidden="true" />
      <p :id="titleId" class="min-w-0 flex-1 truncate text-xs text-muted">{{ question?.header ?? t('chat.question.title') }}</p>
      <span v-if="questions.length > 1" class="shrink-0 text-xs text-muted tabular-nums">
        {{ t('chat.question.progress', { n: step + 1, total: questions.length }) }}
      </span>
      <UiButton variant="ghost" size="xs" :aria-keyshortcuts="shortcuts.aria('deny')" @click="skip">{{ t('chat.question.skip') }}</UiButton>
    </div>
    <template v-if="question">
      <p :id="promptId" class="mt-2 px-1 text-sm font-medium text-pretty">{{ question.prompt }}</p>
      <p v-if="question.multiple" class="px-1 text-xs text-muted">{{ t('chat.question.multiple') }}</p>
      <div
        :key="step"
        class="mt-2 flex max-h-64 flex-col gap-0.5 overflow-y-auto"
        :role="question.multiple ? 'group' : 'radiogroup'"
        :aria-labelledby="promptId"
      >
        <button
          v-for="(option, index) in question.options"
          :key="option.label"
          ref="options"
          type="button"
          :role="question.multiple ? 'checkbox' : 'radio'"
          :aria-checked="picked[step]?.includes(index) ?? false"
          :aria-keyshortcuts="index < 9 ? String(index + 1) : undefined"
          class="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          :class="picked[step]?.includes(index) ? 'bg-selection' : 'hover:bg-selection-hover'"
          @click="pick(index)"
          @keydown="onOptionKeydown($event, index)"
        >
          <span class="w-3 shrink-0 pt-px text-xs text-muted tabular-nums" aria-hidden="true">{{ index < 9 ? index + 1 : '' }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm">{{ option.label }}</span>
            <span v-if="option.description" class="block text-xs text-muted">{{ option.description }}</span>
          </span>
        </button>
        <input
          ref="other"
          v-model="custom[step]"
          type="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          writingsuggestions="false"
          :aria-label="t('chat.question.otherLabel')"
          :placeholder="t('chat.question.other')"
          class="mt-1 h-8 rounded-md border border-stroke bg-transparent px-2 text-sm outline-none placeholder:text-muted focus:border-stroke-focus"
          @input="onCustom"
          @keydown="onOtherKeydown"
        />
      </div>
    </template>
    <div class="mt-3 flex items-center justify-end gap-2">
      <UiButton v-if="step > 0" variant="ghost" size="sm" @click="go(step - 1)">{{ t('chat.question.back') }}</UiButton>
      <UiButton variant="primary" size="sm" :disabled="!ready" :aria-keyshortcuts="shortcuts.aria('approve')" @click="next">
        {{ last ? t('chat.question.send') : t('chat.question.next') }}
        <kbd v-if="shortcuts.label('approve')" class="font-sans text-xs opacity-60" aria-hidden="true">{{ shortcuts.label('approve') }}</kbd>
      </UiButton>
    </div>
  </section>
</template>
