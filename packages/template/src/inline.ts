// The inline syntax of card text (L2): **bold**, *italic*, {icon}, and a blank line between
// paragraphs. Nothing else. The parser is small on purpose and can never produce HTML —
// it produces a tree the compiler renders and the validator measures.
//
// The rulebook (B7) asks for one construction more: [[zon:id]] and [[kort:id]], which stand for
// what the thing is called right now. Card text never asks for it, so L2's four constructions
// are still all a card has.

export type InlineNode =
  | { type: 'text'; text: string }
  // A symbol, and — when the deck has given it one — the meaning it is written in (E4). The
  // role is written and not the colour, so the palette is one place rather than forty cells.
  | { type: 'icon'; name: string; role?: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'ref'; of: 'zone' | 'card'; id: string }

export type Paragraph = { type: 'paragraph'; children: InlineNode[] }
// A bullet list, the one construction a card body has that a rulebook paragraph does not (#308).
// It holds its items and nothing else: no nesting, no numbering, no marker of its own — what the
// bullet looks like is the renderer's, in the element's own font and size.
export type BulletList = { type: 'list'; items: InlineNode[][] }
export type BodyBlock = Paragraph | BulletList
export type InlineOptions = { refs?: boolean }

export function parseInline(text: string, options: InlineOptions = {}): Paragraph[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p.length > 0)
    .map((p) => ({ type: 'paragraph', children: parseSpan(p, options) }))
}

// A line that opens a bullet item: a hyphen and a space, and nothing else. `*` is not offered as
// a bullet because a line may legitimately open with emphasis, and a subset that cannot be read
// twice the same way is no subset.
const BULLET = /^[ \t]*-[ \t]+(.*)$/

// The card body read as blocks (#308): paragraphs separated by a blank line, and runs of `- `
// lines as lists. The rulebook keeps `parseInline`, because a list is already one of its own kinds
// of block and a text block of its must not quietly turn into one.
//
// Like everything else here this produces a tree and never markup: a `<b>` a designer typed is
// text in a text node, and the renderer escapes it.
export function parseBody(text: string, options: InlineOptions = {}): BodyBlock[] {
  const blocks: BodyBlock[] = []
  let lines: string[] = []
  let items: InlineNode[][] | null = null
  // A single newline inside a paragraph is a wrap and not a break — the same reading `parseInline`
  // has always given it.
  const closeParagraph = () => {
    const written = lines.join('\n').replace(/\s*\n\s*/g, ' ').trim()
    lines = []
    if (written.length > 0) blocks.push({ type: 'paragraph', children: parseSpan(written, options) })
  }
  // An item with nothing written on it is no item, and a list with no items is no list — the same
  // answer an empty paragraph gets.
  const closeList = () => {
    if (items && items.length > 0) blocks.push({ type: 'list', items })
    items = null
  }
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.exec(line)
    if (bullet) {
      closeParagraph()
      items ??= []
      const written = (bullet[1] ?? '').trim()
      if (written.length > 0) items.push(parseSpan(written, options))
      continue
    }
    closeList()
    if (line.trim().length === 0) closeParagraph()
    else lines.push(line)
  }
  closeParagraph()
  closeList()
  return blocks
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
      const inside = end > i + 1 ? s.slice(i + 1, end).trim() : ''
      // `{namn}` and `{namn|roll}`. A bar with nothing usable after it makes the whole thing
      // text rather than a symbol wearing a strange role — the same answer a bad name gets.
      const bar = inside.indexOf('|')
      const [name, role] = bar < 0 ? [inside, ''] : [inside.slice(0, bar).trim(), inside.slice(bar + 1).trim()]
      if (name && NAME.test(name) && (bar < 0 || NAME.test(role))) {
        flush()
        out.push(role ? { type: 'icon', name, role } : { type: 'icon', name })
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

// What a symbol and a role may be called: the letters a name is made of, and nothing else.
const NAME = /^[\p{L}\p{N}_-]+$/u

// A reference names one of two kinds of thing, by the id it has in the project.
const REF = /^(zon|kort):([\p{L}\p{N}_:-]+)$/u
