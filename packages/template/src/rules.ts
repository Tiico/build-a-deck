import { z } from 'zod'
import { parseInline, type InlineNode } from './inline.js'

// The rulebook (B7): a document that lives in the project, is versioned in the same history as
// the cards (B4) and locked into a session at start like everything else, and that knows the game
// it belongs to. A rule can name a zone or a card by id and never by name, so what it says follows
// what the thing is called — renaming the discard pile rewrites every rule that mentions it,
// because the rules never held the name in the first place.
// It is declared here and nowhere else (#183): the schema is what validates on the way in, and the
// type the renderer and the editor read is inferred from it, so a field cannot be added to one
// side and forgotten on the other.
export const RuleBlock = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), id: z.string().min(1), level: z.union([z.literal(1), z.literal(2)]), text: z.string() }),
  // `ask` is the question a template section carries until it is answered (#131). It is the
  // editor's affordance and never the reader's text: nothing renders it, so it reaches neither the
  // table's drawer nor the printed booklet, and it is gone the moment a character is written. The
  // book the reader meets is what was written, never what was asked.
  z.object({ kind: z.literal('text'), id: z.string().min(1), text: z.string(), ask: z.string().optional() }),
  z.object({ kind: z.literal('list'), id: z.string().min(1), items: z.array(z.string()), ordered: z.boolean().optional() }),
  // The setup picture is the zones themselves (B5's follow-on), not a drawing kept beside them.
  z.object({ kind: z.literal('setup'), id: z.string().min(1), caption: z.string().optional() }),
  // A picture (#173). `src` is one of the project's own assets and can be nothing else: the book
  // is versioned with the cards (B4, B7), so an address pointing out of the game would be a
  // rulebook whose figures go missing on their own schedule. It is the same `asset:<hash>` a card
  // image is, which is what makes one upload serve both.
  //
  // `alt` and `caption` are two fields because they are written for two readers. Alt replaces the
  // picture for whoever cannot see it and is therefore exhaustive; a caption is read *beside* the
  // picture by someone who already sees it and says what the picture does not. An empty `alt` is
  // HTML's own word for decorative, and it is what an image whose Markdown carried no alt text is
  // taken in as — see B7 for the accessibility cost that choice accepts.
  //
  // `px` is the file's own size, and it is on the block rather than fetched because the one
  // measurement below must be arrived at without I/O: the editor, the table, the phone and the
  // press all have to reach the same millimetres from the same document.
  z.object({
    kind: z.literal('image'),
    id: z.string().min(1),
    src: z.string().regex(/^asset:[0-9a-f]{64}$/),
    alt: z.string(),
    caption: z.string().optional(),
    px: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  }),
])
// Which file the book was imported from, and when (#131). It is text in the document and never a
// file handle: a handle belongs to one browser and one person, and the book has to travel with the
// project. This is what "import the same file again" reads.
export const RuleSource = z.object({ file: z.string().min(1), at: z.string().min(1) })
export const RuleDoc = z.object({ title: z.string(), blocks: z.array(RuleBlock), source: RuleSource.optional() })
export type RuleDoc = z.infer<typeof RuleDoc>
export type RuleBlock = RuleDoc['blocks'][number]

// The booklet's page, and the one measurement every surface scales (B7, #173).
//
// A rulebook is folded to A5, and the booklet's own `@page` keeps 14 mm above and below and 15 mm
// at the sides — `packages/server/src/booklet.ts` writes that rule out of these very numbers
// rather than repeating them, and the geometry stands here because the measurement that reads it
// is here. The type area is therefore 118 × 182 mm, and 118 mm is the book's column wherever it is
// read: the editor, the table's drawer and the phone scale the same millimetres, so what the
// designer sees on a screen is the share of the column the press will give her.
export const BOOKLET_PAGE_MM = { w: 148, h: 210 }
export const BOOKLET_MARGIN_MM = { block: 14, inline: 15 }
export const RULE_COLUMN_MM = BOOKLET_PAGE_MM.w - 2 * BOOKLET_MARGIN_MM.inline
// Two thirds of the type area's height, and the only measure here that was not already in the
// code. A figure allowed the whole type area becomes a page of its own, and a lone picture in the
// middle of a rulebook is a page the reader turns past without knowing it belongs to the paragraph
// before it; `break-inside: avoid` does not help, it moves the same problem one page on. At 120 mm
// a figure and its caption always share a page with text.
export const RULE_IMAGE_CEILING_MM = 120
// A picture is never enlarged past its own pixels at the resolution the press asks for. A 700 px
// sketch pulled out to the full column is printed at 150 DPI and is porridge in the hand, while on
// a screen it would look well right up to delivery. Rather a small sharp figure than a large soft.
export const RULE_IMAGE_DPI = 300
const MM_PER_INCH = 25.4

// Which of the three bounds the figure came to rest against, so a surface can say why it is the
// size it is without working the arithmetic out a second time.
export type RuleImageFit = 'column' | 'height' | 'own'

// The figure's box, in millimetres, in the order the bounds apply: never wider than the column,
// never taller than the ceiling, and never larger than its own pixels at 300 DPI. An image too
// tall for the page narrows to fit and is never cropped — a cropped setup picture is a setup
// picture that lies.
export function imageBoxMm(px: { w: number; h: number }): { w: number; h: number; fit: RuleImageFit } {
  const own = (px.w * MM_PER_INCH) / RULE_IMAGE_DPI
  let fit: RuleImageFit = own < RULE_COLUMN_MM ? 'own' : 'column'
  let w = Math.min(RULE_COLUMN_MM, own)
  let h = (w * px.h) / px.w
  if (h > RULE_IMAGE_CEILING_MM) {
    h = RULE_IMAGE_CEILING_MM
    w = (h * px.w) / px.h
    fit = 'height'
  }
  return { w, h, fit }
}

// What the names of things are right now. The rulebook asks for them at render time; it never
// stores them.
export type Names = { zones: Record<string, string>; cards: Record<string, string> }
export type RuleWarning = { block: string; of: 'zone' | 'card'; id: string }

// What a rendered rule is made of. A reference arrives carrying the name it stands for, so
// whatever draws it — the editor, the table, the printed booklet — needs nothing but this.
export type RenderedNode =
  | { type: 'text'; text: string }
  | { type: 'icon'; name: string }
  | { type: 'bold'; children: RenderedNode[] }
  | { type: 'italic'; children: RenderedNode[] }
  | { type: 'ref'; of: 'zone' | 'card'; id: string; name: string | null }
export type RenderedParagraph = { children: RenderedNode[] }
export type RenderedBlock =
  | { kind: 'heading'; id: string; level: 1 | 2; text: string }
  | { kind: 'text'; id: string; paragraphs: RenderedParagraph[] }
  | { kind: 'list'; id: string; ordered: boolean; items: RenderedNode[][] }
  | { kind: 'setup'; id: string; caption?: string | undefined }
  // A picture arrives measured (#173): the millimetres are worked out once, here, and every
  // surface does nothing but scale them by its own pixels per millimetre.
  | { kind: 'image'; id: string; src: string; alt: string; caption?: string | undefined; px: { w: number; h: number }; mm: { w: number; h: number }; fit: RuleImageFit }
// `text` is the whole rulebook as plain text: what a search reads, and what a test can hold on to.
export type RenderedRules = { title: string; blocks: RenderedBlock[]; warnings: RuleWarning[]; text: string }

export function renderRules(doc: RuleDoc, names: Names): RenderedRules {
  const warnings: RuleWarning[] = []
  const lines: string[] = []
  const blocks: RenderedBlock[] = doc.blocks.map((block): RenderedBlock => {
    switch (block.kind) {
      case 'heading':
        lines.push(block.text)
        return block
      case 'text': {
        const parsed = parseInline(block.text, { refs: true })
        for (const p of parsed) lines.push(flatten(p.children, names, block.id, warnings))
        return { kind: 'text', id: block.id, paragraphs: parsed.map((p) => ({ children: resolve(p.children, names) })) }
      }
      case 'list': {
        const parsed = block.items.map((item) => parseInline(item, { refs: true }).flatMap((p) => p.children))
        parsed.forEach((children, i) => lines.push(`${block.ordered ? `${i + 1}. ` : '- '}${flatten(children, names, block.id, warnings)}`))
        return { kind: 'list', id: block.id, ordered: block.ordered ?? false, items: parsed.map((children) => resolve(children, names)) }
      }
      case 'setup':
        if (block.caption) lines.push(block.caption)
        return block
      // The caption is part of the book a search reads, because it is text the reader meets. The
      // alt text is not: it stands for the picture for whoever cannot see it, and a hit on a word
      // nobody can find on the page would be a hit on nothing (B7).
      case 'image': {
        if (block.caption) lines.push(block.caption)
        const { w, h, fit } = imageBoxMm(block.px)
        return { kind: 'image', id: block.id, src: block.src, alt: block.alt, ...(block.caption ? { caption: block.caption } : {}), px: block.px, mm: { w, h }, fit }
      }
    }
  })
  return { title: doc.title, blocks, warnings, text: lines.join('\n') }
}

// One line of the book, read on its own (#131). A rewritten paragraph is drawn sentence by
// sentence in the import's proposal, and a sentence has to keep everything the whole paragraph
// would have kept: emphasis is emphasis, and a reference still stands for the name the thing has.
export function renderLine(text: string, names: Names): RenderedNode[] {
  return resolve(
    parseInline(text, { refs: true }).flatMap((p) => p.children),
    names,
  )
}

// What a reference stands for right now. A rule that names something the game no longer has says
// so where it stands, rather than quietly saying nothing — the same choice as an unknown icon (L2).
export function nameOf(node: Extract<InlineNode, { type: 'ref' }>, names: Names): string | null {
  const table = node.of === 'zone' ? names.zones : names.cards
  return table[node.id] ?? null
}
export const refText = (node: Extract<InlineNode, { type: 'ref' }>): string => `[[${node.of === 'zone' ? 'zon' : 'kort'}:${node.id}]]`

// The parse tree with every reference carrying the name it stands for right now.
function resolve(nodes: readonly InlineNode[], names: Names): RenderedNode[] {
  return nodes.map((n): RenderedNode => {
    switch (n.type) {
      case 'bold':
      case 'italic':
        return { type: n.type, children: resolve(n.children, names) }
      case 'ref':
        return { type: 'ref', of: n.of, id: n.id, name: nameOf(n, names) }
      default:
        return n
    }
  })
}

function flatten(nodes: readonly InlineNode[], names: Names, block: string, warnings: RuleWarning[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return n.text
        case 'icon':
          return `{${n.name}}`
        case 'bold':
        case 'italic':
          return flatten(n.children, names, block, warnings)
        case 'ref': {
          const found = nameOf(n, names)
          if (found === null) {
            warnings.push({ block, of: n.of, id: n.id })
            return refText(n)
          }
          return found
        }
      }
    })
    .join('')
}
