// The inline syntax of card text (L2): **bold**, *italic*, {icon}, and a blank line between
// paragraphs. Nothing else. The parser is small on purpose and can never produce HTML —
// it produces a tree the compiler renders and the validator measures.

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'icon'; name: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }

export type Paragraph = { type: 'paragraph'; children: InlineNode[] }

export function parseInline(text: string): Paragraph[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p.length > 0)
    .map((p) => ({ type: 'paragraph', children: parseSpan(p) }))
}

// Recursive descent over one paragraph. Emphasis markers must close; an unclosed marker is text.
function parseSpan(s: string): InlineNode[] {
  const out: InlineNode[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ type: 'text', text: buf })
    buf = ''
  }
  let i = 0
  while (i < s.length) {
    if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2)
      if (end > i + 2) {
        flush()
        out.push({ type: 'bold', children: parseSpan(s.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }
    if (s[i] === '*' && !s.startsWith('**', i)) {
      const end = s.indexOf('*', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ type: 'italic', children: parseSpan(s.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    }
    if (s[i] === '{') {
      const end = s.indexOf('}', i + 1)
      const name = end > i + 1 ? s.slice(i + 1, end).trim() : ''
      if (name && /^[\p{L}\p{N}_-]+$/u.test(name)) {
        flush()
        out.push({ type: 'icon', name })
        i = end + 1
        continue
      }
    }
    buf += s[i]
    i++
  }
  flush()
  return out
}
