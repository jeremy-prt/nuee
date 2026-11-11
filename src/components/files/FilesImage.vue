<script lang="ts">
export interface Picture {
  src: string
  width: number | null
  height: number | null
  bytes: number
  type: string
}
</script>

<script setup lang="ts">
import { LoaderCircle } from '@/components/ui/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Image du volet, matricielle ou SVG : fond en damier, un clic passe de l'ajustement à la taille réelle, et le même
// bandeau pour toutes. `picture` null : cadre vide de même taille pendant la lecture ; `busy` : lecture lente.
const props = defineProps<{ picture: Picture | null; name: string; busy?: boolean }>()

const { t, locale } = useI18n()
const fit = ref(true)

const weight = computed(() => {
  const value = props.picture?.bytes ?? 0
  const [amount, unit] = value >= 1024 * 1024 ? [value / 1024 / 1024, 'megabyte'] : [value / 1024, 'kilobyte']
  return new Intl.NumberFormat(locale.value, { style: 'unit', unit, maximumFractionDigits: 1 }).format(amount)
})
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <!-- Ajustée en position absolue : dans une grille sans hauteur fixée, `max-h-full` la réduisait à rien. -->
    <button
      type="button"
      class="files-checker relative min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      :aria-label="fit ? t('dock.files.actualSize') : t('dock.files.fitSize')"
      :disabled="!picture"
      @click="fit = !fit"
    >
      <img
        v-if="picture"
        :src="picture.src"
        :alt="name"
        :class="fit ? 'absolute inset-4 m-auto max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] object-contain' : 'm-4 max-w-none'"
        :style="busy ? { opacity: 0.5 } : undefined"
      />
      <span v-if="busy" class="absolute inset-0 grid place-items-center text-muted" role="status" :aria-label="t('dock.files.loading')">
        <LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      </span>
    </button>
    <footer class="flex h-6 shrink-0 items-center gap-2 border-t border-stroke px-2.5 text-[10.5px] text-muted">
      <template v-if="picture && !busy">
        <span v-if="picture.width && picture.height" class="tabular-nums">{{ picture.width }} × {{ picture.height }}</span>
        <span>{{ weight }}</span>
        <span>{{ picture.type }}</span>
        <span class="flex-1" />
        <span>{{ fit ? t('dock.files.fitted') : '100 %' }}</span>
      </template>
    </footer>
  </div>
</template>

<style scoped>
.files-checker {
  background-image:
    linear-gradient(45deg, rgb(128 128 128 / 0.1) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(128 128 128 / 0.1) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgb(128 128 128 / 0.1) 75%),
    linear-gradient(-45deg, transparent 75%, rgb(128 128 128 / 0.1) 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
}
</style>
