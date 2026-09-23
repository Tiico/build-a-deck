import { describe, expect, it } from 'vitest'
import { Harness, registry, twoSeatSetup } from './fixture.js'
import { initialState, replay } from '../src/index.js'

// Har något hänt vid det här bordet (#452)?
//
// Startbrickan (K24) kan tryckas igen mitt i spelet — det är så en ny giv ges, och K23 säger att
// verktyget inte säger nej. Men ett andra tryck drar tillbaka varje hand och blandar om leken,
// och det ska inte kunna ske av misstag. Bekräftelsen frågas därför bara när något faktiskt
// redan hänt, och det här är vad «hänt» betyder: en fysisk rad i loggen.
//
// `seq` duger inte som mått: den räknar också `seat.claim`, så ett bord där fyra personer satt
// sig men ingen rört ett kort hade räknats som påbörjat. Uppgiften läcker ingenting (B6) — att
// någon rört ett kort är lika publikt som att en hög blandades.
describe('om något har hänt vid bordet', () => {
  it('är falskt på ett nytt bord, och sant först när ett kort har rörts', () => {
    const h = new Harness()
    expect(h.view(null).played).toBe(false)

    // Att sätta sig är inte att spela: platsen är sessionens och inte spelets.
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    expect(h.view(null).played).toBe(false)

    h.do(null, { v: 'shuffle', pile: 'draw' })
    expect(h.view(null).played).toBe(true)
  })

  it('går tillbaka till falskt när bordet återställs: då ligger inga kort ute att lägga tillbaka', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'discard', count: 2 })
    expect(h.view(null).played).toBe(true)
    h.do(null, { v: 'setup.reset' })
    expect(h.view(null).played).toBe(false)
  })

  it('är ett faktum om loggen och inte en flagga: en uppspelning når samma svar', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    h.do(null, { v: 'shuffle', pile: 'draw' })
    expect(replay(initialState('v1', twoSeatSetup(), registry), registry, h.log).played).toBe(true)
  })
})
