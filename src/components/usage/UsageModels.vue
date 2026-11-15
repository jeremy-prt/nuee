<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Classement des modèles, comme le tableau de T3 Code : une fine barre sous le nom donne l'ordre de grandeur.
defineProps<{ rows: { model: string; label: string; color: string; cost: string; share: string; tokens: string; bar: number }[]; shareLabel: string }>()

const { t } = useI18n()
</script>

<template>
  <table class="w-full text-[13px] tabular-nums">
    <thead class="text-xs text-muted">
      <tr class="border-b border-stroke">
        <th scope="col" class="w-8 py-2 text-start font-normal">#</th>
        <th scope="col" class="py-2 text-start font-normal">{{ t('usage.models.model') }}</th>
        <th scope="col" class="py-2 ps-6 text-end font-normal">{{ t('usage.models.cost') }}</th>
        <th scope="col" class="py-2 ps-6 text-end font-normal">{{ shareLabel }}</th>
        <th scope="col" class="py-2 ps-6 text-end font-normal">{{ t('usage.models.tokens') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, index) in rows" :key="row.model" class="border-b border-stroke/60 text-muted last:border-b-0">
        <td class="py-3 text-xs">{{ index + 1 }}</td>
        <th scope="row" class="py-3 text-start font-normal">
          <span class="block truncate text-content">{{ row.label }}</span>
          <span class="mt-1.5 block max-w-60" aria-hidden="true">
            <span class="block h-0.5 rounded-full" :style="{ width: `max(0.5rem, ${row.bar * 100}%)`, background: row.color }" />
          </span>
        </th>
        <td class="py-3 ps-6 text-end font-medium text-content">{{ row.cost }}</td>
        <td class="py-3 ps-6 text-end">{{ row.share }}</td>
        <td class="py-3 ps-6 text-end">{{ row.tokens }}</td>
      </tr>
    </tbody>
  </table>
</template>
