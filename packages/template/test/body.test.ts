import { describe, expect, it } from 'vitest'
import { parseBody, parseInline } from '../src/inline.js'
import { estimateHeight, measurableText } from '../src/fit.js'

// The card body's own subset of Markdown (L2, #308). Bold, italic, symbols and blank lines are
// what L2 already had; a line opening with `- ` is the fifth construction and the only one this
// parser adds. Everything else is text, and nothing here can produce markup.
describe('parseBody — a bullet list (L2, #308)', () => {
  it('reads a run of lines opening with "- " as one list, each line an item', () => {
    expect(parseBody('- dra ett kort\n- kasta ett kort')).toEqual([
      {
        type: 'list',
        items: [[{ type: 'text', text: 'dra ett kort' }], [{ type: 'text', text: 'kasta ett kort' }]],
      },
    ])
  })

  // E4's symbol is written inside the emphasis, not beside it: the span reader recurses, so a
  // symbol stands wherever text stands — in bold, in italic and in a bullet.
  it('reads a symbol inside bold, inside italic and inside a bullet', () => {
    expect(parseBody('**Gör {eld} skada** och *ta {2}*.\n- *dra* ett {kort}')).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'bold', children: [{ type: 'text', text: 'Gör ' }, { type: 'icon', name: 'eld' }, { type: 'text', text: ' skada' }] },
          { type: 'text', text: ' och ' },
          { type: 'italic', children: [{ type: 'text', text: 'ta ' }, { type: 'icon', name: '2' }] },
          { type: 'text', text: '.' },
        ],
      },
      {
        type: 'list',
        items: [[{ type: 'italic', children: [{ type: 'text', text: 'dra' }] }, { type: 'text', text: ' ett ' }, { type: 'icon', name: 'kort' }]],
      },
    ])
  })

  it('lets a bullet end the paragraph above it, and a blank line end the list', () => {
    expect(parseBody('Gör så här:\n- ett\n\nSedan.')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'Gör så här:' }] },
      { type: 'list', items: [[{ type: 'text', text: 'ett' }]] },
      { type: 'paragraph', children: [{ type: 'text', text: 'Sedan.' }] },
    ])
  })
})

// What the fitting has to see (E6). A list is not one long line: each item takes a line of its
// own, and the indent takes width away from all of them. Measured as one paragraph the body
// would be thought shorter than it is and never shrink, which is the failure E6 exists to stop.
describe('measuring a formatted body (E6, #308)', () => {
  it('gives each list item a line of its own', () => {
    expect(measurableText('Välj en:\n- dra ett kort\n- gör {eld} skada')).toEqual(['Välj en:', 'dra ett kort', 'gör M skada'])
  })

  it('makes a body taller for every item it gains', () => {
    const font = { family: 'Inter', sizePt: 9, weight: 400, lineHeight: 1.25 }
    const one = estimateHeight('- ett', font, 50)
    const two = estimateHeight('- ett\n- två', font, 50)
    expect(two).toBeGreaterThan(one)
  })
})

// The promise made to every deck that already exists (#308): a cell that writes no list reads
// exactly as it did before, because it goes through the same span parser and comes out as the
// same paragraphs. Said as an equality against the reader the cards were drawn with until now,
// rather than as a fixture somebody would have to keep in step.
describe('a cell without a list (#308)', () => {
  const unmarked = [
    'Dra ett kort.',
    'Gör {2}{eld} skada, sedan **dra ett kort**.\n\nKostar *hälften* om du har en {skog}.',
    'En mening som\nfortsätter på nästa rad.',
    'Kostnad 3 - betala när du spelar kortet.',
    'Minus-3 till anfall—inte minus 4.',
    '',
    '   ',
  ]

  it('reads exactly as the paragraph reader the deck was drawn with', () => {
    for (const text of unmarked) expect({ text, blocks: parseBody(text) }).toEqual({ text, blocks: parseInline(text) })
  })
})

// L2's own rule: the parser can never produce markup. A tag a designer typed is a tag she typed,
// and the card says so — it is a security boundary and not a nicety, because the cell is her data
// and it goes into a Chromium that renders the print file.
describe('markup a designer typed (L2, #308)', () => {
  it('keeps it as text, wherever in the body it stands', () => {
    expect(parseBody('<b>fet</b> & <script>x</script>')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: '<b>fet</b> & <script>x</script>' }] },
    ])
    expect(parseBody('- **verkligt fet** <i>inte kursiv</i>')).toEqual([
      {
        type: 'list',
        items: [[{ type: 'bold', children: [{ type: 'text', text: 'verkligt fet' }] }, { type: 'text', text: ' <i>inte kursiv</i>' }]],
      },
    ])
  })
})
