// Recherche tolérante, sans dépendance : casse et accents ignorés, chaque mot cherché doit se retrouver
// dans un champ (mot entier, début de mot, milieu de mot), ou à une faute près (deux dès 8 lettres).

export interface SearchField {
  text: string
  words: string[]
  // Pénalité ajoutée au score : 0 pour le libellé, plus pour les champs secondaires.
  weight: number
}

export function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function searchField(text: string, weight: number): SearchField {
  const normalized = normalize(text)
  return { text: normalized, words: normalized.split(' '), weight }
}

// Distance de Damerau-Levenshtein restreinte : une inversion de deux lettres compte pour une faute.
function distance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) rows[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2]![j - 2]! + 1)
      rows[i]![j] = value
    }
  }
  return rows[a.length]![b.length]!
}

// Contre le mot entier ou son début : « notifcat » doit trouver « notifications » avant la fin de la frappe.
function nearWord(token: string, word: string, allowed: number) {
  if (Math.abs(word.length - token.length) <= allowed && distance(token, word) <= allowed) return true
  for (const length of [token.length - 1, token.length, token.length + 1]) {
    if (length < word.length && distance(token, word.slice(0, length)) <= allowed) return true
  }
  return false
}

function tokenScore(token: string, field: SearchField) {
  if (field.words.includes(token)) return 0
  if (field.words.some((word) => word.startsWith(token))) return 1
  // Milieu de mot : trop de bruit sous 4 lettres, sauf pour les écritures sans espaces (japonais, chinois).
  if ((token.length >= 4 || !/^[a-z0-9]+$/.test(token)) && field.text.includes(token)) return 2
  const allowed = token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0
  if (allowed && field.words.some((word) => nearWord(token, word, allowed))) return 3 + allowed
  return null
}

// Score d'une entrée (plus bas = meilleur), null si un mot cherché ne se retrouve nulle part.
export function matchScore(query: string, fields: SearchField[]) {
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (!tokens.length) return null
  let total = 0
  for (const token of tokens) {
    let best = Infinity
    for (const field of fields) {
      const score = tokenScore(token, field)
      if (score !== null) best = Math.min(best, score + field.weight)
    }
    if (best === Infinity) return null
    total += best
  }
  return total
}
