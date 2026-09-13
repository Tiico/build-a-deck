// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { TypeRegistry, initialState, project, STANDARD_TYPES } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { TableRenderer, type TableMode } from '../src/table/TableRenderer.js'
import { feltLabels } from '../src/table/keyboard.js'
import { translate, type Lang, type T } from '../src/i18n/index.js'
import { seatSetup } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const registry = new TypeRegistry(STANDARD_TYPES)
const table = () => project(initialState('v1', seatSetup(), registry), registry, null)
// A's "Liv" chip: 20, standing at (8, 8) inside `counters:A` at (100, 220) — absolute (108, 228).
const livId = (v: Snapshot) => v.components.find((c) => c.zone === 'counters:A' && c.cardRef === 'Liv')!.id
const chipOf = (id: string) => document.querySelector(`[data-counter-token="${id}"]`) as HTMLElement
const placeOf = (el: HTMLElement) => ({ left: el.style.left, top: el.style.top })
// At scale 1 with jsdom's zero-sized boxes a TV client pixel is a table millimetre offset by the
// floor's origin (-500, -300). Table mode projects through the tilt instead, so the same numbers
// land elsewhere on the felt — which is exactly why the two modes are asked the same question.
const client = (mmX: number, mmY: number) => ({ clientX: mmX + 500, clientY: mmY + 300, pointerId: 1, isPrimary: true, button: 0 })

// A counter token is a 24 mm chip. On a TV the whole felt is scaled to fit the screen, and at the
// scale a two-seat table lands on that chip is smaller than the word standing in it — so the name
// spills out over the felt as an unreadable smear on top of itself (UX-kontroll 2026-09-10).
describe('a counter token', () => {
  it('keeps its name inside the chip: below the width the word needs, the value stands alone', () => {
    const { container } = render(<TableRenderer view={table()} mode="tv" scale={0.75} />)
    const token = container.querySelector('.byd-token')!
    expect(parseFloat((token as HTMLElement).style.width)).toBeLessThan(34)
    expect(token.querySelector('span')).toBeNull()
    expect(token.querySelector('b')!.textContent).toBe('20')
  })

  it('says the name when the chip is wide enough to hold it', () => {
    const { container } = render(<TableRenderer view={table()} mode="tv" scale={2} />)
    const token = container.querySelector('.byd-token')!
    expect(parseFloat((token as HTMLElement).style.width)).toBeGreaterThanOrEqual(34)
    expect(token.querySelector('span')!.textContent).toBe('Liv')
  })
})

// A chip is a thing on the felt like any other, and the hand on the felt takes hold of things
// (K14). The renderer handed the counter branch the keyboard's node alone and kept the pointer's
// handles for cards and piles, so the chip was the one thing on the table that no mouse and no
// finger could touch at all (#73).
describe.each<TableMode>(['table', 'tv'])('a counter chip under the pointer, mode=%s (K14, C4)', (mode) => {
  it('follows the pointer, and stays where it was let go of until the table answers', () => {
    const v = table()
    const id = livId(v)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={onAct} />)
    const home = placeOf(chipOf(id))

    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerMove(chipOf(id), client(398, 98))
    const dragged = placeOf(chipOf(id))
    expect(dragged).not.toEqual(home)

    fireEvent.pointerUp(chipOf(id), client(398, 98))
    expect(onAct).toHaveBeenCalledTimes(1)
    expect(onAct.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ v: 'move', component: id })])
    // The drop and the patch are different moments (#29). Nothing has come back yet, so the chip
    // stands where it was put rather than flinching home.
    expect(placeOf(chipOf(id))).toEqual(dragged)
  })

  // The control the drag test needs: the same gestures on a table that is only being shown move
  // nothing at all, so the comparison above is a chip that travelled and not an assertion that
  // could never fail.
  it('stays put on a table that is only shown, where there is no hand to take it', () => {
    const v = table()
    const id = livId(v)
    render(<TableRenderer view={v} mode={mode} scale={1} />)
    const home = placeOf(chipOf(id))

    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerMove(chipOf(id), client(398, 98))
    fireEvent.pointerUp(chipOf(id), client(398, 98))
    expect(placeOf(chipOf(id))).toEqual(home)
  })
})

describe('where a dropped chip lands (K2, C4)', () => {
  it('moves to the millimetre it was let go of, in the zone that point falls in', () => {
    const v = table()
    const id = livId(v)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode="tv" scale={1} onAct={onAct} />)

    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerMove(chipOf(id), client(398, 98))
    fireEvent.pointerUp(chipOf(id), client(398, 98))
    // Out of its counter zone and onto the felt: (398, 98) is (898, 398) inside `table`.
    expect(onAct).toHaveBeenCalledWith([{ v: 'move', component: id, to: 'table', x: 898, y: 398 }])
    expect(placeOf(chipOf(id))).toEqual({ left: '898px', top: '398px' })
  })
})

// The chip's address was `card:<id>`, the same shape a card's address has, so the sentence a
// reader heard began "Poäng, kort i Spelyta". A counter is not a card: it has no face to turn and
// no back to hide, and the glossary gives the concept its own word (A4, C4, #73).
const noop = (): undefined => undefined
const stops = (labels: ReadonlyMap<string, string>) => ({
  labels,
  itemProps: () => ({ tabIndex: -1, ref: noop, onKeyDown: noop, onFocus: noop }),
  onActivate: noop,
})
// Bounded where the word begins and open where it ends, as the glossary test is: Swedish inflects,
// so `kort` has to be caught as `kortet` too.
const saysCard = /\bkort|\bcard/i

describe.each<[Lang, string, string]>([
  ['sv', 'Liv, räknare i Räknare A, värde 20. Enter öppnar handlingar.', 'Räknare i Räknare A, värde 20. Enter öppnar handlingar.'],
  ['en', 'Liv, counter in Räknare A, value 20. Enter opens actions.', 'Counter in Räknare A, value 20. Enter opens actions.'],
])('what a reader is told a chip is, in %s (A4, C4)', (lang, said, saidUnnamed) => {
  it('says it is a counter, with its value, and never calls it a card', () => {
    const v = table()
    const t: T = (key, params) => translate(lang, key, params)
    render(<TableRenderer view={v} mode="table" scale={2} keyboard={stops(feltLabels(v, t))} />)

    const chip = chipOf(livId(v))
    expect(chip.getAttribute('role')).toBe('button')
    expect(chip.getAttribute('aria-label')).toBe(said)
    expect(chip.getAttribute('aria-label')).not.toMatch(saysCard)

    // The control: the same felt, the same catalogue, a node that really is a card — so the chip's
    // silence about cards is this sentence and not a pattern that matches nothing.
    const top = document.querySelector('[data-kbd="top:draw"]')!
    expect(top.getAttribute('aria-label')).toMatch(saysCard)
  })

  // A chip standing in a zone whose faces this screen may not see comes through the projection
  // with no name at all (B6). The word a card falls back on there is `Dolt kort`, and that would
  // walk `kort` straight back into a counter's sentence by the back door.
  it('falls back on the counter’s own word, never on a hidden card, when the chip has no name', () => {
    const v = table()
    const id = livId(v)
    const nameless = { ...v, components: v.components.map((c) => (c.id === id ? { ...c, cardRef: null } : c)) }
    const t: T = (key, params) => translate(lang, key, params)
    render(<TableRenderer view={nameless} mode="table" scale={2} keyboard={stops(feltLabels(nameless, t))} />)

    const label = chipOf(id).getAttribute('aria-label')
    expect(label).toBe(saidUnnamed)
    expect(label).not.toMatch(saysCard)
  })
})
