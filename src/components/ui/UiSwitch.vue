<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

// Les autres attributs (aria-describedby vers l'aide de la ligne) vont au bouton.
defineProps<{ label: string; disabled?: boolean }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <SwitchRoot
    v-model="model"
    :aria-label="label"
    :disabled="disabled"
    class="inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-selection-hover p-0.5 transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-accent motion-reduce:transition-none"
  >
    <SwitchThumb
      class="block size-4 rounded-full bg-content shadow-sm transition-transform duration-150 ease-out data-[state=checked]:translate-x-4 data-[state=checked]:bg-canvas motion-reduce:transition-none rtl:data-[state=checked]:-translate-x-4"
    />
  </SwitchRoot>
</template>
