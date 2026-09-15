import { describe, expect, it } from 'vitest'
import { parseInline } from '../src/inline.js'

describe('parseInline (L2)', () => {
  it('turns bold, italic, icons and blank lines into a small tree, and nothing else', () => {
    const text = 'Gör {2}{eld} skada, sedan **dra ett kort**.\n\nKostar *hälften* om du har en {skog}.'
    expect(parseInline(text)).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Gör ' },
          { type: 'icon', name: '2' },
          { type: 'icon', name: 'eld' },
          { type: 'text', text: ' skada, sedan ' },
          { type: 'bold', children: [{ type: 'text', text: 'dra ett kort' }] },
          { type: 'text', text: '.' },
        ],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Kostar ' },
          { type: 'italic', children: [{ type: 'text', text: 'hälften' }] },
          { type: 'text', text: ' om du har en ' },
          { type: 'icon', name: 'skog' },
          { type: 'text', text: '.' },
        ],
      },
    ])
  })
})

// A symbol says what it means by its colour (E4): `{namn|roll}` names one of the game's own
// meanings, and the meaning carries the colour. The role and not the colour is written, so a
// deck repaints every card that says "fara" by changing one thing.
describe('a symbol with a role (E4)', () => {
  it('reads the role after the bar', () => {
    expect(parseInline('Skada {svard|fara} 2.')).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Skada ' },
          { type: 'icon', name: 'svard', role: 'fara' },
          { type: 'text', text: ' 2.' },
        ],
      },
    ])
  })

  it('leaves a symbol without a role exactly the symbol it was', () => {
    expect(parseInline('{svard}')).toEqual([{ type: 'paragraph', children: [{ type: 'icon', name: 'svard' }] }])
  })

  it('takes a role by the same letters a name is made of, and nothing else', () => {
    expect(parseInline('{svard|fara-2}')).toEqual([{ type: 'paragraph', children: [{ type: 'icon', name: 'svard', role: 'fara-2' }] }])
    // A bar with nothing after it, or something that cannot be a name, is not a symbol at all:
    // it stays the text it was written as rather than becoming a symbol with a strange role.
    expect(parseInline('{svard|}')).toEqual([{ type: 'paragraph', children: [{ type: 'text', text: '{svard|}' }] }])
    expect(parseInline('{svard|a b}')).toEqual([{ type: 'paragraph', children: [{ type: 'text', text: '{svard|a b}' }] }])
  })

  it('still reads a bare number as a pip rather than as a symbol', () => {
    expect(parseInline('{3}')).toEqual([{ type: 'paragraph', children: [{ type: 'icon', name: '3' }] }])
  })
})
