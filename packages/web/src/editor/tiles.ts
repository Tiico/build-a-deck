import { TILE_COIN, TILE_HEX, TILE_ROUND, TILE_SQUARE, rotationStep, type ComponentTypeDef } from '@byd/engine'
import type { ProjectDeck, ProjectDoc } from '@byd/server'
import { copiesOf, nextCardRef, type Marker } from '@byd/server/doc'
import type { FaceTemplate, Row } from '@byd/template'
import type { Key, T } from '../i18n/index.js'

// The game's tiles in Bord and Mall (#1487, editorvariant A i #1474): the shapes a tile is cut in,
// what a new marker and a new deck of tiles are when the ＋ lays them, and the words a row says them in.

// The four tile types the registry has (#1482), in the order a choice offers them: the shapes are
// beställarens beslut 9 (square, hexagon, round), and the coin is the round one a marker most often is.
export const TILE_TYPES: readonly ComponentTypeDef[] = [TILE_HEX, TILE_SQUARE, TILE_ROUND, TILE_COIN]
export const typeRef = (type: ComponentTypeDef) => ({ id: type.id, version: type.version })
export const tileType = (ref: { id: string; version: number }): ComponentTypeDef | undefined => TILE_TYPES.find((d) => d.id === ref.id && d.version === ref.version)

// What a shape is called and how big it is: «sexhörning 52 mm», «rund 25 mm». A hexagon is measured
// across its flats, the way the prototype and the punch board say it.
const SHAPE_WORD: Record<string, Key> = { hex: 'tile.shape.hex', roundedRect: 'tile.shape.square', circle: 'tile.shape.round' }
export const shapeName = (type: ComponentTypeDef, t: T): string => t(SHAPE_WORD[type.physical.shape] ?? 'tile.shape.square')
export const shapeWords = (type: ComponentTypeDef, t: T): string => t('tile.shape.size', { shape: shapeName(type, t), mm: Math.round(type.physical.widthMm) })
export const stepOf = (type: ComponentTypeDef): number => rotationStep(type)

const blank = () => ({ base: [], variants: {} })
const free = (taken: ReadonlySet<string>, base: string): string => {
  let n = 1
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

// A marker as «＋ Bricka» › «Markör» lays it (#1487): ten coins, both sides blank and in the document
// from the start, so that the first layer drawn on either is a step back of its own (L14). Named in
// the designer's language (A4); she renames it in its row.
export function newMarker(doc: Pick<ProjectDoc, 'setup'>, place: string, t: T): Marker {
  const markers = doc.setup.markers ?? []
  const id = free(new Set(markers.map((m) => m.id)), 'markor')
  const where = place.startsWith('role:') ? { role: place.slice('role:'.length) } : { zone: place.slice('zone:'.length) }
  return { id, name: t('tile.marker.new'), type: typeRef(TILE_COIN), faces: { front: blank(), back: blank() }, count: 10, ...where }
}

// A deck of tiles as «＋ Bricka» › «Hög ur en lek» or «＋ Lek» makes it (#1487): hexagons, one tile to
// draw on, blank sides, lying in the pile it was made for. Its name is its id's word in the
// designer's language.
export function newTileDeck(doc: Pick<ProjectDoc, 'decks'>, zone: string, t: T): ProjectDeck {
  const decks = doc.decks ?? []
  const id = free(new Set(decks.map((d) => d.id)), 'brickor')
  const n = Number(id.slice('brickor-'.length))
  return {
    id,
    name: n === 1 ? t('tile.deck.new') : t('tile.deck.new.n', { n }),
    type: typeRef(TILE_HEX),
    template: { faces: { front: blank(), back: blank() } },
    rows: [{ id: nextCardRef({ rows: [] }), fields: { title: '', antal: 1 } }],
    zone,
  }
}

// A face of a tile as the felt draws it (#1487), by the name the tile goes by at the table: a
// marker's (`marker:<id>`) side, or a side of a row of another deck (`<deck>:<row>`, `rowRef`), with
// the type it is drawn at and the row it is drawn with. Nothing for a card of the document's own
// deck, and nothing for a side with no layer on it yet.
export function tileFaceOf(doc: Pick<ProjectDoc, 'decks' | 'setup'>, cardRef: string, side: string): { face: FaceTemplate; row: Row; type: ComponentTypeDef } | null {
  const at = cardRef.indexOf(':')
  if (at <= 0) return null
  const owner = cardRef.slice(0, at)
  const id = cardRef.slice(at + 1)
  const drawn = (face: FaceTemplate | undefined) => face !== undefined && (face.base.length > 0 || Object.keys(face.variants).length > 0)
  if (owner === 'marker') {
    const marker = doc.setup.markers?.find((m) => m.id === id)
    const face = marker?.faces?.[side as keyof NonNullable<Marker['faces']>]
    const type = marker && tileType(marker.type)
    return marker && type && drawn(face) ? { face: face!, row: { title: marker.name }, type } : null
  }
  const deck = doc.decks?.find((d) => d.id === owner)
  const row = deck?.rows.find((r) => r.id === id)
  const face = deck?.template.faces[side]
  const type = deck && tileType(deck.type)
  return deck && row && type && drawn(face) ? { face: face!, row: row.fields, type } : null
}

// How many tiles a deck lays: every row's copies (L4).
export const tilesIn = (deck: Pick<ProjectDeck, 'rows'>): number => deck.rows.reduce((n, r) => n + copiesOf(r.fields), 0)
