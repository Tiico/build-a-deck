import { describe, expect, it } from 'vitest'
import { applyRecipe, MAX_PLAYERS, NEW_AREA, newAreaSpot, newPileSpot, openingSetup, type Geometry, type Setup } from '../src/recipe.js'

// The recipe's own zones, measured against each other at every seat count the table admits (K18).
// K2 lets a designer overlap zones deliberately; nothing the recipe lays out is deliberate in that
// way, so two recipe zones sharing a millimetre is always a defect — two players' hands on the same
// spot most of all. The floor is every other zone's container and is therefore not one of the pairs.
// Ett bord med allt receptet lägger ut, och därtill en yta där marknadsratten en gång la en:
// zonen är designerns numera (B5, reviderat), men måtten den lades med är kvar i det här provet,
// eftersom det är de måtten grannarna har prövats mot sedan K18.
const fullTable = (players: number): Setup => {
  const setup = openingSetup({ players, counters: [{ name: 'Poäng', start: 0 }] })
  return { ...setup, zones: [...setup.zones, { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: { x: -260, y: -200, w: 520, h: 120, rot: 0 } }] }
}

const fullTableWith = (players: number, counters: { name: string; start: number }[]): Setup => {
  const setup = openingSetup({ players, counters })
  return { ...setup, zones: [...setup.zones, { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: { x: -260, y: -200, w: 520, h: 120, rot: 0 } }] }
}

const sharesArea = (a: Geometry, b: Geometry): boolean =>
  Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)

const holds = (outer: Geometry, inner: Geometry): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

// What one seat count looks like, in the terms the defect was reported in: how large the felt is,
// how many pairs were actually looked at (a pair count of zero would make every list below pass
// for the wrong reason), which pairs share area, which zones hang off the felt, and where a pile's
// point — which has no area of its own — has landed inside somebody else's rectangle.
function measure(players: number) {
  const setup = fullTable(players)
  const floor = setup.zones.find((z) => z.id === setup.floor)!.geometry
  const zones = setup.zones.filter((z) => z.id !== setup.floor)
  const overlapping: string[] = []
  let pairs = 0
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      pairs++
      if (sharesArea(zones[i]!.geometry, zones[j]!.geometry)) overlapping.push(`${zones[i]!.id}+${zones[j]!.id}`)
    }
  }
  const outside = zones.filter((z) => !holds(floor, z.geometry)).map((z) => z.id)
  const buried = zones
    .filter((z) => z.kind === 'pile')
    .filter((p) => zones.some((z) => z.id !== p.id && z.geometry.w > 0 && holds(z.geometry, p.geometry)))
    .map((z) => z.id)
  return { felt: `${floor.w}x${floor.h}`, pairs, overlapping, outside, buried }
}

const clear = (felt: string, pairs: number) => ({ felt, pairs, overlapping: [], outside: [], buried: [] })

describe('the felt a recipe lays out (K18, B5)', () => {
  it('keeps every zone clear of every other and inside the felt, at every seat count the table admits', () => {
    const seatCounts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)
    expect(seatCounts).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(Object.fromEntries(seatCounts.map((n) => [n, measure(n)]))).toEqual({
      2: clear('1200x800', 36),
      3: clear('1200x800', 66),
      4: clear('1200x800', 105),
      5: clear('1800x800', 153),
      6: clear('1800x800', 210),
      7: clear('1800x1400', 276),
      8: clear('1800x1400', 351),
    })
  })

  // The alternative this rules out: narrowing the hand as the seats grow would have kept the felt
  // at 1200 x 800 without touching anything else, and given a player at an eight-seat table a
  // visibly smaller hand than a player at a four-seat one — the same game on different terms
  // depending on who happens to be playing.
  it('gives every seat the same hand, however many people sit at the table', () => {
    const widths = new Set<number>()
    for (let players = 2; players <= MAX_PLAYERS; players++) {
      for (const hand of fullTable(players).zones.filter((z) => z.kind === 'hand')) {
        widths.add(Math.max(hand.geometry.w, hand.geometry.h))
        expect(Math.min(hand.geometry.w, hand.geometry.h)).toBe(60)
      }
    }
    expect([...widths]).toEqual([500])
  })

  // What a table that already worked is worth: nothing about it changes. Up to four seats no edge
  // carries two, so the felt and every seat on it land on the millimetres they landed on before the
  // felt could grow at all.
  it('lays a table for four out exactly where it was laid out before the felt could grow', () => {
    const four = fullTable(4)
    const at = (id: string) => four.zones.find((z) => z.id === id)?.geometry
    expect(at('table')).toEqual({ x: -600, y: -400, w: 1200, h: 800, rot: 0 })
    expect(at('hand:A')).toEqual({ x: -250, y: 340, w: 500, h: 60, rot: 0 })
    expect(at('hand:B')).toEqual({ x: -250, y: -400, w: 500, h: 60, rot: 0 })
    expect(at('hand:C')).toEqual({ x: 540, y: -250, w: 60, h: 500, rot: 0 })
    expect(at('hand:D')).toEqual({ x: -600, y: -250, w: 60, h: 500, rot: 0 })
    // The two zones that share a seat's 500 mm are the one pair #89 moved: the chips lie a pitch
    // apart along the rim so a finger can reach each of them, and `Framför` pays for the room out
    // of its own length. The seat, the place setting and the felt are the millimetres they were.
    expect(at('mine:A')).toEqual({ x: -250, y: 230, w: 365, h: 100, rot: 0 })
    expect(at('counters:A')).toEqual({ x: 125, y: 230, w: 125, h: 100, rot: 0 })
    expect((at('mine:A')?.w ?? 0) + 10 + (at('counters:A')?.w ?? 0)).toBe(500)
  })

  // What a second counter costs and what a third one does not (C4, K18, #89). Two chips lie side
  // by side and the counters zone takes a second pitch out of `Framför`; a third stacks them, so
  // the seat goes back to the shape it had with one. Nothing outside the seat's 500 mm moves at
  // any of the three, which is the whole reason B was chosen up to two and C at three.
  it('lets a seat’s counters spread to two and stack at three, inside the same 500 mm', () => {
    const named = [
      { name: 'Poäng', start: 0 },
      { name: 'Liv', start: 20 },
      { name: 'Rundor', start: 1 },
      { name: 'Kort', start: 5 },
    ]
    const seatOf = (counters: number) => {
      const setup = openingSetup({ players: 4, counters: named.slice(0, counters) })
      const at = (id: string) => setup.zones.find((z) => z.id === id)!.geometry
      return { mine: at('mine:A').w, counters: at('counters:A').w, felt: `${at('table').w}x${at('table').h}`, hand: at('hand:A').w }
    }
    expect([1, 2, 3, 4].map(seatOf)).toEqual([
      { mine: 365, counters: 125, felt: '1200x800', hand: 500 },
      { mine: 240, counters: 250, felt: '1200x800', hand: 500 },
      { mine: 365, counters: 125, felt: '1200x800', hand: 500 },
      { mine: 365, counters: 125, felt: '1200x800', hand: 500 },
    ])
    // And no zone of the new shapes lies on any other, at any seat count the table admits.
    for (const counters of [1, 2, 3, 4]) {
      for (let players = 2; players <= MAX_PLAYERS; players++) {
        const setup = fullTableWith(players, named.slice(0, counters))
        const zones = setup.zones.filter((z) => z.id !== setup.floor)
        const overlapping = zones.flatMap((a, i) => zones.slice(i + 1).filter((b) => sharesArea(a.geometry, b.geometry)).map((b) => `${a.id}+${b.id}`))
        expect({ counters, players, overlapping }).toEqual({ counters, players, overlapping: [] })
      }
    }
  })

  // The lift. A setup saved while five to eight seats were laid out on a 1200 x 800 mm felt carries
  // those millimetres in its own document, so it does not heal by itself. A felt too small for the
  // seats it already has is laid out again the next time the recipe is turned, even when the knob
  // that was turned was something else entirely.
  it('lays a saved table out again when its felt cannot hold the seats already sitting at it', () => {
    // A six-seat setup as it was written to disk while the felt was 1200 x 800 mm at every seat
    // count: the fifth and sixth seats shifted 300 mm along a hand 500 mm wide, so A and E shared
    // the same stretch of the south edge.
    const asItWasSaved: Setup = {
      ...fullTable(6),
      zones: fullTable(6).zones.map((z) => {
        if (z.id === 'table') return { ...z, geometry: { x: -600, y: -400, w: 1200, h: 800, rot: 0 } }
        if (z.id === 'hand:A') return { ...z, geometry: { x: -250, y: 340, w: 500, h: 60, rot: 0 } }
        if (z.id === 'hand:E') return { ...z, geometry: { x: 50, y: 340, w: 500, h: 60, rot: 0 } }
        if (z.id === 'mine:A') return { ...z, geometry: { x: -250, y: 230, w: 380, h: 100, rot: 0 } }
        if (z.id === 'mine:E') return { ...z, geometry: { x: 50, y: 230, w: 380, h: 100, rot: 0 } }
        return z
      }),
    }
    expect(sharesArea(asItWasSaved.zones.find((z) => z.id === 'hand:A')!.geometry, asItWasSaved.zones.find((z) => z.id === 'hand:E')!.geometry)).toBe(true)

    // Opening it and turning the knob at all — here the counters, not the seat count — lays it out
    // again, because the felt it carries cannot hold the seats it carries.
    const opened = applyRecipe(asItWasSaved, { players: 6, counters: [{ name: 'Poäng', start: 0 }] })
    expect(opened.zones.find((z) => z.id === 'table')?.geometry).toEqual({ x: -900, y: -400, w: 1800, h: 800, rot: 0 })
    expect(opened.zones.find((z) => z.id === 'hand:A')?.geometry).toEqual({ x: -550, y: 340, w: 500, h: 60, rot: 0 })
    expect(opened.zones.find((z) => z.id === 'hand:E')?.geometry).toEqual({ x: 50, y: 340, w: 500, h: 60, rot: 0 })
    expect(sharesArea(opened.zones.find((z) => z.id === 'hand:A')!.geometry, opened.zones.find((z) => z.id === 'hand:E')!.geometry)).toBe(false)
  })

  // A felt the designer made roomier than the recipe asks for is theirs, and the recipe leaves it
  // alone for as long as it holds the seats.
  it('leaves a felt a designer enlarged alone while it still holds the seats', () => {
    const four = fullTable(4)
    const roomier: Setup = {
      ...four,
      zones: four.zones.map((z) => (z.id === 'table' ? { ...z, geometry: { x: -800, y: -500, w: 1600, h: 1000, rot: 0 } } : z)),
    }
    const again = applyRecipe(roomier, { players: 4, counters: [{ name: 'Poäng', start: 0 }] })
    expect(again.zones.find((z) => z.id === 'table')?.geometry).toEqual({ x: -800, y: -500, w: 1600, h: 1000, rot: 0 })
    expect(again.zones.find((z) => z.id === 'hand:A')?.geometry).toEqual({ x: -250, y: 340, w: 500, h: 60, rot: 0 })
  })
})

// Var en ny delad yta föds (#440). Panelens ＋ Yta la den på en konstant, så två ytor lades på
// millimetern på varandra: zonen är dessutom vald direkt, så det första formgivaren ser är en
// markerad ruta ovanpå en annan som hon måste dra undan innan hon ser vad hon gjort.
//
// Placeringen är en regel ur uppställningen och inget formval, och den är ren geometri: en
// önskeplats, filtens golv, och zonerna som redan står där. Vad fliken ritar av svaret mäts i
// `packages/web/test/setup-new-area.test.tsx`.
describe('en ny delad yta föds på ledig filt (#440, K2)', () => {
  const holdsAndClears = (setup: Setup, spot: Geometry) => ({
    inside: holds(setup.zones.find((z) => z.id === setup.floor)!.geometry, spot),
    over: setup.zones.filter((z) => z.id !== setup.floor && sharesArea(z.geometry, spot)).map((z) => z.id),
  })

  it('lägger den där panelen alltid har lagt den, så länge den rutan är ledig', () => {
    const setup = fullTable(2)
    // Marknaden ur `fullTable` står någon annanstans, så önskeplatsen är fri: svaret är den.
    expect(newAreaSpot(setup)).toEqual({ x: -150, y: 100, w: NEW_AREA.w, h: NEW_AREA.h, rot: 0 })
  })

  it('håller den fri från varje zon och hel på filten, vid varje platsantal bordet rymmer', () => {
    for (let players = 2; players <= MAX_PLAYERS; players++) {
      const setup = fullTable(players)
      const spot = newAreaSpot(setup)
      // Icke-vakuitet: det finns ett svar att pröva. `null` här vore «ingen ledig filt», och den
      // raden nedan skulle då bli grön av att ingenting mättes.
      expect({ players, found: spot !== null }).toEqual({ players, found: true })
      expect({ players, ...holdsAndClears(setup, spot!) }).toEqual({ players, inside: true, over: [] })
    }
  })

  it('viker undan när önskeplatsen redan är någons, och lägger nästa yta bredvid den förra', () => {
    const setup = fullTable(2)
    const first = newAreaSpot(setup)!
    const withFirst: Setup = { ...setup, zones: [...setup.zones, { id: 'yta-1', kind: 'area', name: 'Yta 1', visibility: 'all', geometry: first }] }
    const second = newAreaSpot(withFirst)!
    expect(second).not.toEqual(first)
    expect(holdsAndClears(withFirst, second)).toEqual({ inside: true, over: [] })
    // Och en tredje står fri från båda: regeln är «ledig filt» och inte «bredvid den senaste».
    const withBoth: Setup = { ...withFirst, zones: [...withFirst.zones, { id: 'yta-2', kind: 'area', name: 'Yta 2', visibility: 'all', geometry: second }] }
    const third = newAreaSpot(withBoth)!
    expect(holdsAndClears(withBoth, third)).toEqual({ inside: true, over: [] })
  })

  // En hög är en punkt i dokumentet och en kortrygg på skärmen. Mätt på punkten är varje hög fri
  // att lägga en yta över, vilket är att lägga ytan över leken.
  it('räknar en hög som den kortrygg den ritas som, så ingen yta föds över leken', () => {
    const setup = fullTable(2)
    const onWish: Setup = { ...setup, zones: setup.zones.map((z) => (z.id === 'draw' ? { ...z, geometry: { x: 0, y: 160, w: 0, h: 0, rot: 0 } } : z)) }
    const spot = newAreaSpot(onWish)!
    expect(sharesArea(spot, { x: -31.5, y: 116, w: 63, h: 88, rot: 0 })).toBe(false)
    expect(holdsAndClears(onWish, spot)).toEqual({ inside: true, over: [] })
  })

  // Och när filten är full säger uppställningen det i stället för att stapla tyst. Det är den enda
  // vägen ut ur regeln, och den som gör att ＋ Yta aldrig lägger en ruta ovanpå en annan.
  it('säger nej när filten inte har någon ledig ruta så stor', () => {
    const setup = fullTable(2)
    const floor = setup.zones.find((z) => z.id === setup.floor)!.geometry
    const covered: Setup = { ...setup, zones: [...setup.zones, { id: 'duk', kind: 'area', name: 'Duk', visibility: 'all', geometry: floor }] }
    expect(newAreaSpot(covered)).toBeNull()
    // En filt som är mindre än ytan säger samma sak, av samma skäl.
    const tiny: Setup = { ...setup, zones: setup.zones.map((z) => (z.id === setup.floor ? { ...z, geometry: { x: -100, y: -50, w: 200, h: 100, rot: 0 } } : z)) }
    expect(newAreaSpot(tiny)).toBeNull()
  })
})

// Var en ny hög föds (#443). Panelens ＋ Hög la den på konstanten `point(0, 150)`, så ett andra
// tryck la `hog-2` på millimetern ovanpå `hog-1`. Felet är inte var den första högen hamnar — den
// krockar med ingenting vid något platsantal — utan att platsen är en konstant.
//
// Regeln är ytans, och samma funktion bakom den. Det som skiljer är att en hög är en punkt utan
// area i dokumentet och en kortrygg på filten, så svaret måste omvandlas tillbaka till punkten.
describe('en ny hög föds på ledig filt (#443, K2)', () => {
  // Kortryggen kring en högs punkt: det den upptar på filten, och därmed det enda måttet «täcker
  // de varandra» går att ställa på. Två punkter som inte är samma punkt säger ingenting.
  const CARD = { w: 63, h: 88 }
  const cardBack = (g: Geometry): Geometry => ({ x: g.x - CARD.w / 2, y: g.y - CARD.h / 2, ...CARD, rot: 0 })
  const boxOf = (z: Setup['zones'][number]): Geometry => (z.kind === 'pile' ? cardBack(z.geometry) : z.geometry)
  const holdsAndClears = (setup: Setup, at: Geometry) => ({
    inside: holds(setup.zones.find((z) => z.id === setup.floor)!.geometry, cardBack(at)),
    over: setup.zones.filter((z) => z.id !== setup.floor && sharesArea(boxOf(z), cardBack(at))).map((z) => z.id),
  })
  const withPile = (setup: Setup, id: string, at: Geometry): Setup => ({ ...setup, zones: [...setup.zones, { id, kind: 'pile', name: id, visibility: 'all', geometry: at }] })

  it('lägger den där panelen alltid har lagt den, så länge den kortryggen är ledig', () => {
    expect(newPileSpot(fullTable(2))).toEqual({ x: 0, y: 150, w: 0, h: 0, rot: 0 })
  })

  it('lägger den första på sin gamla punkt och den andra fri från den, vid varje platsantal bordet rymmer', () => {
    for (let players = 2; players <= MAX_PLAYERS; players++) {
      const setup = fullTable(players)
      const first = newPileSpot(setup)
      // Den första högen krockar med ingenting vid något platsantal, så inget recepbord ritas om.
      expect({ players, at: first }).toEqual({ players, at: { x: 0, y: 150, w: 0, h: 0, rot: 0 } })
      const second = newPileSpot(withPile(setup, 'hog-1', first!))
      // Icke-vakuitet: det finns ett svar att pröva. `null` här vore «ingen ledig filt», och
      // raderna nedan skulle då bli gröna av att ingenting mättes.
      expect({ players, found: second !== null }).toEqual({ players, found: true })
      expect({ players, ...holdsAndClears(withPile(setup, 'hog-1', first!), second!) }).toEqual({ players, inside: true, over: [] })
      // Och punkten är hela millimetrar, som allt annat bordet bär. Kortryggen är 63 bred kring
      // en mittpunkt, så en ruta ur en sökning i hela millimetrar skulle ge en halv — och att
      // avrunda den hade skjutit kortryggen ut ur den ruta regeln just friade.
      expect({ players, whole: [Number.isInteger(second!.x), Number.isInteger(second!.y)] }).toEqual({ players, whole: [true, true] })
    }
  })

  // Önskeplatsen är precis där ＋ Yta lägger sin ruta, så en delad yta som redan står där är det
  // första regeln måste vika undan för. En regel som bara såg andra högar hade lagt kortryggen
  // mitt i ytan.
  it('viker undan för en delad yta på önskeplatsen, och för leken', () => {
    const setup = fullTable(2)
    const under: Setup = { ...setup, zones: [...setup.zones, { id: 'yta-1', kind: 'area', name: 'Yta 1', visibility: 'all', geometry: newAreaSpot(setup)! }] }
    const spot = newPileSpot(under)!
    expect(holdsAndClears(under, spot)).toEqual({ inside: true, over: [] })
    // Och en hög som redan står på önskeplatsen räknas som den kortrygg den ritas som.
    const taken = withPile(setup, 'hog-0', { x: 0, y: 150, w: 0, h: 0, rot: 0 })
    expect(holdsAndClears(taken, newPileSpot(taken)!)).toEqual({ inside: true, over: [] })
  })

  it('säger nej när filten inte har någon ledig kortrygg', () => {
    const setup = fullTable(2)
    const floor = setup.zones.find((z) => z.id === setup.floor)!.geometry
    const covered: Setup = { ...setup, zones: [...setup.zones, { id: 'duk', kind: 'area', name: 'Duk', visibility: 'all', geometry: floor }] }
    expect(newPileSpot(covered)).toBeNull()
    // En filt som är mindre än ett kort säger samma sak, av samma skäl.
    const tiny: Setup = { ...setup, zones: setup.zones.map((z) => (z.id === setup.floor ? { ...z, geometry: { x: -20, y: -20, w: 40, h: 40, rot: 0 } } : z)) }
    expect(newPileSpot(tiny)).toBeNull()
  })
})
