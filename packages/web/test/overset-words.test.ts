import { describe, expect, it } from 'vitest'
import { oversetWords } from '../src/editor/overset.js'
import { translate, type T } from '../src/i18n/index.js'

// What the mark round a text that does not fit says (#808, beställarens beslut A): the tag under
// the box in a long form and a short one, and the whole sentence the card's name carries.
const sv: T = (key, params) => translate('sv', key, params)
const en: T = (key, params) => translate('en', key, params)
const body = { field: 'Regeltext', sizePt: 6, hidden: 4, fit: 'shrink' as const }

describe('the words of a text that does not fit (#808)', () => {
  it('says how many lines are not on the card, in the tag and in the sentence', () => {
    expect(oversetWords(body, sv, 'sv')).toEqual({
      long: 'Ryms inte · 4 rader till',
      short: '+4 rader',
      sentence: '«Regeltext» ryms inte ens i 6 pt: 4 rader syns inte på kortet.',
    })
  })

  it('counts one line as one, and writes a size the way the reader writes numbers', () => {
    expect(oversetWords({ ...body, hidden: 1, sizePt: 6.5 }, sv, 'sv')).toEqual({
      long: 'Ryms inte · 1 rad till',
      short: '+1 rad',
      sentence: '«Regeltext» ryms inte ens i 6,5 pt: 1 rad syns inte på kortet.',
    })
  })

  it('does not say «even» of a text that was never allowed to shrink', () => {
    expect(oversetWords({ ...body, fit: 'fixed', sizePt: 9 }, sv, 'sv').sentence).toBe('«Regeltext» ryms inte i 9 pt: 4 rader syns inte på kortet.')
  })

  // A word too long for the box's width is cut at the side and loses no line.
  it('says only that it does not fit when no whole line is lost', () => {
    expect(oversetWords({ ...body, hidden: 0 }, sv, 'sv')).toEqual({ long: 'Ryms inte', short: 'Ryms inte', sentence: '«Regeltext» ryms inte ens i 6 pt.' })
  })

  it('is said in the reader’s language (A4)', () => {
    expect(oversetWords(body, en, 'en')).toEqual({
      long: 'Does not fit · 4 more lines',
      short: '+4 lines',
      sentence: '“Regeltext” does not fit even at 6 pt: 4 lines are not on the card.',
    })
  })
})
