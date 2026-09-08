// The inline syntax of card text (L2): **bold**, *italic*, {icon}, and a blank line between
// paragraphs. Nothing else. The parser is small on purpose and can never produce HTML —
// it produces a tree the compiler renders and the validator measures.
//
// The rulebook (B7) asks for one construction more: [[zon:id]] and [[kort:id]], which stand for
// what the thing is called right now. Card text never asks for it, so L2's four constructions
// are still all a card has.

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'icon'; name: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'ref'; of: 'zone' | 'card'; id: string }

export type Paragraph = { type: 'paragraph'; children: InlineNode[] }
export type InlineOptions = { refs?: boolean }

export function parseInline(text: string, options: InlineOptions = {}): Paragraph[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p.length > 0)
    .map((p) => ({ type: 'paragraph', children: parseSpan(p, options) }))
}

// Recursive descent over one paragraph. Emphasis markers must close; an unclosed marker is text.
function parseSpan(s: string, options: InlineOptions = {}): InlineNode[] {
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
        out.push({ type: 'bold', children: parseSpan(s.slice(i + 2, end), options) })
        i = end + 2
        continue
      }
    }
    if (s[i] === '*' && !s.startsWith('**', i)) {
      const end = s.indexOf('*', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ type: 'italic', children: parseSpan(s.slice(i + 1, end), options) })
        i = end + 1
        continue
      }
    }
    if (options.refs && s.startsWith('[[', i)) {
      const end = s.indexOf(']]', i + 2)
      const ref = end > i + 2 ? REF.exec(s.slice(i + 2, end)) : null
      if (ref) {
        flush()
        out.push({ type: 'ref', of: ref[1] === 'zon' ? 'zone' : 'card', id: ref[2] ?? '' })
        i = end + 2
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

// A reference names one of two kinds of thing, by the id it has in the project.
const REF = /^(zon|kort):([\p{L}\p{N}_:-]+)$/u
