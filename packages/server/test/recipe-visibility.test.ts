import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, type Applied, type Intent, type Snapshot } from '@byd/protocol'
import { STANDARD_TYPES, TypeRegistry, apply, initialState, project, type TableState, type ZoneVisibility } from '@byd/engine'
import { openingSetup } from '../src/recipe.js'
import { setupFromProject } from '../src/setup.js'

// What each seat is told about the area in front of somebody else (#414, C4).
//
// The decision is one word in the recipe, so the guard is that word's two settings put side by
// side and projected — not the recipe's own field read back, which would only say that the file
// says what the file says. `project` is the only way from state to wire, so what it hands a seat
// that does not own the area is what leaves the server.
//
// The card is played the way the phone plays it: a `move`, and a `flip` to the front when the
// target zone is public, which is what `playIntents` sends and what makes the area readable at
// all. Without the flip the card lies face down in a public zone and not even its owner is told
// what it is — the middle state #414 looked at and turned down.
//
// The `owner` case is pinned whole and on purpose. The recipe's area was `owner` until this
// decision and the only thing that changed was that word, so the object below is, byte for byte,
// the zone view a designer's own private area has always produced.

const registry = new TypeRegistry(STANDARD_TYPES)

type Played = { seen: (seat: string) => Snapshot; geometry: unknown }

function playIntoArea(visibility: ZoneVisibility): Played {
  const recipe = openingSetup({ players: 2, counters: [] })
  const setup = setupFromProject({
    rows: [{ id: 'drake', fields: { antal: '1' } }],
    setup: { ...recipe, zones: recipe.zones.map((z) => (z.id === 'mine:A' ? { ...z, visibility } : z)) },
  } as never)
  let state: TableState = initialState({ project: 'p', revision: 1 } as never, setup, registry)
  const card = state.zones['draw']?.order[0]
  if (card === undefined) throw new Error('the draw pile is empty; the fixture proves nothing')
  const intents: Intent[] = visibility === 'all' ? [{ v: 'move', component: card, to: 'mine:A' }, { v: 'flip', component: card, face: 'front' }] : [{ v: 'move', component: card, to: 'mine:A' }]
  let seq = state.seq
  for (const intent of intents) {
    const line: Applied = { schemaVersion: SCHEMA_VERSION, seq: ++seq, batch: 'b1', at: '2026-09-23T19:00:00.000Z', by: 'A', intent }
    state = apply(state, registry, line)
  }
  return { seen: (seat) => project(state, registry, seat), geometry: setup.zones.find((z) => z.id === 'mine:A')?.geometry }
}

const zoneOf = (view: Snapshot) => view.zones.find((z) => z.id === 'mine:A')
const cardIn = (view: Snapshot) => view.components.find((c) => c.zone === 'mine:A')?.cardRef ?? null

describe('the area in front of a seat, as the other seat is told about it (#414)', () => {
  it('is public in the recipe: the stranger is given the order, and the card’s identity with it', () => {
    // The word itself, said here because this is the file about what it does.
    expect(openingSetup({ players: 2, counters: [] }).zones.find((z) => z.id === 'mine:A')?.visibility).toBe('all')
    const { seen, geometry } = playIntoArea('all')
    expect(zoneOf(seen('B'))).toEqual({
      mode: 'order',
      id: 'mine:A',
      kind: 'area',
      name: 'Framför A',
      geometry,
      dynamic: false,
      owner: 'A',
      shortcut: { label: 'Framför mig', at: 'top' },
      order: [expect.any(String)],
    })
    // The half that is not a drawing: the identity itself leaves the server to a seat that does
    // not own the area. Nothing else in this repo let it do that before.
    expect(cardIn(seen('B'))).toBe('drake')
    expect(cardIn(seen('A'))).toBe('drake')
  })

  it('is the old private area again when the designer sets it back, byte for byte', () => {
    const { seen, geometry } = playIntoArea('owner')
    const mine = { mode: 'count', id: 'mine:A', kind: 'area', name: 'Framför A', geometry, dynamic: false, owner: 'A', shortcut: { label: 'Framför mig', at: 'top' }, count: 1 }
    // A count and nothing else. No `top`, no `back`, no `bottom`: the area says how much lies in
    // it and never what, which is what the felt draws as a number (decision B, #437).
    expect(zoneOf(seen('B'))).toEqual(mine)
    // Said as the bytes too, since that is the claim the decision was written with.
    expect(JSON.stringify(zoneOf(seen('B')))).toBe(JSON.stringify(mine))
    expect(seen('B').components.some((c) => c.zone === 'mine:A')).toBe(false)
    // And the owner is still told what she laid there, which is what makes the zero above mean
    // something rather than mean that nothing was played at all.
    expect(cardIn(seen('A'))).toBe('drake')
  })
})
