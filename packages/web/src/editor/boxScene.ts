import { boxFaceSize, type BoxFace, type BoxMeasure } from '@byd/engine'

// Produktbilden i «Visa upp» (#1414, L91, #1406 runda 2): lådan och leken som föremål på ett golv, i
// lekens egna mått. Tolv plan i CSS 3D: lådans sex ytor, lekens framkort, baksida och tre kanter, och
// golvet. Ljuset är bakat i två lager per plan, skuggningen efter planets normal och en glansrand där
// lacken speglar ljuset, och båda räknas om när lådan vrids. Bara transform och opacitet ändras, så
// webbläsaren sammansätter bilden på grafikkortet utan att lägga ut något igen.
//
// Här står bara geometrin och ljuset, utan React och utan DOM, så att det som ritas och det som
// prövas räknas på ett ställe. Ytorna själva är renderarens (E2); ingenting här ritar en yta.

export type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number }
export type Normal = readonly [number, number, number]
export type Plane = { pose: Pose; width: number; height: number; normal: Normal }
export type DeckPart = 'face' | 'back' | 'right' | 'left' | 'top'
export type Scene = {
  // How much room the picture needs at its rest angle, in the same pixels as the planes.
  width: number
  height: number
  box: Record<BoxFace, Plane>
  // A deck of no cards has no block to stand beside the box.
  deck: Record<DeckPart, Plane> | null
  floor: { pose: Pose; width: number; height: number }
}

// The angle the box rests at: a little from above and turned so that its front, its right side and
// its lid are seen, as in the prototype.
export const REST = { rx: -12, ry: -28 } as const
// How far it turns either way on its own, and how slowly: one swing in about 21 seconds.
export const SWAY_DEG = 18
const SWAY_MS = 3400
// The fold between the net and the box (#1406, beslut runda 2): about 0.9 s.
export const FOLD_MS = 900
// Where the light comes from, in the viewer's frame: above, left and in front.
const LIGHT: Normal = norm([-0.45, -0.7, 0.55])
// Halfway between the light and the viewer, where a lacquered face shines.
const HALF: Normal = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1])
// The air between the box and the deck, and how far the deck stands forward of the box's front.
const GAP_MM = 16
const FORWARD_MM = 6

export const FACE_NORMALS: Record<BoxFace, Normal> = { front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0], lid: [0, -1, 0], bottom: [0, 1, 0] }
// The lacquer lies on the front and the lid; the rest is matt laminate with a little sheen.
export const GLOSS: Record<BoxFace, number> = { front: 1, lid: 1, back: 0.4, right: 0.4, left: 0.4, bottom: 0.4 }
export const DECK_GLOSS: Record<DeckPart, number> = { face: 0.6, back: 0.3, right: 0, left: 0, top: 0 }

const pose = (x: number, y: number, z: number, rx = 0, ry = 0): Pose => ({ x, y, z, rx, ry, rz: 0, s: 1 })

// The box and the deck in pixels, `px` to the millimetre, centred on the middle of the floor.
// Every plane is laid out centred on its own middle and then moved by its pose.
export function showScene(size: BoxMeasure, card: { widthMm: number; heightMm: number }, deckMm: number, px: number): Scene {
  const W = size.width * px
  const H = size.height * px
  const D = size.depth * px
  const t = deckMm * px
  const cw = card.widthMm * px
  const ch = card.heightMm * px
  const hasDeck = deckMm > 0
  const total = hasDeck ? W + GAP_MM * px + cw : W
  const bx = -total / 2 + W / 2
  const face = (f: BoxFace, p: Pose): Plane => {
    const { widthMm, heightMm } = boxFaceSize(f, size)
    return { pose: p, width: widthMm * px, height: heightMm * px, normal: FACE_NORMALS[f] }
  }
  const box: Record<BoxFace, Plane> = {
    front: face('front', pose(bx, 0, D / 2)),
    back: face('back', pose(bx, 0, -D / 2, 0, 180)),
    right: face('right', pose(bx + W / 2, 0, 0, 0, 90)),
    left: face('left', pose(bx - W / 2, 0, 0, 0, -90)),
    lid: face('lid', pose(bx, -H / 2, 0, 90)),
    bottom: face('bottom', pose(bx, H / 2, 0, -90)),
  }
  let deck: Scene['deck'] = null
  if (hasDeck) {
    const kx = total / 2 - cw / 2
    const ky = (H - ch) / 2
    const kz = D / 2 - t / 2 + FORWARD_MM * px
    deck = {
      face: { pose: pose(kx, ky, kz + t / 2), width: cw, height: ch, normal: [0, 0, 1] },
      back: { pose: pose(kx, ky, kz - t / 2, 0, 180), width: cw, height: ch, normal: [0, 0, -1] },
      right: { pose: pose(kx + cw / 2, ky, kz, 0, 90), width: t, height: ch, normal: [1, 0, 0] },
      left: { pose: pose(kx - cw / 2, ky, kz, 0, -90), width: t, height: ch, normal: [-1, 0, 0] },
      top: { pose: pose(kx, ky - ch / 2, kz, 90), width: cw, height: t, normal: [0, -1, 0] },
    }
  }
  const deep = Math.max(D, t + FORWARD_MM * px)
  return {
    // The rest angle shows some of the depth beside the front and over the lid.
    width: total + deep,
    height: H + deep,
    box,
    deck,
    floor: { pose: pose(0, H / 2 + 1, 0, 90), width: total * 1.5, height: deep * 3.2 },
  }
}

// Where a face lies flat on the net, given the middle of its panel on the screen relative to the
// middle of the picture, and how much smaller the panel is than the plane. Written with the same
// functions in the same order as a pose in the box, so the fold goes from one to the other function
// by function: the faces glide and turn onto their sides, and the lid, drawn upside down on the
// sheet, turns the right way up as it folds over.
export function netPose(at: { x: number; y: number }, scale: number, face: BoxFace, turned: boolean): Pose {
  return { x: at.x, y: at.y, z: 0, rx: 0, ry: face === 'back' ? 360 : 0, rz: turned ? 180 : 0, s: scale }
}

export function poseTransform(p: Pose): string {
  return `translate3d(${px(p.x)}px, ${px(p.y)}px, ${px(p.z)}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg) scale(${Math.round(p.s * 10000) / 10000})`
}
const px = (n: number) => Math.round(n * 100) / 100

// A normal as the viewer sees it once the box is turned: CSS `rotateX(rx) rotateY(ry)` turns a point
// by the Y turn first and the X turn after it.
export function turn(n: Normal, rx: number, ry: number): Normal {
  const a = (rx * Math.PI) / 180
  const b = (ry * Math.PI) / 180
  const x1 = n[0] * Math.cos(b) + n[2] * Math.sin(b)
  const z1 = -n[0] * Math.sin(b) + n[2] * Math.cos(b)
  const y2 = n[1] * Math.cos(a) - z1 * Math.sin(a)
  const z2 = n[1] * Math.sin(a) + z1 * Math.cos(a)
  return [x1, y2, z2]
}

// Whether a face is turned toward the viewer, who looks down the z axis from in front.
export function facing(n: Normal, rx: number, ry: number): boolean {
  return turn(n, rx, ry)[2] > 1e-6
}

// The two baked layers of a plane at an angle: how dark its shadow lies (the opacity of a black
// layer), how bright the lacquer shines (the opacity of the gloss band, by how much lacquer the plane
// has), and how far the band has slid across it, in percent of its width.
export function lit(n: Normal, rx: number, ry: number, gloss: number): { shadow: number; shine: number; shift: number } {
  const v = turn(n, rx, ry)
  const diffuse = Math.max(0, dot(v, LIGHT))
  const spec = gloss === 0 ? 0 : Math.pow(Math.max(0, dot(v, HALF)), 18) * gloss
  return { shadow: round3(0.62 * (1 - (0.28 + 0.72 * diffuse))), shine: round3(0.55 * spec), shift: Math.round(v[0] * 600) / 10 }
}

// The calm turn of its own: from where it stands, back and forth around it.
export function swayed(base: number, since: number): number {
  return base + SWAY_DEG * Math.sin(since / SWAY_MS)
}

// The box turned by the pointer: half a degree a pixel across, and a little less up and down, never
// further over than to see the lid from straight above or under it from a little below.
export function turnedBy(from: { rx: number; ry: number }, dx: number, dy: number): { rx: number; ry: number } {
  return { rx: Math.max(-60, Math.min(20, from.rx - dy * 0.4)), ry: from.ry + dx * 0.5 }
}

function dot(a: Normal, b: Normal): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function norm(v: Normal): Normal {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}
const round3 = (n: number) => Math.round(n * 1000) / 1000
