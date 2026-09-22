import { describe, expect, it } from 'vitest'
import type { ZoneView } from '@byd/protocol'
import { HAND_COUNT_ABOVE_MM, HAND_COUNT_MM, handAnchor, handAt, handCountAt, handRotation, type TableMode } from '../src/table/hand.js'

// Var handens antalsbricka hänger, sagt i bordets egna millimeter (#413).
//
// Brickan är en etikett i pixlar, som en högs namn, och den ritas utanför fläkten. Fläkten mäts
// (`handExtent`) och passas in; brickan mäts inte alls, och på TV:n hängde den utanför fönstret.
// Det som saknades var inte brickans höjd — den är i pixlar och kan ingen inpassning i millimeter
// äga — utan *linjen den hänger från*: en punkt på filten, som en inpassning kan hålla innanför
// bilden och lämna en pillerbredds luft omkring (`TV_AIR_PX`).
//
// Punkten och ingenting mer, alltså. Brickan är 18 px hög och som bredast fyra tecken; vad den
// tar förbi sin punkt är luftens sak och inte filtens, precis som `TV_AIR_PX` redan säger.

const floor: ZoneView = zone('table', 'area', { x: -600, y: -400, w: 1200, h: 800 })
// De fyra platserna som receptet lägger dem: S, N, E, W, var och en 500 mm längs sin kant och
// 60 mm in från den (K18).
const HANDS = {
  S: zone('hand:A', 'hand', { x: -250, y: 340, w: 500, h: 60 }),
  N: zone('hand:B', 'hand', { x: -250, y: -400, w: 500, h: 60 }),
  E: zone('hand:C', 'hand', { x: 540, y: -250, w: 60, h: 500 }),
  W: zone('hand:D', 'hand', { x: -600, y: -250, w: 60, h: 500 }),
} as const

function zone(id: string, kind: 'hand' | 'area', geometry: { x: number; y: number; w: number; h: number }, count = 5): ZoneView {
  return { mode: 'count', id, kind, name: id, geometry: { ...geometry, rot: 0 }, dynamic: false, count } as ZoneView
}

const at = (hand: ZoneView, mode: TableMode) => {
  const rot = handRotation(hand, floor, mode)
  return { anchor: handAnchor(hand, floor, rot), point: handCountAt(hand, floor, rot) }
}

describe('linjen handens antalsbricka hänger från (#413)', () => {
  it('ligger under fläkten på TV:n, där brickan hänger nedåt', () => {
    for (const edge of ['S', 'E', 'W'] as const) {
      const { anchor, point } = at(HANDS[edge], 'tv')
      expect({ edge, x: round(point.x - anchor.x), y: round(point.y - anchor.y) }).toEqual({ edge, x: 0, y: HAND_COUNT_MM })
    }
  })

  it('ligger ovanför fläkten vid TV:ns norra plats, som är den enda vars kant ligger ovanför den (#84)', () => {
    const { anchor, point } = at(HANDS.N, 'tv')
    expect({ x: round(point.x - anchor.x), y: round(point.y - anchor.y) }).toEqual({ x: 0, y: -HAND_COUNT_ABOVE_MM })
  })

  it('vänder med handen i bordsläget, där fläkten är vriden mot sin egen kant (C5)', () => {
    // Varje hand är vriden mot sin kant, så brickan hänger utåt vid var och en av dem: bort från
    // bordets mitt, vilket är hela poängen med att den hänger under fläkten.
    const out = { S: { x: 0, y: HAND_COUNT_MM }, N: { x: 0, y: -HAND_COUNT_MM }, E: { x: HAND_COUNT_MM, y: 0 }, W: { x: -HAND_COUNT_MM, y: 0 } }
    for (const edge of ['S', 'N', 'E', 'W'] as const) {
      const { anchor, point } = at(HANDS[edge], 'table')
      expect({ edge, x: round(point.x - anchor.x), y: round(point.y - anchor.y) }).toEqual({ edge, ...out[edge] })
    }
  })

  it('hänger från zonens egen mitt för en hand som är fälld till sitt tal, som inte ritar någon fläkt', () => {
    // `/online` ritar läsarens egen hand i bandet och fäller den på filten (#77). En fälld hand
    // har ingen fläkt som skjuter ut den mot kanten, så den står mitt i sin egen zon — och
    // brickan hänger från den punkten, precis som renderaren ritar den.
    expect(handCountAt(HANDS.S, floor, 0, true)).toEqual({ x: 0, y: 370 + HAND_COUNT_MM })
    expect(handAt(HANDS.S, floor, 0, true)).toEqual({ x: 0, y: 370 })
  })

  it('finns även för en tom hand, som ritar sin nolla som varje annan hand ritar sitt tal', () => {
    // En tom hand har ingen fläkt att skjutas ut av, så brickan hänger från zonens egen mitt —
    // innanför filten, där den aldrig kan klippas. Men den finns, och en inpassning som inte
    // svarade för den skulle svara för olika många brickor beroende på vem som råkar hålla kort.
    const empty = zone('hand:A', 'hand', { x: -250, y: 340, w: 500, h: 60 }, 0)
    expect(handCountAt(empty, floor, 0)).toEqual({ x: 0, y: 370 + HAND_COUNT_MM })
  })
})

// Avrundat, och med nollan skriven en gång: en vändning ger −0 där den inte flyttade något, och
// −0 är inte 0 för en djup jämförelse.
const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0
