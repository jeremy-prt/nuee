<script setup lang="ts">
import { Check, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { computed, nextTick, onMounted, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { chatCard } from '@/components/chat/card'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { Question } from '@/ipc/bindings/Question'
import { useShortcutsStore } from '@/stores/shortcuts'

// Questions à choix de l'agent, une page à la fois, dans le fil comme l'app Claude (même cadre que les autres cartes). Rend une réponse par question (null : passée), ou null si toutes
// ont été passées.
const props = defineProps<{ questions: Question[] }>()
const emit = defineEmits<{ answer: [answers: (string | null)[] | null] }>()

const { t } = useI18n()
const shortcuts = useShortcutsStore()
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

// La page suivante prend le focus sur la carte, sans anneau sur un choix : ↓ y entre au clavier.
function go(index: number) {
  step.value = index
  nextTick(() => card.value?.focus({ preventScroll: true }))
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
  if (event.target === card.value && event.key === 'ArrowDown') {
    event.preventDefault()
    focusFirst()
  } else if (shortcuts.matches(event, 'deny')) {
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

// À l'ouverture, le focus va sur la carte sans anneau (demande de Jérémy) : 1 à 9, ↵ et Échap marchent, ↓ entre dans
// les choix.
const card = useTemplateRef<HTMLElement>('card')
onMounted(() => card.value?.focus({ preventScroll: true }))
</script>

<template>
  <section ref="card" role="dialog" tabindex="-1" :aria-labelledby="promptId" :class="chatCard" class="overflow-hidden text-sm outline-none" @keydown="onKeydown">
    <div class="flex items-start gap-2 border-b border-stroke bg-content/3 py-2.5 ps-4 pe-2">
      <p :id="promptId" class="min-w-0 flex-1 pt-1 text-pretty">
        {{ question?.prompt }}
        <span v-if="question?.multiple" class="block text-xs font-normal text-muted">{{ t('chat.question.multiple') }}</span>
      </p>
      <div v-if="questions.length > 1" class="flex shrink-0 items-center text-xs text-muted tabular-nums">
        <UiIconButton :label="t('chat.question.back')" :disabled="step === 0" class="size-6!" @click="go(step - 1)">
          <ChevronLeft class="size-3.5" aria-hidden="true" />
        </UiIconButton>
        <span class="px-1">{{ t('chat.question.progress', { n: step + 1, total: questions.length }) }}</span>
        <UiIconButton :label="t('chat.question.next')" :disabled="last" class="size-6!" @click="go(step + 1)">
          <ChevronRight class="size-3.5" aria-hidden="true" />
        </UiIconButton>
      </div>
    </div>
    <template v-if="question">
      <div :key="step" class="flex max-h-72 flex-col overflow-y-auto" :role="question.multiple ? 'group' : 'radiogroup'" :aria-labelledby="promptId">
        <button
          v-for="(option, index) in question.options"
          :key="option.label"
          ref="options"
          type="button"
          :role="question.multiple ? 'checkbox' : 'radio'"
          :aria-checked="picked[step]?.includes(index) ?? false"
          :aria-keyshortcuts="index < 9 ? String(index + 1) : undefined"
          class="flex items-start gap-3 border-b border-stroke px-4 py-3 text-start hover:bg-selection-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          @click="pick(index)"
          @keydown="onOptionKeydown($event, index)"
        >
          <!-- Rond pour un choix unique, carré pour plusieurs, comme un formulaire. -->
          <span
            class="mt-px grid size-[18px] shrink-0 place-items-center border"
            :class="[
              question.multiple ? 'rounded-[5px]' : 'rounded-full',
              picked[step]?.includes(index) ? 'border-signal bg-signal text-on-signal' : 'border-muted/60',
            ]"
            aria-hidden="true"
          >
            <Check v-if="question.multiple && picked[step]?.includes(index)" class="size-3" />
            <span v-else-if="picked[step]?.includes(index)" class="size-[7px] rounded-full bg-on-signal" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block">{{ option.label }}</span>
            <span v-if="option.description" class="mt-0.5 block text-muted">{{ option.description }}</span>
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
          class="bg-transparent px-4 py-3.5 outline-none placeholder:text-muted"
          @input="onCustom"
          @keydown="onOtherKeydown"
        />
      </div>
    </template>
    <div class="flex items-center justify-end gap-2 px-3 py-3">
      <UiButton size="sm" :aria-keyshortcuts="shortcuts.aria('deny')" @click="skip">{{ t('chat.question.skip') }}</UiButton>
      <UiButton variant="primary" size="sm" :disabled="!ready" :aria-keyshortcuts="shortcuts.aria('approve')" @click="next">
        {{ last ? t('chat.question.send') : t('chat.question.next') }}
        <kbd v-if="shortcuts.label('approve')" class="font-sans text-xs opacity-60" aria-hidden="true">{{ shortcuts.label('approve') }}</kbd>
      </UiButton>
    </div>
  </section>
</template>
