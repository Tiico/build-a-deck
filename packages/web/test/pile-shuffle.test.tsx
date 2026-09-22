// @vitest-environment jsdom
// A shuffle is fanned on the pile it shuffled, played by the event and not by the state (L35,
// #326). The wire says nothing new for it: a `shuffle` line already reaches every screen that
// sees the pile, and the fan is what that line looks like on the felt.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { componentOf, projectActivity } from '@byd/engine'
import type { Activity } from '@byd/protocol'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { SHUFFLE_MS, SHUFFLE_PULSE_MS, STILL, useShuffles } from '../src/table/shuffle.js'
import { TableClient } from '../src/client.js'
import { TablePage } from '../src/table/TablePage.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { buildScene, renderedDeck, tableOf } from './scene.js'
import { admit, asTable, createSession, roomOf, startServer, twoSeatSetup, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const tableCss = readFileSync(join(import.meta.dirname, '..', 'src/table/table.css'), 'utf8')

// The scene's own log, and the same log with the draw pile shuffled once more by the table.
function shuffled(): { before: Activity[]; after: Activity[]; again: Activity[] } {
  const { log, viewAfter } = buildScene()
  const before = log.map(projectActivity)
  viewAfter({ v: 'shuffle', pile: 'draw' })
  const after = log.map(projectActivity)
  viewAfter({ v: 'shuffle', pile: 'draw' })
  const again = log.map(projectActivity)
  return { before, after, again }
}

// A table behind a compiled deck, read through `project` the way every screen reads it: the draw
// pile hidden (`visibility: 'none'`, projected as `count`) and the discard public (`'all'`,
// projected as `order`), with three cards moved from one to the other. `up` turns the discard's
// cards face-up, which is the only difference between the two cases below.
//
// The hashes come from the deck rather than from a hand-written snapshot: what is asked here is
// what the felt makes of what `project` said, and a pasted hash would ask nothing about that.
function twoPiles(up: boolean) {
  const setup = twoSeatSetup()
  const table = tableOf(setup, renderedDeck(setup))
  table.run(null, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
  if (up) for (const id of [...table.state().zones['discard']!.order]) table.run(null, { v: 'flip', component: id, face: 'front' })
  const cardOn = (pile: string) => componentOf(table.state(), table.state().zones[pile]!.order[0]!).cardRef
  return { view: table.view(null), discard: cardOn('discard'), draw: cardOn('draw') }
}

const faceUrl = (hash: string) => `http://faces.test/faces/${hash}`

// The reader has asked for less motion: the window answers the one query the felt asks.
function askedForStillness(still: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: still && query === STILL,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  vi.useRealTimers()
  askedForStillness(false)
})

describe('useShuffles: which piles are being shuffled right now', () => {
  it('plays a shuffle line that arrives after mount, once, and lets go of it after 560 ms', () => {
    vi.useFakeTimers()
    const { before, after } = shuffled()
    const { result, rerender } = renderHook(({ activity }) => useShuffles(activity, true), { initialProps: { activity: before } })
    expect(result.current).toEqual([])

    rerender({ activity: after })
    const line = after[after.length - 1]!
    expect(result.current).toEqual([{ pile: 'draw', seq: line.seq }])

    // The same line again is the same event: nothing replays.
    rerender({ activity: [...after] })
    expect(result.current).toEqual([{ pile: 'draw', seq: line.seq }])

    act(() => {
      vi.advanceTimersByTime(SHUFFLE_MS)
    })
    expect(result.current).toEqual([])
  })

  it('plays nothing for the shuffles that were already in the log when the screen mounted', () => {
    vi.useFakeTimers()
    const { after } = shuffled()
    const { result } = renderHook(({ activity }) => useShuffles(activity, true), { initialProps: { activity: after } })
    expect(result.current).toEqual([])
    act(() => {
      vi.advanceTimersByTime(SHUFFLE_MS)
    })
    expect(result.current).toEqual([])
  })

  it('takes the log that comes with the first snapshot as history, and only what follows it as events', () => {
    vi.useFakeTimers()
    const { after, again } = shuffled()
    // Mounted before the snapshot: the activity is empty and the screen is not ready.
    const { result, rerender } = renderHook(({ activity, ready }) => useShuffles(activity, ready), { initialProps: { activity: [] as Activity[], ready: false } })
    rerender({ activity: after, ready: true })
    expect(result.current).toEqual([])
    rerender({ activity: again, ready: true })
    expect(result.current).toEqual([{ pile: 'draw', seq: again[again.length - 1]!.seq }])
  })

  it('a later shuffle of the same pile replaces the earlier one, so the fan starts over', () => {
    vi.useFakeTimers()
    const { before, after, again } = shuffled()
    const { result, rerender } = renderHook(({ activity }) => useShuffles(activity, true), { initialProps: { activity: before } })
    rerender({ activity: after })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ activity: again })
    expect(result.current).toEqual([{ pile: 'draw', seq: again[again.length - 1]!.seq }])
    // The first shuffle's clock running out does not take the second one with it.
    act(() => {
      vi.advanceTimersByTime(SHUFFLE_MS - 200)
    })
    expect(result.current).toEqual([{ pile: 'draw', seq: again[again.length - 1]!.seq }])
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toEqual([])
  })
})

describe('the fan on the felt (L35)', () => {
  const fanOf = (pile: string) => Array.from(document.querySelectorAll(`[data-zone="${pile}"] .byd-pile-fan-card`))

  it('marks the shuffled pile and fans exactly four backs on it, and leaves the other piles alone', () => {
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} faces="http://faces.test" shuffles={[{ pile: 'draw', seq: 12 }]} />)
    const draw = document.querySelector('[data-zone="draw"]')!
    expect(draw.getAttribute('data-shuffling')).toBe('fan')
    const fan = fanOf('draw')
    expect(fan).toHaveLength(4)
    for (const card of fan) {
      expect(card.getAttribute('data-face')).toBe('back')
      expect(card.textContent).toBe('')
    }
    expect(document.querySelector('[data-zone="discard"]')!.hasAttribute('data-shuffling')).toBe(false)
    expect(fanOf('discard')).toHaveLength(0)
  })

  it('fans nothing while no shuffle is playing', () => {
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} />)
    expect(document.querySelector('[data-shuffling]')).toBeNull()
    expect(document.querySelectorAll('.byd-pile-fan-card')).toHaveLength(0)
  })

  it('the fan wears only the back the pile already wears: the same texture as its top, and no front anywhere', () => {
    const { view } = buildScene()
    // The hidden draw pile wears its top card's own back (#313): the one hash a zone carries.
    const own = 'b'.repeat(64)
    const snapshot = view(null)
    const withBack = { ...snapshot, zones: snapshot.zones.map((z) => (z.id === 'draw' && z.mode === 'count' ? { ...z, back: own } : z)) }
    render(<TableRenderer view={withBack} mode="tv" scale={1} faces="http://faces.test" shuffles={[{ pile: 'draw', seq: 12 }]} />)
    const top = document.querySelector('[data-zone="draw"] .byd-pile-top')!
    expect(top.getAttribute('data-face')).toBe('back')
    const topSrc = top.querySelector('img')?.getAttribute('src') ?? null
    expect(topSrc).toBe(`http://faces.test/faces/${own}`)
    expect(fanOf('draw')).toHaveLength(4)
    for (const card of fanOf('draw')) expect(card.querySelector('img')?.getAttribute('src') ?? null).toBe(topSrc)
    // Nothing on the felt learned a face it did not know: every texture the fan shows was
    // already on the screen before the shuffle, and none of the fan's cards is a front.
    expect(document.querySelectorAll('[data-zone="draw"] [data-face="front"]')).toHaveLength(0)
  })

  // What `data-back='own'` is worth, read off the sheet rather than assumed: the weave is what a
  // fanned card wears unless that attribute is on it. The two cases below are about which of the
  // two a public pile gets, so the attribute has to mean something first (#445).
  it("wears the built-in weave wherever a fanned card does not say it carries a deck's own back", () => {
    const weave = /\.byd-card\[data-face='back'\][^{]*\{[^}]*\}/.exec(tableCss)?.[0]
    expect(weave, 'the striped weave is declared in table.css').toBeDefined()
    expect(weave).toContain('.byd-pile .byd-pile-fan-card')
    expect(weave).toMatch(/background:\s*repeating-linear-gradient/)
    const own = /\.byd-card\[data-back='own'\][^{]*\{[^}]*\}/.exec(tableCss)?.[0]
    expect(own, "the rule that takes the weave off a card wearing its deck's own back").toBeDefined()
    expect(own).toContain(".byd-pile .byd-pile-fan-card[data-back='own']")
    expect(own).toMatch(/background:\s*none/)
  })

  // A public pile — the discard, and every pile ＋ Hög makes — hands its cards out as components
  // and says nothing on the zone about what it wears (K15). The fan used to read the zone alone,
  // found nothing there, and fell back on the weave that belongs to no deck (#445). The card is
  // on the wire the whole time; the fan reads it.
  it('a public pile fans the back its own top card wears, and not the built-in weave (#445)', () => {
    const { view, discard, draw } = twoPiles(false)
    const zone = view.zones.find((z) => z.id === 'discard')!
    // The case is a case only while the pile is public: `order` is the whole difference between
    // this pile and the draw pile, which was drawing its fan right all along.
    expect(zone.mode).toBe('order')
    expect(view.zones.find((z) => z.id === 'draw')!.mode).toBe('count')
    render(<TableRenderer view={view} mode="tv" scale={1} faces="http://faces.test" shuffles={[{ pile: 'discard', seq: 12 }, { pile: 'draw', seq: 13 }]} />)

    const top = document.querySelector('[data-zone="discard"] .byd-pile-top')!
    expect(top.getAttribute('data-face')).toBe('back')
    expect(top.querySelector('img')?.getAttribute('src') ?? null).toBe(faceUrl(`b-${discard}`))
    expect(fanOf('discard')).toHaveLength(4)
    for (const card of fanOf('discard')) {
      expect(card.getAttribute('data-face')).toBe('back')
      expect(card.getAttribute('data-back')).toBe('own')
      expect(card.querySelector('img')?.getAttribute('src') ?? null).toBe(faceUrl(`b-${discard}`))
    }

    // Each pile's fan wears its own pile's back, and the two are different cards': one back for
    // both piles would let a fan that read the wrong pile pass. The draw pile is untouched by
    // this — it reads the hash the zone carries, as it always did.
    expect(draw).not.toBe(discard)
    for (const card of fanOf('draw')) expect(card.querySelector('img')?.getAttribute('src') ?? null).toBe(faceUrl(`b-${draw}`))
  })

  // A pile whose top lies face-up is still a stack of cards seen from above while it is fanned:
  // what flies out of it is four backs. The component the fan reads has a front on it here — the
  // seat may see it — and the fan must go on wearing the other face (#445).
  it('fans backs over a public pile whose top lies face-up, and no front anywhere (#445)', () => {
    const { view, discard } = twoPiles(true)
    render(<TableRenderer view={view} mode="tv" scale={1} faces="http://faces.test" shuffles={[{ pile: 'discard', seq: 12 }]} />)

    const top = document.querySelector('[data-zone="discard"] .byd-pile-top')!
    expect(top.getAttribute('data-face')).toBe('front')
    expect(top.querySelector('img')?.getAttribute('src') ?? null).toBe(faceUrl(`f-${discard}`))
    expect(fanOf('discard')).toHaveLength(4)
    for (const card of fanOf('discard')) {
      expect(card.getAttribute('data-face')).toBe('back')
      expect(card.getAttribute('data-back')).toBe('own')
      expect(card.querySelector('img')?.getAttribute('src') ?? null).toBe(faceUrl(`b-${discard}`))
    }
    // And no front reached the fan at all, neither as a mark nor as a texture: the front hash of
    // every card the deck has is absent from what the fan drew.
    const fan = document.querySelector('[data-zone="discard"] .byd-pile-fan')!
    expect(fan.querySelectorAll('[data-face="front"]')).toHaveLength(0)
    for (const c of view.components) if (c.faces?.['front']) expect(fan.innerHTML).not.toContain(c.faces['front'])
  })

  it('does not fan a pile that is being dragged', () => {
    const { view } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="table" scale={1} onAct={onAct} shuffles={[{ pile: 'draw', seq: 12 }]} />)
    const label = document.querySelector('[data-zone="draw"] .byd-pile-count')!
    fireEvent.pointerDown(label, { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerMove(label, { pointerId: 1, clientX: 140, clientY: 140 })
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-dragging')).toBe('true')
    expect(fanOf('draw')).toHaveLength(0)
  })
})

describe('under prefers-reduced-motion the motion is off, and a pulse is what is left (L35)', () => {
  it('marks the pile as pulsing and fans nothing', () => {
    askedForStillness(true)
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} shuffles={[{ pile: 'draw', seq: 12 }]} />)
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-shuffling')).toBe('pulse')
    expect(document.querySelectorAll('.byd-pile-fan-card')).toHaveLength(0)
  })

  it('holds the pulse for 420 ms and not for the fan\'s 560', () => {
    askedForStillness(true)
    vi.useFakeTimers()
    const { before, after } = shuffled()
    const { result, rerender } = renderHook(({ activity }) => useShuffles(activity, true), { initialProps: { activity: before } })
    rerender({ activity: after })
    expect(result.current).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(SHUFFLE_PULSE_MS - 1)
    })
    expect(result.current).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toEqual([])
  })
})

// The stylesheet, read as a text: what the fan is allowed to be written in is a fact about the
// source, and a browser would only show one screen's worth of it.
describe('how the fan is written (L35)', () => {
  // One `@keyframes` block, by name, braces balanced.
  const keyframes = (name: string): string => {
    const at = tableCss.indexOf(`@keyframes ${name}`)
    expect(at, `@keyframes ${name} is declared in table.css`).toBeGreaterThan(-1)
    let depth = 0
    for (let i = tableCss.indexOf('{', at); i < tableCss.length; i++) {
      if (tableCss[i] === '{') depth++
      if (tableCss[i] === '}' && --depth === 0) return tableCss.slice(at, i + 1)
    }
    throw new Error(`@keyframes ${name} never closes`)
  }
  const declarations = (block: string): string[] => Array.from(block.matchAll(/([a-z-]+)\s*:/g), (m) => m[1]!)

  it('moves the fanned backs by transform alone, so the compositor plays it and nothing is laid out again', () => {
    const fan = keyframes('byd-pile-fan')
    const props = new Set(declarations(fan))
    for (const prop of props) expect(['transform', 'opacity'], `${prop} in @keyframes byd-pile-fan`).toContain(prop)
    expect(props.has('transform')).toBe(true)
  })

  it("measures the fan in the card's own width and turn, never in pixels", () => {
    const fan = keyframes('byd-pile-fan')
    expect(fan).not.toMatch(/\d\s*px/)
    // The four reaches are handed to the sheet by the renderer, in per cent of the card's width
    // and in degrees; the sheet reads them and adds no distance of its own.
    expect(fan).toContain('var(--fan-out)')
    expect(fan).toContain('var(--fan-turn)')
    // The fan card's own rule: its box is the card's (shared with the top, above) and its shadow
    // is a card's shadow; what this reads is the motion, which names a time and no distance.
    const rule = /^\.byd-pile \.byd-pile-fan-card\s*\{[^}]*\}/m.exec(tableCss)?.[0]
    expect(rule, '.byd-pile .byd-pile-fan-card is styled in table.css').toBeDefined()
    const motion = /animation:([^;]*);/.exec(rule!)?.[1]
    expect(motion).toMatch(/\bbyd-pile-fan\b/)
    expect(motion).toMatch(/\b560ms\b/)
    expect(motion).not.toMatch(/px/)
  })

  it('turns the fan off under prefers-reduced-motion and leaves a 420 ms amber pulse on the pile', () => {
    const at = tableCss.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(at).toBeGreaterThan(-1)
    const reduced = tableCss.slice(at)
    expect(reduced).toMatch(/\.byd-pile-fan-card\s*\{[^}]*animation:\s*none/)
    const pulseRule = /\.byd-pile\[data-shuffling='pulse'\] \.byd-pile-top::after\s*\{[^}]*\}/.exec(reduced)?.[0]
    expect(pulseRule, 'the pulse is declared under the reduced-motion query').toBeDefined()
    expect(pulseRule).toMatch(/animation:[^;]*byd-pile-pulse[^;]*\b420ms\b/)
    // In the felt's own amber, the one already read at three metres on a chip.
    expect(pulseRule).toContain('var(--byd-felt-accent)')
    // The reduced-motion rule in `a11y.css` cuts every animation to 0.01 ms with `!important`;
    // the pulse is the one thing that stays, and it says so in the same voice.
    expect(pulseRule).toMatch(/animation-duration:\s*420ms\s*!important/)
    const pulse = keyframes('byd-pile-pulse')
    for (const prop of new Set(declarations(pulse))) expect(['box-shadow', 'opacity'], `${prop} in @keyframes byd-pile-pulse`).toContain(prop)
  })
})

// The screens that see the pile, each on a real table: the line arrives over the wire, and the
// fan is what it looks like. The wire itself is unchanged by this — `wire.test.ts` in the server
// already proves on raw frames what a shuffle sends and what it never does — so what is asked
// here is only that the screen plays the line it was already being sent.
describe('the screens that see the pile play the shuffle (L35)', () => {
  let run: Running
  beforeEach(async () => {
    run = await startServer()
  })
  afterEach(async () => {
    await run.stop()
  })

  it('the TV fans the pile the host shuffled, once, and only then', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(roomOf(id).code)
    expect(document.querySelector('[data-shuffling]')).toBeNull()

    const host = TableClient.connect(await asTable(run, id))
    await host.ready()
    await host.send({ v: 'shuffle', pile: 'draw' })
    await waitFor(() => expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-shuffling')).toBe('fan'))
    expect(document.querySelectorAll('[data-zone="draw"] .byd-pile-fan-card')).toHaveLength(4)
    expect(document.querySelector('[data-zone="discard"]')!.hasAttribute('data-shuffling')).toBe(false)
    await waitFor(() => expect(document.querySelector('[data-shuffling]')).toBeNull(), { timeout: SHUFFLE_MS + 500 })
    host.close()
  })

  it('a TV that joins after the shuffle is told about it in words and fans nothing', async () => {
    const id = await createSession(run)
    const host = TableClient.connect(await asTable(run, id))
    await host.ready()
    await host.send({ v: 'shuffle', pile: 'draw' })
    host.close()

    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(/blandade Draghög/)
    expect(document.querySelector('[data-shuffling]')).toBeNull()
    expect(document.querySelectorAll('.byd-pile-fan-card')).toHaveLength(0)
  })

  it("the observer's screen fans it too", async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await waitFor(() => expect(document.querySelector('[data-zone="draw"]')).not.toBeNull())
    const host = TableClient.connect(await asTable(run, id))
    await host.ready()
    await host.send({ v: 'shuffle', pile: 'draw' })
    await waitFor(() => expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-shuffling')).toBe('fan'))
    host.close()
  })

  it("the phone's felt fans it, including for the player who asked for it", async () => {
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
    render(<OnlinePage />)
    await waitFor(() => expect(document.querySelector('[data-zone="draw"]')).not.toBeNull())
    const host = TableClient.connect(await asTable(run, id))
    await host.ready()
    await host.send({ v: 'shuffle', pile: 'draw' })
    await waitFor(() => expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-shuffling')).toBe('fan'))
    host.close()
  })
})
