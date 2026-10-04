import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { lastMoveWords } from '../src/editor/when.js'
import { translate, type Lang, type T } from '../src/i18n/index.js'

// When a table last moved, as the words the Bord tab says (#228).
//
// The list used to say a bare clock, and always a Swedish one: a table played at 00:10 last night
// looked exactly like one played at 00:10 this morning, and an English reader was told the time in
// `sv-SE`. The day belongs beside the clock, and both belong to the reader.

// The zone this file is read in, fixed — for the reason `history-rows.test.ts` gives at length: a
// day and a clock are drawn in the machine's own zone, so `00:10` on a Mac in Stockholm is `22:10`
// the day before on a runner in UTC. The literals below are what a designer actually sees, so it
// is the zone that is pinned rather than the words that are loosened.
const ZONE = 'Europe/Stockholm'
let zoneWas: string | undefined
beforeAll(() => {
  zoneWas = process.env['TZ']
  process.env['TZ'] = ZONE
  const took = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (took !== ZONE) throw new Error(`the zone did not take: asked for ${ZONE}, reading in ${took}`)
})
afterAll(() => {
  if (zoneWas === undefined) delete process.env['TZ']
  else process.env['TZ'] = zoneWas
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const t = (lang: Lang): T => (key, params) => translate(lang, key, params)
const sv = t('sv')
const en = t('en')

const NOW = Date.parse('2026-09-17T12:00:00+02:00')
const at = (when: string): string => new Date(`${when}+02:00`).toISOString()

describe('when a table last moved (#228)', () => {
  it('says the day beside the clock', () => {
    expect(lastMoveWords(at('2026-09-17T09:41:00'), NOW, 'sv', sv)).toBe('senaste drag I dag 09:41')
  })

  it('says yesterday for last night, whatever o’clock it is now', () => {
    // The whole point of the reading: ten past midnight yesterday is yesterday, and five minutes
    // either side of a midnight must not be told apart by hours-ago arithmetic.
    expect(lastMoveWords(at('2026-09-16T00:10:00'), NOW, 'sv', sv)).toBe('senaste drag I går 00:10')
    const justAfterMidnight = Date.parse('2026-09-17T00:05:00+02:00')
    expect(lastMoveWords(at('2026-09-16T23:55:00'), justAfterMidnight, 'sv', sv)).toBe('senaste drag I går 23:55')
  })

  it('names the date once the day has no word of its own', () => {
    expect(lastMoveWords(at('2026-09-04T14:02:00'), NOW, 'sv', sv)).toBe('senaste drag 4 september 14:02')
  })

  it('speaks the reader’s language and not sv-SE', () => {
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] })
    // Which is more than a translated word: the English reader gets the English order of a date
    // and the twelve-hour clock she reads by, from the same instant the Swedish reading above
    // calls `4 september 14:02`.
    expect(lastMoveWords(at('2026-09-04T14:02:00'), NOW, 'en', en)).toBe('last move September 4 02:02 PM')
    expect(lastMoveWords(at('2026-09-16T00:10:00'), NOW, 'en', en)).toBe('last move Yesterday 12:10 AM')
  })

  // English is one catalogue and many clocks (#755). `en` on its own is the American reading, so
  // every English reader was told the twelve-hour clock; the browser says which English it is.
  it('reads the clock and the date the way the reader’s own English does', () => {
    vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB', 'en'] })
    expect(lastMoveWords(at('2026-09-17T10:53:00'), NOW, 'en', en)).toBe('last move Today 10:53')
    expect(lastMoveWords(at('2026-09-04T14:02:00'), NOW, 'en', en)).toBe('last move 4 September 14:02')
  })

  it('keeps to the catalogue’s language when the browser speaks another', () => {
    vi.stubGlobal('navigator', { language: 'sv-SE', languages: ['sv-SE'] })
    expect(lastMoveWords(at('2026-09-04T14:02:00'), NOW, 'en', en)).toBe('last move September 4 02:02 PM')
    vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] })
    expect(lastMoveWords(at('2026-09-04T14:02:00'), NOW, 'sv', sv)).toBe('senaste drag 4 september 14:02')
  })

  it('says a table has not moved at all rather than inventing a moment', () => {
    expect(lastMoveWords(null, NOW, 'sv', sv)).toBe('inga drag än')
  })
})
