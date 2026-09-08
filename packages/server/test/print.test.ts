import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, TOKEN_COUNTER, TypeRegistry, type SetupDef, STANDARD_TYPES } from '@byd/engine'
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
    expect(jobs.get(trap.faces.front!)?.compiled.css).toContain('#cc3333')
    expect(jobs.get(trap.faces.back!)?.compiled.css).toContain('#441111')
    expect(jobs.get(dragon.faces.front!)?.compiled.css).toContain('#eeeeee')
    expect(jobs.get(dragon.faces.back!)?.compiled.css).toContain('#334477')
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
})
