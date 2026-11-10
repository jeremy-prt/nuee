// Icônes de fichiers du thème Material (celles de monocode), lues dans le manifeste du paquet. Chargées à la
// première demande : manifeste et adresses des 1 200 SVG n'alourdissent pas le démarrage.

interface Manifest {
  iconDefinitions: Record<string, { iconPath: string }>
  fileNames: Record<string, string>
  fileExtensions: Record<string, string>
  folderNames: Record<string, string>
  folderNamesExpanded: Record<string, string>
  file: string
  folder: string
  folderExpanded: string
  rootFolder: string
  rootFolderExpanded: string
}

export interface IconTheme {
  file: (name: string) => string | null
  folder: (name: string, open: boolean, root?: boolean) => string | null
}

let theme: Promise<IconTheme> | null = null

// Le paquet ne sait pas détacher l'extension du nom : le nom entier, puis « d.ts », puis « ts ».
function extensions(name: string) {
  const parts = name.split('.')
  const start = parts[0] === '' ? 1 : 0
  return parts.slice(start + 1).map((_, i) => parts.slice(start + 1 + i).join('.'))
}

export function loadIconTheme() {
  theme ??= Promise.all([import('material-icon-theme/dist/material-icons.json'), import('@/utils/materialIconUrls')]).then(
    ([json, { urls }]) => {
      const manifest = (json as unknown as { default: Manifest }).default
      const url = (icon: string | undefined) => {
        const path = icon ? manifest.iconDefinitions[icon]?.iconPath : undefined
        return path ? (urls[path.slice(path.lastIndexOf('/') + 1)] ?? null) : null
      }
      return {
        file(name) {
          const lower = name.toLowerCase()
          const icon = manifest.fileNames[lower] ?? extensions(lower).map((ext) => manifest.fileExtensions[ext]).find(Boolean)
          return url(icon ?? manifest.file)
        },
        folder(name, open, root) {
          if (root) return url(open ? manifest.rootFolderExpanded : manifest.rootFolder)
          const lower = name.toLowerCase()
          return url(open ? (manifest.folderNamesExpanded[lower] ?? manifest.folderExpanded) : (manifest.folderNames[lower] ?? manifest.folder))
        },
      } satisfies IconTheme
    },
  )
  return theme
}
