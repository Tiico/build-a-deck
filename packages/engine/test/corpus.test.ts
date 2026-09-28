import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TypeRegistry, initialState, liftLog, project, replay, STANDARD_TYPES } from '../src/index.js'
import { anonymise, record, type CorpusEntry } from '../scripts/corpus.js'
import { CARD, Harness, twoSeatSetup } from './fixture.js'
import type { SetupDef } from '../src/index.js'

// The replay corpus (DRIFT §7): real logs that must replay identically, and project identically
// for every viewer, on every commit. This is the gate; there is no staging.
const dir = join(import.meta.dirname, '../../../corpus')
const registry = new TypeRegistry(STANDARD_TYPES)
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

describe('the replay corpus', () => {
  it('has entries', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(`${file}: every line still lifts to today's schema, replays, and projects as it did when recorded`, () => {
      const entry = JSON.parse(readFileSync(join(dir, file), 'utf8')) as CorpusEntry
      // Lifted, never rewritten (DRIFT §7): the files stay as they were recorded.
      const log = liftLog(entry.log)
      const initial = initialState(entry.version, entry.setup, registry)
      const state = replay(initial, registry, log)
      const history = { stateAt: (seq: number) => replay(initial, registry, log.filter((l) => l.seq <= seq)), lines: () => log }
      for (const [viewer, expected] of Object.entries(entry.expected)) {
        const seat = viewer === 'table' ? null : viewer === 'observer' ? null : viewer
        expect(project(state, registry, seat, undefined, history, viewer === 'observer')).toEqual(expected)
      }
    })
  }
})

describe('recording an entry', () => {
  it('anonymises who sat down, what was flagged and who watched, and keeps the play itself', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Nicklas Ö' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'flag', note: 'privat kommentar' })
    h.do(null, { v: 'flag', observer: 'Eva Riktig', note: 'mer privat' })
    const log = anonymise(h.log)
    expect(log[0]?.intent).toEqual({ v: 'seat.claim', seat: 'A', name: 'Spelare 1' })
    expect(log[1]?.intent).toEqual({ v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(log[2]?.intent).toEqual({ v: 'flag', note: '(kommentar)' })
    expect(log[3]?.intent).toEqual({ v: 'flag', observer: 'Observatör', note: '(kommentar)' })
    const entry = record('test', 'v1', h.state.setup, h.log, registry)
    expect(Object.keys(entry.expected).sort()).toEqual(['A', 'B', 'observer', 'table'])
    expect(entry.expected['A']?.seats.find((s) => s.id === 'A')?.name).toBe('Spelare 1')
  })
})

// The game as well as the people (#540, beställarens beslut): the repo is public, and a real log
// carries the designer's unpublished game — what every card is called, what it says in its own
// columns, what the zones and the actions are named. What the corpus is for is the play: which
// verbs, in which order, with which outcomes. So the game's own words go and its shape stays.
describe('anonymising the game in an entry (#540)', () => {
  const CARD_REF = CARD
  const secret = (): SetupDef => {
    const base = twoSeatSetup()
    return {
      ...base,
      zones: base.zones.map((z) =>
        z.id === 'discard'
          ? { ...z, name: 'Draklyans', shortcut: { label: 'Kasta i elden', at: 'top' as const }, actions: [{ id: 'bränn', label: 'Bränn draken', steps: [{ v: 'take' as const, which: [{ field: 'typ', is: ['Varelse'] }], to: { at: 'zone' as const, zone: 'table' }, face: 'front' as const }] }] }
          : z.id === 'draw'
            ? { ...z, name: 'Grottan' }
            : z,
      ),
      cards: {
        drakungen: { title: 'Drakungen', typ: 'Varelse', eld: 'Sju lågor' },
        riddarinnan: { title: 'Riddarinnan', typ: 'Varelse', eld: 'Ingen' },
        fallgropen: { title: 'Fallgropen', typ: 'Fälla', eld: 'Ingen' },
      },
      components: ['drakungen', 'riddarinnan', 'fallgropen'].map((cardRef) => ({ type: CARD_REF, cardRef, zone: 'draw', face: 'back' as const })),
    }
  }
  const SECRETS = ['drakungen', 'riddarinnan', 'fallgropen', 'Drakungen', 'Riddarinnan', 'Fallgropen', 'Varelse', 'Fälla', 'Sju lågor', 'Draklyans', 'Grottan', 'Kasta i elden', 'Bränn draken', 'bränn', '"eld"', '"typ"', 'Nicklas Ö']

  it('keeps no word of the game anywhere in the entry, and the play replays as it did', () => {
    const h = new Harness(1, secret())
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Nicklas Ö' })
    h.do(null, { v: 'shuffle', pile: 'draw' })
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1, which: [{ field: 'eld', is: ['Sju lågor'] }], face: 'front' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do(null, { v: 'version.change', to: 'v2', components: secret().components, cards: secret().cards })
    const proposed = h.do('A', { v: 'rewind.propose', toSeq: 2 })
    h.do('B', { v: 'rewind.confirm', proposal: proposed.batch })

    const entry = record('hemlig', 'v1', h.state.setup, h.log, registry)
    const text = JSON.stringify(entry)
    expect(SECRETS.filter((word) => text.includes(word))).toEqual([])
    // Pseudonyms, in the order the cards first appear, and neutral names in place of the game's.
    expect(entry.setup.components.map((c) => c.cardRef)).toEqual(['kort-1', 'kort-2', 'kort-3'])
    expect(entry.setup.zones.find((z) => z.id === 'discard')).toMatchObject({ name: expect.stringMatching(/^Zon \d+$/), shortcut: { label: expect.stringMatching(/^Genväg \d+$/) }, actions: [{ label: expect.stringMatching(/^Åtgärd \d+$/) }] })

    // The play is the same play: the entry replays through the engine, line for line, and every
    // zone holds as many cards as it did, face for face.
    const log = liftLog(entry.log)
    const state = replay(initialState(entry.version, entry.setup, registry), registry, log)
    const shape = (s: typeof state) => Object.fromEntries(Object.values(s.zones).map((z) => [z.id, z.order.map((id) => s.components[id]!.face)]))
    expect(shape(state)).toEqual(shape(h.state))
    expect(log.map((l) => l.intent.v)).toEqual(h.log.map((l) => l.intent.v))
  })
})
