import { boxFaceType, tuckNet, type BoxFace } from '@byd/engine'
import type { FaceTemplate, Motif, Template } from '@byd/template'
import { contentHash, type RenderRequest } from '@byd/render/queue'
import { boxFaceOf, boxOf } from './box.js'
import { boxPrintFileOf, type ExportBox } from './export.js'
import { compileRow, type Deck } from './faces.js'
import type { ProjectDoc } from './projects.js'

// Spelets låda som den går till tryck i exporten (G5, #1418, L91), och som tryckpaketet säger den (F1).
// Måtten är `boxOf`:s och ytorna `boxFaceOf`:s: designerns mall när hon ritat ytan, och annars den
// neutrala. Varje yta kompileras av samma kompilator som korten och ritas av samma renderare (E2),
// i sitt eget mått och med lådans utfall, som en PDF per yta.
//
// Tryckfilerna till en partner, med stansform och i CMYK, är steg 2 och väntar på en vald partner
// (F1, F2); det här är exportens egna filer, med typens utfall, som kortens i exporten.

type BoxDoc = Pick<ProjectDoc, 'rows' | 'box' | 'name' | 'template'>

// Lådan i tal: typen, måtten, låsen, luften, nätets mått och vilka ytor designern ritat.
export type BoxFacts = Omit<ExportBox, 'faces'> & { faces: BoxFace[]; drawn: BoxFace[] }
export function boxFactsOf(doc: BoxDoc): BoxFacts {
  const fit = boxOf(doc)
  const net = tuckNet(fit.type, fit.size)
  const faces = [...fit.type.faces]
  return {
    type: { id: fit.type.id, version: fit.type.version },
    size: fit.size,
    locked: fit.locked,
    clearance: fit.clearance,
    net: { width: net.width, height: net.height },
    faces,
    drawn: faces.filter((face) => boxFaceOf(doc, face).drawn),
  }
}

// The pictures a face of the box is drawn from, as the server resolves them for a card (#320): an
// asset no store has is drawn empty. Without a store the faces are drawn as they are.
export type ResolveFaces = (template: Template) => Promise<{ template: Template; motifs: Record<string, Motif> }>

// Every face as the render job that draws it with bleed, by the file it gets in the zip.
export async function boxPrintOf(doc: BoxDoc, deck: Deck, now: number, resolve?: ResolveFaces): Promise<{ box: ExportBox; jobs: { file: string; job: RenderRequest }[] }> {
  const facts = boxFactsOf(doc)
  const fit = boxOf(doc)
  const drawn: Partial<Record<BoxFace, FaceTemplate>> = Object.fromEntries(facts.faces.map((face) => [face, boxFaceOf(doc, face).template]))
  const own = resolve ? await resolve({ faces: drawn as Record<string, FaceTemplate> }) : { template: { faces: drawn as Record<string, FaceTemplate> }, motifs: {} }
  const motifs = { ...deck.motifs, ...own.motifs }
  const jobs: { file: string; job: RenderRequest }[] = []
  const faces: ExportBox['faces'] = {}
  for (const face of facts.faces) {
    const template = own.template.faces[face]
    if (!template) continue
    const type = boxFaceType(fit.type, face, fit.size)
    const page = compileRow({ ...deck, motifs, template: { faces: { [type.contentFace]: template } } }, type, {}, true)[type.contentFace]
    if (!page) continue
    const file = boxPrintFileOf(face)
    const kind = { kind: 'pdf' } as const
    const compiled = { html: page.html, css: page.css }
    jobs.push({ file, job: { hash: contentHash(compiled, kind), kind, priority: 'print', compiled, requestedAt: now } })
    faces[face] = { file, drawn: facts.drawn.includes(face) }
  }
  const { faces: _faces, drawn: _drawn, ...measure } = facts
  return { box: { ...measure, faces }, jobs }
}
