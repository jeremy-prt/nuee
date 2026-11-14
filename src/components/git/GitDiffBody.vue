<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ChatDiff from '@/components/chat/ChatDiff.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import type { DiffState } from '@/composables/useGitChanges'
import type { DiffComment } from '@/stores/diffComments'

// Diff d'un fichier du volet Git, ou ce qui en tient lieu (lecture, binaire, trop gros). `flush` : en pleine colonne,
// à gauche de la liste ; sinon déplié sous sa ligne. Sans `comments`, lecture seule (fichier d'un commit).
defineProps<{ state: DiffState | undefined; binary: boolean; flush?: boolean; comments?: DiffComment[] }>()
const emit = defineEmits<{ add: [comment: Omit<DiffComment, 'id' | 'file'>]; remove: [id: string] }>()
const { t } = useI18n()
</script>

<template>
  <div :class="flush ? 'min-h-0 flex-1 overflow-auto' : 'ps-2 pt-1 pb-2'">
    <UiSkeleton v-if="state === 'loading' || state === undefined" :label="t('dock.changes.loading')" kind="code" :rows="flush ? 12 : 4" />
    <p v-else-if="state === 'failed'" class="px-2 py-1 text-xs text-muted">{{ t('dock.changes.diffFailed') }}</p>
    <p v-else-if="binary" class="px-2 py-1 text-xs text-muted">{{ t('dock.changes.binary') }}</p>
    <p v-else-if="state.tooLarge" class="px-2 py-1 text-xs text-muted">{{ t('dock.changes.tooLarge') }}</p>
    <ChatDiff
      v-else-if="state.patch"
      :patch="state.patch"
      unbounded
      :flush="flush"
      :commentable="!!comments"
      :comments="comments"
      @add="emit('add', $event)"
      @remove="emit('remove', $event)"
    />
    <p v-else class="px-2 py-1 text-xs text-muted">{{ t('dock.changes.noText') }}</p>
  </div>
</template>
