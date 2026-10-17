// A hand of many backs keeps its shape and does not grow (#766, beställarens beslut A): the fan
// turns at most ±22° in all, however many cards are drawn. Before, twelve backs turned ±49.5° and
// hung 38 px over the felt's edge on the room's television at eight seats.
import { describe, expect, it } from 'vitest'
import { BACK_TILT, BACK_TURN_MAX, FAN_MAX, fanPlace } from '../src/table/hand.js'

const turns = (count: number) => Array.from({ length: count }, (_, i) => fanPlace(i, count, false).tilt)

describe('a fan of backs has a ceiling on its turn (#766)', () => {
  it('turns twelve backs no further than ±22°, evenly', () => {
    const t = turns(FAN_MAX)
    expect(BACK_TURN_MAX).toBe(22)
    expect(Math.max(...t.map(Math.abs))).toBeCloseTo(22, 5)
    const steps = t.slice(1).map((x, i) => x - t[i]!)
    for (const s of steps) expect(s).toBeCloseTo(steps[0]!, 5)
  })

  it('leaves a small hand as it was: a step of its own tilt until the ceiling is reached', () => {
    expect(turns(3)).toEqual([-BACK_TILT, 0, BACK_TILT])
    expect(Math.max(...turns(5).map(Math.abs))).toBe(2 * BACK_TILT)
  })

  it('does not touch a read fan, which steps sideways as well', () => {
    expect(fanPlace(0, 12, true).tilt).toBeLessThan(-22)
  })
})
