// @vitest-environment jsdom
// A die on the felt (#1137, K28 variant A): its kind's silhouette seen from above with the value on
// the top face, a click or Enter that rolls it, a drag that moves it like anything else, and a
// tumble played by the log line that says it was rolled — never by a guess at the value.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { DICE, TypeRegistry, initialState, project, STANDARD_TYPES, type SetupDef } from '@byd/engine'
import type { Activity, Snapshot } from '@byd/protocol'
import { rollsAfter } from '../src/table/Die.js'
import { TableRenderer, type TableMode } from '../src/table/TableRenderer.js'
import { feltLabels } from '../src/table/keyboard.js'
import { dropIntents } from '../src/table/drop.js'
import { describeActivity } from '../src/table/describe.js'
import { Language, translate, type Lang, type T } from '../src/i18n/index.js'
import { seatSetup } from './fixture.js'

const registry = new TypeRegistry(STANDARD_TYPES)
// One die of every kind, lying in a row on the floor at y = 100, its side up the value given.
const KINDS = [4, 6, 8, 10, 12, 20] as const
function withDice(values: Partial<Record<number, number>> = {}): SetupDef {
  const setup = seatSetup()
  for (const [i, n] of KINDS.entries()) {
    const def = DICE.find((d) => d.id === `die.d${n}`)!
    setup.components.push({ type: { id: def.id, version: def.version }, cardRef: `d${n}`, zone: 'table', face: 'front', counter: values[n] ?? 1, x: 100 + i * 60, y: 400 })
  }
  return setup
}
const table = (values?: Partial<Record<number, number>>) => project(initialState('dice', withDice(values), registry), registry, null)
const idOf = (v: Snapshot, n: number) => v.components.find((c) => c.type.id === `die.d${n}`)!.id
const dieOf = (id: string) => document.querySelector(`[data-die="${id}"]`) as HTMLElement
// At scale 1 in jsdom a TV client pixel is a table millimetre offset by the floor's origin.
const client = (mmX: number, mmY: number) => ({ clientX: mmX + 500, clientY: mmY + 300, pointerId: 1, isPrimary: true, button: 0 })

afterEach(() => {
  vi.useRealTimers()
})

describe('a die on the felt (#1137)', () => {
  it('is drawn with its own kind’s silhouette and the side that is up', () => {
    const v = table({ 4: 3, 6: 5, 8: 7, 10: 9, 12: 11, 20: 14 })
    render(<TableRenderer view={v} mode="tv" scale={1} />)
    const drawn = KINDS.map((n) => {
      const el = dieOf(idOf(v, n))
      return [el.getAttribute('data-kind'), el.querySelector('[data-die-value]')?.textContent]
    })
    expect(drawn).toEqual([
      ['d4', '3'],
      ['d6', '5'],
      ['d8', '7'],
      ['d10', '9'],
      ['d12', '11'],
      ['d20', '14'],
    ])
    // Six kinds, six outlines: no two kinds share one, which is what makes the kind readable
    // without a word on it.
    const outlines = KINDS.map((n) => dieOf(idOf(v, n)).querySelector('svg')!.innerHTML.replace(/>\d+</, '><'))
    expect(new Set(outlines).size).toBe(6)
  })
})

// A roll is played by the log line that says it happened (L35's rule for the shuffle): a die rolled
// to the side it already showed changes nothing in the snapshot, and still tumbles.
describe('a die that was just rolled (#1137, K28)', () => {
  const still = (on: boolean) => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }))
  }
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tumbles, its figure jumping, and lands on the side the table says is up', () => {
    still(false)
    vi.useFakeTimers()
    const v = table({ 20: 14 })
    const id = idOf(v, 20)
    render(<TableRenderer view={v} mode="tv" scale={1} rolls={[{ component: id, seq: 9, seat: 'A' }]} />)
    expect(dieOf(id).getAttribute('data-rolling')).toBe('tumble')
    const seen = new Set<string>()
    for (let i = 0; i < 8; i++) {
      seen.add(dieOf(id).querySelector('[data-die-value]')!.textContent!)
      act(() => vi.advanceTimersByTime(70))
    }
    // It jumped: more than one figure on the way (a d20 showing the same side eight times running
    // is one in 20^7).
    expect(seen.size).toBeGreaterThan(1)
    act(() => vi.advanceTimersByTime(300))
    expect(dieOf(id).querySelector('[data-die-value]')!.textContent).toBe('14')
  })

  it('under prefers-reduced-motion shows the value at once, with a ring in the colour of the seat that rolled', () => {
    still(true)
    vi.useFakeTimers()
    const v = table({ 20: 14 })
    const id = idOf(v, 20)
    render(<TableRenderer view={v} mode="tv" scale={1} rolls={[{ component: id, seq: 9, seat: 'B' }]} />)
    expect(dieOf(id).getAttribute('data-rolling')).toBe('ring')
    // B is the second seat, and the second seat is blue (`seatColor`).
    expect(dieOf(id).style.getPropertyValue('--seat')).toBe('#3c8ce7')
    for (let i = 0; i < 5; i++) {
      expect(dieOf(id).querySelector('[data-die-value]')!.textContent).toBe('14')
      act(() => vi.advanceTimersByTime(70))
    }
  })

  it('is not marked as rolling when nothing was rolled', () => {
    const v = table()
    render(<TableRenderer view={v} mode="tv" scale={1} />)
    expect(dieOf(idOf(v, 20)).getAttribute('data-rolling')).toBeNull()
  })
})

describe('which dice were just rolled (#1137)', () => {
  const line = (seq: number, intent: Activity['intent'], by: string | null = 'A'): Activity => ({ schemaVersion: 1, seq, batch: `b${seq}`, at: '', by, intent })
  it('is the rolls among the lines newer than the last one seen, each with the seat that rolled', () => {
    const lines = [line(1, { v: 'roll', component: 'old' }), line(2, { v: 'roll', component: 'd1' }, 'B'), line(3, { v: 'shuffle', pile: 'draw' }), line(4, { v: 'roll', component: 'd2' }, null)]
    expect(rollsAfter(lines, 1)).toEqual([
      { component: 'd1', seq: 2, seat: 'B' },
      { component: 'd2', seq: 4, seat: null },
    ])
  })
})

// A die moved across the felt is said by its kind, never as «ett kort» (A4).
describe('the line a moved die is told in (#1137)', () => {
  it('names the die by its kind', () => {
    const v = table()
    const id = idOf(v, 6)
    const t: T = (key, params) => translate('sv', key, params)
    const moved: Activity = { schemaVersion: 1, seq: 3, batch: 'b', at: '', by: null, intent: { v: 'move', component: id, to: 'table', x: 0, y: 0 } }
    expect(describeActivity(moved, v, t)).toBe('Bordet flyttade d6 till Spelyta')
  })
})

// A die is `stackable: false`, so nothing joins it: a card let go of over a die lies on the felt
// where it was let go of, rather than asking the table for a `stack` it has to refuse.
describe('a card dropped on a die (#1137, K1)', () => {
  it('moves onto the felt and stacks on nothing', () => {
    const base = withDice()
    base.components.push({ type: { id: 'card.standard.63x88', version: 1 }, cardRef: 'loose', zone: 'table', face: 'front', x: 700, y: 100 })
    const v = project(initialState('dice', base, registry), registry, null)
    const card = v.components.find((c) => c.cardRef === 'loose')!.id
    // Carried from (200, -200) to the point (-90, 110), which is on the d20 at (-100, 100).
    const intents = dropIntents(v, { target: { kind: 'card', id: card }, ids: [card], grab: { x: 210, y: -190 }, at: { x: -90, y: 110 }, origin: { [card]: { x: 200, y: -200 } } }, 'tv')
    expect(intents.map((i) => i.v)).toEqual(['move'])
  })
})

// What a reader is told a die is: its kind and the side that is up, where it lies, that Enter
// rolls it and that M moves it (#1169) — and never that it is a card or a counter (A4).
describe.each<[Lang, string]>([
  ['sv', 'd20, visar 14, i Spelyta. Enter slår tärningen, M flyttar den.'],
  ['en', 'd20, showing 14, in Spelyta. Enter rolls it, M moves it.'],
])('what a reader is told a die is, in %s (#1137, A4)', (lang, said) => {
  it('says its kind, its value and that it can be rolled', () => {
    const v = table({ 20: 14 })
    const t: T = (key, params) => translate(lang, key, params)
    const labels = feltLabels(v, t)
    const keyboard = { labels, itemProps: () => ({ tabIndex: -1, ref: () => undefined, onKeyDown: () => undefined, onFocus: () => undefined }), onActivate: () => undefined }
    render(<TableRenderer view={v} mode="table" scale={2} keyboard={keyboard} />)
    const die = dieOf(idOf(v, 20))
    expect(die.getAttribute('role')).toBe('button')
    expect(die.getAttribute('aria-label')).toBe(said)
    expect(die.getAttribute('aria-label')).not.toMatch(/\bkort|\bcard|räknare|counter/i)
  })
})

// The d20 lies at absolute (-100, 100) and the d6 at (-340, 100), each 30 mm square.
const D20 = client(-85, 115)
const D6 = client(-325, 115)
const placeOf = (el: HTMLElement) => ({ left: el.style.left, top: el.style.top })

describe.each<TableMode>(['table', 'tv'])('a die under the pointer, mode=%s (#1137, K14)', (mode) => {
  it('a click that never became a drag rolls it, and opens no ring', () => {
    const v = table()
    const id = idOf(v, 20)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={onAct} />)
    fireEvent.pointerDown(dieOf(id), D20)
    fireEvent.pointerUp(dieOf(id), D20)
    expect(onAct).toHaveBeenCalledWith([{ v: 'roll', component: id }])
    expect(document.querySelector('[data-radial]')).toBeNull()
  })

  it('a hold rolls nothing and opens no ring: a die has one verb, and a click says it', () => {
    vi.useFakeTimers()
    const v = table()
    const id = idOf(v, 20)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={onAct} />)
    fireEvent.pointerDown(dieOf(id), D20)
    act(() => vi.advanceTimersByTime(800))
    expect(document.querySelector('[data-radial]')).toBeNull()
    expect(onAct).not.toHaveBeenCalled()
  })

  it('a drag moves it like anything else, and rolls nothing', () => {
    const v = table()
    const id = idOf(v, 6)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={onAct} />)
    const home = placeOf(dieOf(id))
    fireEvent.pointerDown(dieOf(id), D6)
    fireEvent.pointerMove(dieOf(id), client(-125, -85))
    expect(dieOf(id).getAttribute('data-dragging')).toBe('true')
    expect(placeOf(dieOf(id))).not.toEqual(home)
    fireEvent.pointerUp(dieOf(id), client(-125, -85))
    expect(onAct).toHaveBeenCalledTimes(1)
    expect(onAct.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ v: 'move', component: id, to: 'table' })])
  })

  it('Enter or Space on a die with the keyboard’s focus rolls it, as a click does', () => {
    const v = table()
    const id = idOf(v, 20)
    const onActivate = vi.fn()
    const keyboard = { labels: feltLabels(v), itemProps: () => ({ tabIndex: 0, ref: () => undefined, onKeyDown: () => undefined, onFocus: () => undefined }), onActivate }
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={vi.fn()} keyboard={keyboard} />)
    fireEvent.keyDown(dieOf(id), { key: 'Enter' })
    fireEvent.keyDown(dieOf(id), { key: ' ' })
    expect(onActivate.mock.calls).toEqual([[`die:${id}`], [`die:${id}`]])
  })

  it('stays put and rolls nothing on a table that is only shown', () => {
    const v = table()
    const id = idOf(v, 6)
    render(<TableRenderer view={v} mode={mode} scale={1} />)
    const home = placeOf(dieOf(id))
    fireEvent.pointerDown(dieOf(id), D6)
    fireEvent.pointerMove(dieOf(id), client(-125, -85))
    fireEvent.pointerUp(dieOf(id), client(-125, -85))
    expect(placeOf(dieOf(id))).toEqual(home)
  })
})

// The felt's own help lists M where there are dice to move (#1169, K16), in the reader's language;
// a table without dice keeps its list as it was (`felt-shortcuts.test.tsx`).
describe.each<[Lang, string, string]>([
  ['sv', 'Kortkommandon på bordet', 'Flytta tärningen som har fokus'],
  ['en', 'Shortcuts on the table', 'Move the die that has the focus'],
])('the felt’s help on a table with dice, in %s (#1169)', (lang, opener, said) => {
  it('lists M as the key that moves the focused die', () => {
    render(
      <Language lang={lang}>
        <TableRenderer view={table()} mode="tv" scale={1} onAct={vi.fn()} />
      </Language>,
    )
    fireEvent.click(screen.getByRole('button', { name: opener }))
    const help = screen.getByRole('dialog', { name: opener })
    // A row of its own: M and nothing else in the keys, and the sentence beside it.
    const row = [...help.querySelectorAll('dt')].find((dt) => dt.textContent === 'M')
    expect(row?.nextElementSibling?.textContent).toBe(said)
  })
})
