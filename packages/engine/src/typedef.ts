import { z } from 'zod'
import { FaceId, type TypeRef } from '@byd/protocol'

// A component type is data: immutable, versioned, pinned by a game version.
// The engine knows nothing about cards or dice — only what a definition declares.

export const FieldDef = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['text', 'number', 'image', 'boolean']),
  required: z.boolean().default(false),
})
export type FieldDef = z.infer<typeof FieldDef>

export const ComponentTypeDef = z.object({
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  physical: z.object({
    // A figure (#1471) is a piece cut in a silhouette, as a meeple is: none of the outlines above.
    shape: z.enum(['rect', 'roundedRect', 'hex', 'circle', 'polyhedron', 'figure']),
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
    thicknessMm: z.number().positive(),
    cornerRadiusMm: z.number().nonnegative().optional(),
    material: z.string().min(1),
  }),
  faces: z.array(FaceId).min(1),
  // The face that carries the component's identity. Showing any other face hides it.
  contentFace: FaceId,
  // A type whose every face shows what it is (#1471): a meeple lying down is the same meeple, in the
  // same colour, as one standing. Absent, a face other than `contentFace` hides it, as a card's back.
  everyFaceShows: z.literal(true).optional(),
  // A type whose faces the document draws, a template of its own per side (L91, #1479), rather than a
  // row of the deck: a board. Its `cardRef` names that drawing in the document, never a row, so a
  // row that shares the word gives it no face, title or words. Absent, its faces are a row's.
  ownFaces: z.literal(true).optional(),
  behaviours: z.object({
    stackable: z.boolean(),
    shufflable: z.boolean(),
    flippable: z.boolean(),
    rollable: z.union([z.literal(false), z.object({ faces: z.number().int().min(2) })]),
    counter: z.boolean(),
    // Never held in a hand (K32, #1471): material that lies on the table. Declared by the type rather
    // than guessed from whether it rolls or counts, since a meeple does neither. Absent, it is held.
    holdable: z.literal(false).optional(),
    // Lies where the setup put it (#1479, beställarens beslut 6 i #1470): a board is never moved or
    // turned at the table, by any verb. Absent, it is moved as everything else is.
    movable: z.literal(false).optional(),
    // The step a turn takes on the table (#1482), in degrees: a hexagon's sixth of a turn. The type's
    // to say and the screen's to use; `rotate` takes any angle, so the step is no verb and the engine
    // refuses nothing off it. Absent, a quarter turn, as a card has always turned.
    rotationStepDeg: z.number().positive().max(360).optional(),
  }),
  editorSchema: z.array(FieldDef),
  print: z.object({
    bleedMm: z.number().nonnegative(),
    safeMm: z.number().nonnegative(),
    dpi: z.number().int().positive(),
    colorProfile: z.string().min(1),
    minPtByScript: z.record(z.string(), z.number().positive()),
    // A stock item the partner buys and packs rather than prints (#1140): a die in a printed game
    // is a standard die in the box. It goes to print as hardware beside the cards, never as a card.
    stock: z.literal(true).optional(),
  }),
  manufacturableBy: z.array(z.string().min(1)),
})
export type ComponentTypeDef = z.infer<typeof ComponentTypeDef>

// Material (K31, K32): a piece that lies on the table and is never held in a hand, as against a card.
// What the type declares (`holdable: false`), and nothing else (#1471).
export const isMaterial = (def: ComponentTypeDef): boolean => def.behaviours.holdable === false

// Fixed (#1479): a type that lies where the setup put it, a board. What the type declares.
export const isFixed = (def: ComponentTypeDef): boolean => def.behaviours.movable === false

// The step a component turns in on the table (#1482): what the type declares, or a quarter turn.
export const rotationStep = (def: ComponentTypeDef): number => def.behaviours.rotationStepDeg ?? 90

export const typeKey = (ref: TypeRef): string => `${ref.id}@${ref.version}`

// The game's box (#1412, L91): a type in the same registry (B1, B2), but not a component. It never
// lies on a table, and its size is not its own: it holds the deck, so its measure is worked out of
// the deck's cards (`boxMeasure`) rather than declared here. What it declares is how much air it
// leaves around the card and in the depth, and the step its depth is rounded up to.
//
// Six faces, named by the document's own keys and never translated (A4). The front is the game's
// cover (#1406, beslut 3), so it is the face that carries the box's identity.
export const BoxFace = z.enum(['front', 'back', 'left', 'right', 'lid', 'bottom'])
export type BoxFace = z.infer<typeof BoxFace>
export const BoxTypeDef = z.object({
  kind: z.literal('box'),
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  physical: z.object({
    shape: z.literal('tuckbox'),
    // The board the box is folded from: what a presentation gives its walls (#1414). The measure
    // does not read it.
    thicknessMm: z.number().positive(),
    material: z.string().min(1),
    // The flaps the net adds around the six faces (#1413): the glue flap along the left side, the
    // tuck flaps on the lid and the bottom, and the dust flaps on the sides as a part of the depth.
    // They are folded in and never printed, so they are the net's and not a face's.
    flaps: z.object({ glueMm: z.number().positive(), tuckMm: z.number().positive(), dust: z.number().positive().max(1) }),
  }),
  faces: z.array(BoxFace).min(1),
  contentFace: BoxFace,
  holds: z.object({
    clearanceMm: z.object({ around: z.number().nonnegative(), depth: z.number().nonnegative() }),
    stepMm: z.number().positive(),
  }),
  editorSchema: z.array(FieldDef),
  print: z.object({
    bleedMm: z.number().nonnegative(),
    safeMm: z.number().nonnegative(),
    dpi: z.number().int().positive(),
    colorProfile: z.string().min(1),
    minPtByScript: z.record(z.string(), z.number().positive()),
  }),
  manufacturableBy: z.array(z.string().min(1)),
})
export type BoxTypeDef = z.infer<typeof BoxTypeDef>

const isBox = (def: ComponentTypeDef | BoxTypeDef): def is BoxTypeDef => 'kind' in def && def.kind === 'box'

export class TypeRegistry {
  private readonly defs = new Map<string, ComponentTypeDef>()
  private readonly boxes = new Map<string, BoxTypeDef>()

  constructor(defs: readonly (ComponentTypeDef | BoxTypeDef)[] = []) {
    for (const d of defs) this.register(d)
  }

  register(def: ComponentTypeDef | BoxTypeDef): void {
    const key = typeKey(def)
    if (this.defs.has(key) || this.boxes.has(key)) throw new Error(`type ${key} is already registered and immutable`)
    if (isBox(def)) this.boxes.set(key, BoxTypeDef.parse(def))
    else this.defs.set(key, ComponentTypeDef.parse(def))
  }

  get(ref: TypeRef): ComponentTypeDef {
    const def = this.defs.get(typeKey(ref))
    if (!def) throw new Error(this.boxes.has(typeKey(ref)) ? `type ${typeKey(ref)} is a box and not a component` : `unknown component type ${typeKey(ref)}`)
    return def
  }

  // Whether a table can lay it: a component, never a box.
  has(ref: TypeRef): boolean {
    return this.defs.has(typeKey(ref))
  }

  box(ref: TypeRef): BoxTypeDef {
    const def = this.boxes.get(typeKey(ref))
    if (!def) throw new Error(`unknown box type ${typeKey(ref)}`)
    return def
  }

  hasBox(ref: TypeRef): boolean {
    return this.boxes.has(typeKey(ref))
  }
}

// The one type the thin slice needs.
export const CARD_STANDARD_63x88: ComponentTypeDef = {
  id: 'card.standard.63x88',
  version: 1,
  physical: {
    shape: 'roundedRect',
    widthMm: 63,
    heightMm: 88,
    thicknessMm: 0.3,
    cornerRadiusMm: 3,
    material: 'cardstock-300gsm',
  },
  faces: ['front', 'back'],
  contentFace: 'front',
  behaviours: { stackable: true, shufflable: true, flippable: true, rollable: false, counter: false },
  editorSchema: [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'cost', label: 'Cost', kind: 'number', required: false },
    { key: 'body', label: 'Body', kind: 'text', required: false },
    { key: 'art', label: 'Art', kind: 'image', required: false },
  ],
  print: {
    bleedMm: 3,
    safeMm: 3,
    dpi: 300,
    colorProfile: 'sRGB',
    minPtByScript: { Latn: 6, Hani: 8, Arab: 7 },
  },
  manufacturableBy: [],
}

// A counter token (C4): a seat's life, gold or score as a component with a value. One face,
// nothing to shuffle or flip; `setCounter` is its verb. Drawn as a chip with the value.
export const TOKEN_COUNTER: ComponentTypeDef = {
  id: 'token.counter',
  version: 1,
  physical: { shape: 'circle', widthMm: 20, heightMm: 20, thicknessMm: 2, material: 'acrylic' },
  faces: ['front'],
  contentFace: 'front',
  behaviours: { stackable: false, shufflable: false, flippable: false, rollable: false, counter: true, holdable: false },
  editorSchema: [{ key: 'title', label: 'Title', kind: 'text', required: true }],
  print: { bleedMm: 0, safeMm: 1, dpi: 300, colorProfile: 'sRGB', minPtByScript: { Latn: 6 } },
  manufacturableBy: [],
}

// A die (#1136): one type per number of sides, as a table names them, with figures on the faces.
// Its value is the side facing up, kept where a counter keeps its value, and `roll` is its verb;
// the face it shows is the one face it has, since every side is equally public. The sizes are the
// common game dice and only matter to print: the felt draws a die larger than life, as it does a
// counter, because a 16 mm d6 would be a speck across a room.
const die = (faces: number, sizeMm: number): ComponentTypeDef => ({
  id: `die.d${faces}`,
  version: 1,
  physical: { shape: 'polyhedron', widthMm: sizeMm, heightMm: sizeMm, thicknessMm: sizeMm, material: 'acrylic' },
  faces: ['front'],
  contentFace: 'front',
  behaviours: { stackable: false, shufflable: false, flippable: false, rollable: { faces }, counter: false, holdable: false },
  editorSchema: [],
  print: { bleedMm: 0, safeMm: 0, dpi: 300, colorProfile: 'sRGB', minPtByScript: { Latn: 6 }, stock: true },
  manufacturableBy: [],
})
export const DICE: readonly ComponentTypeDef[] = [die(4, 18), die(6, 16), die(8, 18), die(10, 18), die(12, 20), die(20, 20)]

// The wooden pieces (#1471, #1470): a meeple, a cube and a disc, one family of types as the dice are
// one (beställarens beslut 3, 2026-10-28). Nothing is printed on them, and the colour is the seat's
// (L11, beslut 2): a piece laid for a seat carries the seat as its `cardRef`, as a counter carries
// its name. They are moved and nothing else, and never held (K32). A meeple may be laid down
// (beslut 4): `flip` between standing and lying, and lying it is still the same meeple to everyone.
// Like a die they are stock the partner packs and never cards (beslut 5, #1140). The sizes are the
// common wooden pieces and only matter to print.
const wood = (id: string, physical: ComponentTypeDef['physical'], faces: string[]): ComponentTypeDef => ({
  id: `piece.${id}`,
  version: 1,
  physical,
  faces,
  contentFace: faces[0] ?? 'front',
  ...(faces.length > 1 ? { everyFaceShows: true as const } : {}),
  behaviours: { stackable: false, shufflable: false, flippable: faces.length > 1, rollable: false, counter: false, holdable: false },
  editorSchema: [],
  print: { bleedMm: 0, safeMm: 0, dpi: 300, colorProfile: 'sRGB', minPtByScript: { Latn: 6 }, stock: true },
  manufacturableBy: [],
})
export const MEEPLE = wood('meeple', { shape: 'figure', widthMm: 16, heightMm: 16, thicknessMm: 10, material: 'wood' }, ['standing', 'lying'])
export const CUBE = wood('cube', { shape: 'polyhedron', widthMm: 8, heightMm: 8, thicknessMm: 8, material: 'wood' }, ['front'])
export const DISC = wood('disc', { shape: 'circle', widthMm: 16, heightMm: 16, thicknessMm: 5, material: 'wood' }, ['front'])
export const PIECES: readonly ComponentTypeDef[] = [MEEPLE, CUBE, DISC]

// The boards (#1479, #1470): a main board in a few sizes and a player board laid for every seat
// (beställarens beslut 7, 2026-10-28), each size a type of its own as the dice are. The sizes are the
// prototype's (#1473): a square and a rectangular main board and a small player board. One side each:
// two-sided boards come later, so none is flippable. A board lies fixed where the setup put it
// (beslut 6) and is never held (K32). Its side is designed in the document as a face of the box is
// (L91, `ownFaces`), and goes to print with bleed (beslut 12, #1488); the fold a big board needs is the
// partner's to say, so the shape is the flat sheet.
const board = (id: string, widthMm: number, heightMm: number): ComponentTypeDef => ({
  id: `board.${id}`,
  version: 1,
  physical: { shape: 'rect', widthMm, heightMm, thicknessMm: 2, material: 'greyboard-2mm' },
  faces: ['front'],
  contentFace: 'front',
  ownFaces: true,
  behaviours: { stackable: false, shufflable: false, flippable: false, rollable: false, counter: false, holdable: false, movable: false },
  editorSchema: [],
  print: { bleedMm: 3, safeMm: 5, dpi: 300, colorProfile: 'sRGB', minPtByScript: { Latn: 6, Hani: 8, Arab: 7 } },
  manufacturableBy: [],
})
export const BOARDS: readonly ComponentTypeDef[] = [board('square457', 457, 457), board('rect610', 610, 457), board('player', 240, 150)]

// The tiles (#1482, #1470): cardboard pieces that behave as a card does, in their own shape. The
// shapes are beställarens beslut 9 (2026-10-28), square, hexagon and round, in the sizes of the
// approved prototype (#1474): a hexagon 52 mm across its flats with a point up, a square of 45 mm,
// a round tile of 44 mm and a coin of 25 mm, all of 2 mm board. Each has a printed front and back,
// stacks, shuffles and flips as a card, and may be held hidden in a hand as a card (beslut 10), so
// it declares nothing that makes it material (K32). It turns in its shape's step: a sixth of a turn
// for the hexagon, a quarter for the square and the round one (2026-11-01). One type per shape and
// size, as the card is one type per size.
const tile = (id: string, physical: Omit<ComponentTypeDef['physical'], 'thicknessMm' | 'material'>, rotationStepDeg: number): ComponentTypeDef => ({
  id: `tile.${id}`,
  version: 1,
  physical: { ...physical, thicknessMm: 2, material: 'greyboard-2mm' },
  faces: ['front', 'back'],
  contentFace: 'front',
  behaviours: { stackable: true, shufflable: true, flippable: true, rollable: false, counter: false, rotationStepDeg },
  editorSchema: [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'body', label: 'Body', kind: 'text', required: false },
    { key: 'art', label: 'Art', kind: 'image', required: false },
  ],
  print: { bleedMm: 3, safeMm: 2, dpi: 300, colorProfile: 'sRGB', minPtByScript: { Latn: 6, Hani: 8, Arab: 7 } },
  manufacturableBy: [],
})
export const TILE_HEX = tile('hex.52', { shape: 'hex', widthMm: 52, heightMm: Math.round(((52 * 2) / Math.sqrt(3)) * 100) / 100 }, 60)
export const TILE_SQUARE = tile('square.45', { shape: 'roundedRect', widthMm: 45, heightMm: 45, cornerRadiusMm: 2 }, 90)
export const TILE_ROUND = tile('round.44', { shape: 'circle', widthMm: 44, heightMm: 44 }, 90)
export const TILE_COIN = tile('round.25', { shape: 'circle', widthMm: 25, heightMm: 25 }, 90)
export const TILES: readonly ComponentTypeDef[] = [TILE_HEX, TILE_SQUARE, TILE_ROUND, TILE_COIN]

// What every table knows.
export const STANDARD_TYPES: readonly ComponentTypeDef[] = [CARD_STANDARD_63x88, TOKEN_COUNTER, ...DICE, ...PIECES, ...TILES, ...BOARDS]

// The tuckbox (#1412, L91): the one box of step 1 (#1406, beslut 4). The deck stands in it on its edge
// and the lid tucks in at the top. Its measure follows the deck with 1 mm of air around the card and
// 2 mm in the depth, the depth rounded up to half a millimetre, which is the prototype's formula and
// gives 65 × 90 × 34,5 mm for 108 standard cards. The designer may change the air and lock any
// measure (`ProjectBox`), and this is only where both start.
//
// Its faces are drawn by the one renderer like a card's (E2), with the card's bleed and safe area.
// It is not among `STANDARD_TYPES`: a table never lays a box, and the print providers are made from
// that list, so a box there would be a box Testtryckeriet says it prints. That is step 2 (F1).
export const TUCKBOX: BoxTypeDef = {
  kind: 'box',
  id: 'box.tuck',
  version: 1,
  physical: { shape: 'tuckbox', thicknessMm: 0.4, material: 'folding-carton-350gsm', flaps: { glueMm: 12, tuckMm: 20, dust: 0.8 } },
  faces: ['front', 'back', 'left', 'right', 'lid', 'bottom'],
  contentFace: 'front',
  holds: { clearanceMm: { around: 1, depth: 2 }, stepMm: 0.5 },
  editorSchema: [],
  print: { bleedMm: 3, safeMm: 3, dpi: 300, colorProfile: 'sRGB', minPtByScript: { Latn: 6, Hani: 8, Arab: 7 } },
  manufacturableBy: [],
}

// Every box a game can be put in.
export const BOX_TYPES: readonly BoxTypeDef[] = [TUCKBOX]
