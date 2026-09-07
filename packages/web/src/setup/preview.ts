import { CARD_STANDARD_63x88, STANDARD_TYPES, TOKEN_COUNTER, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import type { Setup } from './recipe.js'

// The table a setup makes (B5), as the screen would show it before anyone sat down: a deck of
// placeholder cards face down in the deck zone, and every seat's counters at their start values.
// Built the way the server builds a table — initialState and project — so what the designer sees
// is what the engine accepts; a setup the engine refuses gives null.
const registry = new TypeRegistry(STANDARD_TYPES)
const DECK = 20

export function previewOf(setup: Setup): Snapshot | null {
  const card = { id: CARD_STANDARD_63x88.id, version: 1 }
  const token = { id: TOKEN_COUNTER.id, version: 1 }
  const counters = setup.counters ?? []
  const def: SetupDef = {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({ id: z.id, kind: z.kind, name: z.name, visibility: z.visibility, geometry: z.geometry, ...(z.owner ? { owner: z.owner } : {}), ...(z.returnTo ? { returnTo: z.returnTo } : {}), ...(z.shortcut ? { shortcut: z.shortcut } : {}) })),
    components: [
      ...Array.from({ length: DECK }, (_, i) => ({ type: card, cardRef: `Kort ${i + 1}`, zone: setup.deckZone, face: 'back' })),
      ...setup.seats.flatMap((seat) => (setup.zones.some((z) => z.id === `counters:${seat}`) ? counters.map((c, i) => ({ type: token, cardRef: c.name, zone: `counters:${seat}`, face: 'front', counter: c.start, x: 8 + (i % 3) * 32, y: 8 + Math.floor(i / 3) * 32 })) : [])),
    ],
  }
  try {
    return project(initialState('preview', def, registry), registry, null)
  } catch {
    return null
  }
}
