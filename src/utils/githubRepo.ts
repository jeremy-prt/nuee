const SEGMENT = /^(?![-.])[A-Za-z0-9._-]+$/

// `propriétaire/nom` depuis ce qu'on colle (owner/repo, adresse https, ssh, page du dépôt) ; même règle que
// `parse_repo` côté Rust, qui a le dernier mot.
export function parseRepo(input: string) {
  const text = input.trim()
  const path =
    text.match(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)(.*)$/)?.[1] ??
    text.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/)?.[1] ??
    null
  const parts = (path ?? text).replace(/\/+$/, '').split('/')
  if (parts.length < 2 || (path === null && parts.length > 2)) return null
  const owner = parts[0]!
  const repo = parts[1]!.replace(/\.git$/, '')
  return SEGMENT.test(owner) && SEGMENT.test(repo) ? `${owner}/${repo}` : null
}

export function repoFolder(name: string) {
  return name.split('/').pop() ?? name
}

// Adresse git hors GitHub (https, ssh, git, `utilisateur@hôte:chemin`) ; même règle que `parse_git_url` côté Rust.
export function parseGitUrl(input: string) {
  const url = input.trim()
  if (!url || url.startsWith('-') || /\s/.test(url)) return null
  const rest = url.match(/^(?:https?|ssh|git):\/\/(.*)$/)?.[1]
  const valid = rest !== undefined ? /^[^/]+\/.+/.test(rest) : /^[^/:]*@[^/:]+:.+/.test(url)
  return valid ? url : null
}

// Nom de dossier tiré d'une adresse git : son dernier segment, sans `.git`.
export function urlFolder(url: string) {
  return url.replace(/\/+$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '') ?? ''
}
