<script setup lang="ts">
import { ChevronRight } from '@/components/ui/icons'
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import { useProgressiveList } from '@/composables/useProgressiveList'
import type { ChangedFile } from '@/ipc/bindings/ChangedFile'
import type { ChangeStatus } from '@/ipc/bindings/ChangeStatus'
import { fileName } from '@/utils/activity'

// Fichiers du volet Git (changements non commités, fichiers d'un commit), à plat ou en arbre comme monocode : icône,
// nom, dossier atténué, état en lettre colorée à droite. `inline` : un clic déplie le diff sous la ligne (slot
// `detail`) ; sinon il s'ouvre à gauche, et `active` est la ligne affichée. Slot `actions` : boutons au survol.
const props = defineProps<{ files: readonly ChangedFile[]; tree: boolean; inline?: boolean; expanded?: ReadonlySet<string>; active?: string | null; reset?: unknown }>()
const emit = defineEmits<{ select: [file: ChangedFile]; pin: [file: ChangedFile] }>()

const { t } = useI18n()

type Row = { key: string; depth: number } & ({ kind: 'file'; file: ChangedFile } | { kind: 'dir'; path: string; name: string })
interface Dir {
  dirs: Map<string, Dir>
  files: ChangedFile[]
}

const collapsed = reactive(new Set<string>())

// Dossiers d'abord, puis fichiers, par nom ; un dossier qui ne contient qu'un dossier se fond avec lui (« src/app »).
const rows = computed<Row[]>(() => {
  if (!props.tree) return props.files.map((file) => ({ key: file.path, depth: 0, kind: 'file', file }))
  const root: Dir = { dirs: new Map(), files: [] }
  for (const file of props.files) {
    const parts = file.path.split('/')
    let dir = root
    for (const part of parts.slice(0, -1)) {
      let next = dir.dirs.get(part)
      if (!next) dir.dirs.set(part, (next = { dirs: new Map(), files: [] }))
      dir = next
    }
    dir.files.push(file)
  }
  const out: Row[] = []
  const walk = (dir: Dir, prefix: string, depth: number) => {
    for (const [first, child] of [...dir.dirs].sort(([a], [b]) => a.localeCompare(b))) {
      let name = first
      let node = child
      while (!node.files.length && node.dirs.size === 1) {
        const [next, only] = [...node.dirs][0]!
        name = `${name}/${next}`
        node = only
      }
      const path = prefix ? `${prefix}/${name}` : name
      out.push({ key: `dir:${path}`, depth, kind: 'dir', path, name })
      if (!collapsed.has(path)) walk(node, path, depth + 1)
    }
    for (const file of [...dir.files].sort((a, b) => fileName(a.path).localeCompare(fileName(b.path))))
      out.push({ key: file.path, depth, kind: 'file', file })
  }
  walk(root, '', 0)
  return out
})
const { shown, more, limit, sentinel } = useProgressiveList(rows, () => props.reset)

function parts(file: ChangedFile) {
  const name = fileName(file.path)
  return { name, dir: file.path.slice(0, -name.length).replace(/\/+$/, '') }
}

function toggleDir(path: string) {
  if (!collapsed.delete(path)) collapsed.add(path)
}

const LETTER: Record<ChangeStatus, string> = { modified: 'M', untracked: 'U', added: 'A', deleted: 'D', renamed: 'R' }
const TONE: Record<ChangeStatus, string> = {
  modified: 'text-warning',
  untracked: 'text-info',
  added: 'text-success',
  deleted: 'text-danger',
  renamed: 'text-violet',
}

const indent = (depth: number) => ({ paddingInlineStart: `${8 + depth * 12}px` })
const row = 'flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg pe-1 text-start text-[13px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
</script>

<template>
  <ul class="flex flex-col gap-0.5">
    <li v-for="item in shown" :key="item.key" :data-change="item.kind === 'file' ? item.file.path : undefined" class="flex flex-col">
      <button
        v-if="item.kind === 'dir'"
        type="button"
        :class="row"
        class="w-full text-muted hover:bg-selection-hover hover:text-content"
        :style="indent(item.depth)"
        :aria-expanded="!collapsed.has(item.path)"
        :title="item.path"
        @click="toggleDir(item.path)"
      >
        <ChevronRight class="size-3 shrink-0" :class="{ 'rotate-90': !collapsed.has(item.path) }" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ item.name }}</span>
      </button>
      <template v-else>
        <div
          class="group/row flex items-center rounded-lg"
          :class="active === item.file.path ? 'bg-selection' : 'hover:bg-selection-hover'"
        >
          <button
            type="button"
            :class="row"
            :style="indent(item.depth)"
            :aria-expanded="inline ? !!expanded?.has(item.file.path) : undefined"
            :aria-current="active === item.file.path ? 'true' : undefined"
            :title="item.file.oldPath ? t('dock.changes.renamedFrom', { path: item.file.oldPath }) : item.file.path"
            @click="emit('select', item.file)"
            @dblclick="emit('pin', item.file)"
          >
            <ChevronRight v-if="inline" class="size-3 shrink-0 text-muted" :class="{ 'rotate-90': expanded?.has(item.file.path) }" aria-hidden="true" />
            <UiFileIcon :name="parts(item.file).name" class="size-4 shrink-0" />
            <span class="max-w-full min-w-0 shrink-0 truncate" :class="{ 'text-muted line-through': item.file.status === 'deleted' }">{{ parts(item.file).name }}</span>
            <span v-if="!tree" class="min-w-0 flex-1 truncate text-xs text-muted">{{ parts(item.file).dir }}</span>
            <span class="sr-only">{{ t(`dock.changes.status.${item.file.status}`) }}</span>
          </button>
          <span v-if="$slots.actions" class="flex shrink-0 items-center opacity-0 duration-(--hover-duration) group-hover/row:opacity-100 focus-within:opacity-100">
            <slot name="actions" :file="item.file" />
          </span>
          <span
            class="w-5 shrink-0 pe-1.5 text-center font-mono text-[11px] font-medium"
            :class="TONE[item.file.status]"
            :title="t(`dock.changes.status.${item.file.status}`)"
            aria-hidden="true"
          >{{ LETTER[item.file.status] }}</span>
        </div>
        <slot v-if="inline && expanded?.has(item.file.path)" name="detail" :file="item.file" />
      </template>
    </li>
    <li v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
  </ul>
</template>
