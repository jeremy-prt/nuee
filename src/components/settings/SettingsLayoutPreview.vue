<script setup lang="ts">
import type { AppLayout } from '@/stores/appearance'

defineProps<{ layout: AppLayout }>()
</script>

<template>
  <!-- Schéma de la fenêtre : les projets en icônes à gauche, ou un seul projet en haut à gauche. Le centre est une carte. -->
  <div class="relative flex aspect-2/1 overflow-hidden rounded-lg border border-stroke bg-chrome text-[6px]" aria-hidden="true">
    <template v-if="layout === 'columns'">
      <div class="flex w-[13%] flex-col items-center gap-[1em] border-e border-stroke py-[1.4em]">
        <span class="size-[1.6em] rounded-[0.4em] bg-content/15" />
        <span class="mt-[0.6em] size-[1.6em] rounded-[0.4em] bg-signal/70" />
        <span class="size-[1.6em] rounded-[0.4em] bg-content/25" />
        <span class="size-[1.6em] rounded-[0.4em] bg-content/25" />
        <span class="size-[1.6em] rounded-[0.4em] bg-content/25" />
      </div>
      <div class="flex w-[24%] flex-col gap-[1em] p-[1.4em] pe-0">
        <span class="h-[1em] w-2/3 rounded-full bg-content/25" />
        <span class="h-[1em] w-full rounded-full bg-content/15" />
        <span class="h-[1em] w-5/6 rounded-full bg-content/15" />
        <span class="h-[1em] w-3/4 rounded-full bg-content/15" />
      </div>
      <div class="my-[1.2em] ms-[1em] me-[1.2em] flex flex-1 flex-col gap-[1em] rounded-[1em] border border-content/15 bg-surface p-[1.6em]">
        <span class="ms-auto h-[1.4em] w-1/3 rounded-full bg-content/20" />
        <span class="h-[1em] w-2/3 rounded-full bg-content/15" />
        <span class="mt-auto h-[2.4em] rounded-[0.8em] border border-content/15" />
      </div>
    </template>
    <template v-else>
      <div class="flex w-[34%] flex-col gap-[1em] p-[1.4em] pe-[1em]">
        <span class="flex items-center gap-[0.6em]">
          <span class="size-[1.6em] shrink-0 rounded-[0.4em] bg-signal/70" />
          <span class="h-[1em] flex-1 rounded-full bg-content/30" />
          <span class="size-[0.9em] shrink-0 rotate-45 border-e border-b border-content/40" />
        </span>
        <span class="mt-[0.4em] h-[1em] w-full rounded-full bg-content/15" />
        <span class="h-[1em] w-5/6 rounded-full bg-content/15" />
        <span class="h-[1em] w-3/4 rounded-full bg-content/15" />
      </div>
      <div class="my-[1.2em] me-[1.2em] flex flex-1 flex-col gap-[1em] rounded-[1em] border border-content/15 bg-surface p-[1.6em]">
        <span class="ms-auto h-[1.4em] w-1/3 rounded-full bg-content/20" />
        <span class="h-[1em] w-2/3 rounded-full bg-content/15" />
        <span class="mt-auto h-[2.4em] rounded-[0.8em] border border-content/15" />
      </div>
    </template>
  </div>
</template>
