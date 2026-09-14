import type { ComponentTypeDef } from '@byd/engine'
import { parseInline, type InlineNode } from './inline.js'
import { detectScript, estimateHeight, fitText, type Measure } from './fit.js'
import { paintOf, shadowCss, type Condition, type Element, type FaceTemplate, type Pattern, type Row, type Template } from './model.js'
import { coord, isOpen, pathFor } from './shapes.js'
import { tileMarkup } from './patterns.js'

export type Warning = { element: string; code: 'unknown-icon' | 'text-too-small' | 'text-overflow' | 'unknown-field'; detail: string }
export type Compiled = { html: string; css: string; warnings: Warning[] }
export type CompileInput = {
  type: ComponentTypeDef
  face: FaceTemplate
  row: Row
  // Project icon set (L2): name → URL. Unknown names render as a visible warning.
  icons: Record<string, string>
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
  css.push(`.byd-icon-missing{color:#c00;background:#fee;font-weight:700;}`)
  css.push(`.byd-pip{display:inline-block;min-width:1.15em;height:1.15em;line-height:1.15em;border-radius:50%;text-align:center;font-weight:700;font-size:0.85em;border:0.12em solid currentColor;vertical-align:-0.15em;padding:0 0.1em;box-sizing:border-box;}`)

  for (const el of elementsFor(input.face, input.row)) render(el, bleed, bleed, input, html, css, warnings)

  return { html: `<div data-card data-bleed="${bleed}">${html.join('')}</div>`, css: rules.join('\n'), warnings }
}

type Css = { push(rule: string): void }

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
          `${renderParagraphs(value, el.id, input.icons, warnings)}</div>`,
      )
      break
    }
    case 'image': {
      const src = resolve(el.bind, input.row)
      css.push(`[data-element="${attr(el.id)}"]{left:${el.x + dx}mm;top:${el.y + dy}mm;width:${el.w}mm;height:${el.h}mm;object-fit:${el.fit ?? 'cover'};}`)
      html.push(src ? `<img data-element="${attr(el.id)}" src="${attr(src)}" alt="">` : `<div data-element="${attr(el.id)}"></div>`)
      break
    }
    case 'icons': {
      const names = resolve(el.bind, input.row).split(/[\s,]+/).filter((n) => n.length > 0)
      css.push(`[data-element="${attr(el.id)}"]{left:${el.x + dx}mm;top:${el.y + dy}mm;width:${el.w}mm;height:${el.h}mm;display:flex;align-items:center;}`)
      css.push(`[data-element="${attr(el.id)}"] .byd-icon{height:${el.iconMm}mm;width:${el.iconMm}mm;margin-right:${el.gapMm ?? 1}mm;}`)
      html.push(`<div data-element="${attr(el.id)}">${names.map((n) => renderNode({ type: 'icon', name: n }, el.id, input.icons, warnings)).join('')}</div>`)
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

function renderParagraphs(text: string, element: string, icons: Record<string, string>, warnings: Warning[]): string {
  return parseInline(text)
    .map((p) => `<p>${p.children.map((n) => renderNode(n, element, icons, warnings)).join('')}</p>`)
    .join('')
}

function renderNode(n: InlineNode, element: string, icons: Record<string, string>, warnings: Warning[]): string {
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
      const src = icons[n.name]
      // A bare number is a pip (L2 addendum) unless the icon set names it.
      if (src === undefined && /^\d+$/.test(n.name)) return `<span class="byd-pip">${escape(n.name)}</span>`
      if (src === undefined) {
        warnings.push({ element, code: 'unknown-icon', detail: n.name })
        return `<span class="byd-icon-missing">{${escape(n.name)}}</span>`
      }
      return `<img class="byd-icon" src="${attr(src)}" alt="${attr(n.name)}">`
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
  const out: Record<string, Compiled> = {}
  for (const faceId of input.type.faces) {
    const face = input.template.faces[faceId]
    if (!face) throw new Error(`template has no face "${faceId}", which ${input.type.id} requires`)
    out[faceId] = compile({ type: input.type, row: input.row, icons: input.icons, face, ...(input.fonts ? { fonts: input.fonts } : {}), ...(input.bleed !== undefined ? { bleed: input.bleed } : {}), ...(input.measure ? { measure: input.measure } : {}) })
  }
  return out
}
