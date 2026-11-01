// @vitest-environment jsdom
// Brickor i handen på /online (#1538, variant A i #1474): solfjädern, kolumnen och «Visa alla»
// ritar en bricka efter korten, i sin form och i sin sanna storlek mot kortet, som telefonen gör
// (#1486); en bricka som bärs ut ur handen bärs i sin form; och panelen handen öppnar roterar den
// i formens steg, «↺ Rotera 60°».
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TILE_HEX, TILE_ROUND, TILE_SQUARE, type SetupDef } from '@byd/engine'
import type { VisibleComponentState } from '@byd/protocol'
import { TableClient } from '../src/client.js'
import { HandColumn } from '../src/online/HandColumn.js'
import { HandFan } from '../src/online/HandFan.js'
import { HandSpread } from '../src/online/HandSpread.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { liftBox } from '../src/table/lift.js'
import { admit, asTable, createSession, roomOf, seatSetup, startServer, type Running } from './fixture.js'
import { atWindow } from './felt-frame.js'

afterEach(cleanup)

const hex = { id: TILE_HEX.id, version: TILE_HEX.version }
const card = (id: string, cardRef: string, type: { id: string; version: number } = { id: 'card.standard.63x88', version: 1 }): VisibleComponentState =>
  ({ id, type, zone: 'hand:A', x: 0, y: 0, rot: 0, face: 'front', cardRef, faces: undefined }) as unknown as VisibleComponentState
// A hexagon held first, between two cards: the hand stands it after them.
const hand = [card('c1', 'Stolen Goods'), card('t1', 'Granskog', hex), card('c2', 'Duel at Dawn')]

const shapes = {
  fan: () => render(<HandFan cards={hand} onPlay={vi.fn()} onOpen={vi.fn()} />),
  column: () => render(<HandColumn cards={hand} onPlay={vi.fn()} onOpen={vi.fn()} />),
  spread: () => render(<HandSpread cards={hand} onOpen={vi.fn()} onClose={vi.fn()} />),
}
const held = () => [...document.querySelectorAll<HTMLElement>('[data-hand-card], [data-spread-card]')]
const idOf = (el: Element) => el.getAttribute('data-hand-card') ?? el.getAttribute('data-spread-card')
// 52 of a card's 63 mm across, and 60 of its 88 down: the rest stands round it.
const HEX_INSET = `${(((88 - TILE_HEX.physical.heightMm) / 2 / 88) * 100).toFixed(3)}% ${(((63 - TILE_HEX.physical.widthMm) / 2 / 63) * 100).toFixed(3)}%`

describe('the hand on /online holds its tiles after its cards, in their shape (#1538)', () => {
  for (const [shape, mount] of Object.entries(shapes)) {
    it(`draws the hexagon last, cut to its outline at its size against a card, in the ${shape}`, () => {
      mount()
      const cells = held()
      expect(cells.map(idOf)).toEqual(['c1', 'c2', 't1'])
      expect(cells.map((c) => c.getAttribute('data-shape'))).toEqual([null, null, 'hex'])
      const tile = cells[2]!
      // The frame draws nothing of a card's own: no paper, no corner, no shadow.
      expect(tile.style.background).toBe('none')
      expect(tile.style.boxShadow).toBe('none')
      const face = tile.querySelector<HTMLElement>('.byd-tile-face[data-shape="hex"]')
      expect(face?.style.inset).toBe(HEX_INSET)
      expect(face?.style.clipPath).toMatch(/^polygon/)
      expect(tile.querySelector('.byd-tile-edge[data-shape="hex"]')).not.toBeNull()
      // A card is still a card.
      expect(cells[0]!.querySelector('.byd-tile-face')).toBeNull()
      expect(cells[0]!.style.background).toBe('')
    })
  }

  it('stands a tile overlapped in the column at the top of its frame, where the strip shows', () => {
    const second = card('t2', 'Tjärn', hex)
    render(<HandColumn cards={[...hand, second]} onPlay={vi.fn()} onOpen={vi.fn()} />)
    const insetOf = (id: string) => document.querySelector<HTMLElement>(`[data-hand-card="${id}"] .byd-tile-face`)!.style.inset
    const x = (((63 - TILE_HEX.physical.widthMm) / 2 / 63) * 100).toFixed(3)
    expect(insetOf('t1')).toBe(`0 ${x}% ${(((88 - TILE_HEX.physical.heightMm) / 88) * 100).toFixed(3)}%`)
    // The last is drawn whole, in the middle of its frame as everywhere else.
    expect(insetOf('t2')).toBe(HEX_INSET)
  })

  // Lifted to be read, a tile keeps its outline's proportions and its size against a card: the
  // millimetres a card is lifted at, the hexagon's 52 × 60 of them, as the felt lifts it (#1485).
  it('lifts a tile from the column in its own proportions, at a card’s millimetres', () => {
    render(<HandColumn cards={hand} onPlay={vi.fn()} onOpen={vi.fn()} />)
    const tile = document.querySelector<HTMLElement>('[data-hand-card="t1"]')!
    tile.getBoundingClientRect = () => new DOMRect(1150, 300, 112, 156)
    act(() => void fireEvent.pointerEnter(tile, { pointerType: 'mouse' }))
    const look = document.querySelector<HTMLElement>('[data-lift]')!
    const card = liftBox({ left: 1150, right: 1262, top: 300, bottom: 456 }, { w: window.innerWidth, h: window.innerHeight })
    const box = liftBox({ left: 1150, right: 1262, top: 300, bottom: 456 }, { w: window.innerWidth, h: window.innerHeight }, undefined, { w: TILE_HEX.physical.widthMm, h: TILE_HEX.physical.heightMm })
    expect(box.w / card.w).toBeCloseTo(52 / 63, 3)
    expect({ w: look.style.width, h: look.style.height }).toEqual({ w: `${box.w}px`, h: `${box.h}px` })
  })

  it('carries a tile out of the fan in its shape', () => {
    render(<HandFan cards={hand} onPlay={vi.fn()} onOpen={vi.fn()} />)
    const tile = document.querySelector('[data-hand-card="t1"]')!
    act(() => void fireEvent.pointerDown(tile, { clientX: 200, clientY: 700, pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse' }))
    act(() => void fireEvent.pointerMove(tile, { clientX: 204, clientY: 660, pointerId: 1 }))
    act(() => void fireEvent.pointerMove(tile, { clientX: 210, clientY: 400, pointerId: 1 }))
    const ghost = document.querySelector<HTMLElement>('.byd-fan-ghost')!
    expect(ghost.getAttribute('data-shape')).toBe('hex')
    expect(ghost.style.background).toBe('none')
    expect(ghost.querySelector<HTMLElement>('.byd-tile-face[data-shape="hex"]')?.style.inset).toBe(HEX_INSET)
  })

  it('cuts a square and a round tile to their own outlines', () => {
    const square = card('t2', 'Vete', { id: TILE_SQUARE.id, version: TILE_SQUARE.version })
    const round = card('t3', 'Guld', { id: TILE_ROUND.id, version: TILE_ROUND.version })
    render(<HandFan cards={[square, round]} onPlay={vi.fn()} onOpen={vi.fn()} />)
    expect(held().map((c) => c.getAttribute('data-shape'))).toEqual(['square', 'circle'])
    expect(document.querySelector<HTMLElement>('[data-hand-card="t3"] .byd-tile-face')!.style.borderRadius).toBe('50%')
  })
})

// Ada's desk over a real wire, holding a hexagon and a square: the panel her hand opens turns each
// in its own step (K34, one verb since 2026-11-01), and the table hears `rotate`.
describe('the hand on /online turns a tile in its step (#1538)', () => {
  let run: Running
  beforeEach(async () => {
    run = await startServer()
  })
  afterEach(async () => {
    await run.stop()
  })

  function setup(): SetupDef {
    const base = seatSetup()
    return {
      ...base,
      components: [
        ...base.components,
        { type: hex, cardRef: 'Fjäll', zone: 'hand:A', face: 'front' as const },
        { type: { id: TILE_SQUARE.id, version: TILE_SQUARE.version }, cardRef: 'Vete', zone: 'hand:A', face: 'front' as const },
      ],
    }
  }

  it('offers ↺ and ↻ Rotera in the shape’s step, and sends `rotate`', async () => {
    const id = await createSession(run, 's1', undefined, setup())
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    atWindow({ w: 1280, h: 800 })
    history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${await admit(run, id, 'A', 'Ada')}&code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    render(<OnlinePage />)
    const last = async () => (await run.store.read(id)).at(-1)?.intent
    // The table sees neither tile, so each is found by the shape it is drawn in.
    const [hexagon, squared] = await waitFor(() => {
      const found = ['hex', 'square'].map((shape) => document.querySelector<HTMLElement>(`[data-hand-fan] [data-hand-card][data-shape="${shape}"]`))
      expect(found).not.toContain(null)
      return found as HTMLElement[]
    })
    const fjall = { id: hexagon!.getAttribute('data-hand-card') }
    const vete = { id: squared!.getAttribute('data-hand-card') }
    fireEvent.keyDown(hexagon!, { key: 'Enter' })
    let panel = await screen.findByRole('dialog')
    expect(within(panel).queryByRole('button', { name: /^Rotera$/ })).toBeNull()
    fireEvent.click(within(panel).getByRole('button', { name: /^↻ Rotera 60°/ }))
    await waitFor(async () => expect(await last()).toEqual({ v: 'rotate', component: fjall.id, rot: 60 }))

    fireEvent.keyDown(squared!, { key: 'Enter' })
    panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: /^↺ Rotera 90°/ }))
    await waitFor(async () => expect(await last()).toEqual({ v: 'rotate', component: vete.id, rot: 270 }))
    table.close()
  })
})
