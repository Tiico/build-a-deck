import type { Row } from '@byd/template'
import type { ProjectDoc } from './types.js'
import { ASSET_PREFIX, assetUrl, isAssetRef } from './assets.js'

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

// The project's fonts as the compiler wants them, for a preview in the browser: the file is the
// asset the project holds, served from where every other asset is. The server does the same for
// a render, only inlining the bytes, because the render worker has no session to fetch with.
export function previewFonts(doc: Pick<ProjectDoc, 'template' | 'fonts'>, assetBase: string | undefined): Record<string, { stack: string; src?: string }> {
  const out: Record<string, { stack: string; src?: string }> = {}
  for (const [family, font] of Object.entries(doc.fonts ?? {})) {
    out[family] = assetBase && isAssetRef(font.asset) ? { stack: font.stack, src: assetUrl(assetBase, font.asset.slice(ASSET_PREFIX.length)) } : { stack: font.stack }
  }
  return out
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
