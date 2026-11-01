import { describe, expect, it } from 'vitest'
import type { Element } from '@byd/template'
import { applyEdit, decideEdit, type EditIntent } from '../src/edits.js'
import { openingSetup } from '../src/recipe.js'
import { changeOf, revertOf } from '../src/undo.js'
import type { ProjectDoc } from '../src/projects.js'
import { boardIssues } from '../src/boards.js'

// Brädet i editorn (#1481, variant A i #1473): brädet läggs i fliken Bord som en rad i trädet, och
// dess sida ritas i fliken «Bräde» med Mall:s lager, som lådans ytor (L91). Båda är redigeringar och
// var och en ett steg tillbaka (B4, L14): `setBoards` lägger hela listan, och kortets egna verb med
// `on: 'board'` ritar en sida, som `on: 'box'` ritar lådans. Ytan heter brädets namn och sidan, `main.front`.
const square = { id: 'board.square457', version: 1 }
const player = { id: 'board.player', version: 1 }
const game = (): ProjectDoc => ({
  name: 'Hamnstaden',
  template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } },
  rows: [{ id: 'kort-1', fields: { title: 'Ek', antal: 20 } }],
  icons: {},
  setup: openingSetup({ players: 4, counters: [{ name: 'Liv', start: 20 }] }),
})
const title: Element = { kind: 'text', id: 'titel', x: 20, y: 200, w: 400, h: 60, bind: { literal: 'Hamnstaden' }, font: { family: 'Georgia', sizePt: 72 }, color: '#5a3a1a' }
const after = (doc: ProjectDoc, ...edits: EditIntent[]) => edits.reduce((d, e) => applyEdit(d, decideEdit(d, e)), doc)
const zone = (doc: ProjectDoc, id: string) => doc.setup.zones.find((z) => z.id === id)!.geometry

describe('brädet läggs i fliken Bord (#1481)', () => {
  it('lägger huvudbrädet och spelarbräden, och filten växer för dem', () => {
    const doc = after(game(), { v: 'setBoards', boards: [{ id: 'main', type: square, zone: 'table' }, { id: 'spelare', type: player, role: 'mine' }] })
    expect(doc.setup.boards?.map((b) => b.id)).toEqual(['main', 'spelare'])
    expect(zone(doc, 'table')).toMatchObject({ w: 1200, h: 937 })
    expect(zone(doc, 'mine:A')).toMatchObject({ w: 240, h: 150 })
    expect(zone(doc, 'draw').x).toBeLessThan(-228)
  })

  it('skriver var redigeringen lade zonerna i raden, så att en senare regel aldrig flyttar dem (#895)', () => {
    const decided = decideEdit(game(), { v: 'setBoards', boards: [{ id: 'main', type: square, zone: 'table' }] })
    expect(decided).toMatchObject({ v: 'setBoards', places: { table: { w: 1200, h: 837 }, draw: { x: -280 } } })
  })

  it('tar bort alla bräden med en tom lista, och dokumentet bär ingen post', () => {
    const doc = after(game(), { v: 'setBoards', boards: [{ id: 'main', type: square, zone: 'table' }] }, { v: 'setBoards', boards: [] })
    expect(doc.setup).not.toHaveProperty('boards')
  })

  it('vägrar en typ som inte är ett bräde och två bräden med samma namn', () => {
    expect(() => applyEdit(game(), { v: 'setBoards', boards: [{ id: 'main', type: { id: 'die.d6', version: 1 }, zone: 'table' }] })).toThrow()
    expect(() => applyEdit(game(), { v: 'setBoards', boards: [{ id: 'main', type: square, zone: 'table' }, { id: 'main', type: player, role: 'mine' }] })).toThrow()
  })

  it('är ett steg tillbaka', () => {
    const before = game()
    const doc = after(before, { v: 'setBoards', boards: [{ id: 'main', type: square, zone: 'table' }] })
    const back = revertOf(changeOf(before, doc), doc)
    expect(back.ok).toBe(true)
    if (back.ok && back.edit) expect(applyEdit(doc, back.edit).setup.boards).toBeUndefined()
  })
})

describe('brädets sida ritas med kortets verb (#1481, L91)', () => {
  const laid = () => after(game(), { v: 'setBoards', boards: [{ id: 'main', type: square, zone: 'table' }] })

  it('får ett lager i brädets egen mall, och bara brädets sida ändras', () => {
    const doc = applyEdit(laid(), { v: 'addElement', on: 'board', face: 'main.front', element: title })
    expect(doc.setup.boards?.[0]?.faces).toEqual({ front: { base: [title], variants: {} } })
    expect(doc.template).toEqual(game().template)
  })

  it('ändrar, flyttar och tar bort lager, och lägger en hel sida', () => {
    const square2: Element = { kind: 'shape', id: 'grund', x: -3, y: -3, w: 463, h: 463, shape: 'rect', fill: '#d8c49c' }
    const doc = after(
      laid(),
      { v: 'addElement', on: 'board', face: 'main.front', element: title },
      { v: 'addElement', on: 'board', face: 'main.front', element: square2 },
      { v: 'moveElement', on: 'board', face: 'main.front', id: 'grund', to: 0 },
      { v: 'patchElement', on: 'board', face: 'main.front', id: 'titel', patch: { x: 30 } },
    )
    expect(doc.setup.boards?.[0]?.faces?.front?.base.map((e) => e.id)).toEqual(['grund', 'titel'])
    expect(applyEdit(doc, { v: 'removeElement', on: 'board', face: 'main.front', id: 'grund' }).setup.boards?.[0]?.faces?.front?.base.map((e) => e.id)).toEqual(['titel'])
    expect(applyEdit(doc, { v: 'replaceFace', on: 'board', face: 'main.front', base: [square2] }).setup.boards?.[0]?.faces?.front?.base).toEqual([square2])
  })

  it('vägrar ett bräde som inte finns, en sida brädet inte har, och en grupp', () => {
    expect(() => applyEdit(laid(), { v: 'addElement', on: 'board', face: 'annat.front', element: title })).toThrow(/annat/)
    expect(() => applyEdit(laid(), { v: 'addElement', on: 'board', face: 'main.back', element: title })).toThrow(/back/)
    expect(() => applyEdit(laid(), { v: 'addElement', on: 'board', face: 'main.front', element: title, group: 'Djur' })).toThrow(/group/)
  })

  it('är ett steg tillbaka', () => {
    const before = laid()
    const doc = applyEdit(before, { v: 'addElement', on: 'board', face: 'main.front', element: title })
    const back = revertOf(changeOf(before, doc), doc)
    expect(back.ok).toBe(true)
    if (back.ok && back.edit) expect(applyEdit(doc, back.edit).setup.boards?.[0]?.faces?.front?.base ?? []).toEqual([])
  })
})

// Fysisk kontroll (E5) mäter brädets sida som ett kort, med brädtypens egen `print`: utfall,
// skyddsmarginal och textgolv per skrift, i brädets eget mått.
describe('Fysisk kontroll på brädet (#1481, E5)', () => {
  it('anmärker text under brädtypens minsta storlek, och ingenting på ett bräde utan sida', () => {
    const tiny: Element = { ...title, id: 'liten', font: { family: 'Georgia', sizePt: 4 } } as Element
    const doc = after(game(), { v: 'setBoards', boards: [{ id: 'main', type: square, zone: 'table' }] })
    expect(boardIssues(doc)).toEqual([])
    const drawn = applyEdit(doc, { v: 'addElement', on: 'board', face: 'main.front', element: tiny })
    expect(boardIssues(drawn)).toEqual(expect.arrayContaining([expect.objectContaining({ board: 'main', face: 'front', element: 'liten' })]))
  })
})
