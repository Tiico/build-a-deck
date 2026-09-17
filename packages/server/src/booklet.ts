import { BOOKLET_MARGIN_MM, BOOKLET_PAGE_MM, type RenderedBlock, type RenderedNode, type RenderedRules } from '@byd/template'
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
  // The rulebook's own pictures (#173), keyed by the `asset:<hash>` the book carries and resolved
  // to bytes the press can draw. A picture whose asset is gone is left out of the book entirely: a
  // reader never meets an error message in a rulebook.
  images?: Record<string, string>
  pageMm: { w: number; h: number }
  // The zones the game has, for the setup picture (B5); their names, in the setup's order.
  zones?: string[]
  // What the licences of the game's symbols are (E4), printed at the back.
  credits?: (ProjectCredit & { name: string })[]
  // The language the tool speaks in the one heading it contributes (A4). Everything else in a
  // booklet is the designer's own words and is never touched.
  lang?: 'sv' | 'en'
}
export type Booklet = { html: string; css: string }

// A5 is what a rulebook is folded to; the box it ships in decides nothing else here. The page and
// its margins are declared beside the measurement that reads them (`@byd/template`), because the
// column a figure is fitted to is this page less these margins (#173) — writing either of them out
// again here would be two numbers to hold in step by hand.
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
    case 'heading':
      return block.level === 1 ? `<h2>${escape(block.text)}</h2>` : `<h3>${escape(block.text)}</h3>`
    case 'text':
      return block.paragraphs.map((p) => `<p>${span(p.children, input.icons)}</p>`).join('')
    case 'list': {
      const items = block.items.map((item) => `<li>${span(item, input.icons)}</li>`).join('')
      return block.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`
    }
    // The setup picture is the game's own zones, never a drawing kept beside them (B5).
    case 'setup': {
      const zones = (input.zones ?? []).map((z) => `<span data-zone>${escape(z)}</span>`).join('')
      const caption = block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : ''
      return `<figure class="byd-setup"><div class="byd-table">${zones}</div>${caption}</figure>`
    }
    // A picture (#173), set in the millimetres `renderRules` already worked out — the press does
    // no arithmetic of its own, which is what keeps the screen and the page the same size.
    case 'image': {
      const src = input.images?.[block.src]
      if (!src) return ''
      const caption = block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : ''
      // An empty alt is the decorative mark, and it is written out rather than left off: an `img`
      // with no `alt` at all is announced by its file name, which here is a hash.
      return `<figure class="byd-figure" style="width:${mm(block.mm.w)}mm"><img src="${escape(src)}" alt="${escape(block.alt)}" style="width:${mm(block.mm.w)}mm;height:${mm(block.mm.h)}mm">${caption}</figure>`
    }
  }
}

// Millimetres as CSS wants them: two decimals is a hundredth of a millimetre, which is finer than
// any press resolves, and a whole number stays whole so the page reads like the measurement does.
const mm = (n: number): string => String(Number(n.toFixed(2)))

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
    '.byd-setup{margin:4mm 0;break-inside:avoid}',
    '.byd-setup .byd-table{display:flex;flex-wrap:wrap;gap:2mm;justify-content:center;padding:5mm;border:0.3mm dashed #8a8172;border-radius:2mm}',
    '.byd-setup span{padding:2mm 3mm;border:0.2mm solid #b3a894;border-radius:1mm;font:8pt system-ui}',
    // A caption is a caption, whichever figure it stands under.
    '.byd-setup figcaption,.byd-figure figcaption{margin-top:2mm;text-align:center;font:italic 8.5pt Georgia,serif;color:#6b6255}',
    // The figure is centred in the column and never pulled out of it, and it stays with its
    // caption: a caption on the next page belongs to nothing. Its own width is written on it, in
    // the millimetres `renderRules` measured.
    '.byd-figure{margin:4mm auto;max-width:100%;break-inside:avoid}',
    // The box is the measurement's, and `contain` is what makes the picture keep its own aspect
    // inside it — so a figure that narrowed to fit the page is never one that was cropped to fit.
    '.byd-figure img{display:block;object-fit:contain}',
    '.byd-credits{margin-top:10mm;break-before:page}',
    '.byd-credits li{font:8.5pt system-ui;color:#4a4438}',
  ].join('\n')
}

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
