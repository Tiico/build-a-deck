// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { Activity, Snapshot } from '@byd/protocol'
import { LastMove } from '../src/online/LastMove.js'
import { seatColor } from '../src/table/seatColor.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// What somebody else just did, still said in the top bar after its 1.6 s ring has gone (#484 fynd 12,
// beslut A, prototyp 26): the same sentence the screen reader is given, in the seat's colour, with
// how long ago. It stays until somebody else moves; the seat's own moves are not news to it.
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const view = {
  seq: 9,
  seat: 'A',
  floor: 'table',
  seats: [
    { id: 'A', name: 'Ada', edge: 'S' },
    { id: 'B', name: 'Bo', edge: 'N' },
  ],
  zones: [
    { mode: 'order', id: 'table', kind: 'area', name: 'Spelyta', geometry: rect(-600, -400, 1200, 800), dynamic: false, order: [] },
    { mode: 'count', id: 'draw', kind: 'pile', name: 'Draghög', geometry: rect(-140, 0, 0, 0), dynamic: false, count: 5 },
    { mode: 'count', id: 'hand:B', kind: 'hand', name: 'Hand', owner: 'B', geometry: rect(-250, -400, 500, 60), dynamic: false, count: 2 },
  ],
  components: [],
} as unknown as Snapshot
const NOW = Date.parse('2026-09-28T10:00:00.000Z')
const line = (seq: number, by: string | null, agoS: number): Activity =>
  ({ seq, batch: `b${seq}`, schemaVersion: 1, by, at: new Date(NOW - agoS * 1000).toISOString(), intent: { v: 'draw', from: 'draw', to: 'hand:B', count: 1 } }) as Activity

afterEach(() => vi.useRealTimers())

describe('the last move somebody else made (#484)', () => {
  it('says the newest line that is not this seat’s own, in its seat’s colour, and how long ago', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(<LastMove view={view} activity={[line(1, 'B', 40), line(2, 'A', 5)]} seat="A" />)
    const el = container.querySelector('[data-last-move]') as HTMLElement
    expect(el.textContent).toBe('Senast: Bo drog 1 från Draghög · för 40 s sedan')
    expect(el.style.getPropertyValue('--seat')).toBe(seatColor(1))
    act(() => vi.advanceTimersByTime(60_000))
    expect(el.textContent).toMatch(/· för 1 min sedan$/)
  })

  it('says nothing before anybody else has moved', () => {
    const { container } = render(<LastMove view={view} activity={[line(1, 'A', 5)]} seat="A" />)
    expect(container.querySelector('[data-last-move]')).toBeNull()
  })

  it('takes no seat’s colour for a line the table itself made, whatever this page’s own seat is', () => {
    const { container } = render(<LastMove view={view} activity={[line(1, null, 5)]} seat="A" />)
    expect((container.querySelector('[data-last-move]') as HTMLElement).style.getPropertyValue('--seat')).toBe('var(--byd-last-table)')
  })
})

