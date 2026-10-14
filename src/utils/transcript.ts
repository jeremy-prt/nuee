import type { ChatItem } from '@/stores/conversations'

// Texte de l'agent depuis le tour précédent jusqu'à `end` (exclu) : sa réponse au tour qui finit là.
export function turnText(items: readonly ChatItem[], end: number) {
  const parts: string[] = []
  for (let i = end - 1; i >= 0; i--) {
    const item = items[i]
    if (!item || item.kind === 'user' || item.kind === 'end') break
    if (item.kind === 'text') parts.unshift(item.text)
  }
  return parts.join('\n\n')
}

// Conversation en Markdown : messages de l'utilisateur et réponses de l'agent, sans les outils.
export function transcriptMarkdown(items: readonly ChatItem[], names: { user: string; agent: string }) {
  const blocks: string[] = []
  let speaker: 'user' | 'agent' | null = null
  for (const item of items) {
    if (item.kind === 'user') {
      const files = item.attachments?.map((attachment) => `[${attachment.name}]`).join(' ')
      blocks.push(`## ${names.user}`, [files, item.text].filter(Boolean).join('\n\n'))
      speaker = 'user'
    } else if (item.kind === 'text' && item.text.trim()) {
      if (speaker !== 'agent') blocks.push(`## ${names.agent}`)
      blocks.push(item.text.trim())
      speaker = 'agent'
    }
  }
  return blocks.join('\n\n')
}
