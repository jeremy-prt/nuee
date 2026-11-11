<script setup lang="ts">
import { ChevronRight } from '@/components/ui/icons'
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import UiFileIcon from '@/components/ui/UiFileIcon.vue'
import { useProgressiveList } from '@/composables/useProgressiveList'
import type { ChangedFile } from '@/ipc/bindings/ChangedFile'
import type { ChangeStatus } from '@/ipc/bindings/ChangeStatus'
import { fileName } from '@/utils/activity'

// Fichiers du volet Git (changements non commités, fichiers d'un commit), à plat comme monocode : icône, nom, dossier
// atténué, état en lettre colorée à droite. `inline` : un clic déplie le diff sous la ligne (slot `detail`) ; sinon il
// s'ouvre à gauche, et `active` est la ligne affichée. Slot `actions` : boutons au survol.
const props = defineProps<{ files: readonly ChangedFile[]; inline?: boolean; expanded?: ReadonlySet<string>; active?: string | null; reset?: unknown }>()
const emit = defineEmits<{ select: [file: ChangedFile]; pin: [file: ChangedFile] }>()

const { t } = useI18n()

const { shown, more, limit, sentinel } = useProgressiveList(toRef(props, 'files'), () => props.reset)

// Un dépôt git imbriqué arrive en dossier (`sous/`).
function parts(file: ChangedFile) {
  const path = file.path.replace(/\/$/, '')
  const name = fileName(path)
  return { name, dir: path.slice(0, -name.length).replace(/\/+$/, '') }
}

const LETTER: Record<ChangeStatus, string> = { modified: 'M', untracked: 'U', added: 'A', deleted: 'D', renamed: 'R' }
const TONE: Record<ChangeStatus, string> = {
  modified: 'text-warning',
  untracked: 'text-info',
  added: 'text-success',
  deleted: 'text-danger',
  renamed: 'text-violet',
}

const row = 'flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg ps-2 pe-1 text-start text-[13px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
</script>

<template>
  <ul class="flex flex-col gap-0.5">
    <li v-for="file in shown" :key="file.path" :data-change="file.path" class="flex flex-col">
      <div class="group/row flex items-center rounded-lg" :class="active === file.path ? 'bg-selection' : 'hover:bg-selection-hover'">
        <button
          type="button"
          :class="row"
          :aria-expanded="inline ? !!expanded?.has(file.path) : undefined"
          :aria-current="active === file.path ? 'true' : undefined"
          :title="file.oldPath ? t('dock.changes.renamedFrom', { path: file.oldPath }) : file.path"
          @click="emit('select', file)"
          @dblclick="emit('pin', file)"
        >
          <ChevronRight v-if="inline" class="size-3 shrink-0 text-muted" :class="{ 'rotate-90': expanded?.has(file.path) }" aria-hidden="true" />
          <UiFileIcon :name="parts(file).name" class="size-4 shrink-0" />
          <span class="max-w-full min-w-0 shrink-0 truncate" :class="{ 'text-muted line-through': file.status === 'deleted' }">{{ parts(file).name }}</span>
          <span class="min-w-0 flex-1 truncate text-xs text-muted">{{ parts(file).dir }}</span>
          <span class="sr-only">{{ t(`dock.changes.status.${file.status}`) }}</span>
        </button>
        <span v-if="$slots.actions" class="flex shrink-0 items-center opacity-0 duration-(--hover-duration) group-hover/row:opacity-100 focus-within:opacity-100">
          <slot name="actions" :file="file" />
        </span>
        <span class="w-5 shrink-0 pe-1.5 text-center font-mono text-[11px] font-medium" :class="TONE[file.status]" :title="t(`dock.changes.status.${file.status}`)" aria-hidden="true">{{
          LETTER[file.status]
        }}</span>
      </div>
      <slot v-if="inline && expanded?.has(file.path)" name="detail" :file="file" />
    </li>
    <li v-if="more" :key="limit" ref="sentinel" class="h-px" aria-hidden="true" />
  </ul>
</template>
