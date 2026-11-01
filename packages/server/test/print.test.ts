import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, DICE, MEEPLE, TOKEN_COUNTER, TypeRegistry, type SetupDef, STANDARD_TYPES } from '@byd/engine'
import type { Deck } from '../src/faces.js'
import { printExportOf } from '../src/faces.js'

const registry = new TypeRegistry(STANDARD_TYPES)
const type = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }

const deck: Deck = {
  template: {
    faces: {
      front: {
        variantBy: 'typ',
        base: [{ kind: 'shape', id: 'front', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#eeeeee' }],
        variants: { fälla: { override: [{ kind: 'shape', id: 'front', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#cc3333' }] } },
      },
      back: {
        variantBy: 'typ',
        base: [{ kind: 'shape', id: 'back', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#334477' }],
        variants: { fälla: { override: [{ kind: 'shape', id: 'back', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#441111' }] } },
      },
    },
  },
  rows: {
    trap: { typ: 'fälla' },
    dragon: { typ: 'varelse' },
  },
  icons: {},
}

const setup: SetupDef = {
  seats: [],
  floor: 'table',
  zones: [{ id: 'table', kind: 'area', name: 'Bord', visibility: 'all', geometry: { x: 0, y: 0, w: 100, h: 100, rot: 0 } }],
  components: [
    { type, cardRef: 'trap', zone: 'table', face: 'back' },
    { type, cardRef: 'dragon', zone: 'table', face: 'back' },
    { type, cardRef: 'trap', zone: 'table', face: 'back' },
  ],
}

describe('the print export (#14)', () => {
  it('keeps every physical front paired with the back selected by the same card row', () => {
    const printed = printExportOf(deck, setup, registry, 123)

    expect(printed.cards.map((card) => card.cardRef)).toEqual(['trap', 'dragon', 'trap'])
    expect(printed.cards[0]?.faces).toEqual(printed.cards[2]?.faces)
    expect(printed.cards[0]?.faces.front).not.toBe(printed.cards[1]?.faces.front)
    expect(printed.cards[0]?.faces.back).not.toBe(printed.cards[1]?.faces.back)

    const jobs = new Map(printed.jobs.map((job) => [job.hash, job]))
    const trap = printed.cards[0]!
    const dragon = printed.cards[1]!
    // A shape's colour is painted on its path, so it is the markup that carries it (L17).
    expect(jobs.get(trap.faces.front!)?.compiled.html).toContain('#cc3333')
    expect(jobs.get(trap.faces.back!)?.compiled.html).toContain('#441111')
    expect(jobs.get(dragon.faces.front!)?.compiled.html).toContain('#eeeeee')
    expect(jobs.get(dragon.faces.back!)?.compiled.html).toContain('#334477')
  })

  it('prints the deck, not the seats\' counters: a token is no card and names no row (C4)', () => {
    const counter = { id: TOKEN_COUNTER.id, version: TOKEN_COUNTER.version }
    const withCounters: SetupDef = {
      ...setup,
      components: [...setup.components, { type: counter, cardRef: 'Poäng', zone: 'table', face: 'front', counter: 0 }],
    }
    const printed = printExportOf(deck, withCounters, registry, 123)
    expect(printed.cards.map((card) => card.cardRef)).toEqual(['trap', 'dragon', 'trap'])
    // A card of the deck that names no row is still a broken deck, and says so.
    expect(() => printExportOf(deck, { ...setup, components: [{ type, cardRef: 'ingen', zone: 'table', face: 'back' }] }, registry, 123)).toThrow(/ingen/)
  })

  it('sends both faces through the ordinary compiler with print bleed, then queues PDFs', () => {
    const printed = printExportOf(deck, setup, registry, 123)

    expect(printed.jobs.every((job) => job.kind.kind === 'pdf' && job.priority === 'print' && job.requestedAt === 123)).toBe(true)
    expect(printed.jobs.every((job) => job.compiled.html.includes('data-bleed="3"'))).toBe(true)
  })

  // A die in a printed game is a stock die the partner puts in the box, not something printed
  // (#1140, beställarens beslut): it is listed beside the cards as hardware, counted by kind, and
  // whoever orders may leave the hardware out, since many partners will not pack it.
  describe('dice (#1140)', () => {
    const die = (faces: number) => {
      const def = DICE.find((d) => d.id === `die.d${faces}`)!
      return { type: { id: def.id, version: def.version }, cardRef: `d${faces}`, zone: 'table', face: 'front', counter: 1 }
    }
    const withDice: SetupDef = { ...setup, components: [...setup.components, die(6), die(20), die(6)] }

    it('marks every die as a stock item, not printed matter', () => {
      expect(DICE.map((d) => d.print.stock)).toEqual(DICE.map(() => true))
      expect(CARD_STANDARD_63x88.print.stock).toBeUndefined()
    })

    it('lists the dice as hardware by kind, in the order the game first names them, and prints none of them', () => {
      const printed = printExportOf(deck, withDice, registry, 123)
      expect(printed.cards.map((card) => card.cardRef)).toEqual(['trap', 'dragon', 'trap'])
      expect(printed.hardware).toEqual([
        { type: 'die.d6', count: 2 },
        { type: 'die.d20', count: 1 },
      ])
    })

    it('leaves the hardware out when asked, and a game without dice has none', () => {
      expect(printExportOf(deck, withDice, registry, 123, { hardware: false }).hardware).toEqual([])
      expect(printExportOf(deck, setup, registry, 123).hardware).toEqual([])
    })
  })

  // The export (G5) bears the printed parts as the package does (#1488): a board's side from its own
  // template with the type's bleed, and a marker's sides once however many copies there are.
  describe('boards and tiles (#1488)', () => {
    const side = (fill: string) => ({ base: [{ kind: 'shape' as const, id: 'bg', x: -3, y: -3, w: 400, h: 400, shape: 'rect' as const, fill }], variants: {} })
    const parts: Deck = {
      ...deck,
      boards: { Kartan: { faces: { front: side('#2e6b46') } }, Tom: { faces: {} } },
      templates: { 'marker:guld': { faces: { front: side('#d99a1f'), back: side('#3a2a1a') } } },
      drawnWith: { 'marker:guld': 'marker:guld' },
      rows: { ...deck.rows, 'marker:guld': { title: 'Guld' } },
    }
    const hex = { id: 'tile.hex.52', version: 1 }
    const withParts: SetupDef = {
      ...setup,
      components: [
        ...setup.components,
        { type: { id: 'board.player', version: 1 }, cardRef: 'Kartan', zone: 'table', face: 'front' },
        { type: { id: 'board.player', version: 1 }, cardRef: 'Tom', zone: 'table', face: 'front' },
        { type: hex, cardRef: 'marker:guld', zone: 'table', face: 'back' },
        { type: hex, cardRef: 'marker:guld', zone: 'table', face: 'back' },
      ],
    }

    it('prints the board\'s side and the markers\' sides, a board nobody drew not at all, and identical markers once', () => {
      const printed = printExportOf(parts, withParts, registry, 123)
      expect(printed.cards.map((card) => card.cardRef)).toEqual(['trap', 'dragon', 'trap', 'Kartan', 'marker:guld', 'marker:guld'])
      expect(Object.keys(printed.cards[3]!.faces)).toEqual(['front'])
      expect(printed.cards[4]!.faces).toEqual(printed.cards[5]!.faces)
      const board = printed.jobs.find((j) => j.hash === printed.cards[3]!.faces['front'])!
      expect(board.compiled.html).toContain('data-bleed="3"')
      expect(new Set(printed.jobs.map((j) => j.hash)).size).toBe(printed.jobs.length)
    })
  })

  // A meeple is stock as a die is (#1478, beställarens beslut 5 i #1470), in its seat's colour (L11).
  describe('meeples (#1478)', () => {
    const meeple = (seat: string) => ({ type: { id: MEEPLE.id, version: MEEPLE.version }, cardRef: seat, zone: 'table', face: 'standing' })
    const withMeeples: SetupDef = { ...setup, seats: ['A', 'B'], components: [...setup.components, meeple('A'), meeple('B'), meeple('A')] }

    it('lists each seat\'s meeples as hardware in the seat\'s colour, and prints none of them', () => {
      const printed = printExportOf(deck, withMeeples, registry, 123)
      expect(printed.cards.map((card) => card.cardRef)).toEqual(['trap', 'dragon', 'trap'])
      expect(printed.hardware).toEqual([
        { type: 'piece.meeple', count: 2, colour: '#e05a4f' },
        { type: 'piece.meeple', count: 1, colour: '#3c8ce7' },
      ])
      expect(printed.leftOut).toEqual([])
    })

    it('leaves them out when asked, and says what it left', () => {
      const printed = printExportOf(deck, withMeeples, registry, 123, { hardware: false })
      expect(printed.hardware).toEqual([])
      expect(printed.leftOut).toEqual([
        { type: 'piece.meeple', count: 2, colour: '#e05a4f' },
        { type: 'piece.meeple', count: 1, colour: '#3c8ce7' },
      ])
    })
  })
})
