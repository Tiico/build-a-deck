import { describe, expect, it } from 'vitest'
import { MEEPLE } from '@byd/engine'
import { applyEdit, type EditIntent } from '../src/edits.js'
import { setupFromProject } from '../src/setup.js'
import { ProjectDoc, ProjectSetup } from '../src/projects.js'
import { PIECE_MM, openingSetup, type Setup } from '../src/recipe.js'
import { layMaterial, placeLine } from '../src/material.js'
import { changeOf, revertOf } from '../src/undo.js'

// Trädelarna i setupen (#1471): meeples, kuber och skivor har sina rader som tärningarna har sina
// (K28, K31). En rad säger sort, antal och var: en yta alla delar eller en yta varje plats har
// (`role`), och en punkt (`at`). En bit som läggs för en plats bär platsen som `cardRef`, för
// färgen är platsens (L11, beställarens beslut 2 i #1470).
const four = (patch: Partial<Setup>): Pick<ProjectDoc, 'rows' | 'setup'> => ({ rows: [], setup: ProjectSetup.parse({ ...openingSetup({ players: 4, counters: [] }), ...patch }) })
const piecesOf = (setup: ReturnType<typeof setupFromProject>) => setup.components.filter((c) => c.type.id.startsWith('piece.'))
const middle = (c: { x?: number | undefined; y?: number | undefined }) => ({ x: (c.x ?? NaN) + PIECE_MM.meeple / 2, y: (c.y ?? NaN) + PIECE_MM.meeple / 2 })
const tally = (setup: ReturnType<typeof setupFromProject>) =>
  piecesOf(setup).reduce<Record<string, number>>((n, d) => ({ ...n, [`${d.zone} ${d.type.id}`]: (n[`${d.zone} ${d.type.id}`] ?? 0) + 1 }), {})

describe('setupens trädelar (#1471)', () => {
  it('ger varje plats fem meeples i sin egen yta, stående och i platsens färg', () => {
    const setup = setupFromProject(four({ pieces: [{ kind: 'meeple', count: 5, role: 'mine' }] }))
    expect(tally(setup)).toEqual({ 'mine:A piece.meeple': 5, 'mine:B piece.meeple': 5, 'mine:C piece.meeple': 5, 'mine:D piece.meeple': 5 })
    for (const m of piecesOf(setup)) expect(m).toMatchObject({ type: { id: MEEPLE.id, version: MEEPLE.version }, face: 'standing', cardRef: m.zone.slice('mine:'.length) })
    // Fem bitar på ett ställe i varje yta: det som inte flyttats är en hög, som räknarnas (#1472 B).
    // Högen är bara var de ligger; motorn har fortfarande fem pjäser.
    expect(new Set(piecesOf(setup).filter((m) => m.zone === 'mine:A').map((m) => `${m.x},${m.y}`)).size).toBe(1)
  })

  it('vänder en platsytas punkt mot varje plats kant (K31)', () => {
    const laid = piecesOf(setupFromProject(four({ pieces: [{ kind: 'meeple', count: 1, role: 'mine', at: { x: 40, y: 60 } }] })))
    expect(Object.fromEntries(laid.map((m) => [m.zone, middle(m)]))).toEqual({
      'mine:A': { x: 40, y: 60 },
      'mine:B': { x: 365 - 40, y: 100 - 60 },
      'mine:C': { x: 60, y: 365 - 40 },
      'mine:D': { x: 100 - 60, y: 40 },
    })
  })

  it('lägger kuber och skivor i en delad yta, per spelare i varje plats färg', () => {
    const setup = setupFromProject(four({ pieces: [{ kind: 'cube', count: 2, zone: 'table', perSeat: true }, { kind: 'disc', count: 3, zone: 'table' }] }))
    expect(tally(setup)).toEqual({ 'table piece.cube': 8, 'table piece.disc': 3 })
    const cubes = piecesOf(setup).filter((c) => c.type.id === 'piece.cube')
    expect(cubes.map((c) => c.cardRef)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D'])
    expect(cubes.every((c) => c.face === 'front')).toBe(true)
    // Varje plats kuber är sin egen hög, och de tre färglösa skivorna en till.
    const spots = (id: string) => new Set(piecesOf(setup).filter((c) => c.type.id === id).map((c) => `${c.x},${c.y}`)).size
    expect([spots('piece.cube'), spots('piece.disc')]).toEqual([4, 1])
    // En skiva som ingen plats har fått har ingen färg.
    expect(piecesOf(setup).filter((c) => c.type.id === 'piece.disc').map((c) => c.cardRef)).toEqual(['', '', ''])
  })

  // Fliken Bords handtag (#1477) är lådan runt raden, och dess mitt är där pilarna flyttar raden ifrån.
  // En rad med två bitar låg en halv millimeter från sin punkt, så att varje pil drog den en
  // millimeter åt sidan: raden ska ligga mitt på sin punkt i hela millimeter, med vilket antal som helst.
  it('lägger en rad mitt på sin punkt, så att lådan runt den har punkten som mitt', () => {
    for (const count of [1, 2, 3, 4]) {
      const setup = four({ pieces: [{ kind: 'meeple', count, zone: 'table', at: { x: 300, y: 200 } }] }).setup
      const laid = layMaterial(setup).filter((p) => p.line.kind === 'piece')
      const left = Math.min(...laid.map((p) => p.x))
      const right = Math.max(...laid.map((p) => p.x + p.size))
      expect((left + right) / 2, `${count} bitar`).toBe(300)
    }
  })

  // «Börjar stående/liggande» i radens fält (#1477, editorvariant B i #1472): en meeple kan läggas ut
  // liggande, som bonden i Carcassonne, och bara en meeple har två sidor att börja på.
  it('lägger en meeple liggande när raden säger det, och bara en meeple kan börja liggande', () => {
    const setup = setupFromProject(four({ pieces: [{ kind: 'meeple', count: 2, role: 'mine', lying: true }] }))
    expect(piecesOf(setup).every((m) => m.face === 'lying')).toBe(true)
    const base = four({}).setup
    expect(() => ProjectSetup.parse({ ...base, pieces: [{ kind: 'cube', count: 1, zone: 'table', lying: true }] })).toThrow()
  })

  it('tar bara sorter som finns, och en rad säger antingen en yta eller en yta per plats', () => {
    const base = four({}).setup
    expect(() => ProjectSetup.parse({ ...base, pieces: [{ kind: 'pawn', count: 1, zone: 'table' }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, pieces: [{ kind: 'meeple', count: 1 }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, pieces: [{ kind: 'meeple', count: 1, zone: 'table', role: 'mine' }] })).toThrow()
    expect(() => ProjectSetup.parse({ ...base, pieces: [{ kind: 'meeple', count: 0, zone: 'table' }] })).toThrow()
  })

  it('läser ett dokument utan trädelar tillbaka orört', () => {
    const before = four({}).setup
    expect(before).not.toHaveProperty('pieces')
    expect(ProjectSetup.parse(JSON.parse(JSON.stringify(before)))).toEqual(before)
    expect(piecesOf(setupFromProject({ rows: [], setup: before }))).toEqual([])
  })

  it('drar en rad till en annan yta och läser punkten tillbaka från platsens stol', () => {
    const doc = four({ pieces: [{ kind: 'meeple', count: 1, zone: 'table' }] })
    const handle = layMaterial(doc.setup).find((p) => p.line.kind === 'piece')!
    expect(handle).toMatchObject({ line: { kind: 'piece', index: 0 }, zone: 'table' })
    const mineA = doc.setup.zones.find((z) => z.id === 'mine:A')!.geometry
    const next = placeLine(doc.setup, handle.line, { x: mineA.x + 40, y: mineA.y + 60 })
    expect(next).toEqual({ kind: 'meeple', count: 1, role: 'mine', at: { x: 40, y: 60 } })
  })
})

// Hela listan är en redigering (`setPieces`), som tärningarnas `setDice`: en ändring är en version
// och ett steg tillbaka (B4).
describe('trädelarna redigeras som en lista (#1471)', () => {
  const game = (): ProjectDoc => ({
    name: 'Meeplespel',
    template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } },
    rows: [],
    icons: {},
    setup: openingSetup({ players: 3, counters: [] }),
  })

  it('skriver listan, tar bort den när den sista biten går, och vägrar en rad dokumentet inte kan bära', () => {
    const doc = applyEdit(game(), { v: 'setPieces', pieces: [{ kind: 'meeple', count: 5, role: 'mine' }] })
    expect(doc.setup.pieces).toEqual([{ kind: 'meeple', count: 5, role: 'mine' }])
    expect(applyEdit(doc, { v: 'setPieces', pieces: [] }).setup).not.toHaveProperty('pieces')
    expect(() => applyEdit(game(), { v: 'setPieces', pieces: [{ kind: 'meeple', count: 1 }] } as EditIntent)).toThrow()
  })

  it('går att ångra', () => {
    const doc = game()
    const mine = applyEdit(doc, { v: 'setPieces', pieces: [{ kind: 'cube', count: 2, zone: 'table' }] })
    const back = revertOf(changeOf(doc, mine), mine)
    if (!back.ok || !back.edit) throw new Error('no step back')
    expect(applyEdit(mine, back.edit).setup.pieces).toBeUndefined()
  })
})
