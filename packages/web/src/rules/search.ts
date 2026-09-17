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
      // A picture says its alt text, and a decorative one says nothing at all (#173); beside it
      // stands the caption, which is the designer's own line and is read by everyone. Either way
      // the reading has to move by exactly what the picture put in the book's plain text, or every
      // passage after it would answer under the wrong words.
      case 'image':
        if (block.alt) line++
        if (block.caption) line++
        break
    }
  }
  return hits
}
