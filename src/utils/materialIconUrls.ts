// Adresses des SVG du thème Material, servis comme fichiers (jamais copiés dans le JS), par nom de fichier.
const files = import.meta.glob<string>('/node_modules/material-icon-theme/icons/*.svg', { query: '?no-inline', import: 'default', eager: true })

export const urls: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
)
