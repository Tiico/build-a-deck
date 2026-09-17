import { contrastRatio, paintOf } from '@byd/template'
import type { FaceTemplate, ProjectDoc, ProjectRow } from './types.js'
import { idsOnFace, layersOf, valuesIn } from './groups.js'

// The wall in bands (#179). The deck's home view used to be one wall of every card in row order —
// 8 637 px in a 734 px box on a real deck, which is eleven screens of the same thing with nothing
// in them that says where in the deck the eye has got to. A band is the answer: the deck keeps
// every card (L8) and gains an order it can be read by.
//
// A band is identified by the value its cards carry in the grouping column, and a card that
// carries no value at all lands in the band whose value is `null`. That is not a nicety of typing:
// the loose band is named `Utan typ` in the reader's own language (A4), and a deck is perfectly
// free to hold a card whose type is literally the word `Utan typ`. Two bands bearing one name
// would be one band the moment either was keyed by it, so the loose band is keyed by being no
// value at all and can never be confused with a group that merely reads like it.
export type Band = { value: string | null; name: string; cards: ProjectRow[] }

// The bands of a wall: every value in the grouping column that has a card on screen, in the order
// the deck stands in, and the loose cards last.
//
// **A group with no cards gets no band, and no line in the table of contents.** `groupsOf` keeps a
// group the template has designed after its last card has gone, and it is right to: a look with
// nothing to show it on is still a look the designer must be able to find and change. But the
// place she changes it is the template tab, where a look is designed. The wall is the deck, and
// what L8 asks of it is that the whole deck is visible — an empty band shows no card, so it adds
// nothing to that and takes a screenful of the deck's own height to say it. The table of contents
// is the wall's contents besides: a line that jumps to nothing is the same broken promise as an
// arrow pointing at an empty rail, and the folded strip would have to give a zero-card group a
// 44 px tile in a strip whose whole reading is that height means size. It is also the one rule
// that survives a search: under a term that no `Location` answers, the `Location` band is gone,
// and it would be strange for the same band to stand empty when the deck itself has emptied it.
export function bandsOf(doc: ProjectDoc, rows: readonly ProjectRow[], column: string | null, looseName: string): Band[] {
  if (column === null) return []
  const out: Band[] = []
  for (const value of valuesIn(doc, column)) {
    const cards = rows.filter((row) => cellOf(row, column) === value)
    if (cards.length > 0) out.push({ value, name: value, cards })
  }
  const loose = rows.filter((row) => cellOf(row, column) === '')
  if (loose.length > 0) out.push({ value: null, name: looseName, cards: loose })
  return out
}

function cellOf(row: ProjectRow, column: string): string {
  const value = row.fields[column]
  return value === null || value === undefined ? '' : String(value)
}

// Which band the top of the view is standing in: the last one that has begun above the fold. The
// answer is a band and never nothing — a reader who has scrolled nowhere is standing in the first
// band, which is what the wall opens on.
//
// It is a function of tops and a scroll position and nothing else, so the mark can be reasoned
// about without a layout: the same arithmetic the jump writes when it scrolls somewhere.
export function bandAtTop(tops: readonly { key: string; top: number }[], scrollTop: number, room = Infinity, current: string | null = null): string | null {
  // The end of the deck is a place the tops cannot describe. There is nothing under the last band
  // to scroll up past it, so the wall runs out of room with the last bands still halfway down the
  // screen and their tops never reach the fold at all — on a real deck the final *two* bands began
  // beyond everything the wall could scroll, 604 px and 129 px past it. Read on tops alone the mark
  // would stop in the middle of the deck and stay there, so a jump into the tail would leave it on
  // a band the reader had already gone past.
  //
  // Once the wall is at its end those stranded bands are all on screen together, and there is no
  // scroll position left that could tell them apart: the arithmetic has genuinely run out of
  // answers rather than merely got one wrong. So the reader's own answer is kept where she has
  // given one — a jump into the tail stays marked on the band she jumped to — and a reader who has
  // only scrolled to the bottom, whose last mark is a band the scroll can still reach, is given the
  // last band, because the end of the deck is what she is looking at. The half pixel is for a
  // browser that reports a fractional scroll and so never lands exactly on its own maximum.
  //
  // `room` must be a real one. A wall that does not scroll at all reports none, and so does a
  // layout that has not measured anything yet — and neither of those is a reader at the end of the
  // deck. Both are a reader at the top of it, which is what the tops below say anyway.
  if (room > 0 && scrollTop >= room - 0.5) {
    const stranded = tops.filter(({ top }) => top > room - 0.5).map(({ key }) => key)
    if (current !== null && stranded.includes(current)) return current
    return tops[tops.length - 1]?.key ?? null
  }
  let here: string | null = tops[0]?.key ?? null
  // A band whose head is a hair below the fold has not been reached yet; the slack is the head's
  // own sticky offset and nothing to do with any font.
  for (const { key, top } of tops) if (top <= scrollTop + 8) here = key
  return here
}

// The colour a band is known by, read off the cards themselves (#179).
//
// The folded strip is painted in the deck's own head colours because those colours are already
// learned: they are what the cards beside it wear. So nothing here invents a palette. It asks the
// template which of its shapes is the one that *says* which group a card is in, and takes that
// shape's colour per group — through `paintOf`, which is the one way from a fill to a colour (L16),
// so the strip can never come out a different colour from the wall.
//
// A shape qualifies when it paints every card of a group alike and at least two groups unalike.
// The first test throws out a fill that follows some other column — a rarity plate is not a group's
// colour however colourful it is — and the second throws out the paper, which is the same on every
// card and therefore says nothing. The first shape that passes both, in the order the face draws
// them, is the head: the card's own background if the deck paints backgrounds by group, and the
// band across the top if it does not.
//
// A deck whose groups are told apart by text alone gets no colours here at all, and the strip is
// no worse off for it: the mark, the brighter tile and the white count carry where the reader is,
// and the colour was never allowed to carry it alone.
export function bandPaints(face: FaceTemplate, doc: ProjectDoc, column: string | null): Map<string, string> {
  const out = new Map<string, string>()
  if (column === null) return out
  // The loose cards are keyed by the empty value, exactly as a band is, and take whatever colour
  // the rule's own fallback gives them — which is the colour they are actually wearing. A key with
  // no card behind it is left out: it has no colour to be read off anything, and asking it to
  // agree with the others would leave the whole strip unpainted.
  const withCards = [...valuesIn(doc, column), ''].map((key) => ({ key, rows: doc.rows.filter((row) => cellOf(row, column) === key) })).filter((k) => k.rows.length > 0)
  const perKey = withCards.map(({ key, rows }) => {
    // A variant is the whole look a value is drawn in (L3), so a group that has one is read
    // through it; a column that is not the template's own grouping has none.
    const layers = layersOf(face, face.variants[key] ? key : null).filter((layer) => layer.source !== 'removed')
    const colours = new Map<string, string>()
    for (const { element } of layers) {
      if (element.kind !== 'shape') continue
      const seen = new Set(rows.map((row) => paintOf(element.fill, row.fields)))
      const only = seen.size === 1 ? [...seen][0] : undefined
      if (only !== undefined) colours.set(element.id, only)
    }
    return colours
  })
  const telling = idsOnFace(face).find((id) => {
    const seen = perKey.map((colours) => colours.get(id))
    return seen.every((colour) => colour !== undefined) && new Set(seen).size > 1
  })
  if (telling === undefined) return out
  for (const [i, { key }] of withCards.entries()) {
    const colour = perKey[i]?.get(telling)
    if (colour !== undefined) out.set(key, colour)
  }
  return out
}

// What a tile in the folded strip is written in (#179).
//
// The count is the tool's own text standing on a colour the *deck* chose, which is the case L11
// settled once already for the seats: the ink follows the ground, and where no ink reads the
// ground gives way. The difference here is that the seat palette is fixed and this one is not —
// a designer may paint her `Shopcard` head in any yellow she likes — so the reckoning has to be
// done per colour rather than decided once in a stylesheet.
//
// Two grounds come out of it, not one. The lit ground is the tile the reader is standing in and
// the quiet ground is every other tile, which is the "brighter tile" channel the fold has to
// survive on; the quiet one is stepped further from the ink, so it can only read better than the
// lit one it was measured from. Both hold the 4.5:1 that every other sentence in the editor holds.
const WHITE = '#ffffff'
// The dark ink the seat palette and the TV dock already write on a light colour (L11).
const DARK = '#0d0f14'
const READS = 4.5

export function tileColours(paint: string): { ground: string; quiet: string; ink: string } {
  const rgb = channels(paint)
  // A colour this cannot read is a colour it must not rewrite: the tile keeps it, and the mark
  // and the head above the wall carry where the reader is on their own.
  if (rgb === null) return { ground: paint, quiet: paint, ink: WHITE }
  const ink = contrastRatio(WHITE, paint) >= contrastRatio(DARK, paint) ? WHITE : DARK
  const away = ink === WHITE ? [13, 15, 20] : [255, 255, 255]
  let lit = rgb
  // Twelve steps of eight per cent reach the far end from any colour there is, so the loop ends
  // whatever it is handed; a colour that still will not read has been walked all the way to the
  // ink's opposite, where every ink reads.
  for (let i = 0; i < 12 && contrastRatio(ink, hex(lit)) < READS; i++) lit = mix(lit, away, 0.08)
  return { ground: hex(lit), quiet: hex(mix(lit, away, 0.22)), ink }
}

const mix = (a: readonly number[], b: readonly number[], by: number): number[] => a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * by))

const hex = (rgb: readonly number[]): string => `#${rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`

// Only a written-out hex, which is what a template's fill is. A colour named some other way is
// handed back untouched above rather than guessed at.
function channels(colour: string): number[] | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(colour)
  if (short) return short.slice(1).map((c) => parseInt(c + c, 16))
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour)
  return long === null ? null : long.slice(1).map((c) => parseInt(c, 16))
}
