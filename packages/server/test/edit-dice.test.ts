import { describe, expect, it } from 'vitest'
import { applyEdit, type EditIntent } from '../src/edits.js'
import { openingSetup } from '../src/recipe.js'
import { setupFromProject } from '../src/setup.js'
import { changeOf, revertOf } from '../src/undo.js'
import type { ProjectDoc } from '../src/projects.js'

// Tärningarna redigeras i fliken Bord (#1139): hela listan skrivs av en redigering, som räknarna
// skrivs av receptet, så att en ändring är en version och ett steg tillbaka (B4, L14).
const game = (): ProjectDoc => ({
  name: 'Tärningsspel',
  template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } },
  rows: [],
  icons: {},
  setup: openingSetup({ players: 3, counters: [] }),
})
const tally = (doc: ProjectDoc) =>
  setupFromProject(doc)
    .components.filter((c) => c.type.id.startsWith('die.'))
    .reduce<Record<string, number>>((n, d) => ({ ...n, [`${d.zone} ${d.type.id}`]: (n[`${d.zone} ${d.type.id}`] ?? 0) + 1 }), {})

describe('tärningarna i setupen redigeras som en lista (#1139)', () => {
  it('lägger «2 d6 per spelare i Framför» och «1 d20 totalt i Spelyta» på bordet', () => {
    const doc = applyEdit(game(), {
      v: 'setDice',
      dice: [
        { faces: 6, count: 2, role: 'mine' },
        { faces: 20, count: 1, zone: 'table' },
      ],
    })
    expect(doc.setup.dice).toEqual([
      { faces: 6, count: 2, role: 'mine' },
      { faces: 20, count: 1, zone: 'table' },
    ])
    expect(tally(doc)).toEqual({ 'mine:A die.d6': 2, 'mine:B die.d6': 2, 'mine:C die.d6': 2, 'table die.d20': 1 })
  })

  it('tar bort listan helt när den sista tärningen går', () => {
    const one = applyEdit(game(), { v: 'setDice', dice: [{ faces: 6, count: 1, zone: 'table' }] })
    const none = applyEdit(one, { v: 'setDice', dice: [] })
    expect(none.setup).not.toHaveProperty('dice')
  })

  it('vägrar en tärning som dokumentet inte kan bära', () => {
    const bad = (die: unknown) => () => applyEdit(game(), { v: 'setDice', dice: [die] } as EditIntent)
    expect(bad({ faces: 7, count: 1, zone: 'table' })).toThrow()
    expect(bad({ faces: 6, count: 0, zone: 'table' })).toThrow()
    expect(bad({ faces: 6, count: 21, zone: 'table' })).toThrow()
    expect(bad({ faces: 6, count: 1, zone: 'table', role: 'mine' })).toThrow()
    expect(bad({ faces: 6, count: 1 })).toThrow()
  })

  it('går att ångra, också när någon annan har ändrat bordet sedan dess', () => {
    const doc = game()
    const mine = applyEdit(doc, { v: 'setDice', dice: [{ faces: 6, count: 2, zone: 'table', perSeat: true }] })
    const theirs = applyEdit(mine, { v: 'patchZone', id: 'discard', patch: { name: 'Slänghög' } })
    const back = revertOf(changeOf(doc, mine), theirs)
    if (!back.ok || !back.edit) throw new Error('no step back')
    const undone = applyEdit(theirs, back.edit)
    expect(undone.setup.dice).toBeUndefined()
    expect(undone.setup.zones.find((z) => z.id === 'discard')?.name).toBe('Slänghög')
  })
})
