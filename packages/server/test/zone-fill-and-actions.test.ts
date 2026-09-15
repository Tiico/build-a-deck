import { describe, expect, it } from 'vitest'
import { applyEdit } from '../src/edits.js'
import type { ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'
import { template } from './deck.js'

const projectDoc = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template,
    rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 2 } }],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

// Zonens fråga och dess egna åtgärder är designerns, och de redigeras som allt annat på en zon:
// genom `patchZone`, så att ett grepp är ett steg tillbaka (L14, B4) och inte en ny mekanism.
const zone = (doc: ProjectDoc, id: string) => doc.setup.zones.find((z) => z.id === id)!

describe('att redigera vad en zon frågar efter och vad den kan', () => {
  it('sätter frågan, och tar bort den igen när den är tom', () => {
    const doc = projectDoc()
    const asked = applyEdit(doc, { v: 'patchZone', id: 'draw', patch: { fill: [{ field: 'rarity', is: ['Diamant'] }] } })
    expect(zone(asked, 'draw').fill).toEqual([{ field: 'rarity', is: ['Diamant'] }])

    const cleared = applyEdit(asked, { v: 'patchZone', id: 'draw', patch: { fill: undefined } })
    expect(zone(cleared, 'draw')).not.toHaveProperty('fill')
  })

  it('sätter hela listan av åtgärder på en gång, eftersom listan är det som ändras', () => {
    const doc = projectDoc()
    const actions = [{ id: 'a1', label: 'Vänd upp ett per spelare', steps: [{ v: 'split' as const, count: { of: 'seats' as const }, to: { at: 'beside' as const }, face: 'front' }] }]
    const next = applyEdit(doc, { v: 'patchZone', id: 'draw', patch: { actions } })
    expect(zone(next, 'draw').actions).toEqual(actions)

    const none = applyEdit(next, { v: 'patchZone', id: 'draw', patch: { actions: [] } })
    expect(zone(none, 'draw')).not.toHaveProperty('actions')
  })
})
