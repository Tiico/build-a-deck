import { BOOKLET_MARGIN_MM, BOOKLET_PAGE_MM, RULE_IMAGE_FRAME, type RenderedBlock, type RenderedNode, type RenderedRules } from '@byd/template'
import type { ProjectCredit } from './projects.js'

// The rulebook as a booklet for print (B7): the same rendering the editor and the table read,
// laid out as pages and handed to the one Chromium worker that renders everything else. A
// booklet is a document rather than a card, so it carries no `[data-card]` and its page size
// comes from `@page`, which Chromium honours exactly.
//
// Nothing a designer wrote reaches the renderer as markup: every string is escaped here.
export type BookletInput = {
  rules: RenderedRules
  // The project's icon set, already resolved to something a browser can draw.
  icons: Record<string, string>
  // The pictures the book holds (#173), keyed by the reference the blocks carry and resolved to
  // something a browser can draw — the same treatment the icons get, and for the same reason: the
  // worker is handed a page and nothing else. A reference with nothing behind it is a picture
  // whose bytes are gone, and the page is printed without it rather than with an empty frame.
  images?: Record<string, string>
  pageMm: { w: number; h: number }
  // What the licences of the game's symbols are (E4), printed at the back.
  credits?: (ProjectCredit & { name: string })[]
  // The language the tool speaks in the one heading it contributes (A4). Everything else in a
  // booklet is the designer's own words and is never touched.
  lang?: 'sv' | 'en'
}
export type Booklet = { html: string; css: string }

// A5 is what a rulebook is folded to; the box it ships in decides nothing else here. The page and
// its margins are the book's own, declared beside the measurement that reads them (#173), so the
// page a figure is measured against is the page it is printed on and neither can drift from the
// other. Nothing here writes either number a second time.
export const A5 = BOOKLET_PAGE_MM

export function bookletOf(input: BookletInput): Booklet {
  const { w, h } = input.pageMm
  const body = input.rules.blocks.map((b) => blockHtml(b, input)).join('\n')
  const credits = (input.credits ?? []).length > 0 ? creditsHtml(input.credits ?? [], input.lang ?? 'sv') : ''
  const html = `<div data-booklet><h1>${escape(input.rules.title)}</h1>${body}${credits}</div>`
  return { html, css: css(w, h) }
}

function blockHtml(block: RenderedBlock, input: BookletInput): string {
  switch (block.kind) {
    // A heading is read inline like a paragraph is (#272), so it goes through the same span: a
    // reference in it is printed as the name the thing has, and every string in it is escaped
    // there rather than here.
    case 'heading': {
      const words = span(block.children, input.icons)
      return block.level === 1 ? `<h2>${words}</h2>` : `<h3>${words}</h3>`
    }
    case 'text':
      return block.paragraphs.map((p) => `<p>${span(p.children, input.icons)}</p>`).join('')
    case 'list': {
      const items = block.items.map((item) => `<li>${span(item, input.icons)}</li>`).join('')
      return block.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`
    }
    // The setup picture is the game's own zones, never a drawing kept beside them (B5).
    //
    // The zones come off the block itself (#270) and no longer beside it: the press, the editor
    // and the table read one arrangement, worked out once from the document, so a zone cannot be
    // grouped one way on a screen and listed another way on paper. The page keeps its own form —
    // a booklet is a document and not a screen, and folding a printed figure open is not a thing
    // paper does — and takes them in the arrangement's order: what stands on the table, then each
    // seat's own.
    case 'setup': {
      const zones = [...block.common, ...block.seats.flatMap((seat) => seat.zones)].map((zone) => `<span data-zone>${escape(zone.name)}</span>`).join('')
      const caption = block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : ''
      return `<figure class="byd-setup"><div class="byd-table">${zones}</div>${caption}</figure>`
    }
    // A picture the designer brought with her (#173). What it says about itself is its alt text;
    // a picture that was written without one came in as decorative and says nothing, which is
    // exactly what `alt=""` means to a screen reader and to this page (decided 2026-09-17). The
    // caption is the other line, written for the reader who can see the picture, and it is the
    // half of the pair that is actually printed and paid for in type area.
    // The block holds a reference to one of the project's own assets and never an address, so
    // nothing a file carried can reach the renderer as one.
    //
    // The width is the figure's own measurement and not the frame: `renderRules` worked out the
    // millimetres once, against this page, and a picture smaller than the column at 300 DPI stands
    // in its own size rather than being pulled out to the column and printed as porridge. The
    // height is left to follow, so a picture that narrowed under the ceiling is the whole picture
    // and never a cropped one.
    case 'image': {
      const src = (input.images ?? {})[block.asset]
      if (!src) return ''
      const caption = block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : ''
      return `<figure class="byd-rules-figure"><img src="${escape(src)}" alt="${escape(block.alt)}" style="width:${mm(block.mm.w)}mm">${caption}</figure>`
    }
  }
}

function span(nodes: readonly RenderedNode[], icons: Record<string, string>): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return escape(n.text)
        case 'bold':
          return `<strong>${span(n.children, icons)}</strong>`
        case 'italic':
          return `<em>${span(n.children, icons)}</em>`
        case 'icon': {
          const src = icons[n.name]
          // A bare number is a pip, as it is on a card (L2); an unknown name says so.
          if (src === undefined && /^\d+$/.test(n.name)) return `<span class="byd-pip">${escape(n.name)}</span>`
          if (src === undefined) return `<span class="byd-missing">{${escape(n.name)}}</span>`
          return `<img class="byd-icon" src="${escape(src)}" alt="${escape(n.name)}">`
        }
        // A reference carries the name it stands for; one the game lost says what was written.
        case 'ref':
          return escape(n.name ?? `${n.of === 'zone' ? 'zon' : 'kort'}:${n.id}`)
      }
    })
    .join('')
}

const CREDITS_HEADING = { sv: 'Symboler och licenser', en: 'Symbols and licences' }
function creditsHtml(credits: (ProjectCredit & { name: string })[], lang: 'sv' | 'en'): string {
  const rows = credits.map((c) => `<li>${escape(c.name)} — ${escape(c.licence)}, ${escape(c.by)}</li>`).join('')
  return `<section class="byd-credits"><h3>${escape(CREDITS_HEADING[lang])}</h3><ul>${rows}</ul></section>`
}

// Print measures: millimetres for the page, points for the type, and a margin wide enough that
// the fold and the knife do not eat a line.
function css(w: number, h: number): string {
  return [
    `@page{size:${w}mm ${h}mm;margin:${BOOKLET_MARGIN_MM.block}mm ${BOOKLET_MARGIN_MM.inline}mm}`,
    'body{margin:0}',
    '[data-booklet]{font:10.5pt/1.55 Georgia,serif;color:#1c1c1c}',
    'h1{font-size:22pt;margin:0 0 10mm}',
    'h2{font-size:15pt;margin:8mm 0 3mm;break-after:avoid}',
    'h3{font-size:11.5pt;margin:6mm 0 2mm;break-after:avoid}',
    'p{margin:0 0 2.5mm;orphans:2;widows:2}',
    'ol,ul{margin:0 0 3mm;padding-left:6mm}',
    'li{margin-bottom:1mm}',
    '.byd-pip{display:inline-grid;place-items:center;width:1.25em;height:1.25em;border-radius:50%;background:#1c1c1c;color:#fff;font:700 0.72em system-ui;vertical-align:-0.15em}',
    '.byd-icon{height:1em;width:auto;vertical-align:-0.15em}',
    '.byd-missing{color:#a12b2b}',
    // A5 is the narrowest of the three surfaces the book is read on, so A5 sets the size of a
    // picture (#173): the text column of the page, and two thirds of the type area's height, so a
    // figure and its caption always share a page with the text they belong to. Each picture
    // carries its own width, worked out against this page; the frame stands here as the bound
    // none of them may pass, and the height follows the width so nothing is ever cropped.
    '.byd-rules-figure{margin:4mm 0;text-align:center;break-inside:avoid}',
    `.byd-rules-figure img{max-width:${RULE_IMAGE_FRAME.wMm}mm;max-height:${RULE_IMAGE_FRAME.hMm}mm;height:auto}`,
    '.byd-rules-figure figcaption{margin-top:2mm;text-align:center;font:italic 8.5pt Georgia,serif;color:#6b6255}',
    '.byd-setup{margin:4mm 0;break-inside:avoid}',
    '.byd-setup .byd-table{display:flex;flex-wrap:wrap;gap:2mm;justify-content:center;padding:5mm;border:0.3mm dashed #8a8172;border-radius:2mm}',
    '.byd-setup span{padding:2mm 3mm;border:0.2mm solid #b3a894;border-radius:1mm;font:8pt system-ui}',
    '.byd-setup figcaption{margin-top:2mm;text-align:center;font:italic 8.5pt Georgia,serif;color:#6b6255}',
    '.byd-credits{margin-top:10mm;break-before:page}',
    '.byd-credits li{font:8.5pt system-ui;color:#4a4438}',
  ].join('\n')
}

// Millimetres as a page is written in: one decimal, which is finer than a press can hold anyway.
const mm = (n: number): number => Math.round(n * 10) / 10

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
