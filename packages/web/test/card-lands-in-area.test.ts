import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { MAX_PLAYERS, openingSetup, type Recipe } from '@byd/server/doc'
import type { Snapshot } from '@byd/protocol'
import type { Rect } from '../src/table/camera.js'
import { CARD_MM, absoluteOf } from '../src/table/drop.js'
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
