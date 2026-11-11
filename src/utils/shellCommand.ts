const SHELLS = new Set(['bash', 'sh', 'zsh', 'shell', 'console'])

// Contrôles (hors saut de ligne et tabulation) et caractères invisibles de mise en forme (bidi, largeur nulle) :
// le texte lancé ne serait pas celui qu'on lit.
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\p{Cf}]/u

// Une ligne coupée de son commentaire, et le guillemet resté ouvert à sa fin.
function scan(line: string, open: string | null) {
  let quote = open
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (char === '\\' && quote !== "'") i++
    else if (quote) {
      if (char === quote) quote = null
    } else if (char === "'" || char === '"') quote = char
    else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]!))) return { code: line.slice(0, i).trimEnd(), quote }
  }
  return { code: line, quote }
}

// Texte à lancer quand un bloc shell tient en une seule commande : une ligne, ou une commande continuée par `\`,
// un heredoc, un pipeline ou des guillemets sur plusieurs lignes. Sinon null : plusieurs commandes, sortie mêlée
// à l'invite `$ `, commande inachevée.
export function runnableCommand(lang: string | undefined, code: string): string | null {
  if (!SHELLS.has(lang?.trim().split(/\s/)[0]?.toLowerCase() ?? '')) return null
  if (HIDDEN.test(code)) return null
  const lines = code.replace(/\s+$/, '').split('\n')
  if (lines[0]?.startsWith('$ ')) lines[0] = lines[0].slice(2)

  let commands = 0
  let continued = false
  let quote: string | null = null
  let heredoc: { tag: string; tabs: boolean } | null = null
  for (const raw of lines) {
    if (heredoc) {
      if ((heredoc.tabs ? raw.replace(/^\t+/, '') : raw) === heredoc.tag) heredoc = null
      continue
    }
    if (quote) {
      quote = scan(raw, quote).quote
      continued = !!quote || /(\\|\||&&)$/.test(raw.trimEnd())
      continue
    }
    const line = raw.trim()
    if (!continued && (!line || line.startsWith('#'))) continue
    if (!continued && !/^(\||&&)/.test(line)) commands++
    if (commands > 1) return null
    const scanned = scan(line, null)
    quote = scanned.quote
    const tag = scanned.code.match(/<<(-?)\s*(['"]?)([\w.-]+)\2/)
    if (tag) heredoc = { tag: tag[3]!, tabs: tag[1] === '-' }
    continued = !!quote || /(\\|\||&&)$/.test(scanned.code)
  }
  if (commands !== 1 || continued || quote || heredoc) return null
  return lines.join('\n')
}
