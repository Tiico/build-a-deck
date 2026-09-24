// @vitest-environment jsdom
// The table folded up small (C4), and since #79 the one place on the phone that can put a card
// into the hand. The verb is the felt's own (K14) and it is offered on exactly the felt's terms:
// any pile that has a card, and only to a reader who holds a seat.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Snapshot } from '@byd/protocol'
import { TableSummary } from '../src/player/TableSummary.js'
import { overviewOf } from '../src/player/PlaySheet.js'
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

// The same table with the area in front of B taken back by the designer, which is the one way an
// area is private again (#414, decision B of 2026-09-22).
function hiddenAreaTable() {
  const setup = seatSetup()
  const table = tableOf({ ...setup, zones: setup.zones.map((z) => (z.id === 'mine:B' ? { ...z, visibility: 'owner' as const } : z)) })
  table.run(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  table.run(null, { v: 'seat.claim', seat: 'B', name: 'Bo' })
  table.run(null, { v: 'draw', from: 'draw', to: 'mine:B', count: 2 })
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
    expect(tiles()).toEqual(['discard', 'draw', 'mine:A', 'mine:B'])
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
    expect(tiles()).toEqual(['discard', 'draw', 'mine:A', 'mine:B'])
    expect(drawable()).toEqual([])
  })
})

// What the overview is, said as the difference it has to the sheet (C4, #414).
//
// The two used to be one list, because they used to have one answer: a zone another seat owned
// was a zone this reader could neither see into nor play to. An area that is public and somebody
// else's separates them. The sheet answers «where may this card go», and Ada's card has no
// business in front of Bo. The overview answers «what is on the table», and the cards in front of
// Bo are on the table — Bo's area is drawn on the felt, and the identities are in this reader's
// own browser already. A phone that hid what its own socket had been sent would be the one state
// the repo's rule about hidden information exists to keep out.
describe('what the overview says of another seat (C4, #414)', () => {
  it('lists an area that seat lets the table look into, by its name and how much lies in it', () => {
    const table = wizardTable()
    table.run(null, { v: 'seat.claim', seat: 'B', name: 'Bo' })
    table.run(null, { v: 'draw', from: 'draw', to: 'mine:B', count: 2 })
    render(<TableSummary view={table.view('A')} activity={[]} onDraw={noop} />)
    expect(tiles()).toEqual(['discard', 'draw', 'mine:A', 'mine:B'])
    const tile = document.querySelector('[data-zone-summary="mine:B"]')
    expect(tile?.textContent).toBe('Framför B2 kort')
    // A tile and not a verb: the area is read, never drawn from and never played into.
    expect(tile?.tagName).toBe('DIV')
    expect(drawable()).toEqual(['discard', 'draw'])
  })

  it('leaves out an area that seat keeps to itself, and every zone that only holds counters', () => {
    const table = hiddenAreaTable()
    render(<TableSummary view={table.view('A')} activity={[]} onDraw={noop} />)
    // `mine:B` is in Ada's snapshot as a count and nothing else, and a count of somebody else's
    // hidden area is not hers to read. The counters zones are both public and both left out, for
    // the older reason: a zone that only holds counters is not a place for cards (C4).
    expect(tiles()).toEqual(['discard', 'draw', 'mine:A'])
  })
})

// De två halvorna av bordet (#465). Telefonen ritar listan två gånger — en gång som rad ovanför
// handen och en gång som flik under den — och innan det här höll båda högarna. Halvorna är
// komplementära: varje bricka står i exakt en av dem, och tillsammans är de hela `overviewOf`.
describe('bordet delat i två halvor (#465)', () => {
  const zonesShown = () => [...document.querySelectorAll('[data-zone-summary]')].map((el) => el.getAttribute('data-zone-summary'))

  it('ger fliken ytorna och raden högarna, utan att en enda bricka står på båda ställena', () => {
    const table = tableOf(seatSetup())
    table.run(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    const view = table.view('A')

    const { unmount } = render(<TableSummary view={view} activity={[]} zones="areas" />)
    const areas = zonesShown()
    unmount()
    render(<TableSummary view={view} activity={[]} zones="piles" onDraw={noop} />)
    const piles = zonesShown()

    expect(areas).toEqual(['mine:A', 'mine:B'])
    expect(piles).toEqual(['discard', 'draw'])
    // Ingen bricka på båda, och tillsammans är de hela listan.
    expect(areas.filter((id) => piles.includes(id))).toEqual([])
    expect([...areas, ...piles].sort()).toEqual([...overviewOf(view).map((z) => z.id)].sort())
  })
})
