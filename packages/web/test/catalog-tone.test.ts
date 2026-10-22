import { describe, expect, it } from 'vitest'
import { svStatus } from '../src/i18n/sv.status.js'
import { svPlay } from '../src/i18n/sv.play.js'
import { enStatus } from '../src/i18n/en.status.js'
import { enPlay } from '../src/i18n/en.play.js'

// The tool speaks plain Swedish (L73, #1101, beställarens beslut 2026-10-22).
//
// The catalogue had a voice of its own: the table *set itself*, the phone *fetched a hand*, a seat
// was *no longer yours*, and a state took two or three sentences and a dash to say. The owner read
// it as overdone and at times hard to follow, and chose the ordinary register other tools use:
// a state is said as other tools say it, in one sentence or two, without the tool calling itself
// «vi» and without a picture standing in for the word. This holds the catalogue to that, part by
// part as each part is rewritten; the parts not listed here are still the old voice and join
// as they are rewritten (#1101).
//
// What is read is the message as the catalogue writes it, placeholders included. The English is
// held to the same shape, because it was written against the Swedish key by key (A4) and carried
// the same pictures.
const PARTS: Record<string, [Record<string, string>, Record<string, string>]> = {
  status: [svStatus, enStatus],
  play: [svPlay, enPlay],
}

// A sentence ends in a full stop, an exclamation mark or a question mark, followed by a space or
// the end. An ellipsis is not a sentence, and a number with a unit (`{n} s`) has no stop.
const sentences = (text: string) => (text.match(/[.!?](?=\s|$)/g) ?? []).length

// The pictures that went out with the voices (A4, revised): a table that sets itself or takes its
// time, a moment, a service that looks something up, a line that is «up», cards that stand still,
// and a tool that stops «on its own».
const RETIRED_SV = ['dukar', 'dukas', 'dröjer', 'ögonblick', 'letar upp', 'uppkopplad', 'står stilla', 'av sig själv', 'på väg ut']
const RETIRED_EN = ['setting the table', 'taking its time', 'on our own', 'no longer yours', 'on your way out', 'coming up']

const offenders = (catalogue: Record<string, string>, breaks: (text: string) => boolean) =>
  Object.entries(catalogue)
    .filter(([, text]) => breaks(text))
    .map(([key, text]) => `${key}: ${text}`)

const dash = (t: string) => t.includes('—')
const long = (t: string) => sentences(t) > 2
const we = (t: string) => /\b[Vv]i\b/.test(t)
const pictureSv = (t: string) => RETIRED_SV.some((w) => t.toLowerCase().includes(w))
const pictureEn = (t: string) => RETIRED_EN.some((w) => t.toLowerCase().includes(w))

describe('the tool speaks plain Swedish on the player surfaces (L73, #1101)', () => {
  for (const [part, [sv, en]] of Object.entries(PARTS)) {
    describe(`the ${part} part`, () => {
      it('writes a dash as a comma or a full stop', () => {
        expect(offenders(sv, dash)).toEqual([])
        expect(offenders(en, dash)).toEqual([])
      })

      it('says a thing in one sentence, two at most', () => {
        expect(offenders(sv, long)).toEqual([])
        expect(offenders(en, long)).toEqual([])
      })

      it('never calls the tool «vi»', () => {
        expect(offenders(sv, we)).toEqual([])
      })

      it('says a state as other tools say it, not as a picture', () => {
        expect(offenders(sv, pictureSv)).toEqual([])
        expect(offenders(en, pictureEn)).toEqual([])
      })
    })
  }

  // The control: the four readings do catch what they are here to catch, so the empty lists above
  // are catalogues without it rather than readings that match nothing.
  it('catches each of the four in a catalogue that breaks them', () => {
    const broken = {
      dash: 'Koden finns inte — fråga värden.',
      long: 'En mening. Två meningar. Tre meningar.',
      we: 'Vi väntar fortfarande på svar.',
      picture: 'Dukar bordet…',
      fine: 'Bordet laddas. Det tar normalt en sekund.',
      ellipsis: 'Laddar…',
      unit: 'Försöker igen om {seconds} s',
      word: 'Visa alla · {n}',
    }
    expect(offenders(broken, dash).map((s) => s.split(':')[0])).toEqual(['dash'])
    expect(offenders(broken, long).map((s) => s.split(':')[0])).toEqual(['long'])
    expect(offenders(broken, we).map((s) => s.split(':')[0])).toEqual(['we'])
    expect(offenders(broken, pictureSv).map((s) => s.split(':')[0])).toEqual(['picture'])
    expect(offenders({ a: 'The table is taking its time' }, pictureEn)).toHaveLength(1)
  })
})
