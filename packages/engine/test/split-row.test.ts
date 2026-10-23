import { describe, expect, it } from 'vitest'
import { CARD, Harness, registry, twoSeatSetup } from './fixture.js'
import { replay, type SetupDef } from '../src/index.js'

// Att lägga ut korten bredvid varandra är en rörelse av handen och inte en kapning per kort
// (#1203): «Ta ett kort per spelare och lägg dem uppvända bredvid varandra» är en rad i loggen.
// Och den måste vara motorns, av K15:s skäl om adressen: hur många kort en fråga träffar i en dold
// hög är det enda klienten inte kan veta, så bara verbet som tar ut dem kan lägga ut dem.
//
// Fixturens golv ligger i (-500, -300), så ett löst korts x och y är punkten minus det.
const at = (h: Harness, id: string) => {
  const c = h.state.components[id]!
  return { zone: c.zone, x: c.x, y: c.y }
}

describe('en rad i stället för en hög (#1203)', () => {
  it('lägger varje kort löst på golvet, ett steg isär, i den ordning de låg i högen', () => {
    const h = new Harness()
    const taken = h.zone('draw').slice(0, 3)
    h.do(null, { v: 'split', pile: 'draw', at: 3, x: -300, y: -44, face: 'front', row: { dx: -75, dy: 0 } })

    expect(h.piles()).toEqual([])
    expect(taken.map((id) => at(h, id))).toEqual([
      { zone: 'table', x: 200, y: 256 },
      { zone: 'table', x: 125, y: 256 },
      { zone: 'table', x: 50, y: 256 },
    ])
    expect(taken.map((id) => h.state.components[id]!.face)).toEqual(['front', 'front', 'front'])
    expect(h.zone('draw')).toHaveLength(7)
  })

  it('lägger det sista kortet överst, eller det första när raden säger det', () => {
    const last = new Harness()
    const a = last.zone('draw').slice(0, 3)
    last.do(null, { v: 'split', pile: 'draw', at: 3, x: 0, y: 0, row: { dx: 26, dy: 0 } })
    // Golvet målas i sin ordning, och det som målas sist ligger överst.
    expect(last.zone('table').slice(-3)).toEqual(a)

    const first = new Harness()
    const b = first.zone('draw').slice(0, 3)
    first.do(null, { v: 'split', pile: 'draw', at: 3, x: 0, y: 0, row: { dx: -26, dy: 0, firstOnTop: true } })
    expect(first.zone('table').slice(-3)).toEqual([...b].reverse())
  })

  it('centrerar raden på punkten', () => {
    const h = new Harness()
    const taken = h.zone('draw').slice(0, 3)
    h.do(null, { v: 'split', pile: 'draw', at: 3, x: -232, y: -144, row: { dx: 75, dy: 0, centred: true } })
    expect(taken.map((id) => at(h, id).x)).toEqual([193, 268, 343])
  })

  it('börjar en ny rad efter så många kort som får plats, och centrerar varje rad för sig', () => {
    const h = new Harness()
    const taken = h.zone('draw').slice(0, 5)
    h.do(null, { v: 'split', pile: 'draw', at: 5, x: 0, y: 0, row: { dx: 75, dy: 0, centred: true, wrap: { after: 3, dx: 0, dy: 100 } } })
    expect(taken.map((id) => at(h, id))).toEqual([
      { zone: 'table', x: 425, y: 300 },
      { zone: 'table', x: 500, y: 300 },
      { zone: 'table', x: 575, y: 300 },
      { zone: 'table', x: 463, y: 400 },
      { zone: 'table', x: 538, y: 400 },
    ])
  })

  it('lägger ut så många som en fråga hittar, fast klienten aldrig sett ett id', () => {
    const deck: SetupDef = {
      ...twoSeatSetup(),
      cards: { dragon: { rarity: 'Diamant' }, knight: { rarity: 'Guld' }, wizard: { rarity: 'Diamant' } },
      components: ['dragon', 'knight', 'wizard'].map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' as const })),
    }
    const h = new Harness(1, deck)
    h.do(null, { v: 'split', pile: 'draw', at: 1, which: [{ field: 'rarity', is: ['Diamant'] }], x: 0, y: 0, row: { dx: 75, dy: 0 } })
    const laid = h.zone('table').map((id) => h.state.components[id]!)
    expect(laid.map((c) => [c.cardRef, c.x])).toEqual([
      ['dragon', 500],
      ['wizard', 575],
    ])
    expect(h.piles()).toEqual([])
  })

  it('vänder korten med högen, som en kapning gör', () => {
    const h = new Harness()
    h.do(null, { v: 'movePile', pile: 'draw', to: 'table', x: -200, y: 0, rot: 90 })
    const taken = h.zone('draw').slice(0, 2)
    h.do(null, { v: 'split', pile: 'draw', at: 2, x: 0, y: 0, row: { dx: 0, dy: 75 } })
    expect(taken.map((id) => h.state.components[id]!.rot)).toEqual([90, 90])
  })

  it('spelas upp identiskt ur loggen', () => {
    const h = new Harness()
    h.do(null, { v: 'split', pile: 'draw', at: 4, x: 10, y: 10, row: { dx: 75, dy: 0, centred: true, wrap: { after: 3, dx: 0, dy: 100 } } })
    expect(replay(h.initial, registry, h.log)).toEqual(h.state)
  })

  it('avvisas med ett mål, eftersom en rad läggs bredvid högen och inte i en annan zon', () => {
    const h = new Harness()
    expect(h.try(null, { v: 'split', pile: 'draw', at: 2, to: 'discard', row: { dx: 75, dy: 0 } }).ok).toBe(false)
    expect(h.try(null, { v: 'split', pile: 'draw', at: 2, row: { dx: 75, dy: 0 } }).ok).toBe(false)
  })
})
