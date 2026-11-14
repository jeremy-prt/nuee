<script setup lang="ts">
import { Check } from '@/components/ui/icons'
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { computed, ref } from 'vue'
import { Translation, useI18n } from 'vue-i18n'
import ProjectBackgroundChoices from '@/components/project/ProjectBackgroundChoices.vue'
import ProjectIcon from '@/components/project/ProjectIcon.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { isAppError } from '@/ipc/agent'
import { ICON_EXTENSIONS, pickImage } from '@/ipc/dialog'
import { type IconMode, type Project, useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { iconColors, iconColorVar } from '@/utils/projects'

const props = defineProps<{ project: Project }>()

const { t } = useI18n()
const projects = useProjectsStore()
const toasts = useToastsStore()

const found = computed(() => projects.icons[props.project.id])
const shown = computed(() => projects.shown(props.project))
const showsLetter = computed(() => shown.value === 'letter')
const importing = ref(false)

// Rien trouvé dans le dossier : « Détectée » est grisé et c'est l'initiale qui apparaît choisie.
const noIcon = computed(() => !!found.value && !found.value.detected)
const modes = computed(() =>
  (['auto', 'letter', 'image'] as const).map((value) => ({
    value,
    label: t(`settings.projects.iconModes.${value}`),
    disabled: value === 'auto' && noIcon.value,
    tooltip: value === 'auto' && noIcon.value ? t('settings.projects.iconHints.none') : undefined,
  })),
)

// Passer sur Image sans image importée ouvre le sélecteur ; annulé, le mode ne change pas.
const mode = computed({
  get: () => (props.project.icon === 'auto' && noIcon.value ? 'letter' : props.project.icon),
  set: (value: IconMode) => {
    if (value === 'image' && !found.value?.custom) importImage()
    else props.project.icon = value
  },
})

// Une aide pour l'icône du projet seulement : où elle a été trouvée (chemin inséré par Translation).
const hint = computed(() => {
  if (props.project.icon !== 'auto') return null
  if (!found.value) return 'searching'
  return found.value.detected ? 'found' : 'none'
})

async function importImage() {
  const path = await pickImage(t('settings.projects.pickIcon'), ICON_EXTENSIONS)
  if (!path) return
  importing.value = true
  try {
    await projects.importIcon(props.project, path)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('settings.projects.iconFailed'), body: isAppError(error) ? error.message : String(error) })
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <SettingsRow data-setting="project-icon" :label="t('settings.projects.icon')">
    <template #icon><ProjectIcon :project="project" class="size-10 shrink-0" /></template>
    <template v-if="hint" #hint>
      <Translation v-if="hint === 'found' && found?.detected" keypath="settings.projects.iconHints.found" tag="span">
        <template #path><span class="break-all">{{ found.detected.path }}</span></template>
      </Translation>
      <template v-else>{{ t(`settings.projects.iconHints.${hint}`) }}</template>
    </template>
    <template #default="{ hintId }">
      <UiSegmented v-model="mode" :label="t('settings.projects.icon')" :options="modes" :aria-describedby="hintId" />
    </template>
  </SettingsRow>

  <template v-if="showsLetter">
    <SettingsRow data-setting="project-color" :label="t('settings.projects.color')">
      <RadioGroupRoot
        v-model="project.color"
        :aria-label="t('settings.projects.color')"
        orientation="horizontal"
        class="flex flex-wrap justify-end gap-1.5"
      >
        <RadioGroupItem
          v-for="color in iconColors"
          :key="color"
          :value="color"
          :aria-label="t(`settings.projects.colors.${color}`)"
          class="grid size-6 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          :style="{ background: iconColorVar(color) }"
        >
          <RadioGroupIndicator><Check class="size-3.5 text-canvas" aria-hidden="true" /></RadioGroupIndicator>
        </RadioGroupItem>
      </RadioGroupRoot>
    </SettingsRow>
  </template>

  <SettingsRow data-setting="project-background" :label="t('settings.projects.background')" :hint="t('settings.projects.backgroundHint')">
    <ProjectBackgroundChoices :project="project" />
  </SettingsRow>

  <SettingsRow v-if="mode === 'image'" v-slot="{ hintId }" data-setting="project-image" :label="t('settings.projects.image')" :hint="t('settings.projects.imageHint')">
    <UiButton size="sm" :loading="importing" :aria-describedby="hintId" @click="importImage">
      {{ found?.custom ? t('settings.projects.changeImage') : t('settings.projects.chooseIcon') }}
    </UiButton>
  </SettingsRow>
</template>
