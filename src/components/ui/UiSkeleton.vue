<script setup lang="ts">
// Squelette de chargement (demande de Jérémy : jamais de rond qui tourne pour un contenu) : des barres à la forme du
// contenu attendu, balayées d'un reflet. `rows` : lignes de liste (icône + texte) ; `code` : lignes de code ou de diff.
// `label` : ce qui charge, lu par un lecteur d'écran.
const props = withDefaults(defineProps<{ label: string; rows?: number; kind?: 'list' | 'code' }>(), { rows: 6, kind: 'list' })
// Largeurs variées mais fixes : des barres toutes égales ressemblent à un bloc, pas à du texte.
const WIDTHS = [72, 54, 86, 63, 78, 45, 91, 58]
const width = (index: number) => `${WIDTHS[index % WIDTHS.length]! - (props.kind === 'code' ? 20 : 0)}%`
</script>

<template>
  <div class="flex flex-col" :class="kind === 'code' ? 'gap-2 px-3 py-3' : 'gap-0.5 p-2'" role="status" :aria-label="label">
    <div v-for="index in rows" :key="index" class="flex items-center" :class="kind === 'code' ? 'h-3 gap-3' : 'h-7 gap-2 px-2'">
      <span v-if="kind === 'code'" class="skeleton h-2 w-4 shrink-0 rounded-sm opacity-60" />
      <span v-else class="skeleton size-3.5 shrink-0 rounded-sm" />
      <span class="skeleton rounded-full" :class="kind === 'code' ? 'h-2' : 'h-2.5'" :style="{ width: width(index) }" />
    </div>
  </div>
</template>
