import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { MAX_PLAYERS, openingSetup, type Recipe } from '@byd/server/doc'
import type { Snapshot } from '@byd/protocol'
import type { Rect } from '../src/table/camera.js'
import { CARD_MM, absoluteOf, dropIntents, type Drag } from '../src/table/drop.js'
import { FAN_MAX, HAND_STEP_MM } from '../src/table/hand.js'
import { playIntents } from '../src/player/play.js'
import { intentsForPlace, placesFor, type Thing } from '../src/table/keyboard.js'
import { fanIn } from '../src/table/lay.js'
import { tableOf } from './scene.js'

// Var ett kort hamnar i en yta när den som spelar inte har pekat (L47, #449).
//
// Mätt på den byggda filten och inte på ritade rutor: startbordet är `openingSetup`, korten går
// dit genom `playIntents` — telefonens egen väg — körda av motorn, och varje korts ruta läses ur
// `project` med `absoluteOf`. Det är samma mätning som prototypen i #449 gjorde, med skillnaden
// att den här körs vid varje platsantal och faller om svaret slutar stämma.
//
// Det som mäts är tre löften: inget kort lämnar sin yta, korten går att räkna, och det nyaste
// ligger överst.

const CARD = () => ({ id: CARD_STANDARD_63x88.id, version: 1 })
const ONE_COUNTER: Recipe['counters'] = [{ name: 'Poäng', start: 0 }]

// Startbordet med så många kort på Ninas hand som mätningen behöver.
function felt(players: number, cards: number, counters: Recipe['counters'] = ONE_COUNTER): SetupDef {
  const setup = openingSetup({ players, counters })
  return {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      name: z.name,
      visibility: z.visibility,
      geometry: z.geometry,
      ...(z.owner ? { owner: z.owner } : {}),
      ...(z.returnTo ? { returnTo: z.returnTo } : {}),
      ...(z.shortcut ? { shortcut: z.shortcut } : {}),
    })),
    components: Array.from({ length: cards }, (_, i) => ({ type: CARD(), cardRef: `kort-${i + 1}`, zone: 'hand:A', face: 'back' as const })),
  }
}

// Ninas bord efter att hon spelat `cards` kort ur handen till ytan framför sig, ett i taget,
// med telefonens «Framför mig» — som inte skickar någon punkt.
function played(players: number, cards: number, counters: Recipe['counters'] = ONE_COUNTER): Snapshot {
  const table = tableOf(felt(players, cards, counters))
  table.run(null, { v: 'seat.claim', seat: 'A', name: 'Nina' })
  for (let i = 0; i < cards; i++) {
    const view = table.view('A')
    const card = view.components.find((c) => c.zone === `hand:A`)
    if (!card) throw new Error('inget kort kvar på Ninas hand')
    table.run('A', ...playIntents(view, [card], 'mine:A'))
  }
  return table.view('A')
}

const zoneOf = (view: Snapshot, id: string) => {
  const z = view.zones.find((x) => x.id === id)
  if (!z) throw new Error(`ingen zon ${id}`)
  return z
}

// Kortens rutor i ytan, i den ordning filten målar dem: `project` skriver komponenterna i zonens
// egen ordning, och renderaren målar dem i den ordning den fick dem.
function boxes(view: Snapshot, zone: string): Rect[] {
  return view.components.filter((c) => c.zone === zone).map((c) => ({ ...absoluteOf(view, c), ...CARD_MM }))
}

const inside = (box: Rect, z: Rect): boolean => box.x >= z.x && box.y >= z.y && box.x + box.w <= z.x + z.w && box.y + box.h <= z.y + z.h

const SEATS = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)

describe('ett kort som spelas till en yta utan att någon pekar (L47, #449)', () => {
  it.each(SEATS)('ryms helt i ytan vid %i platser, ända upp till taket', (players) => {
    const view = played(players, FAN_MAX)
    const zone = zoneOf(view, 'mine:A')
    const laid = boxes(view, 'mine:A')
    // Mätningen får inte gå igenom på att ingenting blev utlagt.
    expect(laid).toHaveLength(FAN_MAX)
    const outside = laid.filter((box) => !inside(box, zone.geometry))
    expect(outside, `${outside.length} av ${laid.length} kort ligger utanför ${zone.name}`).toEqual([])
  })

  it.each(SEATS)('lägger korten ett steg isär vid %i platser, så att de går att räkna', (players) => {
    const view = played(players, FAN_MAX)
    const zone = zoneOf(view, 'mine:A')
    // Ytan framför en plats i norr eller söder är liggande, en i öster eller väster stående:
    // fjädern går längs den långa axeln, vilken det än är.
    const along = zone.geometry.w >= zone.geometry.h ? 'x' : 'y'
    const steps = boxes(view, 'mine:A').map((b) => b[along])
    expect(new Set(steps).size).toBe(FAN_MAX)
    expect(steps.map((v, i) => (i === 0 ? HAND_STEP_MM : v - (steps[i - 1] ?? 0)))).toEqual(Array.from({ length: FAN_MAX }, () => HAND_STEP_MM))
  })

  it.each(SEATS)('målar det nyaste kortet sist vid %i platser, så att det ligger överst', (players) => {
    const view = played(players, 3)
    const zone = zoneOf(view, 'mine:A')
    const order = zone.mode === 'order' ? zone.order : []
    expect(order).toHaveLength(3)
    // Det tredje kortet Nina spelade är `kort-3`, och det ska stå sist i zonens ordning.
    const newest = view.components.find((c) => c.id === order[order.length - 1])
    expect(newest?.cardRef).toBe('kort-3')
  })
})

// Var fjädern slutar växa, och vad som händer efter det (L47, #449).
describe('fjäderns tak (L47, #449)', () => {
  it.each(SEATS)('är handens eget FAN_MAX i receptets egen yta vid %i platser', (players) => {
    // Mätt och inte arrangerat: 63 + 11 × 26 = 349 mm i en yta som är 365 lång. Faller den här
    // faller argumentet beslutet vilar på, och inte bara ett tal i en funktion.
    const zone = zoneOf(played(players, 1), 'mine:A')
    expect(zone.geometry.w >= zone.geometry.h ? zone.geometry.w : zone.geometry.h).toBe(365)
    expect(fanIn(zone.geometry)).toBe(FAN_MAX)
    expect(CARD_MM.w + (FAN_MAX - 1) * HAND_STEP_MM).toBeLessThanOrEqual(365)
  })

  it('är handens och inte rummets i en yta som hade rymt fler steg', () => {
    // Filten själv är 1200 mm lång vid fyra platser och hade rymt fyrtiofem steg. Fjädern slutar
    // ändå vid tolv: det är handens tak, och en yta som fjädrar som en hand slutar där handen gör.
    const floor = zoneOf(played(4, 1), 'table')
    expect(floor.geometry.w).toBeGreaterThan(CARD_MM.w + FAN_MAX * HAND_STEP_MM)
    expect(fanIn(floor.geometry)).toBe(FAN_MAX)
  })

  it('lägger kort nummer tretton på tolvans millimeter, och stannar där', () => {
    const view = played(4, FAN_MAX + 3)
    const zone = zoneOf(view, 'mine:A')
    const laid = boxes(view, 'mine:A')
    expect(laid).toHaveLength(FAN_MAX + 3)
    // De fyra sista ligger på samma punkt: fjädern har slutat växa.
    const last = laid.slice(FAN_MAX - 1)
    expect(new Set(last.map((b) => `${b.x},${b.y}`)).size).toBe(1)
    expect(laid.filter((box) => !inside(box, zone.geometry))).toEqual([])
  })

  it('är ytans eget rum när ytan är kortare än tolv steg, så att ingenting lämnar den ändå', () => {
    // Två räknare bredvid sig gör ytan 240 mm lång i stället för 365, och då är taket ytans.
    const two: Recipe['counters'] = [{ name: 'Liv', start: 20 }, { name: 'Guld', start: 3 }]
    const view = played(4, FAN_MAX, two)
    const zone = zoneOf(view, 'mine:A')
    expect(zone.geometry.w).toBe(240)
    expect(fanIn(zone.geometry)).toBe(7)
    const laid = boxes(view, 'mine:A')
    expect(laid).toHaveLength(FAN_MAX)
    expect(laid.filter((box) => !inside(box, zone.geometry))).toEqual([])
  })
})

// Två vägar in i samma yta får inte ge två svar (L47, #449).
//
// Tangentbordets väg hade ett eget svar — `slotIn`, en rad uträknad ur zonens bredd, som bar
// raden «this is the prototype's guess, not a product decision» — och det var mätt trasigt: första
// kortet låg på `y = 14` i en 100 mm djup yta med ett 88 mm högt kort, alltså 2 mm utanför redan
// med ett enda kort. Ingenting drog tillbaka det: `keptOnFelt` håller bara kvar det som släpps på
// golvet.
describe('samma yta nådd med tangentbordet (L47, #449)', () => {
  // Ett bord där Ninas enda kort ligger löst på filten, redo att adresseras till ytan framför
  // henne från tangentbordet.
  const onTheFelt = () => {
    const table = tableOf(felt(4, 1))
    table.run(null, { v: 'seat.claim', seat: 'A', name: 'Nina' })
    const first = table.view('A').components.find((c) => c.zone === 'hand:A')
    if (!first) throw new Error('inget kort på Ninas hand')
    table.run('A', { v: 'move', component: first.id, to: 'table', x: -100, y: -100 })
    const view = table.view('A')
    const card = view.components.find((c) => c.id === first.id)
    if (!card) throw new Error('kortet försvann från filten')
    const thing: Thing = { key: `card:${card.id}`, kind: 'card', id: card.id, name: 'kort-1', zone: card.zone }
    const place = placesFor(view, new Set([card.id]), card.zone).find((p) => p.zone === 'mine:A' && p.kind === 'area')
    if (!place) throw new Error('ytan framför Nina går inte att adressera')
    return { table, view, card, thing, place }
  }

  it('säger samma sak som telefonen om samma kort i samma yta', () => {
    const { view, card, thing, place } = onTheFelt()
    expect(intentsForPlace(view, place, thing, [card.id])).toEqual(playIntents(view, [card], 'mine:A'))
  })

  it('lägger första kortet helt innanför ytan, vilket raden aldrig gjorde', () => {
    const { table, view, card, thing, place } = onTheFelt()
    table.run('A', ...intentsForPlace(view, place, thing, [card.id]))
    const after = table.view('A')
    const zone = zoneOf(after, 'mine:A')
    const laid = boxes(after, 'mine:A')
    expect(laid).toHaveLength(1)
    expect(laid.filter((box) => !inside(box, zone.geometry))).toEqual([])
  })
})

// Den tredje vägen in i samma yta: pekaren (#461).
//
// Det här är inte L47:s fall — någon *har* pekat, och var kortet hamnar är därför pekarens och
// inte fjäderns (K2). Men ordningen är inte placeringen: `dropIntents` skickade ett `move` utan
// `index`, och ett `move` utan `index` landar på `index 0` och målas först. Samma yta fick alltså
// två z-ordningar beroende på vilken skärm man rörde kortet från.
//
// Att det inte märktes förut är för att alla tre vägarna la kortet underst; #449 lagade två av
// dem och gjorde därmed den tredje synlig.
describe('samma yta nådd med pekaren (#461)', () => {
  // Var korten släpps. En hand som lägger tre kort bredvid varandra i en yta lägger dem isär —
  // ett kort är 63 mm brett, och två släpp närmare än så är ett släpp *på* det förra kortet,
  // vilket är en stapling och inte en placering (K1). Så punkterna står ett kort plus lite isär,
  // vilket också är vad som gör mätningen till en mätning av ordning och inte av stapling.
  const APART_MM = 70

  // Ett bord där `cards` kort dragits in i ytan framför Nina, ett i taget, var och en till sin
  // egen punkt. Kortet bärs i sin egen mitt, som en hand som siktar på en ledig fläck.
  function draggedIn(players: number, cards: number): Snapshot {
    const table = tableOf(felt(players, cards))
    table.run(null, { v: 'seat.claim', seat: 'A', name: 'Nina' })
    for (let i = 0; i < cards; i++) {
      const before = table.view('A')
      const card = before.components.find((c) => c.zone === 'hand:A')
      if (!card) throw new Error('inget kort kvar på Ninas hand')
      // Uppvänt på filten, som ett kort man kan se: ytan framför en plats är publik (L48), och
      // ett nedvänt kort i en publik yta har ingen identitet för någon — inte ens för ägaren.
      // Ett drag som mäts i kortnamn måste alltså dra ett kort som har ett namn att visa.
      table.run('A', { v: 'move', component: card.id, to: before.floor, x: 40, y: 40 }, { v: 'flip', component: card.id, face: 'front' })
      const view = table.view('A')
      const loose = view.components.find((c) => c.id === card.id)
      if (!loose) throw new Error('kortet kom aldrig ut på filten')
      const from = absoluteOf(view, loose)
      const grab = { x: from.x + CARD_MM.w / 2, y: from.y + CARD_MM.h / 2 }
      const g = zoneOf(view, 'mine:A').geometry
      const along = g.w >= g.h
      const step = CARD_MM.w / 2 + i * APART_MM
      const at = along ? { x: g.x + step, y: g.y + g.h / 2 } : { x: g.x + g.w / 2, y: g.y + step }
      const drag: Drag = { target: { kind: 'card', id: loose.id }, ids: [loose.id], origin: { [loose.id]: from }, grab, at }
      const intents = dropIntents(view, drag, 'table')
      // Mätningen får inte gå igenom på ett drag som staplade i stället för att placera, eller
      // som missade ytan: då hade den mätt något annat än den påstår.
      expect(intents.map((it) => `${it.v}:${it.v === 'move' ? it.to : ''}`)).toEqual(['move:mine:A'])
      table.run('A', ...intents)
    }
    return table.view('A')
  }

  const orderIn = (view: Snapshot, zone: string): (string | null)[] => {
    const z = zoneOf(view, zone)
    const order = z.mode === 'order' ? z.order : []
    return order.map((id) => view.components.find((c) => c.id === id)?.cardRef ?? null)
  }

  it('målar det nyaste kortet sist, så att det ligger överst', () => {
    expect(orderIn(draggedIn(4, 3), 'mine:A')).toEqual(['kort-1', 'kort-2', 'kort-3'])
  })

  it('lämnar punkten i fred: kortet ligger där det släpptes och inte där fjädern hade lagt det', () => {
    const view = draggedIn(4, 1)
    const g = zoneOf(view, 'mine:A').geometry
    const laid = boxes(view, 'mine:A')
    expect(laid).toHaveLength(1)
    // Släppet var en halv kortbredd in i ytan, och kortet bars i sin egen mitt: hörnet ligger
    // därför på ytans egen kant. `laidIn` hade svarat med sitt eget steg och sin egen mittlinje.
    const along = g.w >= g.h
    expect(laid[0]).toEqual({ x: along ? g.x : g.x + g.w / 2 - CARD_MM.w / 2, y: along ? g.y + g.h / 2 - CARD_MM.h / 2 : g.y + CARD_MM.w / 2 - CARD_MM.h / 2, ...CARD_MM })
  })

  // Det som gör de tre vägarna till en yta och inte till tre. Telefonen lägger två kort, pekaren
  // drar in ett tredje, och det tredje ska ligga överst — vilket det inte gjorde.
  it('lägger sig ovanpå det telefonen redan lagt, så att de tre vägarna inte kan glida isär igen', () => {
    const table = tableOf(felt(4, 3))
    table.run(null, { v: 'seat.claim', seat: 'A', name: 'Nina' })
    for (let i = 0; i < 2; i++) {
      const view = table.view('A')
      const card = view.components.find((c) => c.zone === 'hand:A')
      if (!card) throw new Error('inget kort kvar på Ninas hand')
      table.run('A', ...playIntents(view, [card], 'mine:A'))
    }
    // Det tredje kortet dras dit för hand, till en ledig fläck bortom de två fjädrade.
    const before = table.view('A')
    const third = before.components.find((c) => c.zone === 'hand:A')
    if (!third) throw new Error('inget tredje kort')
    table.run('A', { v: 'move', component: third.id, to: before.floor, x: 40, y: 40 }, { v: 'flip', component: third.id, face: 'front' })
    const view = table.view('A')
    const loose = view.components.find((c) => c.id === third.id)
    if (!loose) throw new Error('kortet kom aldrig ut på filten')
    const from = absoluteOf(view, loose)
    const g = zoneOf(view, 'mine:A').geometry
    const along = g.w >= g.h
    const free = g.w >= g.h ? g.w : g.h
    const at = along ? { x: g.x + free - CARD_MM.w / 2, y: g.y + g.h / 2 } : { x: g.x + g.w / 2, y: g.y + free - CARD_MM.h / 2 }
    const drag: Drag = { target: { kind: 'card', id: loose.id }, ids: [loose.id], origin: { [loose.id]: from }, grab: { x: from.x + CARD_MM.w / 2, y: from.y + CARD_MM.h / 2 }, at }
    const intents = dropIntents(view, drag, 'table')
    expect(intents.map((it) => `${it.v}:${it.v === 'move' ? it.to : ''}`)).toEqual(['move:mine:A'])
    table.run('A', ...intents)
    expect(orderIn(table.view('A'), 'mine:A')).toEqual(['kort-1', 'kort-2', 'kort-3'])
  })
})
