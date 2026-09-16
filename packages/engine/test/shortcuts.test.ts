import { describe, expect, it } from 'vitest'
import { Harness, twoSeatSetup, zoneView } from './fixture.js'

// Zone shortcuts (C4): a zone may carry the verb the phone shows for it — "Kasta", "Lägg
// underst" — apart from the name the table shows, and where in a pile a card played there goes.
describe('zone shortcuts in the projection', () => {
  it('a zone with a shortcut shows it in every view; one without has none', () => {
    const setup = twoSeatSetup()
    setup.zones = setup.zones.map((z) => (z.id === 'discard' ? { ...z, shortcut: { label: 'Kasta', at: 'top' as const } } : z.id === 'draw' ? { ...z, shortcut: { label: 'Lägg underst', at: 'bottom' as const } } : z))
    const h = new Harness(1, setup)
    for (const seat of ['A', null] as const) {
      const v = h.view(seat)
      expect(zoneView(v, 'discard').shortcut).toEqual({ label: 'Kasta', at: 'top' })
      expect(zoneView(v, 'draw').shortcut).toEqual({ label: 'Lägg underst', at: 'bottom' })
      expect(zoneView(v, 'table')).not.toHaveProperty('shortcut')
    }
  })

  // Vilken sida av en hög som är "bredvid den" är högens egen sak (K21, reviderar #87). Sidan är
  // ingen hemlighet — den står i regelboken som varje annan sak zonen bär — så den reser till
  // varje vy som den står, och en hög som inte säger något säger ingenting i tråden heller.
  it('a pile that names the side beside it shows it in every view; one that does not has none', () => {
    const setup = twoSeatSetup()
    setup.zones = setup.zones.map((z) => (z.id === 'discard' ? { ...z, beside: 'right' as const } : z))
    const h = new Harness(1, setup)
    for (const seat of ['A', null] as const) {
      expect(zoneView(h.view(seat), 'discard').beside).toBe('right')
      expect(zoneView(h.view(seat), 'draw')).not.toHaveProperty('beside')
    }
  })
})
