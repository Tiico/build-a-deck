// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { TypeRegistry, initialState, project, STANDARD_TYPES } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { TableRenderer, type TableMode } from '../src/table/TableRenderer.js'
import { seatSetup } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const registry = new TypeRegistry(STANDARD_TYPES)
const table = () => project(initialState('v1', seatSetup(), registry), registry, null)
// A's "Liv" chip: 20, standing at (8, 8) inside `counters:A` at (100, 220) — absolute (108, 228).
const livId = (v: Snapshot) => v.components.find((c) => c.zone === 'counters:A' && c.cardRef === 'Liv')!.id
const chipOf = (id: string) => document.querySelector(`[data-counter-token="${id}"]`) as HTMLElement
const placeOf = (el: HTMLElement) => ({ left: el.style.left, top: el.style.top })
// At scale 1 with jsdom's zero-sized boxes a TV client pixel is a table millimetre offset by the
// floor's origin (-500, -300). Table mode projects through the tilt instead, so the same numbers
// land elsewhere on the felt — which is exactly why the two modes are asked the same question.
const client = (mmX: number, mmY: number) => ({ clientX: mmX + 500, clientY: mmY + 300, pointerId: 1, isPrimary: true, button: 0 })

// A counter token is a 24 mm chip. On a TV the whole felt is scaled to fit the screen, and at the
// scale a two-seat table lands on that chip is smaller than the word standing in it — so the name
// spills out over the felt as an unreadable smear on top of itself (UX-kontroll 2026-09-10).
describe('a counter token', () => {
  it('keeps its name inside the chip: below the width the word needs, the value stands alone', () => {
    const { container } = render(<TableRenderer view={table()} mode="tv" scale={0.75} />)
    const token = container.querySelector('.byd-token')!
    expect(parseFloat((token as HTMLElement).style.width)).toBeLessThan(34)
    expect(token.querySelector('span')).toBeNull()
    expect(token.querySelector('b')!.textContent).toBe('20')
  })

  it('says the name when the chip is wide enough to hold it', () => {
    const { container } = render(<TableRenderer view={table()} mode="tv" scale={2} />)
    const token = container.querySelector('.byd-token')!
    expect(parseFloat((token as HTMLElement).style.width)).toBeGreaterThanOrEqual(34)
    expect(token.querySelector('span')!.textContent).toBe('Liv')
  })
})

// A chip is a thing on the felt like any other, and the hand on the felt takes hold of things
// (K14). The renderer handed the counter branch the keyboard's node alone and kept the pointer's
// handles for cards and piles, so the chip was the one thing on the table that no mouse and no
// finger could touch at all (#73).
describe.each<TableMode>(['table', 'tv'])('a counter chip under the pointer, mode=%s (K14, C4)', (mode) => {
  it('follows the pointer, and stays where it was let go of until the table answers', () => {
    const v = table()
    const id = livId(v)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={onAct} />)
    const home = placeOf(chipOf(id))

    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerMove(chipOf(id), client(398, 98))
    const dragged = placeOf(chipOf(id))
    expect(dragged).not.toEqual(home)

    fireEvent.pointerUp(chipOf(id), client(398, 98))
    expect(onAct).toHaveBeenCalledTimes(1)
    expect(onAct.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ v: 'move', component: id })])
    // The drop and the patch are different moments (#29). Nothing has come back yet, so the chip
    // stands where it was put rather than flinching home.
    expect(placeOf(chipOf(id))).toEqual(dragged)
  })

  // The control the drag test needs: the same gestures on a table that is only being shown move
  // nothing at all, so the comparison above is a chip that travelled and not an assertion that
  // could never fail.
  it('stays put on a table that is only shown, where there is no hand to take it', () => {
    const v = table()
    const id = livId(v)
    render(<TableRenderer view={v} mode={mode} scale={1} />)
    const home = placeOf(chipOf(id))

    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerMove(chipOf(id), client(398, 98))
    fireEvent.pointerUp(chipOf(id), client(398, 98))
    expect(placeOf(chipOf(id))).toEqual(home)
  })
})

describe('where a dropped chip lands (K2, C4)', () => {
  it('moves to the millimetre it was let go of, in the zone that point falls in', () => {
    const v = table()
    const id = livId(v)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode="tv" scale={1} onAct={onAct} />)

    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerMove(chipOf(id), client(398, 98))
    fireEvent.pointerUp(chipOf(id), client(398, 98))
    // Out of its counter zone and onto the felt: (398, 98) is (898, 398) inside `table`.
    expect(onAct).toHaveBeenCalledWith([{ v: 'move', component: id, to: 'table', x: 898, y: 398 }])
    expect(placeOf(chipOf(id))).toEqual({ left: '898px', top: '398px' })
  })
})
