// Where a click in a rendered paragraph puts the caret in the field it opens (#972). The paragraph
// on the page is its source with the markup taken out — a reference's brackets, a bold's stars —
// so a place in what was read is found in what is written by walking the two side by side.
import { describe, expect, it } from 'vitest'
import { caretInSource } from '../src/editor/caret.js'

describe('the caret goes where the click landed (#972)', () => {
  it('is the same place when the paragraph has no markup', () => {
    const text = 'Den som senast var på en saloon börjar.'
    expect(caretInSource(text, text.indexOf('saloon'), text)).toBe(text.indexOf('saloon'))
  })

  it('steps over the markup the page does not show', () => {
    const source = 'Lägg kortet i [[Kasthög]] och **dra** ett nytt.'
    const read = 'Lägg kortet i Kasthög och dra ett nytt.'
    expect(caretInSource(read, read.indexOf('dra'), source)).toBe(source.indexOf('dra'))
    expect(caretInSource(read, read.indexOf('nytt'), source)).toBe(source.indexOf('nytt'))
  })

  it('goes to the end when the place cannot be found in what is written', () => {
    expect(caretInSource('Något helt annat', 5, 'Kort text')).toBe('Kort text'.length)
  })
})
