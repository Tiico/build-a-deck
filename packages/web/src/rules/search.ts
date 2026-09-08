import type { RenderedRules } from '@byd/template'

// Looking a rule up mid-game (B7): what a player wants at the table is one rule, not the book.
// The search reads the rendered text — the names the reader sees, never the ids behind them —
// and answers with the passages that mention the word, each under the heading it stands beneath.
// A list is one passage: its steps make no sense split apart.
export type Hit = { id: string; block: string; heading: string; text: string }

export function findRules(rules: RenderedRules, query: string): Hit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const lines = rules.text.split('\n')
  const hits: Hit[] = []
  let heading = rules.title
  let line = 0
  for (const block of rules.blocks) {
    switch (block.kind) {
      case 'heading':
        heading = block.text
        line++
        break
      case 'text':
        for (let i = 0; i < block.paragraphs.length; i++) {
          const text = lines[line++] ?? ''
          if (text.toLowerCase().includes(q)) hits.push({ id: `${block.id}:${i}`, block: block.id, heading, text })
        }
        break
      case 'list': {
        const steps = block.items.map(() => lines[line++] ?? '')
        if (steps.some((s) => s.toLowerCase().includes(q))) hits.push({ id: block.id, block: block.id, heading, text: steps.join('\n') })
        break
      }
      case 'setup':
        if (block.caption) line++
        break
    }
  }
  return hits
}
