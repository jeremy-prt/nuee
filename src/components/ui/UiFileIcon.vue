<script setup lang="ts">
import { type Component, computed } from 'vue'
import claudeLogo from '@/assets/agents/claude.svg'
import {
  File,
  FileAudio,
  FileBraces,
  FileCode,
  FileCog,
  FileCss,
  FileHtml,
  FileImage,
  FileJs,
  FileLicense,
  FileLock,
  FileNpm,
  FilePdf,
  FilePhp,
  FilePython,
  FileSql,
  FileTerminal,
  FileText,
  FileTs,
  FileVideo,
  FileXml,
  FileZip,
  Folder,
  GitBranch,
} from '@/components/ui/icons'

type Look = [Component, string]

// Glyphe et couleur par type, comme les listes de fichiers de l'app Claude : les dossiers restent neutres.
const byName: Record<string, Look> = {
  'package.json': [FileNpm, 'text-danger'],
  'pnpm-lock.yaml': [FileLock, 'text-danger'],
  'package-lock.json': [FileLock, 'text-danger'],
  'yarn.lock': [FileLock, 'text-danger'],
  'cargo.lock': [FileLock, 'text-danger'],
  license: [FileLicense, 'text-muted'],
  dockerfile: [FileCog, 'text-info'],
}
const byExtension: Record<string, Look> = {}
const add = (look: Look, ...extensions: string[]) => extensions.forEach((extension) => (byExtension[extension] = look))
add([FileTs, 'text-info'], 'ts', 'tsx', 'mts', 'cts')
add([FileJs, 'text-skill'], 'js', 'jsx', 'mjs', 'cjs')
add([FileCode, 'text-success'], 'vue', 'svelte', 'astro')
add([FileBraces, 'text-orange'], 'json', 'jsonc', 'json5')
add([FileHtml, 'text-orange'], 'html', 'htm')
add([FileCss, 'text-mention'], 'css', 'scss', 'sass', 'less')
add([FileText, 'text-success'], 'md', 'mdx', 'txt', 'rst')
add([FileCode, 'text-orange'], 'rs', 'swift', 'kt', 'java', 'go', 'c', 'h', 'cpp', 'cs', 'rb', 'zig')
add([FilePython, 'text-info'], 'py')
add([FilePhp, 'text-info'], 'php')
add([FileSql, 'text-warning'], 'sql', 'db', 'sqlite')
add([FileXml, 'text-orange'], 'xml', 'plist')
add([FileCog, 'text-muted'], 'yaml', 'yml', 'toml', 'ini', 'conf', 'env', 'lock')
add([FileTerminal, 'text-success'], 'sh', 'bash', 'zsh', 'fish', 'ps1')
add([FileImage, 'text-signal-text'], 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'icns', 'svg', 'heic')
add([FileVideo, 'text-signal-text'], 'mp4', 'mov', 'webm', 'mkv')
add([FileAudio, 'text-signal-text'], 'mp3', 'wav', 'ogg', 'flac', 'm4a')
add([FilePdf, 'text-danger'], 'pdf')
add([FileZip, 'text-warning'], 'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'dmg')

const props = defineProps<{ name: string; folder?: boolean }>()

const lower = computed(() => props.name.toLowerCase())
// Fichiers d'instructions de Claude : son logo, comme dans l'app Claude. Son dessin a une marge, d'où le
// `scale-125` pour la même taille à l'œil que les glyphes.
const claude = computed(() => !props.folder && (lower.value === 'claude.md' || lower.value === 'claude.local.md'))
const look = computed<Look>(() => {
  if (props.folder) return [Folder, 'text-muted']
  const name = lower.value
  if (byName[name]) return byName[name]
  if (name.startsWith('.git')) return [GitBranch, 'text-orange']
  if (name.startsWith('.env')) return [FileCog, 'text-warning']
  const dot = name.lastIndexOf('.')
  return (dot > 0 && byExtension[name.slice(dot + 1)]) || [File, 'text-muted']
})
</script>

<template>
  <img v-if="claude" :src="claudeLogo" alt="" class="scale-125" />
  <component :is="look[0]" v-else :class="look[1]" aria-hidden="true" />
</template>
