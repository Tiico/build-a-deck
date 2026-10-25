import { describe, expect, it } from 'vitest'
import { svStatus } from '../src/i18n/sv.status.js'
import { svPlay } from '../src/i18n/sv.play.js'
import { svOnline } from '../src/i18n/sv.online.js'
import { svAccount } from '../src/i18n/sv.account.js'
import { svEditor } from '../src/i18n/sv.editor.js'
import { enStatus } from '../src/i18n/en.status.js'
import { enPlay } from '../src/i18n/en.play.js'
import { enOnline } from '../src/i18n/en.online.js'
import { enAccount } from '../src/i18n/en.account.js'
import { enEditor } from '../src/i18n/en.editor.js'
import { TEXTS } from '../src/terms/beta.js'

// The tool speaks plain Swedish (L73, #1101, beställarens beslut 2026-10-22).
//
// The catalogue had a voice of its own: the table *set itself*, the phone *fetched a hand*, a seat
// was *no longer yours*, and a state took two or three sentences and a dash to say. The owner read
// it as overdone and at times hard to follow, and chose the ordinary register other tools use:
// a state is said as other tools say it, in one sentence or two, without the tool calling itself
// «vi» and without a picture standing in for the word. This holds the whole catalogue to that,
// every part, in both languages: the English was written against the Swedish key by key (A4) and
// carried the same pictures.
//
// What is read is the message as the catalogue writes it, placeholders included.
const PARTS: Record<string, [Record<string, string>, Record<string, string>]> = {
  status: [svStatus, enStatus],
  play: [svPlay, enPlay],
  online: [svOnline, enOnline],
  account: [svAccount, enAccount],
  editor: [svEditor, enEditor],
}

// A sentence ends in a full stop, an exclamation mark or a question mark, followed by a space or
// the end. An ellipsis is not a sentence, and a number with a unit (`{n} s`) has no stop.
const sentences = (text: string) => (text.match(/[.!?](?=\s|$)/g) ?? []).length

// The pictures that went out with the voices (A4, revised): a table that sets itself or takes its
// time, a moment, a service that looks something up, a line that is «up», cards that stand still,
// and a tool that stops «on its own».
const RETIRED_SV = ['dukar', 'dukas', 'dröjer', 'ögonblick', 'letar upp', 'uppkopplad', 'står stilla', 'av sig själv', 'på väg ut']
const RETIRED_EN = ['setting the table', 'taking its time', 'on our own', 'no longer yours', 'on your way out', 'coming up']

// «Vi» stays only where somebody actually did something: the mail that was sent, and the test
// printer's own answer, quoted in its voice on the print package (#1208).
//
// The beta's terms and privacy text (#1272) are not the catalogue: they are an agreement, and their
// «vi» is a party to it — the one who runs Deckster. They live in `terms/beta.ts`, outside every
// part read here, and the step and the page around them speak in the catalogue's voice like any
// other surface (`the terms' text stays out of the catalogue` below).
const WE_MAY = new Set(['login.sent.body', 'print.answer.taken'])

const offenders = (catalogue: Record<string, string>, breaks: (text: string, key: string) => boolean) =>
  Object.entries(catalogue)
    .filter(([key, text]) => breaks(text, key))
    .map(([key, text]) => `${key}: ${text}`)

const dash = (t: string) => t.includes('—')
const long = (t: string) => sentences(t) > 2
const we = (t: string, key: string) => !WE_MAY.has(key) && /\b[Vv]i\b/.test(t)
const pictureSv = (t: string) => RETIRED_SV.some((w) => t.toLowerCase().includes(w))
const pictureEn = (t: string) => RETIRED_EN.some((w) => t.toLowerCase().includes(w))

describe('the tool speaks plain Swedish (L73, #1101)', () => {
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

  // The named exception (#1272): the agreement's sentences, with their «vi», are the terms' module's
  // and never a key in the catalogue, where the tool would be speaking them as itself.
  it('the terms\' text stays out of the catalogue', () => {
    const catalogue = new Set(Object.values(PARTS).flatMap(([sv, en]) => [...Object.values(sv), ...Object.values(en)]))
    for (const text of Object.values(TEXTS)) {
      const sentences = [...text.summary, ...[text.terms, text.privacy].flatMap((doc) => doc.sections.flatMap((s) => [s.ks, ...s.body.flatMap((b) => (typeof b === 'string' ? [b] : b.list))]))]
      expect(sentences.filter((sentence) => catalogue.has(sentence))).toEqual([])
      expect(sentences.some((sentence) => we(sentence, ''))).toBe(true)
    }
  })

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
    // And the one place «vi» may stand is the one place, not a hole in the reading.
    expect(offenders({ 'login.sent.body': 'Vi har skickat en länk.', other: 'Vi har skickat en länk.' }, we).map((s) => s.split(':')[0])).toEqual(['other'])
  })
})

// Nothing can be ordered before phase 5 (#1223): print is phase 5, and the beta says outright that
// it does not promise print (L36, revised, #743). The wall's check said the deck «går att beställa»
// and that an error «stoppar beställningen», and the booklet «kunde inte beställas», all about an
// order nobody can place. What the check vouches for is that the deck is print-ready, so that is
// what it says; the booklet is made, not ordered.
const ORDER_SV = /beställ/i
const ORDER_EN = /\bordered\b|\bordering\b|\bstops? the order\b|\ban order\b|\bto order\b/i
// The print package (#1208, beslut B) is where the beta says outright that no order is placed: these
// two say it in the prototype's own words, and say nothing that can be ordered.
const NO_ORDER = new Set(['print.lead', 'print.noOrder'])
const ordersSv = (t: string, key?: string) => !(key !== undefined && NO_ORDER.has(key) && /\bIngen beställning läggs\b/.test(t)) && ORDER_SV.test(t)
const ordersEn = (t: string) => ORDER_EN.test(t)

describe('promises no order before phase 5 (#1223)', () => {
  for (const [part, [sv, en]] of Object.entries(PARTS)) {
    it(`the ${part} part promises nothing that can be ordered`, () => {
      expect(offenders(sv, ordersSv)).toEqual([])
      expect(offenders(en, ordersEn)).toEqual([])
    })
  }

  it('has the wall\'s check say the deck is print-ready, in both languages', () => {
    expect(svEditor['wall.checks.ok']).toBe('Leken klarar kontrollen och är tryckfärdig.')
    expect(svEditor['wall.checks.warningsOnly']).toBe('Bara varningar. Leken är tryckfärdig.')
    expect(svEditor['wall.checks.errors.one']).toBe('Ett fel måste rättas innan leken är tryckfärdig.')
    expect(svEditor['wall.checks.errors.other']).toBe('{n} typer av fel måste rättas innan leken är tryckfärdig.')
    expect(enEditor['wall.checks.ok']).toBe('The deck passes the check and is print-ready.')
    expect(enEditor['wall.checks.warningsOnly']).toBe('Only warnings. The deck is print-ready.')
    expect(enEditor['wall.checks.errors.one']).toBe('One error must be mended before the deck is print-ready.')
    expect(enEditor['wall.checks.errors.other']).toBe('{n} kinds of error must be mended before the deck is print-ready.')
  })

  // The control: the readings catch the promise as it stood, and let the order of a turn, a layer or
  // a game be.
  it('catches the old promise and lets the other order be', () => {
    const sv = {
      ok: 'Leken klarar kontrollen och går att beställa.',
      stops: 'Ett fel stoppar beställningen.',
      booklet: 'Häftet kunde inte beställas. Försök igen om en stund.',
      turn: 'Turordning',
    }
    expect(offenders(sv, ordersSv).map((s) => s.split(':')[0])).toEqual(['ok', 'stops', 'booklet'])
    const en = {
      ok: 'The deck passes the check and can be ordered.',
      stops: 'One error stops the order.',
      booklet: 'The booklet could not be ordered. Try again in a moment.',
      turn: 'Turn order',
      layer: 'Drag to change the order.',
      hidden: '{name}, {n} cards, order hidden',
      game: 'in the order of the game, table by table',
    }
    expect(offenders(en, ordersEn).map((s) => s.split(':')[0])).toEqual(['ok', 'stops', 'booklet'])
  })
})
