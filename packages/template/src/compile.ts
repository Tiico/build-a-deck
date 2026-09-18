import type { ComponentTypeDef } from '@byd/engine'
import { parseInline, type InlineNode } from './inline.js'
import { detectScript, estimateHeight, fitText, type Measure } from './fit.js'
import { paintOf, shadowCss, type Bind, type Condition, type Element, type FaceTemplate, type Pattern, type Row, type Template } from './model.js'
import type { Motif } from './motif.js'
import { frameWindow, type Frame, type Nudge } from './frame.js'
import { coord, isOpen, pathFor } from './shapes.js'
import { tileMarkup } from './patterns.js'

export type Warning = { element: string; code: 'unknown-icon' | 'unknown-role' | 'text-too-small' | 'text-overflow' | 'unknown-field'; detail: string }
export type Compiled = { html: string; css: string; warnings: Warning[] }
export type CompileInput = {
  type: ComponentTypeDef
  face: FaceTemplate
  row: Row
  // Project icon set (L2): name → URL. Unknown names render as a visible warning.
  icons: Record<string, string>
  // What the game's meanings are painted in (E4): role → colour. A symbol written `{namn|roll}`
  // reaches the card as its own shape with this colour behind it, so one upload serves every
  // colour the deck writes and a meaning is repainted in one place rather than in forty cells.
  palette?: Record<string, string>
  // The fonts this version is pinned to (B3): a family the project names is written as a face
  // of its own when it carries a file, so what renders is the file and not whatever the machine
  // happens to have. A family the project does not name is used as the CSS stack it already is.
  fonts?: Record<string, { stack: string; src?: string }>
  // Print: extend the card by the type's bleed on every side and shift content accordingly.
  bleed?: boolean
  // Text measurement (E6). Defaults to a glyph-width estimate; inject Chromium to measure for real.
  measure?: Measure
  // A selector prefix for every rule, so many cards (each fitted differently) can share a page.
  scope?: string
  // What is drawn inside each picture (E1): the source, exactly as the row carries it, against
  // the file's pixel size and the uniform border it holds around its motif. Measured once per
  // asset far from here; an image element told to `trim` fits the motif rather than the file, so
  // the same motif is the same size on every card however much air its own file happens to have.
  motifs?: Record<string, Motif>
  // What this card asks of the deck's measure that the measure did not give it (E1): zoom and
  // offset, by the column the picture sits in. It belongs to the deck and not to the file — the
  // same bytes may sit in ten other people's decks — so it arrives per card rather than beside
  // the measurement, which is of the bytes and shared by everyone.
  framing?: Record<string, Nudge>
}

// Compiles one face of one card to HTML and CSS. The same output feeds the editor preview,
// the table texture and the print PDF (E2): this is the one renderer's one input.
export function compile(input: CompileInput): Compiled {
  const warnings: Warning[] = []
  const html: string[] = []
  const rules: string[] = []
  const css = { push: (rule: string) => rules.push(input.scope ? `${input.scope} ${rule}` : rule) }
  const { physical } = input.type
  const bleed = input.bleed ? input.type.print.bleedMm : 0

  css.push(`[data-card]{position:relative;width:${physical.widthMm + 2 * bleed}mm;height:${physical.heightMm + 2 * bleed}mm;overflow:hidden;}`)
  css.push(`[data-element]{position:absolute;box-sizing:border-box;margin:0;overflow:hidden;}`)
  css.push(`[data-element] p{margin:0;}[data-element] p+p{margin-top:0.5em;}`)
  // Every shape is an SVG filling its element, so one code path draws a rectangle, a hexagon
  // and a line, and the stroke of each means the same thing (L17).
  css.push(`[data-element]>svg{display:block;width:100%;height:100%;}`)
  // The faces first, since a rule cannot use a font that has not been declared.
  for (const [name, font] of Object.entries(input.fonts ?? {})) {
    if (!font.src) continue
    if (!usesFont(input.face, name)) continue
    rules.push(`@font-face{font-family:"${attr(name)}";src:url("${attr(font.src)}");font-display:block;}`)
  }
  css.push(`.byd-icon{height:1em;width:auto;vertical-align:-0.15em;}`)
  // A picture hangs inside its own frame rather than being it, so the element's box stays exactly
  // what the designer grabs whether the picture fills it, sits inside it or overflows it.
  css.push(`.byd-art{position:absolute;left:0;top:0;display:block;max-width:none;}`)
  // A painted symbol is its own shape cut out of a block of colour (E4). The width is stated
  // here rather than left auto because there is no picture to take a width from; an icon row
  // still overrides both, being the more specific rule.
  css.push(
    `.byd-ink{display:inline-block;width:1em;background:currentColor;-webkit-mask-size:contain;mask-size:contain;` +
      `-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;}`,
  )
  css.push(`.byd-icon-missing{color:#c00;background:#fee;font-weight:700;}`)
  css.push(`.byd-pip{display:inline-block;min-width:1.15em;height:1.15em;line-height:1.15em;border-radius:50%;text-align:center;font-weight:700;font-size:0.85em;border:0.12em solid currentColor;vertical-align:-0.15em;padding:0 0.1em;box-sizing:border-box;}`)

  for (const el of elementsFor(input.face, input.row)) render(el, bleed, bleed, input, html, css, warnings)

  return { html: `<div data-card data-bleed="${bleed}">${html.join('')}</div>`, css: rules.join('\n'), warnings }
}

type Css = { push(rule: string): void }

// A number as millimetres, without the float noise a division leaves behind.
const mm = (v: number): string => `${Math.round(v * 1e4) / 1e4}mm`

// Where the whole picture has to lie for its motif to meet the frame the way the element asks
// (E1). The fitting is done on the motif — so `contain` fits what is drawn and `cover` fills the
// frame with what is drawn — and the file is then laid out around it at the same scale and
// cropped by the frame, which is what already crops every other picture. A motif with no extent
// is no motif, and such a file is left to its frame.
function aroundMotif(el: { w: number; h: number; fit?: 'cover' | 'contain' | 'fill' | undefined }, motif: Motif): string | null {
  const drawn = { w: motif.w - motif.trim.left - motif.trim.right, h: motif.h - motif.trim.top - motif.trim.bottom }
  if (drawn.w <= 0 || drawn.h <= 0) return null
  const by = { w: el.w / drawn.w, h: el.h / drawn.h }
  const even = (el.fit ?? 'cover') === 'contain' ? Math.min(by.w, by.h) : Math.max(by.w, by.h)
  const [sx, sy] = (el.fit ?? 'cover') === 'fill' ? [by.w, by.h] : [even, even]
  // The motif centred in the frame: its own centre, in the file's pixels, laid on the frame's.
  const left = el.w / 2 - (motif.trim.left + drawn.w / 2) * sx
  const top = el.h / 2 - (motif.trim.top + drawn.h / 2) * sy
  return `left:${mm(left)};top:${mm(top)};width:${mm(motif.w * sx)};height:${mm(motif.h * sy)};`
}

// Where the whole picture has to lie for the deck's measure to be met (E1). The window is worked
// out by `frameWindow` — the one function the editor calls too, so a card can never be framed one
// way on screen and another in print — and the file is then laid out so that exactly the window
// fills the element. The frame crops the rest, as it crops every other picture.
function throughWindow(el: { w: number; h: number }, measure: Frame, motif: Motif, nudge: Nudge): string | null {
  if (motif.w <= 0 || motif.h <= 0) return null
  const win = frameWindow(motif, measure, el.w / el.h, nudge)
  if (win.w <= 0) return null
  // Millimetres per file pixel. The window is the frame's shape, so its height lands on the
  // element's height by the same scale that puts its width on the element's width.
  const by = el.w / win.w
  return `left:${mm(-win.x * by)};top:${mm(-win.y * by)};width:${mm(motif.w * by)};height:${mm(motif.h * by)};`
}

// This card's own departure from the measure, if it has one. It is keyed by the column the
// picture came from, because that is where the designer put the picture — an element bound to a
// literal is the template's own picture and is never one card's to nudge.
function nudgeFor(el: { bind: Bind }, input: CompileInput): Nudge {
  return ('field' in el.bind && input.framing?.[el.bind.field]) || {}
}

const symbolsOf = (input: CompileInput): Symbols => ({ icons: input.icons, palette: input.palette })

// One name out of an icon row's cell. A row is a list of names and not card text, so a symbol
// there wears no braces — but it may name a meaning the same way, `svard|fara`, because the row
// and the sentence are the same symbols and must be able to say the same thing (L1, E4).
function iconNode(written: string): InlineNode {
  const bar = written.indexOf('|')
  if (bar < 0) return { type: 'icon', name: written }
  const [name, role] = [written.slice(0, bar), written.slice(bar + 1)]
  return role ? { type: 'icon', name, role } : { type: 'icon', name }
}

function render(el: Element, dx: number, dy: number, input: CompileInput, html: string[], css: Css, warnings: Warning[]): void {
  switch (el.kind) {
    case 'text': {
      const value = resolve(el.bind, input.row)
      const f = el.font
      const mfont = { family: f.family, sizePt: f.sizePt, weight: f.weight ?? 400, lineHeight: f.lineHeight ?? 1.25 }
      const minPt = input.type.print.minPtByScript[detectScript(value)] ?? input.type.print.minPtByScript['Latn'] ?? 6
      const measure = input.measure ?? estimateHeight
      const fit = (el.fit ?? 'shrink') === 'shrink'
        ? fitText(value, mfont, { w: el.w, h: el.h }, minPt, measure)
        : { sizePt: f.sizePt, overflow: measure(value, mfont, el.w) > el.h }
      if (fit.overflow) {
        warnings.push(
          (el.fit ?? 'shrink') === 'shrink'
            ? { element: el.id, code: 'text-too-small', detail: `${minPt}pt is the minimum for this script and the text still does not fit ${el.w}×${el.h}mm` }
            : { element: el.id, code: 'text-overflow', detail: `the text does not fit ${el.w}×${el.h}mm at ${f.sizePt}pt` },
        )
      }
      css.push(
        `[data-element="${attr(el.id)}"]{left:${el.x + dx}mm;top:${el.y + dy}mm;width:${el.w}mm;height:${el.h}mm;font-size:${fit.sizePt}pt;` +
          `font-family:${familyOf(f.family, input.fonts)};font-weight:${f.weight ?? 400};text-align:${f.align ?? 'left'};line-height:${f.lineHeight ?? 1.25};color:${el.color};}`,
      )
      html.push(
        `<div data-element="${attr(el.id)}" data-fit="${el.fit ?? 'shrink'}" data-size-pt="${f.sizePt}" data-min-pt="${minPt}">` +
          `${renderParagraphs(value, el.id, symbolsOf(input), warnings)}</div>`,
      )
      break
    }
    case 'image': {
      const src = resolve(el.bind, input.row)
      // The measure supersedes the plain trim: it already leaves the air out, and it answers the
      // two questions trim cannot. Either way an unmeasured file is fitted as a file.
      // A crop is the designer's own answer to the question `trim` asks, so it is drawn whether
      // or not this element went looking for a motif: she cropped the picture, and this is the
      // picture (#222).
      const found = input.motifs?.[src]
      const motif = el.frame || el.trim || found?.cropped ? found : undefined
      const laid = motif && (el.frame ? throughWindow(el, el.frame, motif, nudgeFor(el, input)) : aroundMotif(el, motif))
      css.push(`[data-element="${attr(el.id)}"]{left:${el.x + dx}mm;top:${el.y + dy}mm;width:${el.w}mm;height:${el.h}mm;}`)
      css.push(`[data-element="${attr(el.id)}"] .byd-art{${laid ?? `width:100%;height:100%;object-fit:${el.fit ?? 'cover'};`}}`)
      html.push(src ? `<div data-element="${attr(el.id)}"><img class="byd-art" src="${attr(src)}" alt=""></div>` : `<div data-element="${attr(el.id)}"></div>`)
      break
    }
    case 'icons': {
      const names = resolve(el.bind, input.row).split(/[\s,]+/).filter((n) => n.length > 0)
      css.push(`[data-element="${attr(el.id)}"]{left:${el.x + dx}mm;top:${el.y + dy}mm;width:${el.w}mm;height:${el.h}mm;display:flex;align-items:center;}`)
      css.push(`[data-element="${attr(el.id)}"] .byd-icon{height:${el.iconMm}mm;width:${el.iconMm}mm;margin-right:${el.gapMm ?? 1}mm;}`)
      html.push(`<div data-element="${attr(el.id)}">${names.map((n) => renderNode(iconNode(n), el.id, symbolsOf(input), warnings)).join('')}</div>`)
      break
    }
    case 'shape': {
      const parts = [`left:${el.x + dx}mm`, `top:${el.y + dy}mm`, `width:${el.w}mm`, `height:${el.h}mm`]
      // The shadow is a filter on the element rather than on the path, so it follows whatever
      // the path turned out to be — a hexagon casts a hexagon's shadow and a star a star's.
      if (el.shadow) parts.push(`filter:${shadowCss(el.shadow)}`)
      css.push(`[data-element="${attr(el.id)}"]{${parts.join(';')};}`)
      html.push(`<div data-element="${attr(el.id)}">${shapeSvg(el, input)}</div>`)
      break
    }
    case 'if': {
      if (holds(el.when, input.row)) for (const child of el.children) render(child, dx, dy, input, html, css, warnings)
      break
    }
    case 'group': {
      for (const child of el.children) render(child, dx + el.x, dy + el.y, input, html, css, warnings)
      break
    }
    default:
      break
  }
}

// One shape, drawn as a path in the element's own millimetres (L17). Three layers at most, all
// on the same path: the fill, the pattern that rides over it, and the stroke. A stroke in SVG
// straddles the line it is drawn on while a CSS border sat inside the box, so the path is inset
// by half the stroke — which puts the outer edge of the line exactly on the box, and keeps the
// box the truth that the corner handles, the outline and the snap guides all stand on.
function shapeSvg(el: Extract<Element, { kind: 'shape' }>, input: CompileInput): string {
  const strokeMm = el.stroke && (el.strokeMm ?? 0) > 0 ? (el.strokeMm ?? 0) : 0
  const inset = Math.min(strokeMm / 2, el.w / 2, el.h / 2)
  const d = pathFor(el.shape, { x: inset, y: inset, w: Math.max(0, el.w - 2 * inset), h: Math.max(0, el.h - 2 * inset) }, {
    corners: el.corners,
    innerRatio: el.innerRatio,
    rotationDeg: el.rotationDeg,
    radiusMm: el.radiusMm,
  })
  // A line has no inside, so it is never offered a fill: painting one would put colour where
  // the designer drew nothing and cannot click.
  const open = isOpen(el.shape)
  const fill = open ? undefined : paintOf(el.fill, input.row)
  const pattern = open ? undefined : el.pattern
  const tile = pattern ? tileId(input.scope, el.id) : ''
  const layers: string[] = []
  if (fill) layers.push(`<path d="${d}" fill="${attr(fill)}"/>`)
  if (pattern) layers.push(`<path d="${d}" fill="url(#${tile})"/>`)
  if (strokeMm > 0) layers.push(`<path d="${d}" fill="none" stroke="${attr(el.stroke ?? '')}" stroke-width="${strokeMm}" stroke-linejoin="round"/>`)
  // A shape with neither fill nor stroke is still a shape: it keeps its path so that turning a
  // colour back on draws the same outline, and so the element is never an empty box.
  if (layers.length === 0) layers.push(`<path d="${d}" fill="none"/>`)
  const defs = pattern ? `<defs>${patternDef(tile, pattern)}</defs>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${el.w} ${el.h}" preserveAspectRatio="none">${defs}${layers.join('')}</svg>`
}

function patternDef(id: string, pattern: Pattern): string {
  const size = coord(pattern.scaleMm)
  const turn = pattern.angleDeg ? ` patternTransform="rotate(${coord(pattern.angleDeg)})"` : ''
  return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"${turn}>${tileMarkup(pattern.kind, pattern.scaleMm, attr(pattern.color), pattern.weight)}</pattern>`
}

// A tile is referenced by id, and many cards share one page — the deck wall and the print sheet
// both. Two cards under one id would leave every one of them wearing the first card's pattern,
// which is the kind of fault that only appears once a deck has two of something. The scope is
// what already makes a card unique on its page, so the id is built from it.
function tileId(scope: string | undefined, element: string): string {
  return ['byd-p', ident(scope ?? ''), ident(element)].filter((part) => part.length > 0).join('-')
}

function ident(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '')
}

function holds(when: Condition, row: Row): boolean {
  const v = row[when.field]
  const s = v === null || v === undefined ? '' : String(v)
  return 'equals' in when ? s === when.equals : s.trim().length > 0
}

// The variant a row asks for (L3): base elements, with the variant's overrides replacing
// elements of the same id in place and its removals taken out. A value with no variant of
// that name is the base look — most cards are base, and a warning on each would be noise.
// What a family name stands for: the stack the project pinned, or the family as written.
function familyOf(family: string, fonts: CompileInput['fonts']): string {
  return fonts?.[family]?.stack ?? family
}

// Whether any element of the face asks for this family, so an unused file is never carried.
function usesFont(face: FaceTemplate, family: string): boolean {
  const walk = (els: readonly Element[]): boolean =>
    els.some((el) => ('font' in el && el.font.family === family) || ((el.kind === 'if' || el.kind === 'group') && walk(el.children)))
  return walk(face.base) || Object.values(face.variants).some((v) => walk(v.override ?? []))
}

export function elementsFor(face: FaceTemplate, row: Row): Element[] {
  const name = face.variantBy ? row[face.variantBy] : undefined
  if (name === undefined || name === null || name === '') return face.base
  const variant = face.variants[String(name)]
  if (!variant) return face.base
  const overrides = new Map((variant.override ?? []).map((e) => [e.id, e]))
  const removed = new Set(variant.remove ?? [])
  const merged = face.base.filter((e) => !removed.has(e.id)).map((e) => overrides.get(e.id) ?? e)
  const seen = new Set(merged.map((e) => e.id))
  for (const e of variant.override ?? []) if (!seen.has(e.id) && !removed.has(e.id)) merged.push(e)
  return merged
}

function resolve(bind: { field: string } | { literal: string }, row: Row): string {
  if ('literal' in bind) return bind.literal
  const v = row[bind.field]
  return v === null || v === undefined ? '' : String(v)
}

// What a symbol is looked up in: the names the project knows, and what its meanings are painted
// in. The two travel together because every symbol asks both questions at once.
type Symbols = { icons: Record<string, string>; palette?: Record<string, string> | undefined }

function renderParagraphs(text: string, element: string, icons: Symbols, warnings: Warning[]): string {
  return parseInline(text)
    .map((p) => `<p>${p.children.map((n) => renderNode(n, element, icons, warnings)).join('')}</p>`)
    .join('')
}

function renderNode(n: InlineNode, element: string, icons: Symbols, warnings: Warning[]): string {
  switch (n.type) {
    case 'text':
      return escape(n.text)
    case 'bold':
      return `<strong>${n.children.map((c) => renderNode(c, element, icons, warnings)).join('')}</strong>`
    case 'italic':
      return `<em>${n.children.map((c) => renderNode(c, element, icons, warnings)).join('')}</em>`
    // A reference (B7) is the rulebook's, not a card's: card text is parsed without them, so
    // this can only be reached by handing the compiler a rulebook tree. It says what it is.
    case 'ref':
      return escape(`[[${n.of === 'zone' ? 'zon' : 'kort'}:${n.id}]]`)
    case 'icon': {
      const src = icons.icons[n.name]
      // A bare number is a pip (L2 addendum) unless the icon set names it.
      if (src === undefined && /^\d+$/.test(n.name)) return `<span class="byd-pip">${escape(n.name)}</span>`
      if (src === undefined) {
        warnings.push({ element, code: 'unknown-icon', detail: n.name })
        return `<span class="byd-icon-missing">{${escape(n.name)}}</span>`
      }
      const ink = n.role === undefined ? undefined : icons.palette?.[n.role]
      // A meaning the deck has not named loses its colour and keeps its symbol: a card missing a
      // word is worse than a card missing a shade, and the deck is told which meaning it was.
      if (n.role !== undefined && ink === undefined) warnings.push({ element, code: 'unknown-role', detail: n.role })
      if (ink === undefined) return `<img class="byd-icon" src="${attr(src)}" alt="${attr(n.name)}">`
      // The shape is the mask and the colour is paint behind it. The file is therefore never
      // asked to be red, which is what lets one upload serve every colour on every card.
      const mask = `url(${attr(`"${src}"`)})`
      return `<span class="byd-icon byd-ink" role="img" aria-label="${attr(n.name)}" style="background:${attr(ink)};-webkit-mask-image:${mask};mask-image:${mask}"></span>`
    }
  }
}

export function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function attr(s: string): string {
  return escape(s).replace(/"/g, '&quot;')
}

export type CompileCardInput = Omit<CompileInput, 'face'> & { template: Template }

// One card, every face the type declares (L7). A face the template lacks is an error: a card
// without a back cannot be printed, and a texture without one cannot lie face-down.
export function compileCard(input: CompileCardInput): Record<string, Compiled> {
  const { template, ...rest } = input
  const out: Record<string, Compiled> = {}
  for (const faceId of input.type.faces) {
    const face = template.faces[faceId]
    if (!face) throw new Error(`template has no face "${faceId}", which ${input.type.id} requires`)
    // Everything the caller handed over, minus the template, plus the face it names. Written as
    // a spread and not as a list of fields: the list was copied by hand and silently dropped the
    // two newest ones — the palette and this card's framing — from every card the server renders.
    out[faceId] = compile({ ...rest, face })
  }
  return out
}
