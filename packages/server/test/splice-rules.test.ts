import { describe, expect, it } from 'vitest'
import { applyEdit, type EditIntent } from '../src/edits.js'
import type { ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// Rule text placed where it stands (#1006): blocks in place of the blocks a proposal names, or after
// the block it names — by id and never by position, so a block a co-editor adds above lands nothing
// somewhere else, and a block that is gone makes the edit refused rather than misplaced.
const game = () => {
  const { zones, seats, floor } = twoSeatSetup()
  return { setup: { zones, seats, floor, deckZone: 'draw' } }
}
const doc = (): ProjectDoc => ({
  ...game(),
  name: 'Skogens herrar',
  template: { faces: {} },
  rows: [],
  icons: {},
  rules: {
    title: 'Skogens herrar',
    blocks: [
      { kind: 'heading', id: 'b1', level: 1, text: 'Översikt' },
      { kind: 'text', id: 'b2', text: 'Ett spel om skogen.' },
      { kind: 'heading', id: 'b3', level: 1, text: 'En tur' },
      { kind: 'text', id: 'b4', text: 'Dra ett kort.' },
    ],
  },
})
const ids = (d: ProjectDoc) => d.rules!.blocks.map((b) => b.id)
const splice = (replace: string[], after: string | null, blocks: { id: string; text: string }[]): EditIntent => ({ v: 'spliceRules', replace, after, blocks: blocks.map(({ id, text }) => ({ kind: 'text', id, text })) })

describe('rule blocks placed by the ids they stand at (#1006)', () => {
  it('lays new blocks after the block named, or first in the book', () => {
    expect(ids(applyEdit(doc(), splice([], 'b2', [{ id: 'b5', text: 'Nytt.' }])))).toEqual(['b1', 'b2', 'b5', 'b3', 'b4'])
    expect(ids(applyEdit(doc(), splice([], null, [{ id: 'b5', text: 'Först.' }])))).toEqual(['b5', 'b1', 'b2', 'b3', 'b4'])
    expect(ids(applyEdit(doc(), splice([], 'b4', [{ id: 'b5', text: 'Sist.' }])))).toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
  })

  it('puts new blocks where the first of the replaced stood, and takes the replaced out', () => {
    const next = applyEdit(doc(), splice(['b4', 'b2'], null, [{ id: 'b5', text: 'Omskrivet.' }]))
    expect(ids(next)).toEqual(['b1', 'b5', 'b3'])
    // Replacing with nothing takes blocks out of the book.
    expect(ids(applyEdit(doc(), splice(['b3', 'b4'], null, [])))).toEqual(['b1', 'b2'])
  })

  it('lands where it was meant on a book a co-editor has added to since', () => {
    const changed = applyEdit(doc(), splice([], 'b1', [{ id: 'b9', text: 'Medredigerarens.' }]))
    expect(ids(applyEdit(changed, splice(['b4'], null, [{ id: 'b5', text: 'Omskrivet.' }])))).toEqual(['b1', 'b9', 'b2', 'b3', 'b5'])
  })

  it('is refused when a block it names is gone, or a new block takes an id the book has', () => {
    expect(() => applyEdit(doc(), splice(['b7'], null, [{ id: 'b5', text: 'x' }]))).toThrow(/b7/)
    expect(() => applyEdit(doc(), splice([], 'b7', [{ id: 'b5', text: 'x' }]))).toThrow(/b7/)
    expect(() => applyEdit(doc(), splice([], 'b4', [{ id: 'b2', text: 'x' }]))).toThrow(/b2/)
    expect(() => applyEdit(doc(), splice([], 'b4', [{ id: 'b5', text: 'x' }, { id: 'b5', text: 'y' }]))).toThrow(/b5/)
    // A block that is no rule block at all.
    expect(() => applyEdit(doc(), { v: 'spliceRules', replace: [], after: null, blocks: [{ kind: 'table', id: 'b5' }] } as unknown as EditIntent)).toThrow()
  })

  it('starts a book for a game that has none, under the title it is given', () => {
    const none = { ...doc(), rules: undefined }
    const next = applyEdit(none, { ...splice([], null, [{ id: 'b1', text: 'Början.' }]), title: 'Skogens herrar' } as EditIntent)
    expect(next.rules).toEqual({ title: 'Skogens herrar', blocks: [{ kind: 'text', id: 'b1', text: 'Början.' }] })
  })
})
