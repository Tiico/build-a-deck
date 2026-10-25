import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PERSONAL_FIELDS, REDACTED, type Applied, type Envelope } from '@byd/protocol'
import { decide, initialState, liftLog, project, redactLine, redactLog, replay, seededRng, counterIds, type SetupDef, type TableState } from '../src/index.js'
import type { CorpusEntry } from '../scripts/corpus.js'
import { Harness, registry } from './fixture.js'

// Masking a line (#1276, #1269): the personal fields of the log — and only they — become
// `REDACTED`, and the game is the same game (D4 as G6 put it). This is the function and the proof
// that it may; the erasure that writes a masked line in the store is #1279.

// Every personal value a log carries, read off the same list the masking reads.
const wordsOf = (log: readonly Applied[]): Set<string> => {
  const words = new Set<string>()
  for (const line of log)
    for (const { v, field } of PERSONAL_FIELDS) {
      const value = line.intent.v === v ? (line.intent as Record<string, unknown>)[field] : undefined
      if (typeof value === 'string') words.add(value)
    }
  return words
}
// A value as it reads with every one of those words masked: what the masked log must replay to.
const masked = <T>(value: T, words: Set<string>): T => {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return words.has(v) ? REDACTED : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value) as T
}

const historyOf = (initial: TableState, log: readonly Applied[]) => ({ stateAt: (seq: number) => replay(initial, registry, log.filter((l) => l.seq <= seq)), lines: () => log })
const viewers = (setup: SetupDef): [string | null, boolean][] => [...setup.seats.map((s): [string, boolean] => [s, false]), [null, false], [null, true]]

// The masked log replays to the same table, and every view projects the same, when the names and
// texts are compared as masked.
function expectSameGame(initial: TableState, log: readonly Applied[]) {
  const words = wordsOf(log)
  expect(words.size).toBeGreaterThan(0)
  const redacted = redactLog(log)
  expect(JSON.stringify(redacted)).not.toMatch(new RegExp([...words].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')))
  const state = replay(initial, registry, log)
  const after = replay(initial, registry, redacted)
  expect(after).toEqual(masked(state, words))
  for (const [seat, observer] of viewers(initial.setup)) {
    expect(project(after, registry, seat, undefined, historyOf(initial, redacted), observer)).toEqual(masked(project(state, registry, seat, undefined, historyOf(initial, log), observer), words))
  }
}

// Each batch of the masked log sent again through `decide`, against the table the masked log has
// reached: what it says about every line. The lines themselves are then applied as recorded.
function decidedAgain(initial: TableState, log: readonly Applied[]): { line: Applied; reason: string | null }[] {
  const said: { line: Applied; reason: string | null }[] = []
  let state = initial
  const done: Applied[] = []
  for (let i = 0; i < log.length; ) {
    let end = i
    while (end < log.length && log[end]!.batch === log[i]!.batch) end++
    const batch = log.slice(i, end)
    const env: Envelope = { id: batch[0]!.batch, seat: batch[0]!.by, intents: batch.map((l) => l.intent) }
    const d = decide(state, registry, env, { rng: seededRng(1), ids: counterIds('again'), now: () => batch[0]!.at, history: historyOf(initial, done) })
    for (const line of batch) {
      said.push({ line, reason: d.ok ? null : d.reason })
      state = replayOne(state, line)
      done.push(line)
    }
    i += batch.length
  }
  return said
}
const replayOne = (state: TableState, line: Applied) => replay(state, registry, [line])

// A table where every personal field is written, around a rewind, an undo and a row taken away.
function everyField(): Harness {
  const h = new Harness(5)
  h.do(null, { v: 'seat.claim', seat: 'A', name: 'Nicklas Öberg' })
  h.do(null, { v: 'seat.claim', seat: 'B', name: 'Eva Riktig' })
  h.do(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 2 })
  const score = h.do('A', { v: 'note.add', text: 'Nicklas leder med 3' })
  h.do('B', { v: 'note.edit', note: `n${score.seq}`, text: 'Eva leder med 1' })
  const gone = h.do('B', { v: 'note.add', text: 'Ring mamma efteråt' })
  h.do('A', { v: 'flag', note: 'Draken är för stark för Nicklas', component: h.top('hand:A') })
  h.do(null, { v: 'flag', observer: 'Kalle Tittare', note: 'Eva tvekade länge' })
  h.do('A', { v: 'move', component: h.top('hand:A'), to: 'table', x: 0, y: 0 })
  h.do('A', { v: 'undo.self' })
  h.do('B', { v: 'move', component: h.top('hand:B'), to: 'table', x: 10, y: 0 })
  const p = h.do('A', { v: 'rewind.propose', toSeq: 3 })
  h.do('B', { v: 'rewind.confirm', proposal: p.batch })
  h.do('A', { v: 'note.remove', note: `n${gone.seq}` })
  h.do('A', { v: 'seat.release', seat: 'A' })
  h.do(null, { v: 'seat.claim', seat: 'A', name: 'Nicklas igen' })
  return h
}

describe('masking the personal fields of a line (#1276)', () => {
  it('replays a table that used every personal field to the same game, view for view', () => {
    const h = everyField()
    expect(new Set(h.log.flatMap((l) => PERSONAL_FIELDS.filter((f) => f.v === l.intent.v && f.field in l.intent).map((f) => `${f.v}.${f.field}`)))).toEqual(new Set(PERSONAL_FIELDS.map((f) => `${f.v}.${f.field}`)))
    expectSameGame(h.initial, h.log)
  })

  it('keeps that a seat is taken, that a flag is an observer’s and that a note says something', () => {
    const lines = redactLog(everyField().log)
    expect(lines.find((l) => l.intent.v === 'seat.claim')?.intent).toEqual({ v: 'seat.claim', seat: 'A', name: REDACTED })
    expect(lines.filter((l) => l.intent.v === 'flag').map((l) => l.intent)).toEqual([
      { v: 'flag', note: REDACTED, component: expect.any(String) },
      { v: 'flag', observer: REDACTED, note: REDACTED },
    ])
    expect(lines.filter((l) => l.intent.v === 'note.add' || l.intent.v === 'note.edit').map((l) => 'text' in l.intent && l.intent.text)).toEqual([REDACTED, REDACTED, REDACTED])
  })

  it('leaves the play alone: a line without a personal field comes back as it was, and masking twice is masking once', () => {
    for (const line of everyField().log) {
      const once = redactLine(line)
      expect(redactLine(once)).toEqual(once)
      if (!PERSONAL_FIELDS.some((f) => f.v === line.intent.v && f.field in line.intent)) expect(once).toBe(line)
      else expect({ ...once, intent: undefined }).toEqual({ ...line, intent: undefined })
    }
  })

  it('masks only the lines it is not told to keep', () => {
    const log = everyField().log
    const lines = redactLog(log, (line) => line.by === 'B')
    for (const [i, line] of lines.entries()) {
      if (log[i]!.by === 'B') expect(line).toBe(log[i])
      else expect(line).toEqual(redactLine(log[i]!))
    }
  })

  it('has nothing to mask in a rewind’s stored table, which holds zones and components and no seat', () => {
    const h = everyField()
    const restores = h.log.filter((l) => l.outcome?.kind === 'restore')
    expect(restores.length).toBeGreaterThanOrEqual(2)
    const words = wordsOf(h.log)
    for (const line of restores) for (const word of words) expect(JSON.stringify(line.outcome)).not.toContain(word)
  })

  it('refuses no line of a masked log when it is decided again, but a seat taken under the placeholder', () => {
    const h = everyField()
    const said = decidedAgain(h.initial, redactLog(h.log))
    expect(said.filter((s) => s.line.intent.v !== 'seat.claim' && s.reason !== null)).toEqual([])
    // The one refusal masking makes: nobody sits down under the placeholder, whatever the seat says.
    expect(said.filter((s) => s.line.intent.v === 'seat.claim').map((s) => s.reason)).toEqual([expect.stringMatching(/placeholder/), expect.stringMatching(/placeholder/), expect.stringMatching(/placeholder/)])
    // And without it the claims are what they were: every line of the unmasked log decides again.
    expect(decidedAgain(h.initial, h.log).filter((s) => s.reason !== null)).toEqual([])
  })

  it('refuses a seat claimed under the placeholder', () => {
    const h = new Harness()
    const tried = h.try(null, { v: 'seat.claim', seat: 'A', name: REDACTED })
    expect(tried).toMatchObject({ ok: false, reason: expect.stringMatching(/placeholder/) })
    expect(h.try(null, { v: 'seat.claim', seat: 'A', name: ` ${REDACTED} ` }).ok).toBe(false)
  })
})

describe('masking the corpus (#1276)', () => {
  const dir = join(import.meta.dirname, '../../../corpus')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(`${file}: the masked log replays to the same game, view for view, and decides again`, () => {
      const entry = JSON.parse(readFileSync(join(dir, file), 'utf8')) as CorpusEntry
      const initial = initialState(entry.version, entry.setup, registry)
      const log = liftLog(entry.log)
      expectSameGame(initial, log)
      expect(decidedAgain(initial, redactLog(log)).filter((s) => s.line.intent.v !== 'seat.claim' && s.reason !== null)).toEqual([])
    })
  }
})
