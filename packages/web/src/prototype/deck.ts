// PROTOTYPE — throwaway. Delete when the question is answered.
//
// A deck's art as it actually arrives: one file per card, drawn by whoever drew it, and no two
// files agreeing about format or about how much air stands around the drawing. That disagreement
// is the whole question the image workspace exists to answer, so the sample deck is built to
// carry it rather than to look nice: the same six motifs, deliberately mis-framed against each
// other, with the motif's true box known so a prototype can show what a measurement would find.

export type Piece = {
  id: string
  card: string
  // The file's own pixels.
  w: number
  h: number
  // Where the drawing actually sits inside the file, in the file's pixels. This is what the
  // browser's motif measurement finds; here it is known because we drew it.
  motif: { x: number; y: number; w: number; h: number }
  src: string
}

// One drawing, placed at a given box inside a given file size. `body` is drawn in a 0 0 100 100
// space and scaled into the motif box, so air is the only thing that differs between two files
// carrying the same motif.
function piece(id: string, card: string, w: number, h: number, motif: Piece['motif'], body: string, ground = 'none'): Piece {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    (ground === 'none' ? '' : `<rect width="${w}" height="${h}" fill="${ground}"/>`) +
    `<g transform="translate(${motif.x} ${motif.y}) scale(${motif.w / 100} ${motif.h / 100})">${body}</g>` +
    `</svg>`
  return { id, card, w, h, motif, src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }
}

const DRAKE =
  '<path d="M50 8 L74 30 L92 26 L80 44 L88 62 L62 70 L50 92 L38 70 L12 62 L20 44 L8 26 L26 30 Z" fill="#7d3c2e"/>' +
  '<circle cx="50" cy="44" r="14" fill="#e0b35c"/><circle cx="50" cy="44" r="5" fill="#2b1a14"/>'
const RIDDARE =
  '<path d="M50 6 L86 20 V52 C86 74 70 88 50 96 C30 88 14 74 14 52 V20 Z" fill="#3d5a80"/>' +
  '<path d="M50 24 V72 M30 44 H70" stroke="#e8eef6" stroke-width="9" stroke-linecap="square"/>'
const TROLLKARL =
  '<path d="M50 4 L74 58 H26 Z" fill="#4b3f72"/><rect x="22" y="58" width="56" height="14" rx="4" fill="#2e2647"/>' +
  '<circle cx="50" cy="82" r="13" fill="#d8c47a"/>'
const VARG = '<path d="M14 90 L26 34 L44 50 H60 L74 32 L88 90 Z" fill="#4a4f57"/><circle cx="42" cy="66" r="5" fill="#f2c14e"/><circle cx="64" cy="66" r="5" fill="#f2c14e"/>'
const TORN = '<rect x="30" y="20" width="40" height="76" fill="#8a8578"/><path d="M26 20 h48 v-10 h-8 v6 h-8 v-6 h-8 v6 h-8 v-6 h-8 z" fill="#6f6a5e"/><rect x="43" y="56" width="14" height="40" fill="#3a352d"/>'
const BAGARE = '<path d="M28 20 h44 l-6 34 a16 16 0 0 1 -32 0 z" fill="#b8860b"/><rect x="45" y="54" width="10" height="26" fill="#8a6508"/><rect x="30" y="80" width="40" height="10" rx="4" fill="#8a6508"/>'

// Six files, six disagreements. Two are photographs in all but name: they carry a solid ground
// to the edge rather than transparency, which is the case the automatic measurement handles and
// a person must be able to see it handled.
export const DECK: Piece[] = [
  piece('drake', 'Drake', 1400, 1100, { x: 390, y: 180, w: 620, h: 700 }, DRAKE),
  // The one that cannot answer: delivered cropped to the drawing, with no air left to give. No
  // rule can put it at the same size as the rest, and a surface that hides that is lying.
  piece('riddare', 'Riddare', 1400, 900, { x: 30, y: 20, w: 1340, h: 860 }, RIDDARE),
  piece('trollkarl', 'Trollkarl', 1300, 1000, { x: 400, y: 180, w: 500, h: 640 }, TROLLKARL),
  piece('varg', 'Varg', 900, 1400, { x: 140, y: 470, w: 620, h: 470 }, VARG, '#efe7d6'),
  piece('torn', 'Torn', 1500, 1100, { x: 510, y: 140, w: 480, h: 820 }, TORN),
  piece('bagare', 'Bägare', 760, 760, { x: 180, y: 170, w: 400, h: 420 }, BAGARE, '#1d2733'),
]

// The frame a deck's art is fitted into, in millimetres: the template's picture area on a
// 63×88 mm card. Everything the workspace does is measured against this.
export const FRAME_MM = { w: 53, h: 40 }
export const ratio = FRAME_MM.w / FRAME_MM.h
