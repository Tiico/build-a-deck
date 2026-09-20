import { elementsFor, type Element } from '@byd/template'
import type { ProjectDoc, ProjectRow } from './types.js'
import { assetRef } from './assets.js'

// Which sides of a card draw a picture (#295, L22, variant A). Asked of what the card actually
// draws — the face's base with the variant this row asks for laid over it, through the same
// `elementsFor` the compiler uses — and never of the order the template's objects happen to be in.
// A picture reaches a card two ways: through a column the row holds it in, or as a picture the
// template carries by itself (#320); both count, because both are drawn.
//
// Front first, whatever order the template keeps its faces in: when both sides draw the picture
// the preview opens on the front, so the answer is given in the order the choice is made in.
export function facesDrawing(doc: ProjectDoc, row: ProjectRow, hash: string): string[] {
  const ref = assetRef(hash)
  const draws = (els: readonly Element[]): boolean =>
    els.some((el) => (el.kind === 'image' ? ('literal' in el.bind ? el.bind.literal === ref : row.fields[el.bind.field] === ref) : (el.kind === 'if' || el.kind === 'group') && draws(el.children)))
  return faceOrder(doc).filter((face) => {
    const template = doc.template.faces[face]
    return template !== undefined && draws(elementsFor(template, row.fields))
  })
}

// The sides in the order they are offered: the front, then the rest as the template keeps them.
export function faceOrder(doc: ProjectDoc): string[] {
  const faces = Object.keys(doc.template.faces)
  return faces.includes('front') ? ['front', ...faces.filter((f) => f !== 'front')] : faces
}
