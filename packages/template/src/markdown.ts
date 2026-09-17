import type { RuleBlock, RuleDoc } from './rules.js'

// The import (#131): a Markdown file a designer wrote somewhere else, read into the kinds of block
// the book has. The map is the product owner's and every line of it is a decision, so it is
// written out here rather than inferred from a library's idea of what Markdown means.
//
// The rule behind the map is that nothing disappears silently. What cannot become a block becomes
// plain text — a table, a fenced block, a quote — and what genuinely does not come in is counted,
// so the report shown *before* the import can say so. A picture is the one thing here that is not
// finished by reading the file: see `RuleImagePick`. Nothing here can produce markup: every
// construction ends as a string in a block, and a string is text all the way to the page.
export type RuleImportKind =
  // What became a block.
  | 'heading'
  | 'text'
  | 'list'
  | 'ref'
  // What changed shape on the way in, `title` being the file's own title, which the book already
  // has one of (#191).
  | 'title'
  | 'folded'
  | 'quote'
  | 'table'
  | 'code'
  | 'link'
  | 'break'
export type RuleImportNote = { of: RuleImportKind; n: number }

// A picture the file names, as something still to be fetched (#173).
//
// It is deliberately not a block. The file writes an address, and an address is the one thing a
// rulebook may never hold: the book is versioned with the cards (B4, B7), so a figure that lived
// at the end of a path would go missing on somebody else's schedule. The bytes are taken into the
// game's own assets beside the import, and the block is made out of what came back — which is also
// where a picture that cannot be taken in is answered for, rather than here.
//
// `after` is the block the picture stood under, so it goes back exactly where the file had it;
// `null` is a picture that opens the book. `alt` is null when the file wrote none, which is the
// decorative case and never a caption: the two are written for two readers (B7).
export type RuleImagePick = { id: string; after: string | null; alt: string | null; address: string }
export type RuleImport = { doc: RuleDoc; notes: RuleImportNote[]; images: RuleImagePick[] }

// The order the report reads in, which is the argument it makes: what became a block and what
// changed shape on the way. The file's own title heads the second group, because it is the first
// line of the file and the first thing the import did.
const ORDER: readonly RuleImportKind[] = ['heading', 'text', 'list', 'ref', 'title', 'folded', 'quote', 'table', 'code', 'link', 'break']

const HEADING = /^[ \t]*(#{1,6})[ \t]+(.*)$/
// A list item: a bullet, or a number the file counted with. Which of the two it is decides the
// list it belongs to, so a bulleted list under a numbered one is two lists and not one.
const ITEM = /^[ \t]*([-*]|\d+[.)])[ \t]+(.*)$/
const QUOTE = /^[ \t]*>[ \t]?(.*)$/
// A rule is three or more of the same mark on a line of its own. `---` under a line of text is
// Markdown's other way of writing a heading; that one is not read, and the line stays text.
const BREAK = /^[ \t]*([-*_])[ \t]*(?:\1[ \t]*){2,}$/
// A table row, and the ruled line under its head — the only line of a table that is drawing
// rather than content, and so the only one that does not become a line of the book.
const ROW = /^[ \t]*\|.*$/
const RULED = /^[ \t]*\|[ \t:|-]*$/
const FENCE = /^[ \t]*(```|~~~)/
// A picture is read before a link, because `![alt](fil)` is a link wearing a mark in front of it.
// The address may itself hold a pair of brackets — `javascript:alert(1)`, a footnote, a query —
// so one level of nesting is read. Without it the closing bracket is left standing in the prose,
// which is exactly the kind of quiet mess the rule behind the map exists to prevent.
const ADDRESS_BODY = '(?:[^()]|\\([^()]*\\))*'
const ADDRESS = `\\(${ADDRESS_BODY}\\)`
// The picture keeps both halves: its alt text becomes the book's alt text, and its address is what
// the bytes are looked up by (#173). A link keeps only its words.
const IMAGE = new RegExp(`!\\[([^\\]]*)\\]\\((${ADDRESS_BODY})\\)`, 'g')
const LINK = new RegExp(`\\[([^\\]]+)\\]${ADDRESS}`, 'g')
// What a book written by hand already writes (B7). It is kept exactly as it stands: the renderer
// is what makes it the name the thing has right now, and the import decides nothing about it.
const REF = /\[\[(?:zon|kort):[\p{L}\p{N}_:-]+\]\]/gu

export function importRules(markdown: string, title: string): RuleImport {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: RuleBlock[] = []
  const images: RuleImagePick[] = []
  // Pictures read out of the line being worked on, waiting for the block that line becomes. A
  // figure belongs under the paragraph that introduces it, so the address is not settled until the
  // block above it exists — and a picture standing on its own becomes the first thing after
  // whatever was last written, or the opening of the book when there is nothing above it at all.
  let pending: { alt: string | null; address: string }[] = []
  const settle = () => {
    for (const image of pending) images.push({ id: `i${images.length + 1}`, after: blocks[blocks.length - 1]?.id ?? null, ...image })
    pending = []
  }
  const tally = new Map<RuleImportKind, number>()
  const count = (of: RuleImportKind, n = 1) => {
    if (n > 0) tally.set(of, (tally.get(of) ?? 0) + n)
  }
  const id = () => `b${blocks.length + 1}`
  // A line of the book is a paragraph of its own: a single newline inside a text block is read as
  // a wrap, so lines meant to stand apart — a table's rows, a code block's lines — are written
  // apart. Nothing is added: a block with nothing left in it is no block.
  const text = (paragraphs: readonly string[]) => {
    const written = paragraphs.filter((p) => p.trim().length > 0)
    if (written.length === 0) return
    count('text')
    blocks.push({ kind: 'text', id: id(), text: written.join('\n\n') })
  }
  // What a line of prose keeps of itself, and what it hands on. A picture leaves the line and
  // becomes a figure of its own (#173) — it is a block and never words in a sentence. A link keeps
  // the words it was written with and loses the address, because the book is read at a table, on a
  // phone and in a printed booklet, where no address can be followed. Code is never read this way:
  // there, what was written is the whole of what it means.
  const inline = (line: string): string => {
    count('ref', (line.match(REF) ?? []).length)
    count('link', (line.replace(IMAGE, '').match(LINK) ?? []).length)
    return line
      .replace(IMAGE, (_whole, alt: string, address: string) => {
        pending.push({ alt: alt.trim() === '' ? null : alt.trim(), address: address.trim() })
        return ''
      })
      .replace(LINK, (_whole, words: string) => words)
      .trim()
  }

  let i = 0
  const peek = (at: number): string => lines[at] ?? ''
  // Which line the file actually opens with (#191). A blank line above the title is nothing a
  // reader can see, and an editor that leaves one there has not written a different file, so the
  // first line that says anything is the first line.
  const opening = lines.findIndex((l) => l.trim().length > 0)
  while (i < lines.length) {
    const line = peek(i)
    if (line.trim().length === 0 || BREAK.test(line)) {
      if (BREAK.test(line)) count('break')
      i++
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      const hashes = (heading[1] ?? '#').length
      // The file's own title (#191). A file written outside the app usually opens with the name of
      // the game, and read as a section it would give the book two titles, one above the other. The
      // line becomes nothing, and the book keeps the project's name: the name is something the
      // designer sets in one place, not something a file can overwrite behind her back, and an
      // import that renamed the game would do more than it was asked to — every time the same file
      // was handed over again. What it costs is that the file's own title is not what the book is
      // called, which is why the report says the line was taken out and why.
      if (i === opening && hashes === 1) {
        count('title')
        i++
        continue
      }
      // The book has two levels, and a file may have six. Folding is said out loud in the report
      // rather than done quietly, which is the whole of the rule behind the map.
      if (hashes > 2) count('folded')
      count('heading')
      blocks.push({ kind: 'heading', id: id(), level: hashes === 1 ? 1 : 2, text: (heading[2] ?? '').trim() })
      settle()
      i++
      continue
    }
    const bullet = ITEM.exec(line)
    if (bullet) {
      const ordered = numbered(bullet[1])
      const items: string[] = []
      for (let item = ITEM.exec(peek(i)); item && numbered(item[1]) === ordered; item = ITEM.exec(peek(i))) {
        items.push(inline(item[2] ?? ''))
        i++
      }
      count('list')
      blocks.push({ kind: 'list', id: id(), ...(ordered ? { ordered: true } : {}), items })
      settle()
      continue
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = []
      for (let q = QUOTE.exec(peek(i)); q; q = QUOTE.exec(peek(i))) {
        quoted.push(inline(q[1] ?? ''))
        i++
      }
      count('quote')
      text([quoted.filter((l) => l.length > 0).join('\n')])
      settle()
      continue
    }
    const fenced = FENCE.exec(line)
    if (fenced) {
      const fence = fenced[1] ?? '```'
      const code: string[] = []
      for (i++; i < lines.length && !peek(i).trimStart().startsWith(fence); i++) code.push(peek(i))
      i++
      count('code')
      text(code)
      settle()
      continue
    }
    if (ROW.test(line)) {
      const rows: string[] = []
      while (i < lines.length && ROW.test(peek(i))) {
        const row = peek(i)
        i++
        if (RULED.test(row)) continue
        rows.push(cellsOf(row).map(inline).join(' | '))
      }
      count('table')
      text(rows)
      settle()
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && ordinary(peek(i))) {
      paragraph.push(inline(peek(i)))
      i++
    }
    text([paragraph.filter((l) => l.length > 0).join('\n')])
    settle()
  }
  settle()
  return { doc: { title, blocks }, notes: ORDER.flatMap((of) => made(of, tally.get(of))), images }
}

const numbered = (marker: string | undefined): boolean => /\d/.test(marker ?? '')
const cellsOf = (row: string): string[] =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
const made = (of: RuleImportKind, n: number | undefined): RuleImportNote[] => (n ? [{ of, n }] : [])

// A line that is prose and nothing else: everything the map has an answer for ends the paragraph
// standing above it.
const ordinary = (line: string): boolean =>
  line.trim().length > 0 && !HEADING.test(line) && !ITEM.test(line) && !QUOTE.test(line) && !BREAK.test(line) && !ROW.test(line) && !FENCE.test(line)

// A picture that was taken in: what the game's assets answered with, against the pick it came from.
export type RuleImageTaken = { id: string; src: string; alt: string; px: { w: number; h: number } }

// The book with its pictures back in it (#173). It is a pure splice, so the same file gives the
// same book whichever surface asked for it, and a picture that could not be taken in is simply one
// this was never given — the book is made without it, and the reason for that is the report's
// business and never the reader's.
export function withRuleImages(doc: RuleDoc, picks: readonly RuleImagePick[], taken: readonly RuleImageTaken[]): RuleDoc {
  const made = new Map(taken.map((image) => [image.id, image]))
  const under = (id: string | null): RuleBlock[] =>
    picks
      .filter((pick) => pick.after === id)
      .flatMap((pick) => {
        const image = made.get(pick.id)
        return image ? [{ kind: 'image' as const, id: image.id, src: image.src, alt: image.alt, px: image.px }] : []
      })
  return { ...doc, blocks: [...under(null), ...doc.blocks.flatMap((block) => [block, ...under(block.id)])] }
}
