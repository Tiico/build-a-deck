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
// What a picture in the book may point at: one of the project's own assets, named by the hash of
// its bytes. The same shape the rows and the icon set use (E1), written here because the schema is
// what validates on the way in and the type is inferred from it.
export const RuleImageAsset = z.string().regex(/^asset:[0-9a-f]{64}$/, 'a picture in the book lives in the project’s own assets')

// The page the book is printed on, and the margins the fold and the knife ask for. It stands here
// and not in the printer, although the printer is what writes the `@page` rule out of it: the
// measurement below is what needs the page, and a figure has to be measured against the page it is
// actually printed on rather than against a number somebody wrote down twice and has to keep in
// step by hand. `packages/server/src/booklet.ts` reads these and adds nothing of its own.
export const BOOKLET_PAGE_MM = { w: 148, h: 210 }
export const BOOKLET_MARGIN_MM = { block: 14, inline: 15 }

// How big a picture in the book may be drawn (#173, decided 2026-09-17). The book is read at a
// table, on a phone and in a printed A5 booklet, and A5 is the narrowest of the three — so A5 sets
// the size and the other two draw the same picture inside the same frame.
//
// The width is the text column, derived rather than written: the page less its two side margins.
//
// The height is two thirds of the type area, and it is the one measure here that was not already
// in the code. Half the column's height, around 90 mm, was offered and declined: at 120 mm a
// figure *and its caption* still share a page with the text they belong to, and what the ceiling
// is for is precisely that a figure never becomes a lone picture page the reader turns past
// without knowing it answers the paragraph before it. (The caption half of that argument only
// exists because the block has a caption of its own — see `RuleBlock` below.)
//
// The same frame is given in `em` of the book's own type, because a screen has no millimetres it
// can be held to: what carries across is the picture's size relative to the words beside it.
const BOOKLET_PT = 10.5
const MM_PER_EM = (BOOKLET_PT * 25.4) / 72
const round = (n: number): number => Math.round(n * 10) / 10
const COLUMN_MM = BOOKLET_PAGE_MM.w - 2 * BOOKLET_MARGIN_MM.inline
const CEILING_MM = 120
export const RULE_IMAGE_FRAME = { wMm: COLUMN_MM, hMm: CEILING_MM, wEm: round(COLUMN_MM / MM_PER_EM), hEm: round(CEILING_MM / MM_PER_EM) }
// Millimetres as the book's own type reads them, which is what a screen can be held to.
export const ruleEm = (mm: number): number => round(mm / MM_PER_EM)
// The resolution the press asks for. A picture is never enlarged past its own pixels at it: a
// 700 px sketch pulled out to the full column would be printed at 150 DPI and be porridge in the
// hand, while on a screen it would have looked well right up to delivery. Rather a small sharp
// figure than a large soft one — so a picture smaller than the column stands in its own size.
export const RULE_IMAGE_DPI = 300
const MM_PER_INCH = 25.4

// Which of the three bounds the figure came to rest against, so a surface can say why it is the
// size it is without doing the arithmetic a second time.
export type RuleImageFit = 'column' | 'height' | 'own'

// The figure's box in millimetres, in the order the bounds apply: never wider than the column,
// never larger than its own pixels at 300 DPI, and never taller than the ceiling. A picture too
// tall narrows to fit and is never cropped — a cropped setup picture is a setup picture that lies
// — which is why the last step scales both sides by the same factor.
export function imageBoxMm(px: { w: number; h: number }): { w: number; h: number; fit: RuleImageFit } {
  const own = (px.w * MM_PER_INCH) / RULE_IMAGE_DPI
  let fit: RuleImageFit = own < RULE_IMAGE_FRAME.wMm ? 'own' : 'column'
  let w = Math.min(RULE_IMAGE_FRAME.wMm, own)
  let h = (w * px.h) / px.w
  if (h > RULE_IMAGE_FRAME.hMm) {
    h = RULE_IMAGE_FRAME.hMm
    w = (h * px.w) / px.h
    fit = 'height'
  }
  return { w, h, fit }
}

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
  // A picture the designer drew somewhere else (#173, decided 2026-09-17). It lives in the
  // project's own assets, content-addressed as `asset:<hash>` — the road a card's own image
  // already takes (E1) — and never as an address pointing out of the project: the book is
  // versioned with the cards (B4, B7), so the picture has to travel in the same history.
  // The reference is 64 hex characters and nothing else, so the block cannot hold a `javascript:`,
  // a `data:` or a host at all; there is no address here for an untrusted file to smuggle one in.
  // `alt` empty is the decision of 2026-09-17: a picture whose Markdown carried no alt text comes
  // in anyway and is marked decorative, hidden from a screen reader. It is the one point where
  // B7 weighs against L12, and the import report is what keeps it from being silent.
  //
  // `caption` is a second field and not the same one worn twice (decided 2026-09-17). Alt text and
  // a caption are written for two different readers and go bad by swapping places: alt replaces
  // the picture for whoever cannot see it and is exhaustive, a caption is read beside the picture
  // by somebody who already sees it and comments on it. The caption is printed and costs type
  // area; the alt text is neither printed nor paid for. And decisively: if the alt text doubled as
  // the caption, a decorative picture — one that says nothing on purpose — could no longer be told
  // apart from a picture that merely has no caption, and the counting of pictures without alt text
  // collapses with it, which is the whole road back to an accessible book. `setup` already carries
  // a `caption`, so there is a shape to inherit rather than invent.
  //
  // The price is written out and accepted: an imported book has no captions at all until somebody
  // writes them. Markdown's alt text is the alt text and is never copied into the caption.
  //
  // `px` is the file's own size in pixels, and it is on the block rather than fetched because the
  // measurement above has to be arrived at without I/O: the editor, the table, the phone and the
  // press all reach the same millimetres out of the same document. A picture whose pixels are
  // unknown is a picture the press would have to guess at, so there is no such block.
  z.object({
    kind: z.literal('image'),
    id: z.string().min(1),
    asset: RuleImageAsset,
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
  // The picture reaches every surface as the reference it is; whoever draws it knows where the
  // project's assets are served from and resolves it there, exactly as a card's image is resolved.
  // A picture arrives measured (#173): the millimetres are worked out once, here, and a surface
  // does nothing with them but scale them by its own reading of the column.
  | { kind: 'image'; id: string; asset: string; alt: string; caption?: string | undefined; px: { w: number; h: number }; mm: { w: number; h: number }; fit: RuleImageFit }
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
      // What a picture says is its alt text, and a decorative one says nothing — which is the
      // whole of what "decorative" means (#173): it is not in the book's text either. The caption
      // is the reader's own line, printed and read beside the picture, so it is in the book's text
      // whether or not anything was said about the picture itself.
      case 'image': {
        if (block.alt) lines.push(block.alt)
        if (block.caption) lines.push(block.caption)
        const { w, h, fit } = imageBoxMm(block.px)
        return { ...block, mm: { w, h }, fit }
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
