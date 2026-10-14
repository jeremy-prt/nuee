<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ patch: string }>()

type Line = { kind: 'hunk' | 'add' | 'del' | 'same'; text: string; old: number | null; new: number | null }

const lines = computed(() => {
  const rows: Line[] = []
  let old = 0
  let now = 0
  for (const raw of props.patch.split('\n')) {
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      old = Number(hunk[1])
      now = Number(hunk[2])
      if (rows.length) rows.push({ kind: 'hunk', text: '', old: null, new: null })
    } else if (raw.startsWith('+')) rows.push({ kind: 'add', text: raw.slice(1), old: null, new: now++ })
    else if (raw.startsWith('-')) rows.push({ kind: 'del', text: raw.slice(1), old: old++, new: null })
    else rows.push({ kind: 'same', text: raw.slice(1), old: old++, new: now++ })
  }
  return rows
})

const ROW: Record<Line['kind'], string> = {
  add: 'bg-success/12',
  del: 'bg-danger/12',
  same: '',
  hunk: 'h-2 bg-selection/40',
}
const SIGN = { add: '+', del: '−', same: ' ', hunk: '' }
</script>

<template>
  <div class="max-h-80 overflow-auto rounded-md border border-stroke font-mono text-[11px] leading-[1.6] select-text">
    <table class="w-full border-collapse">
      <tbody>
        <tr v-for="(line, index) in lines" :key="index" :class="ROW[line.kind]">
          <template v-if="line.kind !== 'hunk'">
            <td class="w-px px-1.5 text-end text-muted/70 tabular-nums select-none">{{ line.old }}</td>
            <td class="w-px px-1.5 text-end text-muted/70 tabular-nums select-none">{{ line.new }}</td>
            <td
              class="w-px ps-1 pe-1.5 select-none"
              :class="{ 'text-success': line.kind === 'add', 'text-danger': line.kind === 'del', 'text-muted': line.kind === 'same' }"
            >{{ SIGN[line.kind] }}</td>
            <td class="pe-3 whitespace-pre">{{ line.text }}</td>
          </template>
          <td v-else colspan="4" />
        </tr>
      </tbody>
    </table>
  </div>
</template>
