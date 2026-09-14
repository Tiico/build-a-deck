// PROTOTYPE — throwaway (#90). A table to lay the buttons on: the recipe's own zones, a chip per
// seat, cards in front of every seat and a hand at every rim, so the felt under a ring is the
// felt the product draws and not a green rectangle.
//
// Nothing here is turned by the variant. #90 is not a question about millimetres — the geometry
// is `packages/server/src/recipe.ts` untouched — it is a question about which colours a button on
// this felt is allowed to wear, so the stage is the constant and the palette is the variable.
import { CARD_STANDARD_63x88, STANDARD_TYPES, TOKEN_COUNTER, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { applyRecipe, emptySetup, SWEDISH_WORDS, type Counter, type Recipe, type Setup } from '@byd/server/doc'

const registry = new TypeRegistry(STANDARD_TYPES)
const DECK = 20

export type VariantKey = 'N' | 'A' | 'B' | 'C'

export const seatNameOf = (seat: string): string => `Spelare ${seat.charCodeAt(0) - 64}`

// One counter per seat is what the wizard hands out (C4), and one is all #90 needs: the question
// is the ring above the chip, not how many chips a seat has (that is #89).
const COUNTER_NAMES = ['Poäng']
const COUNTER_STARTS = [12]

export function layout(players: number): Setup {
  const counters: Counter[] = COUNTER_NAMES.map((name, i) => ({ name, start: COUNTER_STARTS[i] ?? 0 }))
  const recipe: Recipe = { players, mine: true, discard: true, market: false, counters }
  return applyRecipe(emptySetup(), recipe, SWEDISH_WORDS)
}

export function stageOf(setup: Setup): Snapshot | null {
  const card = { id: CARD_STANDARD_63x88.id, version: 1 }
  const token = { id: TOKEN_COUNTER.id, version: 1 }
  const def: SetupDef = {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      name: z.name,
      // The table screen is the table's own screen and sees everything on it (B6 is about what a
      // seat's phone may see, not about the felt the room is looking at).
      visibility: z.id.startsWith('mine:') ? ('all' as const) : z.visibility,
      geometry: z.geometry,
      ...(z.owner ? { owner: z.owner } : {}),
      ...(z.returnTo ? { returnTo: z.returnTo } : {}),
      ...(z.shortcut ? { shortcut: z.shortcut } : {}),
    })),
    components: [
      ...Array.from({ length: DECK }, (_, i) => ({ type: card, cardRef: `Kort ${i + 1}`, zone: setup.deckZone, face: 'back' as const })),
      // Something lying in front of every seat. The card's own ring opens over one of these, and
      // where it opens is half the measurement: a ring near the south rim reaches off the felt,
      // over the wooden rim and onto the dark beyond it.
      ...setup.seats.flatMap((seat) => {
        const z = setup.zones.find((w) => w.id === `mine:${seat}`)
        if (!z) return []
        const tall = z.geometry.h > z.geometry.w
        return [0, 1].map((i) => ({ type: card, cardRef: `Spelat ${seat}${i}`, zone: `mine:${seat}`, face: 'front' as const, x: tall ? 18 : 10 + i * 70, y: tall ? 10 + i * 100 : 6 }))
      }),
      ...setup.seats.flatMap((seat) => Array.from({ length: 4 }, (_, i) => ({ type: card, cardRef: `Hand ${seat}${i}`, zone: `hand:${seat}`, face: 'back' as const }))),
      ...setup.seats.flatMap((seat) => {
        if (!setup.zones.some((z) => z.id === `counters:${seat}`)) return []
        return COUNTER_NAMES.map((name, k) => ({ type: token, cardRef: name, zone: `counters:${seat}`, face: 'front' as const, counter: COUNTER_STARTS[k] ?? 0, x: 8, y: 8 }))
      }),
    ],
  }
  try {
    const snap = project(initialState('proto', def, registry), registry, null)
    return { ...snap, seats: snap.seats.map((s) => ({ ...s, name: seatNameOf(s.id) })) }
  } catch {
    return null
  }
}
