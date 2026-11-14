import { Channel, invoke } from '@tauri-apps/api/core'
import type { GithubDeviceCode } from '@/ipc/bindings/GithubDeviceCode'
import type { GithubStatus } from '@/ipc/bindings/GithubStatus'
import type { CloneProgress } from '@/ipc/bindings/CloneProgress'
import type { GithubRepo } from '@/ipc/bindings/GithubRepo'

// Version de gh et ses comptes, lus par `gh auth status` : aucun jeton ne traverse l'IPC.
export function githubStatus() {
  return invoke<GithubStatus>('github_status')
}

// `gh auth login --web` piloté par Rust : onCode reçoit le code à taper sur GitHub, la promesse se résout
// une fois le compte ajouté.
export function githubLogin(onCode: (code: GithubDeviceCode) => void) {
  return invoke<void>('github_login', { onCode: new Channel<GithubDeviceCode>(onCode) })
}

// Avatar public d'un compte github.com en `data:` ; null hors ligne ou pour un login inconnu.
export function githubAvatar(login: string) {
  return invoke<string | null>('github_avatar', { login })
}

// Rend ce compte actif dans gh, pour tous les terminaux ; renvoie l'état relu.
export function githubSwitch(host: string, login: string) {
  return invoke<GithubStatus>('github_switch', { host, login })
}

// Ouvre la page du code de la connexion en cours : l'adresse reste côté Rust.
export function githubLoginOpen() {
  return invoke<void>('github_login_open')
}

export function githubLoginCancel() {
  return invoke<void>('github_login_cancel')
}

// Dépôts accessibles au compte actif de gh (les siens, ses collaborations, ses organisations), du plus récent au plus ancien.
export function githubRepos() {
  return invoke<GithubRepo[]>('github_repos')
}

// `gh repo clone` dans `parent/name` ; rend le chemin créé. Annulé ou raté, le dossier est retiré.
export function githubClone(repo: string, parent: string, name: string, onProgress: (progress: CloneProgress) => void) {
  return invoke<string>('github_clone', { repo, parent, name, onProgress: new Channel<CloneProgress>(onProgress) })
}

export function githubCloneCancel() {
  return invoke<void>('github_clone_cancel')
}
