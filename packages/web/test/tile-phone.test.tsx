// @vitest-environment jsdom
// Brickor i telefonen (#1486, variant A i #1474): brickorna i handens rad efter korten i sin sanna
// storlek mot kortet, deras baksidor i TV:ns solfjäder, och ↺/↻ i formens steg i «Framför mig»
// och «Bordet».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TILE_HEX, TILE_SQUARE, type SetupDef } from '@byd/engine'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { admit, asTable, createSession, seatSetup, startServer, type Running } from './fixture.js'
import { HandGrid } from '../src/player/HandGrid.js'
import { MineStrip } from '../src/player/SeatExtras.js'
import { TableSummary } from '../src/player/TableSummary.js'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { tableOf } from './scene.js'


const hex = { id: TILE_HEX.id, version: TILE_HEX.version }
const square = { id: TILE_SQUARE.id, version: TILE_SQUARE.version }

// The two-seat table with an area in front of each seat, a hidden bag of hexagons and a square
// lying in a shared area, Marknad.
function setup(): SetupDef {
  const base = seatSetup()
  return {
    ...base,
    zones: [...base.zones, { id: 'bag', kind: 'pile', name: 'Landskap', visibility: 'none', geometry: { x: 0, y: -150, w: 0, h: 0, rot: 0 } }, { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: { x: 250, y: -100, w: 200, h: 120, rot: 0 } }],
    components: [
      ...base.components,
      ...['Granskog', 'Tjärn', 'Fjäll', 'Rågåker'].map((cardRef) => ({ type: hex, cardRef, zone: 'bag', face: 'back' as const })),
      { type: square, cardRef: 'Vete', zone: 'market', face: 'front' as const, x: 20, y: 20 },
    ],
  }
}

// Ada holds two cards and a hexagon, and has a hexagon lying face up in front of her.
function adasTable() {
  const table = tableOf(setup())
  table.run(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  table.run(null, { v: 'draw', from: 'bag', to: 'hand:A', count: 1 })
  table.run(null, { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
  table.run(null, { v: 'draw', from: 'bag', to: 'mine:A', count: 1, face: 'front' })
  return table
}

afterEach(cleanup)

// Ada's phone over a real wire, with a hexagon in front of her and the square in Marknad.
describe('the phone turns a tile, and the table hears `rotate` (#1486)', () => {
  let run: Running
  beforeEach(async () => {
    run = await startServer()
  })
  afterEach(async () => {
    await run.stop()
  })

  it('in «Framför mig» by its own buttons, and in «Bordet» from the tile held up', async () => {
    const id = await createSession(run, 's1', undefined, setup())
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'draw', from: 'bag', to: 'mine:A', count: 1, face: 'front' })
    await table.synced(1)
    const token = await admit(run, id, 'A', 'Ada')
    history.replaceState(null, '', `/play?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
    render(
      <StatusLive>
        <PlayerPage />
      </StatusLive>,
    )
    const last = async () => (await run.store.read(id)).at(-1)?.intent
    const mine = table.view!.components.find((c) => c.zone === 'mine:A')!
    const vete = table.view!.components.find((c) => c.cardRef === 'Vete')!

    // A tab is opened before anything in it is asked about (#1147).
    fireEvent.click(await screen.findByRole('tab', { name: /Framför mig/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^↻ Rotera 60°/ }))
    await waitFor(async () => expect(await last()).toEqual({ v: 'rotate', component: mine.id, rot: 60 }))

    fireEvent.click(screen.getByRole('tab', { name: /Bordet/ }))
    fireEvent.click(document.querySelector(`[data-area-card="${vete.id}"]`)!)
    const held = await screen.findByRole('dialog')
    // Held up in its shape, at its size against a card (K26).
    expect(held.querySelector('[data-inspect]')!.getAttribute('data-shape')).toBe('square')
    fireEvent.click(within(held).getByRole('button', { name: /^↺ Rotera 90°/ }))
    await waitFor(async () => expect(await last()).toEqual({ v: 'rotate', component: vete.id, rot: 270 }))
  })
})

describe('the hand holds its tiles after its cards, in their shape (#1486)', () => {
  it('draws the hexagon last, cut to its outline at its size against a card', () => {
    const view = adasTable().view('A')
    render(<HandGrid view={view} selected={new Set()} onToggle={() => undefined} onOpen={() => undefined} />)
    const cells = [...document.querySelectorAll('[data-hand-card]')]
    expect(cells).toHaveLength(3)
    expect(cells.map((c) => c.getAttribute('data-shape'))).toEqual([null, null, 'hex'])
    const face = cells[2]!.querySelector('.byd-tile-face[data-shape="hex"]') as HTMLElement
    // 52 of a card's 63 mm across, and 60 of its 88 down: the rest stands round it.
    expect(face.style.inset).toBe(`${(((88 - TILE_HEX.physical.heightMm) / 2 / 88) * 100).toFixed(3)}% ${(((63 - 52) / 2 / 63) * 100).toFixed(3)}%`)
  })

  it('carries a tile along the hand only among the tiles', () => {
    const table = adasTable()
    table.run(null, { v: 'draw', from: 'bag', to: 'hand:A', count: 1 })
    const view = table.view('A')
    const onReorder = vi.fn()
    render(<HandGrid view={view} selected={new Set()} onToggle={() => undefined} onOpen={() => undefined} onReorder={onReorder} />)
    const cells = [...document.querySelectorAll<HTMLElement>('[data-hand-card]')]
    expect(cells.map((c) => c.getAttribute('data-shape'))).toEqual([null, null, 'hex', 'hex'])
    // The first tile cannot go back past the last card.
    fireEvent.keyDown(cells[2]!, { key: 'ArrowLeft', altKey: true })
    expect(onReorder).not.toHaveBeenCalled()
    // The last tile goes one place back, to where the other tile stands in the hand's order.
    const raw = view.components.filter((c) => c.zone === 'hand:A').reverse()
    fireEvent.keyDown(cells[3]!, { key: 'ArrowLeft', altKey: true })
    expect(onReorder).toHaveBeenCalledWith(expect.objectContaining({ id: cells[3]!.getAttribute('data-hand-card') }), raw.findIndex((c) => c.id === cells[2]!.getAttribute('data-hand-card')))
  })
})

describe('the television fans a hand’s tiles as tiles (#1486)', () => {
  it('draws the backs of the cards, then the backs of the tiles in their shape', () => {
    const view = adasTable().view(null)
    render(<TableRenderer view={view} mode="tv" scale={1} />)
    const fan = document.querySelector('.byd-hand[data-zone="hand:A"] .byd-hand-fan')!
    expect([...fan.querySelectorAll('.byd-back')].map((b) => b.getAttribute('data-shape'))).toEqual([null, null, 'hex'])
  })
})

describe('a tile in front of me and on the table turns in its step (#1486)', () => {
  it('«Framför mig» offers ↺ and ↻ on a hexagon, a sixth of a turn each way', () => {
    const view = adasTable().view('A')
    const onTurn = vi.fn()
    render(<MineStrip view={view} faces={undefined} onOpen={() => undefined} onTurn={onTurn} />)
    const tile = view.components.find((c) => c.zone === 'mine:A')!
    const item = document.querySelector(`[data-mine-card="${tile.id}"]`)!.closest('.byd-mine-item') as HTMLElement
    fireEvent.click(within(item).getByRole('button', { name: /^↻ Rotera 60°/ }))
    expect(onTurn).toHaveBeenLastCalledWith([{ v: 'rotate', component: tile.id, rot: 60 }])
    fireEvent.click(within(item).getByRole('button', { name: /^↺ Rotera 60°/ }))
    expect(onTurn).toHaveBeenLastCalledWith([{ v: 'rotate', component: tile.id, rot: 300 }])
  })

  it('«Bordet» draws a tile in an area in its shape, and counts the bag in tiles', () => {
    const view = adasTable().view('A')
    render(<TableSummary view={view} activity={[]} zones="all" history={false} onRead={() => undefined} onDraw={() => undefined} />)
    const vete = view.components.find((c) => c.cardRef === 'Vete')!
    expect(document.querySelector(`[data-area-card="${vete.id}"]`)!.getAttribute('data-shape')).toBe('square')
    expect(document.querySelector('[data-zone-summary="bag"]')!.textContent).toContain('2 brickor')
    expect(screen.getByRole('button', { name: /Landskap/ })).toBeTruthy()
  })
})
