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
