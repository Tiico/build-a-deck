import type { RuleBlock, RuleDoc } from './rules.js'

// The import (#131): a Markdown file a designer wrote somewhere else, read into the kinds of block
// the book has. The map is the product owner's and every line of it is a decision, so it is
// written out here rather than inferred from a library's idea of what Markdown means.
//
// The rule behind the map is that nothing disappears silently. What cannot become a block becomes
// plain text — a table, a fenced block, a quote — and what genuinely does not come in is counted,
// so the report shown *before* the import can say so. Nothing here can produce markup: every
// construction ends as a string in a block, and a string is text all the way to the page. A
// picture is the one thing that is not a string, and it is not an address either: it is a
// reference to one of the project's own assets, 64 hex characters that no file can smuggle
// anything into (#173).
export type RuleImportKind =
  // What became a block. A picture is one of them since #173: it comes in as the book's fifth kind
  // of block rather than standing in the report as "not yet".
  | 'heading'
  | 'text'
  | 'list'
  | 'ref'
  | 'image'
  // What changed shape on the way in, `title` being the file's own title, which the book already
  // has one of (#191).
  | 'title'
  | 'folded'
  | 'quote'
  | 'table'
  | 'code'
  | 'link'
  | 'break'
  // How many of the pictures came in without alt text and are therefore decorative — `alt=""`,
  // hidden from a screen reader (#173, decided 2026-09-17). The count is the whole of what keeps
  // that decision from being silent: in a rulebook a picture is almost never decorative, so
  // whoever wants to write the alt texts has to be able to see from the report that there are some.
  | 'decorative'
export type RuleImportNote = { of: RuleImportKind; n: number }
// Why a picture the file points at could not be taken in (#173). Nothing disappears silently
// (#131): the line stays in the report with the reason, and the book is made without the picture.
export type RuleImageProblem = 'missing' | 'too-big' | 'wrong-format' | 'broken'
export type RuleImportProblem = { file: string; why: RuleImageProblem }
// What the caller found behind an address. Reading a file, checking it and putting it in the
// project's assets is the surface's work and needs a network; the map from file to block is this
// module's, and stays framework-free and synchronous — so the two meet here, in a map.
export type RuleImage = { asset: string } | { why: RuleImageProblem }
export type RuleImages = Record<string, RuleImage>
export type RuleImport = { doc: RuleDoc; notes: RuleImportNote[]; problems: RuleImportProblem[] }

// The order the report reads in, which is the argument it makes: what became a block, what changed
// shape on the way, and what came in saying less about itself than it could have. The file's own
// title heads the middle group, because it is the first line of the file and the first thing the
// import did.
const ORDER: readonly RuleImportKind[] = ['heading', 'text', 'list', 'ref', 'image', 'title', 'folded', 'quote', 'table', 'code', 'link', 'break', 'decorative']

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
const INSIDE = '(?:[^()]|\\([^()]*\\))*'
// A picture carries the two things the book needs of it: the words it says about itself, and the
// file it names. Both are read here and nowhere else.
const IMAGE = new RegExp(`!\\[([^\\]]*)\\]\\((${INSIDE})\\)`, 'g')
const LINK = new RegExp(`\\[([^\\]]+)\\]\\(${INSIDE}\\)`, 'g')
// What a book written by hand already writes (B7). It is kept exactly as it stands: the renderer
// is what makes it the name the thing has right now, and the import decides nothing about it.
const REF = /\[\[(?:zon|kort):[\p{L}\p{N}_:-]+\]\]/gu

// The addresses the file points a picture at, in the order they stand and once each. It is read
// before the book is made, because the bytes behind them have to be fetched, checked and stored
// before there is anything for a block to point at.
export function imagesIn(markdown: string): string[] {
  const found: string[] = []
  for (const [, , address] of markdown.matchAll(IMAGE)) {
    const file = addressOf(address ?? '')
    if (file && !found.includes(file)) found.push(file)
  }
  return found
}

export function importRules(markdown: string, title: string, images: RuleImages = {}): RuleImport {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: RuleBlock[] = []
  const problems: RuleImportProblem[] = []
  // The pictures found on the lines of the block being built. A picture is a block of its own, so
  // it cannot stand inside a paragraph: it is laid down after the passage it was written in, which
  // for the ordinary case — a picture on a line of its own — is exactly where it stood.
  let pending: { asset: string; alt: string }[] = []
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
    if (written.length > 0) {
      count('text')
      blocks.push({ kind: 'text', id: id(), text: written.join('\n\n') })
    }
    laid()
  }
  // The pictures of the passage just written, laid down under it.
  const laid = () => {
    for (const picture of pending) {
      count('image')
      if (picture.alt === '') count('decorative')
      blocks.push({ kind: 'image', id: id(), asset: picture.asset, alt: picture.alt })
    }
    pending = []
  }
  // What a line of prose keeps of itself. A picture leaves the line and becomes a block of its
  // own (#173): it is the fifth kind of block, and what it points at is one of the project's own
  // assets — never the address the file wrote, because the book is versioned with the cards (B4)
  // and an address out of the project does not travel with it. A link keeps the words it was
  // written with and loses the address, because the book is read at a table, on a phone and in a
  // printed booklet, where no address can be followed. Code is never read this way: there, what
  // was written is the whole of what it means.
  const inline = (line: string): string => {
    count('ref', (line.match(REF) ?? []).length)
    let took = false
    for (const [, alt, address] of line.matchAll(IMAGE)) {
      took = true
      const file = addressOf(address ?? '')
      const found = images[file]
      if (found && 'asset' in found) pending.push({ asset: found.asset, alt: (alt ?? '').trim() })
      // One picture is one line of the report, however often the file names it.
      else if (!problems.some((problem) => problem.file === file)) problems.push({ file, why: found?.why ?? 'missing' })
    }
    const prose = line.replace(IMAGE, '')
    count('link', (prose.match(LINK) ?? []).length)
    const words = prose.replace(LINK, (_whole, own: string) => own)
    // A picture lifted out of a sentence leaves the space on either side of it behind; a line that
    // never held one is left exactly as it was written.
    return (took ? words.replace(/[ \t]{2,}/g, ' ') : words).trim()
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
      laid()
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
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && ordinary(peek(i))) {
      paragraph.push(inline(peek(i)))
      i++
    }
    text([paragraph.filter((l) => l.length > 0).join('\n')])
  }
  return { doc: { title, blocks }, notes: ORDER.flatMap((of) => made(of, tally.get(of))), problems }
}

// The address as the file wrote it, read down to the file it names: CommonMark allows it to stand
// in angle brackets and to carry a title after it, and neither is part of the name.
const addressOf = (raw: string): string =>
  raw
    .trim()
    .replace(/\s+(?:"[^"]*"|'[^']*'|\([^()]*\))$/, '')
    .replace(/^<(.*)>$/, '$1')
    .trim()

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
