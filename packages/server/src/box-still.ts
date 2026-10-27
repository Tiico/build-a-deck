import type { BoxFace } from '@byd/engine'
import { BOX_STILL, boxStill, type FaceTemplate } from '@byd/template'
import { contentHash, type RenderKind, type RenderRequest } from '@byd/render/queue'
import { boxFaceOf, boxOf } from './box.js'
import type { ResolveFaces } from './box-print.js'
import type { Deck } from './faces.js'
import type { ProjectDoc } from './projects.js'

// Länkbilden (#1417, L91): «Visa upp» som stillbild, tagen av den enda renderaren (E2) en gång per
// version. Sidan är `boxStill`, byggd av samma geometri, ljus och regler som vyn, med lådans ytor som
// `boxFaceOf` ger dem och lekens första kort som kortväggen ritar det. Jobbet är nycklat på det som
// står på sidan (DRIFT §6), så samma version är samma bild och ritas en gång, och en ändring som syns
// på lådan eller kortet är en ny bild.
//
// Den är en JPEG: en förhandsvisare hämtar den över mobilnätet, och flera av dem hoppar över en bild
// som väger mer än några hundra kilobyte. En PNG av golvets mjuka ljus är det flera gånger om.

export const STILL_KIND: RenderKind = { kind: 'raster', format: 'jpg', widthPx: BOX_STILL.width, heightPx: BOX_STILL.height }

type StillDoc = Pick<ProjectDoc, 'rows' | 'box' | 'name' | 'template'>

export async function boxStillJobOf(doc: StillDoc, deck: Deck, now: number, resolve?: ResolveFaces): Promise<RenderRequest> {
  const fit = boxOf(doc)
  const drawn = Object.fromEntries(fit.type.faces.map((face) => [face, boxFaceOf(doc, face).template])) as Record<string, FaceTemplate>
  const own = resolve ? await resolve({ faces: drawn }) : { template: { faces: drawn }, motifs: {} }
  const first = doc.rows[0]
  const compiled = boxStill({
    type: fit.type,
    size: fit.size,
    card: fit.card,
    deckMm: fit.deckMm,
    faces: own.template.faces as Record<BoxFace, FaceTemplate>,
    cardFront: deck.template.faces['front'],
    cardBack: deck.template.faces['back'],
    row: (first && deck.rows[first.id]) ?? {},
    name: doc.name,
    icons: deck.icons,
    palette: deck.palette,
    fonts: deck.fonts,
    motifs: { ...deck.motifs, ...own.motifs },
  })
  return { hash: contentHash(compiled, STILL_KIND), kind: STILL_KIND, priority: 'print', compiled, requestedAt: now }
}
