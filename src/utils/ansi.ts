export interface AnsiSpan {
  text: string
  color: string | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
}

type Style = Omit<AnsiSpan, 'text'>

const PLAIN: Style = { color: null, bold: false, dim: false, italic: false, underline: false }
const CUBE = [0, 95, 135, 175, 215, 255]

function color256(n: number, palette: readonly string[]) {
  if (n < 16) return palette[n] ?? null
  if (n > 255) return null
  if (n >= 232) {
    const gray = 8 + (n - 232) * 10
    return `rgb(${gray}, ${gray}, ${gray})`
  }
  const index = n - 16
  return `rgb(${CUBE[Math.floor(index / 36)]}, ${CUBE[Math.floor(index / 6) % 6]}, ${CUBE[index % 6]})`
}

// Couleurs de texte (16, 256, 24 bits) et gras, atténué, italique, souligné ; le fond et l'inversion sont ignorés.
function sgr(style: Style, params: number[], palette: readonly string[]): Style {
  const next = { ...style }
  for (let i = 0; i < params.length; i++) {
    const code = params[i]!
    if (code === 0) Object.assign(next, PLAIN)
    else if (code === 1) next.bold = true
    else if (code === 2) next.dim = true
    else if (code === 3) next.italic = true
    else if (code === 4) next.underline = true
    else if (code === 22) next.bold = next.dim = false
    else if (code === 23) next.italic = false
    else if (code === 24) next.underline = false
    else if (code >= 30 && code <= 37) next.color = palette[code - 30] ?? null
    else if (code >= 90 && code <= 97) next.color = palette[code - 90 + 8] ?? null
    else if (code === 39) next.color = null
    else if (code === 38 || code === 48) {
      const mode = params[i + 1]
      const value =
        mode === 5 ? color256(params[i + 2] ?? 0, palette) : mode === 2 ? `rgb(${params[i + 2] ?? 0}, ${params[i + 3] ?? 0}, ${params[i + 4] ?? 0})` : null
      if (code === 38) next.color = value
      i += mode === 5 ? 2 : mode === 2 ? 4 : 0
    }
  }
  return next
}

// Sortie d'un pty en morceaux de texte stylés, jamais en HTML. Les déplacements du curseur sont retirés ; un retour
// chariot seul repart du début de la ligne (barres de progression), effacée plutôt que réécrite caractère par caractère.
export function parseAnsi(input: string, palette: readonly string[]): AnsiSpan[] {
  const done: AnsiSpan[] = []
  let line: AnsiSpan[] = []
  let style = PLAIN
  let text = ''

  const cut = () => {
    if (!text) return
    const last = line[line.length - 1]
    const same = last && last.color === style.color && last.bold === style.bold && last.dim === style.dim && last.italic === style.italic && last.underline === style.underline
    if (same) last.text += text
    else line.push({ ...style, text })
    text = ''
  }
  const endLine = () => {
    cut()
    done.push(...line, { ...PLAIN, text: '\n' })
    line = []
  }

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!
    if (char === '\n') endLine()
    else if (char === '\r') {
      if (input[i + 1] === '\n') continue
      text = ''
      line = []
    } else if (char === '\b') {
      if (text) text = text.slice(0, -1)
      else {
        const last = line[line.length - 1]
        if (last) last.text = last.text.slice(0, -1)
      }
    } else if (char === '\x1b') {
      const kind = input[i + 1]
      if (kind === '[') {
        let end = i + 2
        while (end < input.length && !/[\x40-\x7e]/.test(input[end]!)) end++
        if (end >= input.length) break
        const body = input.slice(i + 2, end)
        if (input[end] === 'm') {
          cut()
          const params = body.split(/[;:]/).map((part) => (part === '' ? 0 : Number(part)))
          style = sgr(style, params.some(Number.isNaN) ? [] : params, palette)
        } else if (input[end] === 'K' && body === '2') {
          text = ''
          line = []
        }
        i = end
      } else if (kind === ']') {
        const bell = input.indexOf('\x07', i)
        const st = input.indexOf('\x1b\\', i)
        const end = bell === -1 ? st : st === -1 ? bell : Math.min(bell, st)
        if (end === -1) break
        i = end === st ? end + 1 : end
      } else i += kind && '()#%'.includes(kind) ? 2 : 1
    } else if (char === '\t' || (char >= ' ' && char !== '\x7f')) text += char
  }
  cut()
  done.push(...line)
  return done
}
