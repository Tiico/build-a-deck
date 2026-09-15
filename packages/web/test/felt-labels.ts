// What the two issues about names on the felt ask of one reading, and how a reading is taken
// (K19, K20, #43, #71, #72, #76). Four surfaces draw the felt's names — the played table, the TV,
// the editor's Bord tab and the observer's phone — and the measurement is the same on all of
// them, so it is written once here rather than a second time per surface.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect } from 'vitest'
import { CARD_STANDARD_63x88, STANDARD_TYPES, TOKEN_COUNTER, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { SWEDISH_WORDS, openingSetup, type Setup } from '@byd/server/doc'


const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

export const FACE = /url\('(\.\/[^']+\.woff2)'\)/g
export const sheet = (rel: string): string =>
  read(rel).replace(FACE, (_all, file: string) => `url('data:font/woff2;base64,${readFileSync(join(import.meta.dirname, '..', dirname(rel), file)).toString('base64')}')`)

// The face the felt is written in (K20), first in every cascade the readings are taken against.
export const FELT_FONT = 'src/fonts/felt-font.css'

export type Crowding = { pairs: string[]; clipped: string[]; outside: string[] }
export type Reading = Crowding & { names: string[]; wrapped: string[]; smallest: number; cardPx: number; wider: Crowding }

// How much wider than the shipped face every name has to survive being drawn (#95). "No overlap"
// is not a machine-independent claim: Linux fontconfig snaps each glyph's advance to a whole
// pixel and macOS places them on subpixels, which is up to ~1.5 px per name and does not go away
// because the face ships. A design that clears by two pixels therefore clears on one machine and
// not on the next — which is exactly what it did, and what CI kept reporting.
//
// The number is the felt's own slack said as a proportion, because the scarcity here is relative:
// the two pixel-shifts before this one bought *absolute* room and bought nothing. Today's tightest
// scene has 2.0 % and DejaVu Sans draws K19's names 12–14 % wider, so 15 % is the smallest demand
// that would have caught it. The shipped face leaves 21–22 %.
export const NAME_MARGIN = 1.15

// What the two issues are about, read off the DOM: which names are visible, which pairs of them
// lie on the same pixels, which were cut short by the box they were given, and which were drawn
// off the felt altogether — and then all of that again with every name drawn `NAME_MARGIN` wider.
//
// Widening is done with `letter-spacing`, which is how a wider face differs from a narrower one
// as far as this layout is concerned: every name is `nowrap` and anchored at one of its own two
// ends with `translate(-100% …)`, so the element's own width is what moves it. Adding Δ to an
// n-character name of width w adds n·Δ to that width, so Δ = (k−1)·w/n scales the drawn text by k
// while the fixed insets — `--name-in`, the pill's padding — stay fixed, as they would under a
// wider face.
export const READ = `((margin) => {
  const sel = ['.byd-zone > span', '.byd-seat-name', '.byd-setup-handle > span', '.byd-pile-name', '.byd-pile-n', '.byd-hand-count'].join(', ')
  const seen = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? r : null
  }
  // The glyphs' own width, without the pill's padding: a range over the element's text. That is
  // the quantity a wider face changes.
  const textWidth = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().width
  }
  const base = [...document.querySelectorAll(sel)]
    .filter((el) => seen(el))
    .map((el) => {
      const ls = getComputedStyle(el).letterSpacing
      return { el, ls: ls === 'normal' ? 0 : parseFloat(ls) || 0, w: textWidth(el), n: Math.max(1, (el.textContent || '').trim().length) }
    })
  const widen = (k) => {
    for (const b of base) b.el.style.letterSpacing = (b.ls + ((k - 1) * b.w) / b.n) + 'px'
  }
  const readAt = () => {
    const labels = []
    const clipped = []
    // A zone's name is laid out in a box as wide as the zone, so beside a narrow zone it breaks
    // onto two lines and measures half as wide — half of every good number below would then be the
    // wrap's doing rather than the rule's. The readings used to force one line on from the outside,
    // which meant the shipped declaration could be deleted without a single test noticing: the
    // injected rule stood in for it. What is read here is the cascade as it ships.
    const wrapped = []
    let smallest = Infinity
    for (const el of document.querySelectorAll(sel)) {
      const r = seen(el)
      if (!r) continue
      const text = (el.textContent || '').trim()
      // A pile's name and its count are two halves of one pill ("Draghög · 20") and touch by
      // construction. One label, not two — and it is the badge, \`.byd-pile-n\`, that is read, since
      // in TV mode the wrapper around it covers the whole pile while the badge hangs over its top.
      labels.push({ text, r, pill: el.closest('.byd-pile-count') })
      if (el.matches('.byd-zone > span') && !/nowrap|pre(?!-)/.test(getComputedStyle(el).whiteSpace)) wrapped.push(text)
      smallest = Math.min(smallest, parseFloat(getComputedStyle(el).fontSize))
      if (el.scrollWidth > el.clientWidth + 1) clipped.push(text)
    }
    const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    const pairs = []
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        if (labels[i].pill && labels[i].pill === labels[j].pill) continue
        if (hits(labels[i].r, labels[j].r)) pairs.push(labels[i].text + ' × ' + labels[j].text)
      }
    // Off the felt. A hand's count is left out on purpose: it hangs a fixed distance below its own
    // hand by \`HAND_COUNT_MM\`, which is K9's own rule for the played felt and not a stray name.
    const felt = document.querySelector('[data-table]')?.getBoundingClientRect() ?? null
    const outside = []
    if (felt)
      for (const el of document.querySelectorAll('.byd-zone > span, .byd-seat-name')) {
        const r = seen(el)
        if (!r) continue
        if (r.left < felt.left - 1 || r.top < felt.top - 1 || r.right > felt.right + 1 || r.bottom > felt.bottom + 1) outside.push((el.textContent || '').trim())
      }
    const card = document.querySelector('.byd-pile-top')
    return {
      names: labels.map((l) => l.text),
      pairs,
      clipped,
      outside,
      wrapped,
      smallest: Number.isFinite(smallest) ? Math.round(smallest * 10) / 10 : 0,
      cardPx: card ? Math.round(card.getBoundingClientRect().width) : 0,
    }
  }
  const at = readAt()
  widen(margin)
  const wide = readAt()
  widen(1)
  return { ...at, wider: { pairs: wide.pairs, clipped: wide.clipped, outside: wide.outside } }
})(${NAME_MARGIN})`

// Everything the two issues ask of one reading, said once: the names are all there, none of them
// lies on another, none was cut short, and none was drawn off the felt — and the same is still
// true when every name is drawn `NAME_MARGIN` wider, which is what makes the answer belong to the
// design rather than to the machine it was read on (#95).
export function expectClear(reading: Reading, wanted: string[], where: string): void {
  expect({ where, names: reading.names.length > 0 }).toEqual({ where, names: true })
  expect({ where, missing: wanted.filter((n) => !reading.names.includes(n)) }).toEqual({ where, missing: [] })
  expect({ where, pairs: reading.pairs }).toEqual({ where, pairs: [] })
  expect({ where, clipped: reading.clipped }).toEqual({ where, clipped: [] })
  expect({ where, outside: reading.outside }).toEqual({ where, outside: [] })
  expect({ where, wrapped: reading.wrapped }).toEqual({ where, wrapped: [] })
  const wide = `${where}, every name drawn ${Math.round((NAME_MARGIN - 1) * 100)} % wider`
  expect({ where: wide, pairs: reading.wider.pairs }).toEqual({ where: wide, pairs: [] })
  expect({ where: wide, clipped: reading.wider.clipped }).toEqual({ where: wide, clipped: [] })
  expect({ where: wide, outside: reading.wider.outside }).toEqual({ where: wide, outside: [] })
}

const registry = new TypeRegistry(STANDARD_TYPES)
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const TOKEN = { id: TOKEN_COUNTER.id, version: 1 }
export const COUNTERS = [{ name: 'Poäng', start: 0 }]
const DECK = 20
const HELD = 4

// A seat's name is as wide as the name is: the collision #71 reports is a name card lying on a
// zone's label, and "A" is not what a table says. So the seats are named as people name them.
export const seatNameOf = (seat: string): string => `Spelare ${seat.charCodeAt(0) - 64}`

// The table the recipe lays out for that many seats (K18), which is the table every surface here
// draws — the editor's preview from the document, the played felt from the log. The seats carry
// everything a seat can have, since the question is what happens when one edge holds two of them.
// The market is a zone nobody owns, 200 mm in from the north rim — the one band a seat's own names
// were sent into when they were moved off that rim. A scene pinned to one setting of it measures
// half a table, so every reading below is taken with it both there and gone. It is laid out here
// rather than by a knob, because the table is the designer's and the market is a zone like any
// other since B5 was revised.
export const feltOf = (seats: number, market = false): Setup => {
  const setup = openingSetup({ players: seats, counters: COUNTERS }, SWEDISH_WORDS)
  if (!market) return setup
  return { ...setup, zones: [...setup.zones, { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: { x: -260, y: -200, w: 520, h: 120, rot: 0 }, shortcut: { label: 'Till marknaden', at: 'top' } }] }
}

// The same table as the engine projects it, with something lying in every hand and in every area
// in front of a seat: a label is judged against what is dealt near it, not against bare felt.
// The areas in front are opened to `all` for the same reason — the table's own screen is shown
// nothing lying in an `owner` zone (B6), and this is a question about names over cards.
// The same table as a `SetupDef`, which is what a server is handed to start a session from and
// what the engine projects a snapshot out of: one description of the scene, two ways in.
export function defOf(setup: Setup): SetupDef {
  return {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      name: z.name,
      visibility: z.id.startsWith('mine:') ? ('all' as const) : z.visibility,
      geometry: z.geometry,
      ...(z.owner ? { owner: z.owner } : {}),
      ...(z.returnTo ? { returnTo: z.returnTo } : {}),
      ...(z.shortcut ? { shortcut: z.shortcut } : {}),
    })),
    components: [
      ...Array.from({ length: DECK }, (_, i) => ({ type: CARD, cardRef: `Kort ${i + 1}`, zone: setup.deckZone, face: 'back' as const })),
      ...setup.seats.flatMap((seat) => {
        const z = setup.zones.find((w) => w.id === `mine:${seat}`)
        if (!z) return []
        const tall = z.geometry.h > z.geometry.w
        return [0, 1].map((i) => ({ type: CARD, cardRef: `Spelat ${seat}${i}`, zone: `mine:${seat}`, face: 'front' as const, x: tall ? 18 : 10 + i * 70, y: tall ? 10 + i * 100 : 6 }))
      }),
      ...setup.seats.flatMap((seat) => Array.from({ length: HELD }, (_, i) => ({ type: CARD, cardRef: `Hand ${seat}${i}`, zone: `hand:${seat}`, face: 'back' as const }))),
      ...setup.seats.flatMap((seat) =>
        setup.zones.some((z) => z.id === `counters:${seat}`) ? COUNTERS.map((c, i) => ({ type: TOKEN, cardRef: c.name, zone: `counters:${seat}`, face: 'front' as const, counter: c.start, x: 8 + i * 32, y: 8 })) : [],
      ),
    ],
  }
}

export function sceneOf(setup: Setup): Snapshot {
  const snap = project(initialState('names', defOf(setup), registry), registry, null)
  return { ...snap, seats: snap.seats.map((s) => ({ ...s, name: seatNameOf(s.id) })) }
}

// Every name the table is meant to say at that seat count. A reading that is missing one of them
// has not placed the names well; it has lost one.
export function namesOf(setup: Setup): string[] {
  const areas = setup.zones.filter((z) => z.kind === 'area' && z.id !== setup.floor).map((z) => z.name)
  const piles = setup.zones.filter((z) => z.kind === 'pile').map((z) => z.name)
  return [...areas, ...piles, ...setup.seats.map(seatNameOf)]
}
