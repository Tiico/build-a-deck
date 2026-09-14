// @vitest-environment jsdom
// The table folded up small (C4), and since #79 the one place on the phone that can put a card
// into the hand. The verb is the felt's own (K14) and it is offered on exactly the felt's terms:
// any pile that has a card, and only to a reader who holds a seat.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Snapshot } from '@byd/protocol'
import { TableSummary } from '../src/player/TableSummary.js'
import { seatSetup } from './fixture.js'
import { tableOf } from './scene.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const noop = (): undefined => undefined
const drawable = () => screen.queryAllByRole('button').map((b) => b.getAttribute('data-zone-draw'))
const tiles = () => [...document.querySelectorAll('[data-zone-summary]')].map((el) => el.getAttribute('data-zone-summary'))

// The table the wizard lays out: two piles, an area in front of every seat, and a counters zone.
function wizardTable() {
  const table = tableOf(seatSetup())
  table.run(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  table.run(null, { v: 'draw', from: 'draw', to: 'discard', count: 2 })
  table.run(null, { v: 'draw', from: 'draw', to: 'mine:A', count: 1 })
  return table
}

// The same table with one pile emptied out onto the floor, which is where a pile that has been
// played all the way out ends up anyway.
function emptied(v: Snapshot, pile: string): Snapshot {
  const zones = v.zones.map((z) => (z.id === pile ? (z.mode === 'count' ? { ...z, count: 0 } : { ...z, order: [] }) : z))
  return { ...v, zones, components: v.components.map((c) => (c.zone === pile ? { ...c, zone: v.floor } : c)) }
}

describe('the overview offers the draw per pile (C4, K14, #79)', () => {
  it('offers it on every pile that has a card, and never on an area or the floor', () => {
    const table = wizardTable()
    render(<TableSummary view={table.view('A')} activity={[]} onDraw={noop} />)
    // The wizard's table: the draw pile and the discard, which is precisely what someone
    // standing at the felt can already do with the ring on either of them.
    expect(tiles()).toEqual(['discard', 'draw', 'mine:A'])
    expect(drawable()).toEqual(['discard', 'draw'])
    // The area in front of the seat is a tile and not a verb, and the floor is not a tile at all.
    expect(document.querySelector('[data-zone-summary="mine:A"]')?.tagName).toBe('DIV')
    expect(tiles()).not.toContain(table.view('A').floor)
  })

  it('says nothing of a draw on a pile with no cards left in it', () => {
    const table = wizardTable()
    render(<TableSummary view={emptied(table.view('A'), 'discard')} activity={[]} onDraw={noop} />)
    expect(drawable()).toEqual(['draw'])
    // The pile is still there to be read; it is only the verb that is gone.
    expect(document.querySelector('[data-zone-summary="discard"]')?.tagName).toBe('DIV')
  })

  it('offers it to nobody without a seat to draw into', () => {
    const table = wizardTable()
    render(<TableSummary view={table.view(null)} activity={[]} onDraw={noop} />)
    expect(tiles()).toEqual(['discard', 'draw'])
    expect(drawable()).toEqual([])
  })
})
