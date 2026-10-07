import type { Row } from '@byd/template'
import type { ProjectDoc } from './types.js'
import { ASSET_PREFIX, assetBytesUrl, isAssetRef, isEarly } from './assets.js'
import { themeFamilies, themeOf } from './themes.js'

// The type a game is set in (B3). A family the project names carries the file it is drawn from,
// so what a printer sets a year from now is what the designer saw; a family that is only a CSS
// stack is whatever the machine at the other end happens to have, which is what the physical
// check warns about (E5).

// Every family the template asks for, in the order the faces are read: what may not be thrown
// away, and what the card is actually set in.
export function familiesInUse(doc: Pick<ProjectDoc, 'template'>): string[] {
  const out: string[] = []
  const walk = (els: ProjectDoc['template']['faces'][string]['base']) => {
    for (const el of els) {
      if (el.kind === 'text' && !out.includes(el.font.family)) out.push(el.font.family)
      if (el.kind === 'if' || el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  return out
}

// What a text layer's family picker offers, in the order it offers it (L57, #634): the game's own
// typefaces first, said to be the game's, and — when the layer is set in a family the game no
// longer names — that family on its own, so the layer is never moved to another type behind the
// designer's back. The rest of the catalog is behind «Fler typsnitt…», which is the picker's and
// not this list's.
//
// One place that decides the order: the theme the game started from (#632) puts its heading and
// then its body family at the head of `game`, and the game's other typefaces follow in the order
// it has them. A theme family the game no longer carries is not offered — it would be a name
// without a file (#420).
export function familyChoices(doc: Pick<ProjectDoc, 'fonts' | 'theme'>, current: string): { game: string[]; kept: string | null } {
  const carried = Object.keys(doc.fonts ?? {})
  const theme = themeOf(doc)
  const first = theme ? themeFamilies(theme).map((f) => f.family).filter((family) => carried.includes(family)) : []
  const game = [...first, ...carried.filter((family) => !first.includes(family))]
  return { game, kept: game.includes(current) ? null : current }
}

// The project's fonts as the compiler wants them, for a preview in the browser: the file is the
// asset the project holds. The server does the same for a render, only inlining the bytes,
// because the render worker has no session to fetch with.
//
// Through the server's own `/bytes` and not the address a picture is shown from (#472). A web
// font is always fetched in CORS mode, and `/assets/<hash>` redirects to the object store, whose
// answer carries no CORS header — so in production no face ever loaded, and `font-display: block`
// held every card's text invisible until the browser gave up and set it in the fallback. The
// bytes are immutable, so a browser fetches each face once (DRIFT §4).
export function previewFonts(doc: Pick<ProjectDoc, 'template' | 'fonts'>, assetBase: string | undefined): Record<string, { stack: string; src?: string }> {
  const out: Record<string, { stack: string; src?: string }> = {}
  for (const [family, font] of Object.entries(doc.fonts ?? {})) {
    out[family] = assetBase && isAssetRef(font.asset) ? { stack: font.stack, src: assetBytesUrl(assetBase, font.asset.slice(ASSET_PREFIX.length)) } : { stack: font.stack }
  }
  return out
}

// The resolved faces with the files whose bytes are still on their way left out (#959): such a
// family is a stack and no `@font-face` until they land, so the card is set in the fallback
// meanwhile. Declared any earlier, the face was fetched, got a 404, and stayed in error — the
// card in the fallback until the page was loaded again.
export function holdFonts(fonts: Record<string, { stack: string; src?: string }>, early: ReadonlySet<string>): Record<string, { stack: string; src?: string }> {
  return Object.fromEntries(Object.entries(fonts).map(([family, font]) => [family, font.src !== undefined && isEarly(font.src, early) ? { stack: font.stack } : font]))
}

// The two words a typeface is tried on (#329, L27): the card's own heading and its own rule
// text, each in the point size the card sets it in.
//
// That is the whole of why room C was chosen over A and B. A family name set in nineteen points
// looks well in nearly anything; the question a designer actually has is whether her rule text
// survives at nine points on a 63 mm card, and she can only answer it by reading her own card.
//
// Which two: the largest text on the face and the smallest, which is what a heading and a body
// are without anyone having to name them. A face with one text has only the one word to show; a
// face with none — a plain back — has nothing to show and says so by returning nothing.
export type CardWords = { heading: { text: string; sizePt: number }; body: { text: string; sizePt: number } }

export function cardWords(elements: ProjectDoc['template']['faces'][string]['base'], row: Row): CardWords | null {
  const texts = elements
    .filter((el) => el.kind === 'text')
    .map((el) => ({ text: 'field' in el.bind ? String(row[el.bind.field] ?? '') : el.bind.literal, sizePt: el.font.sizePt }))
    .filter((word) => word.text !== '')
  const sorted = [...texts].sort((a, b) => b.sizePt - a.sizePt)
  const heading = sorted.at(0)
  const body = sorted.at(-1)
  if (heading === undefined || body === undefined) return null
  return { heading, body }
}
