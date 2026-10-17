import { describe, expect, it } from 'vitest'
import { itemsOfLines, runsOf } from '../src/rules.js'

// What a paragraph of the rulebook becomes when its block is closed (#707, beslut 2026-10-06: C
// med A:s genväg). A line that opens with «- » or «1. » is a point of a list, as in the import.
describe('the lines of a written paragraph, read as the runs they become', () => {
  it('reads lines that open with «- » as a bulleted list, without their marks', () => {
    expect(runsOf('- Dra ett kort.\n- Spela ett kort.\n- Kasta ned till sju.')).toEqual([
      { kind: 'list', ordered: false, items: ['Dra ett kort.', 'Spela ett kort.', 'Kasta ned till sju.'] },
    ])
  })

  it('reads lines that open with a number and a full stop as a numbered list', () => {
    expect(runsOf('1. Dra.\n2. Spela.\n10) Kasta.')).toEqual([{ kind: 'list', ordered: true, items: ['Dra.', 'Spela.', 'Kasta.'] }])
  })

  it('keeps the sentences around a list as paragraphs of their own, in the order they were written', () => {
    expect(runsOf('Varje tur har tre steg.\n- Dra.\n- Spela.\nSedan går turen vidare.\n\nNästa stycke.')).toEqual([
      { kind: 'text', text: 'Varje tur har tre steg.' },
      { kind: 'list', ordered: false, items: ['Dra.', 'Spela.'] },
      { kind: 'text', text: 'Sedan går turen vidare.\n\nNästa stycke.' },
    ])
  })

  it('makes two lists of a bulleted run beside a numbered one, and of two runs a blank line parts', () => {
    expect(runsOf('- a\n1. b\n\n1. c')).toEqual([
      { kind: 'list', ordered: false, items: ['a'] },
      { kind: 'list', ordered: true, items: ['b'] },
      { kind: 'list', ordered: true, items: ['c'] },
    ])
  })

  it('leaves a paragraph without a marked line exactly as it was written', () => {
    expect(runsOf('Dra ett kort.\nSpela ett kort.')).toEqual([{ kind: 'text', text: 'Dra ett kort.\nSpela ett kort.' }])
    expect(runsOf('')).toEqual([{ kind: 'text', text: '' }])
    // Emphasis that opens a line is not a mark, and neither is a hyphen with no space after it.
    expect(runsOf('*Obs:* dra.\n-1 poäng.')).toEqual([{ kind: 'text', text: '*Obs:* dra.\n-1 poäng.' }])
    // A number on a line of its own is the designer's number and not an empty point to leave out.
    expect(runsOf('Spelet kom ut\n1999. \n-')).toEqual([{ kind: 'text', text: 'Spelet kom ut\n1999. \n-' }])
  })

  it('leaves out a point with nothing written on it, as a list closed in the editor does (#481)', () => {
    expect(runsOf('- Dra.\n- \n- Spela.')).toEqual([{ kind: 'list', ordered: false, items: ['Dra.', 'Spela.'] }])
  })
})

// A paragraph made a list with the chooser (#707): every line a point, whatever mark it carried.
describe('the lines of a paragraph, as the points of a list', () => {
  it('makes each written line a point and leaves the marks and the empty lines out', () => {
    expect(itemsOfLines('Dra ett kort.\n- Spela ett kort.\n\n2. Kasta.')).toEqual(['Dra ett kort.', 'Spela ett kort.', 'Kasta.'])
    expect(itemsOfLines('')).toEqual([])
  })
})

