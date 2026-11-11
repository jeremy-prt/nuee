<script setup lang="ts">
import { MessageSquarePlus, Trash2 } from '@/components/ui/icons'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { DiffComment } from '@/stores/diffComments'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type DiffLine, changeStarts, diffLines } from '@/utils/diff'

type Anchor = Pick<DiffComment, 'side' | 'line' | 'code'>

// unbounded : sans hauteur maximale, quand le conteneur défile déjà (volet Git). flush : sans cadre, en pleine
// colonne (éditeur du volet Git). commentable : un bouton au survol de chaque ligne ouvre un champ de commentaire sous
// elle. La première ligne de chaque changement porte `data-change` (son rang), pour passer de l'un à l'autre.
const props = defineProps<{ patch: string; unbounded?: boolean; flush?: boolean; commentable?: boolean; comments?: DiffComment[] }>()
const emit = defineEmits<{ add: [comment: Anchor & { body: string }]; remove: [id: string] }>()

const { t } = useI18n()
const shortcuts = useShortcutsStore()

type Line = DiffLine

const lines = computed(() => diffLines(props.patch))
const starts = computed(() => new Map(changeStarts(lines.value).map((line, rank) => [line, rank])))

function anchor(line: Line): Anchor {
  return line.kind === 'del' ? { side: 'old', line: line.old ?? 0, code: line.text } : { side: 'new', line: line.new ?? 0, code: line.text }
}

function same(a: Anchor, b: Anchor) {
  return a.side === b.side && a.line === b.line
}

function commentsOf(line: Line) {
  const at = anchor(line)
  return (props.comments ?? []).filter((comment) => same(comment, at))
}

const editing = ref<Anchor | null>(null)
const draft = ref('')
const field = ref<HTMLTextAreaElement[]>([])

async function open(line: Line) {
  editing.value = anchor(line)
  draft.value = ''
  await nextTick()
  field.value[0]?.focus()
}

// ⌘↵ enregistre comme il envoie un message ; Échap referme sans quitter le volet.
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (shortcuts.matches(event, 'sendOther')) {
    event.preventDefault()
    save()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    editing.value = null
  }
}

function save() {
  const body = draft.value.trim()
  if (!editing.value || !body) return
  emit('add', { ...editing.value, body })
  editing.value = null
}

const ROW: Record<Line['kind'], string> = {
  add: 'bg-success/12',
  del: 'bg-danger/12',
  same: '',
  hunk: 'h-2 bg-selection/40',
}
const SIGN = { add: '+', del: '−', same: ' ', hunk: '' }
const columns = computed(() => (props.commentable ? 5 : 4))
</script>

<template>
  <div class="overflow-auto font-mono text-[11px] leading-[1.6] select-text" :class="[{ 'max-h-80': !unbounded }, flush ? '' : 'rounded-md border border-stroke']">
    <table class="w-full border-collapse">
      <tbody>
        <template v-for="(line, index) in lines" :key="index">
          <tr class="group/line scroll-mt-8" :class="ROW[line.kind]" :data-change="starts.get(index)">
            <template v-if="line.kind !== 'hunk'">
              <td v-if="commentable" class="w-px ps-0.5 align-top select-none">
                <button
                  type="button"
                  class="grid size-4 place-items-center rounded text-muted opacity-0 duration-(--hover-duration) group-hover/line:opacity-100 hover:bg-selection-hover hover:text-content focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
                  :aria-label="t('dock.changes.comment', { line: anchor(line).line })"
                  @click="open(line)"
                >
                  <MessageSquarePlus class="size-3" aria-hidden="true" />
                </button>
              </td>
              <td class="w-px px-1.5 text-end text-muted/70 tabular-nums select-none">{{ line.old }}</td>
              <td class="w-px px-1.5 text-end text-muted/70 tabular-nums select-none">{{ line.new }}</td>
              <td
                class="w-px ps-1 pe-1.5 select-none"
                :class="{ 'text-success': line.kind === 'add', 'text-danger': line.kind === 'del', 'text-muted': line.kind === 'same' }"
              >{{ SIGN[line.kind] }}</td>
              <td class="pe-3 whitespace-pre">{{ line.text }}</td>
            </template>
            <td v-else :colspan="columns" />
          </tr>
          <template v-if="line.kind !== 'hunk'">
            <tr v-for="comment in commentsOf(line)" :key="comment.id">
              <td :colspan="columns" class="px-1.5 py-1">
                <div class="flex items-start gap-2 rounded-md border border-stroke bg-canvas px-2 py-1.5 font-sans text-xs">
                  <p class="min-w-0 flex-1 whitespace-pre-wrap break-words">{{ comment.body }}</p>
                  <UiIconButton :label="t('dock.changes.commentRemove')" class="-my-1 -me-1" @click="emit('remove', comment.id)">
                    <Trash2 class="size-3.5" aria-hidden="true" />
                  </UiIconButton>
                </div>
              </td>
            </tr>
            <tr v-if="editing && same(editing, anchor(line))">
              <td :colspan="columns" class="px-1.5 py-1">
                <div class="flex flex-col gap-1.5 rounded-md border border-stroke bg-canvas p-2 font-sans">
                  <textarea
                    ref="field"
                    v-model="draft"
                    rows="2"
                    class="w-full resize-y rounded bg-transparent text-xs outline-none placeholder:text-muted"
                    :placeholder="t('dock.changes.commentPlaceholder')"
                    :aria-label="t('dock.changes.comment', { line: editing.line })"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    writingsuggestions="false"
                    @keydown="onKeydown"
                  />
                  <div class="flex justify-end gap-1.5">
                    <UiButton size="xs" variant="ghost" @click="editing = null">{{ t('dock.changes.commentCancel') }}</UiButton>
                    <UiButton size="xs" variant="primary" :disabled="!draft.trim()" @click="save">{{ t('dock.changes.commentAdd') }}</UiButton>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </template>
      </tbody>
    </table>
  </div>
</template>
