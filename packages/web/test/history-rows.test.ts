import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DOC_PARTS, type VersionChange } from '@byd/server/doc'
import type { VersionSummary } from '@byd/server'
import { MOST_CHIPS, byDay, historyRow } from '../src/editor/historyRow.js'
import { translate, type Lang, type T } from '../src/i18n/index.js'

// What a row in the history says (#177, B4). This is the whole of it as words: the panel only
// paints what comes out of here, so a designer scanning her own history is answered here first
// and drawn second.

// The zone this file is read in, fixed.
//
// A clock and a day are drawn in the reader's own zone, which is what the designer wants and what
// the module does. It also makes the reading a fact about the machine, and `08:23` written on a
// Mac in Stockholm is `06:23` on a runner in UTC: three of the readings below were green here and
// red on CI for no other reason. The literals are what is worth keeping — `08:23` and `I går` are
// what a designer actually sees, and a test that formats the value the way the code formats it
// asserts nothing — so it is the zone that is pinned instead of the words that are loosened.
//
// Stockholm, because that is the offset the instants below are written with; the two have to say
// the same thing or the literals stop being readable. Node re-reads `TZ` on assignment, for
// `Date`'s local getters as for `Intl`, and the guard says so out loud rather than letting a
// runtime that stopped doing it quietly hand the readings back to the machine.
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

const t = (lang: Lang): T => (key, params) => translate(lang, key, params)
const sv = t('sv')

// Instants, written with the offset `ZONE` stands at on these September days. What is stored is
// always the instant — the server stamps `toISOString()` and nothing anywhere decides a day for
// the reader — so this is the fixture saying which afternoon it means, not a zone leaking in.
const NOON = Date.parse('2026-09-17T12:00:00+02:00')
const at = (when: string): string => new Date(`${when}+02:00`).toISOString()

const change = (over: Partial<VersionChange> = {}): VersionChange => ({ rev: 7, added: 0, removed: 0, changed: 0, parts: [], reordered: false, columns: false, ...over })
const version = (over: Partial<VersionSummary> = {}): VersionSummary => ({ rev: 7, at: at('2026-09-17T08:23:00'), ...over })

const row = (v: VersionSummary, c: VersionChange | undefined, lang: Lang = 'sv') => historyRow(v, c, { now: NOON, lang, t: t(lang), current: false })

describe('what a row in the history says (#177)', () => {
  it('says how many cards came, went and moved, in the words a designer already uses', () => {
    const said = row(version(), change({ added: 3, removed: 2, changed: 4 }))
    expect(said.words).toBe('3 nya kort · 2 borttagna · 4 ändrade')
    // One of anything is one of anything, not "1 ändrade".
    expect(row(version(), change({ added: 1, removed: 1, changed: 1 })).words).toBe('1 nytt kort · 1 borttaget · 1 ändrat')
  })

  // A change with nothing in it is not a save where nothing happened (#177): a version is only
  // written when the document really changed, and `diffProjects` does not look at `palette`,
  // `framing` or `fonts`. So the empty change means "something we have no word for", and the row
  // says that rather than a sentence that cannot be true.
  it('says a save it has no word for as something changed, never as nothing changed', () => {
    const said = row(version(), change())
    expect(said.words).toBe('Annat ändrat.')
    expect(said.spoken).toContain('Annat ändrat.')
    expect(row(version(), change(), 'en').words).toBe('Something else changed.')
    // But a save that only moved the template has a word for itself: the chip carries it, and the
    // row must not say anything beside a chip that already says what happened.
    expect(row(version(), change({ parts: ['template'] })).words).toBe('')
  })

  it('says the first version of all began the game', () => {
    expect(row(version({ rev: 1 }), change({ rev: 1, first: true })).words).toBe('Spelet skapades.')
  })

  it('reads a named version as its name, and keeps the number under it (B4)', () => {
    const named = row(version({ label: 'Första blindtestet' }), change({ added: 1 }))
    expect(named.heading).toBe('Första blindtestet')
    expect(named.version).toBe('Version 7')
    const plain = row(version(), change({ added: 1 }))
    expect(plain.heading).toBe('Version 7')
    expect(plain.version).toBeNull()
  })

  it('puts the clock in the row and never "i dag" as the whole of the time', () => {
    expect(row(version(), change()).time).toBe('08:23')
    expect(row(version(), change()).spoken).not.toMatch(/i dag/i)
  })
})

describe('the parts of the document that are not cards, as chips (#177)', () => {
  it('draws a chip for each part that moved, in the one order the parts are named', () => {
    const said = row(version(), change({ parts: ['setup', 'template'] }))
    expect(said.chips.map((c) => c.part)).toEqual(['template', 'setup'])
    expect(said.chips.map((c) => c.word)).toEqual(['mallen', 'bordet'])
    expect(said.count).toBeNull()
  })

  // The beställare's decision of 2026-09-17: three chips read, four do not — they become a row of
  // colour rather than a piece of news — and whoever moved four parts in one save knows she did
  // something big.
  it('stops at three chips, and from four says how many parts moved instead', () => {
    const three = row(version(), change({ parts: ['template', 'setup', 'rules'] }))
    expect(three.chips).toHaveLength(MOST_CHIPS)
    expect(three.count).toBeNull()

    const four = row(version(), change({ parts: ['template', 'setup', 'rules', 'icons'] }))
    expect(four.chips).toEqual([])
    expect(four.count).toBe('fyra delar ändrade')
  })

  // The count spells out the only number it can ever say, so the day a fifth part exists this
  // falls over here rather than telling a designer "four" about five things.
  it('has exactly the four parts the count is written for', () => {
    expect(DOC_PARTS).toHaveLength(4)
  })
})

describe('the history heard rather than seen (#177, L12)', () => {
  it('says every chip in words, and in the order the row draws them', () => {
    const said = row(version({ label: 'Balansering' }), change({ added: 3, parts: ['template', 'icons'] }))
    expect(said.spoken).toBe('08:23 · Balansering · Version 7 · 3 nya kort · mallen ändrad · symbolerna ändrade')
    // Whatever the eye can read is in what the ear hears, so the name never contradicts the label.
    for (const seen of [said.time, said.heading, said.version!, said.words, ...said.chips.map((c) => c.word)]) expect(said.spoken).toContain(seen)
  })

  it('says the count in words too, and says which version is the open one', () => {
    const said = historyRow(version(), change({ parts: [...DOC_PARTS] }), { now: NOON, lang: 'sv', t: sv, current: true })
    expect(said.spoken).toContain('fyra delar ändrade')
    expect(said.spoken).toContain('öppen nu')
  })

  it('says a row whose summary has not come back yet without pretending it knows', () => {
    const said = row(version(), undefined)
    expect(said.words).toBe('')
    expect(said.chips).toEqual([])
    expect(said.spoken).toBe('08:23 · Version 7')
  })
})

describe('the versions grouped by the day they were made (#177)', () => {
  const versions: VersionSummary[] = [
    version({ rev: 9, at: at('2026-09-17T08:23:00') }),
    version({ rev: 8, at: at('2026-09-17T08:20:00') }),
    version({ rev: 7, at: at('2026-09-16T19:58:00') }),
    version({ rev: 6, at: at('2026-09-12T20:03:00') }),
  ]

  it('makes the day a heading with how many versions it holds, and keeps the order it was given', () => {
    const days = byDay(versions, { now: NOON, lang: 'sv', t: sv })
    expect(days.map((d) => d.day)).toEqual(['I dag', 'I går', '12 september'])
    expect(days.map((d) => d.versions.map((v) => v.rev))).toEqual([[9, 8], [7], [6]])
    expect(days[0]!.count).toBe('2 versioner')
    expect(days[1]!.count).toBe('1 version')
  })

  // A day is a day on the reader's calendar and not a count of hours: something saved at eleven
  // last night was saved yesterday, whatever o'clock it is now.
  it('breaks the days where the calendar breaks them, not twenty-four hours back', () => {
    const lateLastNight = byDay([version({ rev: 9, at: at('2026-09-16T23:30:00') })], { now: NOON, lang: 'sv', t: sv })
    expect(lateLastNight[0]!.day).toBe('I går')
  })

  it('speaks the reader’s language, here as everywhere else (A4)', () => {
    const days = byDay(versions, { now: NOON, lang: 'en', t: t('en') })
    expect(days.map((d) => d.day)).toEqual(['Today', 'Yesterday', days[2]!.day])
    expect(days[2]!.day).toContain('12')
    expect(row(version(), change({ added: 1, parts: ['rules'] }), 'en').words).toBe('1 new card')
  })
})
