import { describe, expect, it } from 'vitest'
import { BOARDS, STANDARD_TYPES, isMaterial, project, replay, type ComponentTypeDef } from '../src/index.js'
import { Harness, registry, twoSeatSetup } from './fixture.js'

// The boards (#1479, #1470): a main board in a few sizes and a player board per seat, each size a type
// of its own as the dice are (beställarens beslut 7, 2026-10-28). A board lies fixed where the setup
// put it (beslut 6): it is never moved, turned, stacked, shuffled, rolled or held.
const ref = (def: ComponentTypeDef) => ({ id: def.id, version: def.version })
const board = (id: string) => BOARDS.find((b) => b.id === id)!

// The main board first, so that everything else lies on it (#1479).
function withBoard() {
  const setup = twoSeatSetup()
  setup.components.unshift({ type: ref(board('board.square457')), cardRef: 'main', zone: 'table', face: 'front', x: 271, y: 71 })
  return setup
}
const boardId = (h: Harness) => Object.values(h.state.components).find((c) => c.type.id.startsWith('board.'))!.id

describe('the boards (#1479)', () => {
  it('are standard types: a square and a rectangular main board and a player board, in the sizes of the prototype (#1473)', () => {
    expect(BOARDS.map((b) => [b.id, b.physical.widthMm, b.physical.heightMm])).toEqual([
      ['board.square457', 457, 457],
      ['board.rect610', 610, 457],
      ['board.player', 240, 150],
    ])
    for (const b of BOARDS) expect(STANDARD_TYPES).toContain(b)
  })

  it('have one side, which is no secret, and a print profile with bleed', () => {
    for (const b of BOARDS) {
      expect(b.faces, b.id).toEqual(['front'])
      expect(b.behaviours, b.id).toMatchObject({ stackable: false, shufflable: false, flippable: false, rollable: false, counter: false })
      expect(b.print.bleedMm, b.id).toBeGreaterThan(0)
      expect(b.print.stock, b.id).toBeUndefined()
    }
  })

  it('are never held: material, as K32 reads it off the type', () => {
    for (const b of BOARDS) expect(isMaterial(b), b.id).toBe(true)
  })

  it('refuses to stack, shuffle, roll or flip a board, with the type in the reason', () => {
    const h = new Harness(1, withBoard())
    const id = boardId(h)
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    expect(h.try('A', { v: 'stack', component: id, onto: h.top('table') })).toEqual({ ok: false, reason: expect.stringContaining('board.square457') })
    expect(h.try('A', { v: 'stack', component: h.top('table'), onto: id })).toEqual({ ok: false, reason: expect.stringContaining('board.square457') })
    expect(h.try('A', { v: 'roll', component: id })).toEqual({ ok: false, reason: expect.stringContaining('board.square457') })
    expect(h.try('A', { v: 'flip', component: id, face: 'front' })).toEqual({ ok: false, reason: expect.stringContaining('board.square457') })
    expect(h.try('A', { v: 'shuffle', pile: 'table' })).toEqual({ ok: false, reason: expect.stringContaining('board.square457') })
  })

  it('refuses a board in a hand', () => {
    const h = new Harness(1, withBoard())
    expect(h.try('A', { v: 'move', component: boardId(h), to: 'hand:A' })).toEqual({ ok: false, reason: expect.stringContaining('board.square457') })
  })

  // Beslut 6: the board lies where the setup put it and cannot be moved at the table. Read off the
  // type (`movable: false`), as every other refusal in the engine is (K32).
  it('lies fixed: move and rotate are refused, and so is drawing it off the area it lies in', () => {
    const h = new Harness(1, withBoard())
    const id = boardId(h)
    expect(h.try('A', { v: 'move', component: id, to: 'table', x: 0, y: 0 })).toEqual({ ok: false, reason: 'board.square457 lies where the setup put it' })
    expect(h.try('A', { v: 'move', component: id, to: 'discard' })).toEqual({ ok: false, reason: 'board.square457 lies where the setup put it' })
    expect(h.try(null, { v: 'rotate', component: id, rot: 90 })).toEqual({ ok: false, reason: 'board.square457 lies where the setup put it' })
    expect(h.try('A', { v: 'draw', from: 'table', to: 'discard', count: 1 })).toEqual({ ok: false, reason: 'board.square457 lies where the setup put it' })
    expect(h.try('A', { v: 'deal', from: 'table', to: ['discard'], each: 1 })).toEqual({ ok: false, reason: 'board.square457 lies where the setup put it' })
    expect(h.state.components[id]).toMatchObject({ zone: 'table', x: 271, y: 71, rot: 0 })
  })

  it('leaves everything else free to move across it', () => {
    const h = new Harness(1, withBoard())
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    expect(h.try('A', { v: 'move', component: h.top('table'), to: 'table', x: 300, y: 100 }).ok).toBe(true)
  })

  it('replays a table with a board to the same table (D4)', () => {
    const h = new Harness(3, withBoard())
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 2 })
    h.do('A', { v: 'move', component: h.top('table'), to: 'table', x: 300, y: 100 })
    expect(replay(h.initial, registry, h.log)).toEqual(h.state)
  })
})

// The board's side is drawn from the document's own template for it (L91), never from a row of the
// deck, and its texture reaches every view through `project` like a card's face (E2, DRIFT §6).
describe("a board's side in the view (#1479)", () => {
  it('is the texture compiled from the board, for every seat and the table, and never a row that shares its word', () => {
    const h = new Harness(1, withBoard())
    const id = boardId(h)
    const deck = { faces: { main: { front: 'row-front', back: 'row-back' } }, titles: { main: 'Ett kort' }, texts: { main: ['Ord'] }, ownFaces: { main: { front: 'board-front' } } }
    for (const seat of ['A', 'B', null]) {
      const seen = project(h.state, registry, seat, deck).components.find((c) => c.id === id)!
      expect(seen.faces, String(seat)).toEqual({ front: 'board-front' })
      expect(seen.cardRef).toBe('main')
      expect(seen).not.toHaveProperty('title')
      expect(seen).not.toHaveProperty('text')
    }
  })

  it("gives a card no board texture when its row shares the board's word", () => {
    const setup = withBoard()
    setup.components.push({ type: setup.components[1]!.type, cardRef: 'main', zone: 'table', face: 'front' })
    const h = new Harness(1, setup)
    const card = Object.values(h.state.components).find((c) => c.cardRef === 'main' && !c.type.id.startsWith('board.'))!
    const seen = project(h.state, registry, 'A', { ownFaces: { main: { front: 'board-front' } } }).components.find((c) => c.id === card.id)!
    expect(seen).not.toHaveProperty('faces')
  })
})
