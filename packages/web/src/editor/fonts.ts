import type { ProjectDoc } from './types.js'
import { ASSET_PREFIX, assetUrl, isAssetRef } from './assets.js'

// The type a game is set in (B3). A family the project names carries the file it is drawn from,
// so what a printer sets a year from now is what the designer saw; a family that is only a CSS
// stack is whatever the machine at the other end happens to have, which is what the physical
// check warns about (E5).

// Every family the template asks for, in the order the faces are read: what may not be thrown
// away, and what the card is actually set in.
export function familiesInUse(doc: ProjectDoc): string[] {
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
export function previewFonts(doc: ProjectDoc, assetBase: string | undefined): Record<string, { stack: string; src?: string }> {
  const out: Record<string, { stack: string; src?: string }> = {}
  for (const [family, font] of Object.entries(doc.fonts ?? {})) {
    out[family] = assetBase && isAssetRef(font.asset) ? { stack: font.stack, src: assetUrl(assetBase, font.asset.slice(ASSET_PREFIX.length)) } : { stack: font.stack }
  }
  return out
}
