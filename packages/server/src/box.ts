import { BOX_TYPES, CARD_STANDARD_63x88, TUCKBOX, TypeRegistry, boxFaceSize, boxFaceType, boxFit, type BoxCard, type BoxFace, type BoxFit, type BoxTypeDef } from '@byd/engine'
import { textFloorPt, validateCard, type Element, type FaceTemplate, type Issue } from '@byd/template'
import type { ProjectBox, ProjectDoc } from './projects.js'
import { copiesOf } from './setup.js'

// Spelets låda ur dokumentet (#1412): typen spelet pinnar, leken som bordet delar den (`antal`), och
// designerns lås och luft. Den enda läsningen av lådan, så att editorn, Fysisk kontroll och det som
// ritar lådan senare (#1413, #1414) talar om samma låda. Ren och utan I/O, som `applyEdit`.

const BOXES = new TypeRegistry(BOX_TYPES)

// Lådan ett spel har när det aldrig rört sin: tuckboxen (#1406, beslut 4).
export const DEFAULT_BOX_TYPE = { id: TUCKBOX.id, version: TUCKBOX.version } as const

export type GameBox = BoxFit & { type: BoxTypeDef; card: BoxCard }

export function boxOf(doc: Pick<ProjectDoc, 'rows' | 'box'>): GameBox {
  const box: ProjectBox | undefined = doc.box
  const type = BOXES.box(box?.type ?? DEFAULT_BOX_TYPE)
  const card = CARD_STANDARD_63x88.physical
  const fit = boxFit({ type, card, cards: doc.rows.reduce((n, row) => n + copiesOf(row.fields), 0), clearance: box?.clearance, locked: box?.locked })
  return { ...fit, type, card }
}

// En yta på lådan som den ritas (#1413): designerns mall när hon har ritat den, och annars den neutrala
// ytan (#1406, beslut 5), lekens färg och spelets namn och inget mer. Den neutrala ytan är en mall som
// alla andra och ritas av samma renderare (E2); den skrivs aldrig i dokumentet förrän designern rör
// ytan, och då blir den hennes. Den bär inga av verktygets ord, bara spelets namn, så den är densamma
// på varje språk (A4). Heron, länkbilden och «Visa upp» (#1414, #1416, #1417) frågar här.
export type BoxFaceDrawing = { drawn: boolean; template: FaceTemplate }

export function boxFaceOf(doc: Pick<ProjectDoc, 'rows' | 'box' | 'name' | 'template'>, face: BoxFace): BoxFaceDrawing {
  const own = doc.box?.faces?.[face]
  if (own) return { drawn: true, template: own }
  const { type, size } = boxOf(doc)
  return { drawn: false, template: { base: neutralFace(face, boxFaceSize(face, size), doc.name, deckColour(doc), textFloorPt(type.print, doc.name), type.print.bleedMm), variants: {} } }
}

// Fysisk kontroll på lådan (#1459, E5, L91): varje yta designern har ritat prövas med samma regler
// som ett kort, med lådtypens egen `print` (utfall, skyddsmarginal och textgolv per skrift) och i
// ytans eget mått (`boxFaceType`). En neutral yta prövas inte, eftersom den är verktygets och inte
// designerns, och en tom yta har inget att pröva. Editorn och servern frågar här, så att det är samma
// dom på båda ställena, som för korten. En yta binder ingen kolumn, så raden är tom.
export type BoxFound = Issue & { face: BoxFace }

export function boxIssues(doc: Pick<ProjectDoc, 'rows' | 'box' | 'fonts'>): BoxFound[] {
  const { type, size } = boxOf(doc)
  const found: BoxFound[] = []
  for (const face of type.faces) {
    const own = doc.box?.faces?.[face]
    if (!own) continue
    for (const issue of validateCard({ type: boxFaceType(type, face, size), face: own, row: {}, ...(doc.fonts ? { fonts: doc.fonts } : {}) })) found.push({ ...issue, face })
  }
  return found
}

// Omslaget i heron i Mina spel (#1416, L91): lådan i C:s stilla form, framsidan och högra sidan, de
// ytor en låda snett framifrån i ögonhöjd visar. Locket står inte med: lutad så lite som C:s form
// lutar den blir lockets text några pixlar hög och läses som smuts. Varje yta som `boxFaceOf` ger den, så att heron
// ritar samma låda som nätet och «Visa upp» (E2). Typen och måtten följer med, eftersom en yta ritas
// i sitt eget mått, och lekens ikoner, typsnitt och palett, eftersom en ritad yta kan skriva dem.
export const COVER_FACES = ['front', 'right'] as const satisfies readonly BoxFace[]
export type CoverFace = (typeof COVER_FACES)[number]
export type GameCover = {
  type: { id: string; version: number }
  size: GameBox['size']
  faces: Record<CoverFace, BoxFaceDrawing>
  icons: ProjectDoc['icons']
  fonts?: ProjectDoc['fonts']
  palette?: ProjectDoc['palette']
}
export function coverOf(doc: Pick<ProjectDoc, 'rows' | 'box' | 'name' | 'template' | 'icons' | 'fonts' | 'palette'>): GameCover {
  const { type, size } = boxOf(doc)
  return {
    type: { id: type.id, version: type.version },
    size,
    faces: Object.fromEntries(COVER_FACES.map((face) => [face, boxFaceOf(doc, face)])) as Record<CoverFace, BoxFaceDrawing>,
    icons: doc.icons,
    ...(doc.fonts ? { fonts: doc.fonts } : {}),
    ...(doc.palette ? { palette: doc.palette } : {}),
  }
}

// Om heron visar omslaget (#1416): när designern har öppnat lådan, och när någon yta är ritad, för
// att rita den är att ha öppnat den. Ett spel som kom med en import eller som en kopia bär sin ritade
// låda men inte att fliken öppnades.
export function showsCover(doc: Pick<ProjectDoc, 'box'>, opened: boolean): boolean {
  return opened || Object.keys(doc.box?.faces ?? {}).length > 0
}

// Lekens färg: det kortets baksida, och annars framsidan, målas i över hela kortet. En lek som inte
// målar något har en mörk kartong, så att namnet står ljust på den som på en ritad låda.
const BOARD = '#2b3a4a'
function deckColour(doc: Pick<ProjectDoc, 'template'>): string {
  const card = CARD_STANDARD_63x88.physical
  for (const side of ['back', 'front']) {
    const ground = doc.template.faces[side]?.base.find((el) => el.kind === 'shape' && typeof el.fill === 'string' && el.x <= 0 && el.y <= 0 && el.w >= card.widthMm && el.h >= card.heightMm)
    if (ground?.kind === 'shape' && typeof ground.fill === 'string') return ground.fill
  }
  return BOARD
}
// Namnet i ljust på en mörk färg och i mörkt på en ljus, efter färgens relativa luminans.
function inkOn(colour: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour)?.[1]
  if (!hex) return '#f3ecdc'
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#1b1d23' : '#f3ecdc'
}
const PT_PER_MM = 72 / 25.4
function neutralFace(face: BoxFace, size: { widthMm: number; heightMm: number }, name: string, fill: string, floorPt: number, bleedMm: number): Element[] {
  // Färgen går ut i utfallet, som ett korts bakgrund gör (E5): en yta designern tar över blir hennes
  // med den här grunden, och en grund som slutar vid snittet lämnar en vit kant där kniven vandrar
  // och är ett fel i Fysisk kontroll (#1459).
  const ground: Element = { kind: 'shape', id: 'ground', x: -bleedMm, y: -bleedMm, w: size.widthMm + 2 * bleedMm, h: size.heightMm + 2 * bleedMm, shape: 'rect', fill }
  // Namnet bärs av framsidan, locket och sidorna, där en låda i en hylla läses; baksidan och botten
  // är bara färg.
  if (face === 'back' || face === 'bottom') return [ground]
  // Och bara där det blir minst så stort som E5:s textgolv för tryck i namnets skrift (#1458): på en
  // tunn låda blev namnet längs ryggen och på locket knappt en millimeter högt. Där är ytan bara
  // lekens färg, och designern lägger en text där själv om hon vill.
  const title = nameOn(face, size, name, inkOn(fill))
  return title.font.sizePt >= floorPt ? [ground, title] : [ground]
}
type NameElement = Extract<Element, { kind: 'text' }>
function nameOn(face: 'front' | 'left' | 'right' | 'lid', { widthMm: w, heightMm: h }: { widthMm: number; heightMm: number }, name: string, ink: string): NameElement {
  // Luften runt namnet är 3 mm, men aldrig mer än en fjärdedel av ytans mått på den ledden (#1448):
  // en lek på högst 13 kort ger en rygg och ett lock under 6 mm, och där gav 3 mm från båda kanterna
  // en ruta med negativ bredd, en mall ingen redigering kunde lägga in. Rutan är alltså alltid minst
  // halva ytan, och namnet krymper i den (E6).
  const airX = inset(w)
  const airY = inset(h)
  const round = (mm: number) => Math.round(mm * 10) / 10
  const pt = (mm: number) => Math.max(1, Math.round(mm * PT_PER_MM))
  // Sidorna bär namnet längs ryggen (#1431), vridet ett kvarts varv som på en riktig tuckbox, med
  // bokstävernas överkant mot framsidan: nätet läser vänster sida, framsida, höger sida, så den
  // vänstra vrids medsols och den högra motsols. Rutan är hela ryggen innanför luften, och
  // bokstavens höjd tas ur ryggens bredd, lådans djup; ett namn som är för långt krymper (E6).
  if (face === 'left' || face === 'right') {
    const across = round(w - 2 * airX)
    return {
      kind: 'text',
      id: 'title',
      x: round(airX),
      y: round(airY),
      w: across,
      h: round(h - 2 * airY),
      bind: { literal: name },
      font: { family: 'sans-serif', sizePt: pt(Math.min(9, across * 0.32)), weight: 700, align: 'center' },
      color: ink,
      fit: 'shrink',
      valign: 'middle',
      rotationDeg: face === 'left' ? 90 : -90,
    }
  }
  const sizeMm = face === 'front' ? w * 0.11 : Math.min(5, h * 0.16)
  const boxH = face === 'front' ? Math.min(h - 2 * airY, sizeMm * 3) : h - 2 * airY
  return {
    kind: 'text',
    id: 'title',
    x: round(airX),
    y: round((h - boxH) / 2),
    w: round(w - 2 * airX),
    h: round(boxH),
    bind: { literal: name },
    font: { family: 'sans-serif', sizePt: pt(sizeMm), weight: 700, align: 'center' },
    color: ink,
    fit: 'shrink',
    valign: 'middle',
  }
}
const AIR = 3
const inset = (mm: number) => Math.min(AIR, mm / 4)
