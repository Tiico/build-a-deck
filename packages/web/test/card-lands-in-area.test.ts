import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, type SetupDef } from '@byd/engine'
import { MAX_PLAYERS, openingSetup, type Recipe } from '@byd/server/doc'
import type { Snapshot } from '@byd/protocol'
import type { Rect } from '../src/table/camera.js'
import { CARD_MM, absoluteOf } from '../src/table/drop.js'
import { FAN_MAX, HAND_STEP_MM } from '../src/table/hand.js'
import { playIntents } from '../src/player/play.js'
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
