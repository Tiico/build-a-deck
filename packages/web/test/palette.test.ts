import { describe, expect, it } from 'vitest'
import { paletteIssues, rolesUsed, ROLE_MIN_CONTRAST } from '../src/editor/palette.js'

// The palette is where a deck's colours can be judged all at once (E4, E5). A colour per use is
// forty chances to write an unreadable card and forty chances to say the same thing twice; a
// meaning is one place to catch both, and this is that place.
describe('what a palette can be wrong about', () => {
  const ground = '#f4ead8'

  it('says nothing about a palette that is fine', () => {
    expect(paletteIssues({ fara: '#8f2d20', kostnad: '#7a5c00', vinst: '#2f6136' }, ground)).toEqual([])
  })

  it('catches a meaning too faint to read on the card it will sit on', () => {
    // A symbol is a graphic and wants 3:1 against its ground, which pale gold on cream is not.
    const issues = paletteIssues({ fara: '#8f2d20', ljus: '#e8d9a0' }, ground)

    expect(issues).toEqual([{ role: 'ljus', code: 'too-faint', against: ground }])
    expect(ROLE_MIN_CONTRAST).toBe(3)
  })

  it('catches two meanings that become one colour for a colour-blind reader', () => {
    // Deep blue and forest green stand 80 Lab apart for most readers and eleven apart for one
    // who cannot see blue — which is the whole argument for naming meanings rather than colours.
    const issues = paletteIssues({ kostnad: '#3b3a86', vinst: '#2f6136' }, ground)

    expect(issues).toEqual([{ role: 'vinst', code: 'colour-only', with: 'kostnad', blindness: 'tritanopia' }])
  })

  it('says nothing of two meanings that already look alike to everyone', () => {
    // Two near-identical colours are one colour for every reader, which is the deck's own choice
    // and not a finding: the check is about colours that part company only for some readers.
    expect(paletteIssues({ fara: '#8f2d20', hot: '#8f2d22' }, ground)).toEqual([])
  })
})

// Which meanings the cards actually say, so a palette can show what is in use and what is not.
describe('the meanings the deck writes', () => {
  const rows = [
    { fields: { body: 'Skada {svard|fara} 2, dra {droppe|vinst} 1.', marks: 'skold|fara' } },
    { fields: { body: 'Betala {mynt|kostnad}.', marks: '' } },
  ]

  it('counts a meaning wherever it is written, in card text and in an icon row', () => {
    expect(rolesUsed(rows)).toEqual({ fara: 2, vinst: 1, kostnad: 1 })
  })

  it('counts nothing for a deck that names no meanings', () => {
    expect(rolesUsed([{ fields: { body: 'Skada {svard} 2.' } }])).toEqual({})
  })
})
