// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TypeRegistry, initialState, project, STANDARD_TYPES } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'
import { TableRenderer, type TableMode } from '../src/table/TableRenderer.js'
import { feltLabels, thingsOn } from '../src/table/keyboard.js'
import { ActionPanel } from '../src/table/ActionPanel.js'
import { Language, translate, type Lang, type T } from '../src/i18n/index.js'
import { applyRecipe, emptySetup, setupFromProject } from '@byd/server/doc'
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
    // Marked as carried while it is in the hand, which is what lifts it over the felt it is being
    // drawn across — `table-grab.test.ts` measures the lift itself.
    expect(chipOf(id).getAttribute('data-dragging')).toBe('true')

    fireEvent.pointerUp(chipOf(id), client(398, 98))
    expect(chipOf(id).getAttribute('data-dragging')).toBeNull()
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

// A hold on a chip used to wait for nothing: the counter branch got the pointer's handles in #73
// and the ring stayed a card's and a pile's. What a counter offers when it is held is C4's own
// answer — a value moved one step either way, or said outright — and every one of them goes over
// the wire as `setCounter` with an absolute value, because the vocabulary is closed (#67).
const seated = (v: Snapshot): Snapshot => ({ ...v, seats: v.seats.map((s) => (s.id === 'A' ? { ...s, name: 'Ada' } : s)) })
const ringButtons = () => [...document.querySelectorAll('[data-radial] button')].map((b) => b.textContent)

describe.each<TableMode>(['table', 'tv'])('a chip held or clicked, mode=%s (K14, C4, #67)', (mode) => {
  it('a hold opens a ring with the counter’s own verbs, and the hub says what is counted and whose it is', () => {
    vi.useFakeTimers()
    const v = seated(table())
    const id = livId(v)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={onAct} />)
    fireEvent.pointerDown(chipOf(id), client(108, 228))
    expect(document.querySelector('[data-radial]')).toBeNull()
    act(() => vi.advanceTimersByTime(400))
    const ring = document.querySelector('[data-radial]')!
    expect(ring.getAttribute('data-radial')).toBe(id)
    expect(ringButtons()).toEqual(['−1', '+1', 'Sätt värde…'])
    // The chip's name is never drawn on the felt at any screen measured (`TOKEN_NAME_PX` 34 against
    // a chip of 10–34 px), and a chip lifted into a ring loses the one thing that said whose it
    // was: where it lay. The hub says both, with the value.
    const hub = ring.querySelector('[data-radial-hub]')!
    expect(hub.textContent).toContain('Liv')
    expect(hub.textContent).toContain('20')
    expect(hub.textContent).toContain('Adas räknare')
    fireEvent.pointerUp(screen.getByRole('button', { name: '+1' }), client(108, 228))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'setCounter', component: id, value: 21 }])
    expect(document.querySelector('[data-radial]')).toBeNull()
    vi.useRealTimers()
  })

  it('a click that never became a drag opens the same ring; −1 sends the value one below', () => {
    const v = seated(table())
    const id = livId(v)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={onAct} />)
    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerUp(chipOf(id), client(108, 228))
    expect(document.querySelector('[data-radial]')?.getAttribute('data-radial')).toBe(id)
    fireEvent.click(screen.getByRole('button', { name: '−1' }))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'setCounter', component: id, value: 19 }])
    expect(document.querySelector('[data-radial]')).toBeNull()
  })

  // The ring holds verbs and nothing else (K14, revised 2026-09-12): what closes it is anything
  // that is not a verb, and a chip's ring goes the same way as a card's.
  it('closes on a press outside the verbs and on Escape, sending nothing', () => {
    const v = seated(table())
    const id = livId(v)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={onAct} />)
    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerUp(chipOf(id), client(108, 228))
    fireEvent.pointerUp(document.querySelector('.byd-radial-backdrop')!)
    expect(document.querySelector('[data-radial]')).toBeNull()
    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerUp(chipOf(id), client(108, 228))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('[data-radial]')).toBeNull()
    expect(onAct).not.toHaveBeenCalled()
  })
})

// A chip that has left its seat's zone — dropped on the floor, which #73 allows — has nobody to
// be named after, and the hub does not invent one.
describe('the hub of a chip’s ring', () => {
  it('leaves the owner out when the chip lies in a zone nobody owns', () => {
    const v = seated(table())
    const id = livId(v)
    const loose = { ...v, components: v.components.map((c) => (c.id === id ? { ...c, zone: 'table', x: 0, y: 0 } : c)) }
    render(<TableRenderer view={loose} mode="tv" scale={1} onAct={vi.fn()} />)
    fireEvent.pointerDown(chipOf(id), client(-500, -300))
    fireEvent.pointerUp(chipOf(id), client(-500, -300))
    const hub = document.querySelector('[data-radial-hub]')!
    expect(hub.textContent).toContain('Liv')
    expect(hub.textContent).not.toContain('räknare')
  })
})

// "Sätt värde…" on a screen with no keyboard (#67). The phone's `CountersRow` calls `prompt()`,
// which a TV touched with a finger cannot answer; the number is written on the tool's own keys
// instead, and a hand on a physical keyboard types straight into the same sheet. What goes out
// is `setCounter` with the number said, and nothing until it is said.
const entryOf = (id: string) => document.querySelector(`[data-set-value="${id}"]`) as HTMLElement | null
const shown = () => document.querySelector('[data-set-value] output')!.textContent

describe('saying a counter’s value outright (C4, #67)', () => {
  const opened = (mode: TableMode) => {
    const v = seated(table())
    const id = livId(v)
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode={mode} scale={1} onAct={onAct} />)
    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerUp(chipOf(id), client(108, 228))
    fireEvent.click(screen.getByRole('button', { name: 'Sätt värde…' }))
    return { id, onAct }
  }

  it.each<TableMode>(['table', 'tv'])('opens a sheet on the felt from the ring, named for the chip and whose it is, mode=%s', (mode) => {
    const { id, onAct } = opened(mode)
    expect(document.querySelector('[data-radial]')).toBeNull()
    const sheet = entryOf(id)!
    expect(sheet.getAttribute('role')).toBe('dialog')
    expect(sheet.getAttribute('aria-label')).toBe('Sätt värde för Liv')
    expect(sheet.textContent).toContain('Adas räknare')
    // It opens on the value the chip has, and the first key said replaces it rather than trailing
    // it: nobody who wants 5 wants 205.
    expect(shown()).toBe('20')
    expect(onAct).not.toHaveBeenCalled()
  })

  it('writes the number on its own keys, and sends it as an absolute value once confirmed', () => {
    const { id, onAct } = opened('tv')
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(shown()).toBe('25')
    fireEvent.click(screen.getByRole('button', { name: 'Byt tecken' }))
    expect(shown()).toBe('-25')
    fireEvent.click(screen.getByRole('button', { name: 'Byt tecken' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sudda' }))
    expect(shown()).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: '7' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sätt värdet' }))
    expect(onAct).toHaveBeenCalledTimes(1)
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'setCounter', component: id, value: 27 }])
    expect(entryOf(id)).toBeNull()
  })

  it('takes the digits from a physical keyboard too, confirms on Enter and leaves on Escape', () => {
    const { id, onAct } = opened('tv')
    const sheet = entryOf(id)!
    expect(sheet.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(sheet, { key: '4' })
    fireEvent.keyDown(sheet, { key: '2' })
    expect(shown()).toBe('42')
    fireEvent.keyDown(sheet, { key: 'Backspace' })
    fireEvent.keyDown(sheet, { key: '-' })
    expect(shown()).toBe('-4')
    fireEvent.keyDown(sheet, { key: 'Enter' })
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'setCounter', component: id, value: -4 }])
    expect(entryOf(id)).toBeNull()

    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerUp(chipOf(id), client(108, 228))
    fireEvent.click(screen.getByRole('button', { name: 'Sätt värde…' }))
    fireEvent.keyDown(entryOf(id)!, { key: '9' })
    fireEvent.keyDown(entryOf(id)!, { key: 'Escape' })
    expect(entryOf(id)).toBeNull()
    expect(onAct).toHaveBeenCalledTimes(1)
  })

  it('cannot confirm nothing: an erased sheet has no number to send', () => {
    const { id, onAct } = opened('tv')
    fireEvent.click(screen.getByRole('button', { name: 'Sudda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sudda' }))
    expect(shown()).toBe('')
    expect((screen.getByRole('button', { name: 'Sätt värdet' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(entryOf(id)).toBeNull()
    expect(onAct).not.toHaveBeenCalled()
  })
})

// The hand and the keyboard offer one and the same list on a chip (L12, #67). Today the panel
// offered a chip the card's verbs — `Vänd · Vrid 90° · Avslöja · Titta` — because the two lists
// were two lists. Both are read here, from the rendered ring and the rendered panel, and held to
// be the same in both languages the tool speaks.
describe.each<Lang>(['sv', 'en'])('the ring and the keyboard panel read one list, in %s', (lang) => {
  it('offer a chip the same verbs in the same order', () => {
    const v = seated(table())
    const id = livId(v)
    const t: T = (key, params) => translate(lang, key, params)
    render(
      <Language lang={lang}>
        <TableRenderer view={v} mode="tv" scale={1} onAct={vi.fn()} />
      </Language>,
    )
    fireEvent.pointerDown(chipOf(id), client(108, 228))
    fireEvent.pointerUp(chipOf(id), client(108, 228))
    const ring = ringButtons()
    fireEvent.keyDown(window, { key: 'Escape' })

    const thing = thingsOn(v, t).find((x) => x.key === `counter:${id}`)!
    render(
      <Language lang={lang}>
        <ActionPanel view={v} thing={thing} cards={[]} onClose={vi.fn()} onRun={vi.fn()} onLook={vi.fn()} onSet={vi.fn()} intentsFor={() => []} landedKey={() => ''} />
      </Language>,
    )
    const panel = [...document.querySelectorAll('.byd-kbd-list')[0]!.querySelectorAll('button > span')].map((s) => s.textContent)
    expect(ring.length).toBe(3)
    expect(panel).toEqual(ring)
    // And the panel says whose chip it is, as the ring's hub does.
    expect(document.querySelector('.byd-kbd-panel h2')!.textContent).toContain(lang === 'sv' ? 'Adas räknare' : 'Ada’s counter')
  })
})

// ── A seat's third counter (C4, K18, #89) ─────────────────────────────────────────────────────
// Two counters lie side by side along the seat's own rim and each has its own target. A third
// does not fit: a finger's 44 px is about a hundred millimetres of felt, and three of those want
// more room along the rim than a seat has to give without taking it from somebody else. So the
// third stacks the seat's chips, and what the hand meets is the pile — one thing to press, whose
// ring reaches each counter by name and from there offers `counterActs` and nothing else.
//
// The table is laid out by the recipe and dealt by `setupFromProject`, so what is read here is the
// path a real table takes and not a fixture's arithmetic.
const stacked = (counters: number): Snapshot => {
  const named = [
    { name: 'Poäng', start: 0 },
    { name: 'Liv', start: 20 },
    { name: 'Rundor', start: 1 },
  ].slice(0, counters)
  const setup = applyRecipe(emptySetup(), { players: 2, mine: true, discard: true, market: false, counters: named })
  return seated(project(initialState('stack', setupFromProject({ rows: [], setup }), registry), registry, null))
}
const chipsIn = (zone: string, v: Snapshot) => v.components.filter((c) => c.zone === zone)

describe('a seat with a third counter (C4, K18, #89)', () => {
  it('lays two counters in two slots and stacks three into one pile with one target', () => {
    for (const counters of [1, 2, 3]) {
      const v = stacked(counters)
      const chips = chipsIn('counters:A', v)
      expect(chips).toHaveLength(counters)
      // One spot per chip up to two, one spot for all of them at three: it is where they lie that
      // makes a pile, and nothing else.
      const spots = new Set(chips.map((c) => `${c.x},${c.y}`))
      expect({ counters, spots: spots.size }).toEqual({ counters, spots: counters <= 2 ? counters : 1 })

      const { unmount } = render(<TableRenderer view={v} mode="tv" scale={1} onAct={vi.fn()} />)
      // Every counter is still drawn, and every one of them still has the name and the tab stop a
      // keyboard reaches it by — a pile hides a chip from the finger, never from the reader.
      expect(document.querySelectorAll('.byd-token')).toHaveLength(counters * 2)
      expect(chips.every((c) => chipOf(c.id).getAttribute('aria-label') !== '')).toBe(true)
      // But the targets are one per pile: three chips under one finger are one thing to press.
      expect(document.querySelectorAll('[data-counter-hit]')).toHaveLength(counters <= 2 ? counters * 2 : 2)
      unmount()
    }
  })

  it('opens the pile’s ring on the counters it holds, and each of them on its own verbs', () => {
    const v = stacked(3)
    const chips = chipsIn('counters:A', v)
    const top = chips[chips.length - 1]!
    const onAct = vi.fn()
    render(<TableRenderer view={v} mode="tv" scale={1} onAct={onAct} />)

    fireEvent.pointerDown(chipOf(top.id), client(0, 0))
    fireEvent.pointerUp(chipOf(top.id), client(0, 0))
    // The pile has no verbs of its own: its ring is the counters in it, each said by name and
    // value, and the hub says how many are stacked there and whose they are.
    expect(ringButtons()).toEqual(['Poäng 0', 'Liv 20', 'Rundor 1'])
    const hub = document.querySelector('[data-radial-hub]')!
    expect(hub.textContent).toContain('3')
    expect(hub.textContent).toContain('Adas räknare')

    // Choosing one opens that counter's own ring, which is `counterActs` and nothing else — the
    // same three the keyboard's panel offers, so the two lists cannot drift apart (#67).
    fireEvent.click([...document.querySelectorAll('[data-radial] button')].find((b) => b.textContent === 'Liv 20')!)
    expect(ringButtons()).toEqual(['−1', '+1', 'Sätt värde…'])
    const liv = chips.find((c) => c.cardRef === 'Liv')!
    fireEvent.click([...document.querySelectorAll('[data-radial] button')].find((b) => b.textContent === '+1')!)
    expect(onAct).toHaveBeenCalledWith([{ v: 'setCounter', component: liv.id, value: 21 }])
  })
})
