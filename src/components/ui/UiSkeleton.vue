<script setup lang="ts">
// Squelette de chargement (demande de Jérémy : jamais de rond qui tourne pour un contenu) : des barres à la forme du
// contenu attendu, balayées d'un reflet. `rows` : lignes de liste (icône + texte) ; `code` : lignes de code ou de diff ;
// `chat` : échanges (une bulle puis quelques lignes de réponse). `label` : ce qui charge, lu par un lecteur d'écran.
const props = withDefaults(defineProps<{ label: string; rows?: number; kind?: 'list' | 'code' | 'chat' }>(), { rows: 6, kind: 'list' })
// Largeurs variées mais fixes : des barres toutes égales ressemblent à un bloc, pas à du texte.
const WIDTHS = [72, 54, 86, 63, 78, 45, 91, 58]
const width = (index: number) => `${WIDTHS[index % WIDTHS.length]! - (props.kind === 'code' ? 20 : 0)}%`
const bubble = (index: number) => `${WIDTHS[(index * 3) % WIDTHS.length]! / 2}%`
</script>

<template>
  <div v-if="kind === 'chat'" class="mx-auto flex w-full max-w-(--chat-width) flex-col gap-7 px-6 py-6" role="status" :aria-label="label">
    <div v-for="index in rows" :key="index" class="flex flex-col gap-2.5">
      <span class="skeleton h-9 self-end rounded-xl" :style="{ width: bubble(index) }" />
      <span v-for="line in 2 + (index % 3)" :key="line" class="skeleton h-2.5 rounded-full" :style="{ width: width(index * 2 + line) }" />
    </div>
  </div>
  <div v-else class="flex flex-col" :class="kind === 'code' ? 'gap-2 px-3 py-3' : 'gap-0.5 p-2'" role="status" :aria-label="label">
    <div v-for="index in rows" :key="index" class="flex items-center" :class="kind === 'code' ? 'h-3 gap-3' : 'h-7 gap-2 px-2'">
      <span v-if="kind === 'code'" class="skeleton h-2 w-4 shrink-0 rounded-sm opacity-60" />
      <span v-else class="skeleton size-3.5 shrink-0 rounded-sm" />
      <span class="skeleton rounded-full" :class="kind === 'code' ? 'h-2' : 'h-2.5'" :style="{ width: width(index) }" />
    </div>
  </div>
</template>
