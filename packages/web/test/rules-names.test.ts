// What a block of the rulebook is called to someone who cannot see where it stands (#558 F-9). The
// controls were named by the block's internal id — «Lägg till efter b2», «Text b12» — which says
// nothing about which text is meant. A block is named by the section it stands in, and a second
// block of the same kind in one section by its number.
import { describe, expect, it } from 'vitest'
import type { RuleBlock } from '@byd/template'
import { translate, type T } from '../src/i18n/index.js'
import { blockNames } from '../src/editor/rulesNames.js'

const t: T = (key, params) => translate('sv', key, params)

const book: RuleBlock[] = [
  { kind: 'text', id: 'b0', text: 'Ett spel för två.' },
  { kind: 'heading', id: 'h1', level: 1, text: 'Översikt' },
  { kind: 'text', id: 'b1', text: 'Först…' },
  { kind: 'text', id: 'b2', text: 'Sedan…' },
  { kind: 'list', id: 'l1', items: ['a', 'b'] },
  { kind: 'heading', id: 'h2', level: 2, text: '' },
  { kind: 'setup', id: 's1' },
]

describe('the names of the blocks in a rulebook (#558)', () => {
  const names = blockNames(book, t)

  it('names a heading by its own words, and one without words as such', () => {
    expect(names.get('h1')).toEqual({ where: 'under Översikt', self: 'Översikt', nth: '', heading: 1 })
    expect(names.get('h2')?.self).toBe('rubriken utan text')
    // Its own field is called by its place, which does not change while it is typed into.
    expect(names.get('h2')?.heading).toBe(2)
  })

  it('names every other block by the section it stands in', () => {
    expect(names.get('b0')).toEqual({ where: 'i början av boken', self: 'texten i början av boken', nth: '' })
    expect(names.get('l1')?.self).toBe('listan under Översikt')
    expect(names.get('s1')?.self).toBe('uppställningen under rubriken utan text')
  })

  it('numbers a second block of the same kind in the same section, and only then', () => {
    expect(names.get('b1')).toEqual({ where: 'under Översikt', self: 'texten 1 under Översikt', nth: '1 ' })
    expect(names.get('b2')).toEqual({ where: 'under Översikt', self: 'texten 2 under Översikt', nth: '2 ' })
  })

  it('never names a block by its id', () => {
    for (const [id, name] of names) expect(`${name.self} ${name.where}`).not.toContain(id)
  })
})
