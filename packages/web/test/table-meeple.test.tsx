// @vitest-environment jsdom
// A wooden piece on the felt (#1475, prototype #1472 felt B): what has not been moved yet is one chip
// with the figure and a count per seat, like the counters' pile, and every piece out on the felt is
// its own silhouette in its seat's colour — a meeple laid down lies on its side. It is dragged like
// anything else, never into a hand (K32), and a click asks what may be done with it instead of
// rolling it as a die's does.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CUBE, DISC, MEEPLE, TypeRegistry, initialState, project, STANDARD_TYPES, type SetupDef } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { seatColor } from '../src/table/seatColor.js'
import { feltLabels, placesFor } from '../src/table/keyboard.js'
import { translate, type Lang, type T } from '../src/i18n/index.js'
import { seatSetup } from './fixture.js'

const registry = new TypeRegistry(STANDARD_TYPES)
const ref = (def: { id: string; version: number }) => ({ id: def.id, version: def.version })
// Ada (A, red) has four meeples not yet moved, lying on one spot in front of her, and one out on the
// floor. Bo (B, blue) has one meeple laid down on the floor, a cube and a disc.
function withPieces(): SetupDef {
  const setup = seatSetup()
  for (let i = 0; i < 4; i++) setup.components.push({ type: ref(MEEPLE), cardRef: 'A', zone: 'mine:A', face: 'standing', x: 300, y: 30 })
  setup.components.push({ type: ref(MEEPLE), cardRef: 'A', zone: 'table', face: 'standing', x: 400, y: 380 })
  setup.components.push({ type: ref(MEEPLE), cardRef: 'B', zone: 'table', face: 'lying', x: 480, y: 380 })
  setup.components.push({ type: ref(CUBE), cardRef: 'B', zone: 'table', face: 'front', x: 560, y: 380 })
  setup.components.push({ type: ref(DISC), cardRef: 'B', zone: 'table', face: 'front', x: 620, y: 380 })
  return setup
}
const table = (): Snapshot => project(initialState('meeples', withPieces(), registry), registry, null)
const piecesIn = (v: Snapshot, zone: string, kind = 'piece.meeple') => v.components.filter((c) => c.zone === zone && c.type.id === kind)
const pieceOf = (id: string) => document.querySelector(`[data-piece="${id}"]`) as HTMLElement | null

describe('a wooden piece on the felt (#1475)', () => {
  it('draws each piece out on the felt as its own silhouette, in its seat’s colour', () => {
    const v = table()
    render(<TableRenderer view={v} mode="tv" scale={1} />)
    const [ada] = piecesIn(v, 'table').filter((c) => c.cardRef === 'A')
    const [bo] = piecesIn(v, 'table').filter((c) => c.cardRef === 'B')
    const cube = piecesIn(v, 'table', CUBE.id)[0]!
    const disc = piecesIn(v, 'table', DISC.id)[0]!
    expect(pieceOf(ada!.id)?.getAttribute('data-kind')).toBe('meeple')
    expect(pieceOf(ada!.id)?.querySelector('[data-figure]')?.getAttribute('fill')).toBe(seatColor(0))
    expect(pieceOf(bo!.id)?.querySelector('[data-figure]')?.getAttribute('fill')).toBe(seatColor(1))
    expect(pieceOf(cube.id)?.getAttribute('data-kind')).toBe('cube')
    expect(pieceOf(disc.id)?.getAttribute('data-kind')).toBe('disc')
    // A meeple laid down is drawn lying, and one standing is not.
    expect(pieceOf(bo!.id)?.getAttribute('data-lying')).toBe('true')
    expect(pieceOf(ada!.id)?.getAttribute('data-lying')).toBeNull()
    // Three kinds, three outlines.
    const outline = (id: string) => pieceOf(id)?.querySelector('[data-figure]')?.outerHTML.replace(/fill="[^"]*"/, '')
    expect(new Set([outline(ada!.id), outline(cube.id), outline(disc.id)]).size).toBe(3)
  })

  it('draws a seat’s pieces lying on one spot as one chip with the count, not four figures', () => {
    const v = table()
    render(<TableRenderer view={v} mode="tv" scale={1} />)
    const pile = piecesIn(v, 'mine:A')
    const chips = document.querySelectorAll('[data-piece-pile]')
    expect(chips).toHaveLength(1)
    expect(chips[0]?.querySelector('[data-piece-count]')?.textContent).toBe('4')
    expect(chips[0]?.querySelector('[data-figure]')?.getAttribute('fill')).toBe(seatColor(0))
    // Only the top of the pile is drawn: the three under it are not figures of their own.
    expect(pile.filter((c) => pieceOf(c.id) !== null)).toHaveLength(1)
  })
})

// At scale 1 in jsdom a TV client pixel is a table millimetre offset by the floor's origin.
const client = (mmX: number, mmY: number) => ({ clientX: mmX + 500, clientY: mmY + 300, pointerId: 1, isPrimary: true, button: 0 })
// Ada's meeple out on the floor lies at (400, 380) in the floor's frame, (-100, 80) on the table.
const ADA = client(-85, 95)

describe('a wooden piece under the pointer (#1475, K14, K32)', () => {
  it('let go over a hand, lands on what the hand lies over, never in the hand', () => {
    const v = table()
    const ada = piecesIn(v, 'table').find((c) => c.cardRef === 'A')!
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode="tv" scale={1} onAct={onAct} />)
    fireEvent.pointerDown(pieceOf(ada.id)!, ADA)
    // Into Ada's hand strip along the south rim.
    fireEvent.pointerMove(pieceOf(ada.id)!, client(0, 360))
    fireEvent.pointerUp(pieceOf(ada.id)!, client(0, 360))
    expect(onAct).toHaveBeenCalledTimes(1)
    const [intent] = onAct.mock.calls[0]![0] as { v: string; component: string; to: string }[]
    expect(intent).toMatchObject({ v: 'move', component: ada.id, to: 'table' })
  })

  it('a drag on a pile takes its top piece out, and leaves the pile with one fewer', () => {
    const v = table()
    const pile = piecesIn(v, 'mine:A')
    const top = pile[pile.length - 1]!
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode="tv" scale={1} onAct={onAct} />)
    // The pile's chip is drawn round the meeples' middle: (-300 + 300 + 15, 220 + 30 + 15).
    const at = client(15, 265)
    fireEvent.pointerDown(pieceOf(top.id)!, at)
    fireEvent.pointerMove(pieceOf(top.id)!, client(15, 100))
    expect(document.querySelector('[data-piece-pile] [data-piece-count]')?.textContent).toBe('3')
    fireEvent.pointerUp(pieceOf(top.id)!, client(15, 100))
    expect(onAct.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ v: 'move', component: top.id, to: 'table' })])
  })

  it('a click asks, as a card’s does, and rolls nothing: «Lägg ner» lays a meeple down', () => {
    const v = table()
    const ada = piecesIn(v, 'table').find((c) => c.cardRef === 'A')!
    const onAct = vi.fn()
    const keyboard = { labels: feltLabels(v), itemProps: () => ({ tabIndex: 0, ref: () => undefined, onKeyDown: () => undefined, onFocus: () => undefined }), onActivate: vi.fn() }
    render(<TableRenderer view={v} mode="tv" scale={1} onAct={onAct} keyboard={keyboard} />)
    fireEvent.pointerDown(pieceOf(ada.id)!, ADA)
    fireEvent.pointerUp(pieceOf(ada.id)!, ADA)
    expect(onAct).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Flytta…' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Lägg ner' }))
    expect(onAct).toHaveBeenCalledWith([{ v: 'flip', component: ada.id, face: 'lying' }])
  })

  it('a meeple lying down is stood up again; a cube is only moved', () => {
    const v = table()
    const bo = piecesIn(v, 'table').find((c) => c.cardRef === 'B')!
    const cube = piecesIn(v, 'table', CUBE.id)[0]!
    const onAct = vi.fn()
    const { unmount } = render(<TableRenderer view={v} mode="tv" scale={1} onAct={onAct} />)
    fireEvent.pointerDown(pieceOf(bo.id)!, client(-5, 95))
    fireEvent.pointerUp(pieceOf(bo.id)!, client(-5, 95))
    fireEvent.click(screen.getByRole('button', { name: 'Res upp' }))
    expect(onAct).toHaveBeenCalledWith([{ v: 'flip', component: bo.id, face: 'standing' }])
    unmount()
    render(<TableRenderer view={v} mode="tv" scale={1} onAct={onAct} />)
    fireEvent.pointerDown(pieceOf(cube.id)!, client(70, 90))
    fireEvent.pointerUp(pieceOf(cube.id)!, client(70, 90))
    expect(screen.queryByRole('button', { name: 'Lägg ner' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Res upp' })).toBeNull()
  })
})

// The room's stage holds the card the latest line was about (#1290). A piece is no card: a meeple
// moved held its seat's letter up as a blank card face the size of the column.
describe('the television after a piece is moved (#1475)', () => {
  it('holds up no card for it', () => {
    const v = table()
    const ada = piecesIn(v, 'table').find((c) => c.cardRef === 'A')!
    const moved = { schemaVersion: 1 as const, seq: 3, batch: 'b', at: '', by: 'A', intent: { v: 'move' as const, component: ada.id, to: 'table', x: 0, y: 0 } }
    render(
      <TvChrome view={v} activity={[moved]} roomCode="KX7P" title="Meeples" room>
        <div />
      </TvChrome>,
    )
    expect(document.querySelector(`[data-inspect="${ada.id}"]`)).toBeNull()
  })
})

// «Flytta till» for a piece (K16, K32): the felt's areas, the floor by its name, and no hand.
describe('where a wooden piece can be moved to with the keyboard (#1475)', () => {
  it('lists the felt’s areas and no hand', () => {
    const v = table()
    const ada = piecesIn(v, 'table').find((c) => c.cardRef === 'A')!
    const places = placesFor(v, new Set([ada.id]), ada.zone)
    expect(places.filter((p) => p.kind === 'hand')).toEqual([])
    expect(places.filter((p) => p.kind === 'area').map((p) => p.zone)).toEqual(expect.arrayContaining(['mine:A', 'mine:B']))
  })

  it('counts the cards in an area as cards, and not the pieces lying there', () => {
    const v = table()
    const ada = piecesIn(v, 'table').find((c) => c.cardRef === 'A')!
    const mine = placesFor(v, new Set([ada.id]), ada.zone).find((p) => p.zone === 'mine:A')!
    expect(mine.hint).toBe('0 kort · fri yta')
  })
})

// What a reader hears (A4): its kind, whose colour it wears, whether it lies, where it is, and that
// M moves it — never that it is a card.
describe.each<[Lang, string, string, string]>([
  ['sv', 'meeple, A:s, i Spelyta. Enter öppnar handlingar, M flyttar den.', '4 meeples, A:s, i Framför A. Enter öppnar handlingar, M flyttar den.', 'meeple, B:s, liggande, i Spelyta. Enter öppnar handlingar, M flyttar den.'],
  ['en', 'meeple, A’s, in Spelyta. Enter opens actions, M moves it.', '4 meeples, A’s, in Framför A. Enter opens actions, M moves it.', 'meeple, B’s, lying down, in Spelyta. Enter opens actions, M moves it.'],
])('what a reader is told a wooden piece is, in %s (#1475)', (lang, one, pile, lying) => {
  it('says its kind, whose it is and where, and a pile its count', () => {
    const v = table()
    const t: T = (key, params) => translate(lang, key, params)
    const labels = feltLabels(v, t)
    const ada = piecesIn(v, 'table').find((c) => c.cardRef === 'A')!
    const bo = piecesIn(v, 'table').find((c) => c.cardRef === 'B')!
    const top = piecesIn(v, 'mine:A').at(-1)!
    expect(labels.get(`piece:${ada.id}`)).toBe(one)
    expect(labels.get(`piece:${top.id}`)).toBe(pile)
    expect(labels.get(`piece:${bo.id}`)).toBe(lying)
    // One stop for the pile: the three under the top have none.
    expect(piecesIn(v, 'mine:A').filter((c) => labels.has(`piece:${c.id}`))).toHaveLength(1)
  })
})
