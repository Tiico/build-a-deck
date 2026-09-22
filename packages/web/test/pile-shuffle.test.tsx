// @vitest-environment jsdom
// A shuffle is fanned on the pile it shuffled, played by the event and not by the state (L35,
// #326). The wire says nothing new for it: a `shuffle` line already reaches every screen that
// sees the pile, and the fan is what that line looks like on the felt.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { project, projectActivity } from '@byd/engine'
import type { Activity } from '@byd/protocol'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { SHUFFLE_MS, SHUFFLE_PULSE_MS, STILL, useShuffles } from '../src/table/shuffle.js'
import { TableClient } from '../src/client.js'
import { TablePage } from '../src/table/TablePage.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { buildScene, registry, tableOf } from './scene.js'
import { admit, asTable, createSession, roomOf, startServer, twoSeatSetup, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const tableCss = readFileSync(join(import.meta.dirname, '..', 'src/table/table.css'), 'utf8')

const FACES = 'http://faces.test'

// A deck that has been through the render farm: both faces of every card have a texture, and
// `project` hands each seat the hashes it may have — a face-down card's back among them (#313).
// The two tests about what the fan wears build their view this way rather than patching a hash
// onto a snapshot, because what failed was the step from the projection to the felt, and a
// snapshot made by hand is made in the shape of whatever the felt was already doing.
const hashOf = (cardRef: string, face: string): string => `${face}${cardRef}`.repeat(64).slice(0, 64)
const renderedDeck = () => ({
  faces: Object.fromEntries(twoSeatSetup().components.map((c) => [c.cardRef, { front: hashOf(c.cardRef, 'front'), back: hashOf(c.cardRef, 'back') }])),
})
const srcsFor = (face: string): string[] => twoSeatSetup().components.map((c) => `${FACES}/faces/${hashOf(c.cardRef, face)}`)
const backs = () => srcsFor('back')
const fronts = () => srcsFor('front')

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

  it('the fan on a public pile wears the back its own cards wear, and never the stand-in weave (#326)', () => {
    // A pile whose order everybody may see is projected as `order`, and such a zone carries no
    // back of its own: there is nothing for it to say about a stack whose cards are handed out
    // one by one, and a face-down one wears the back its own faces name (#14). Reading the fan's
    // back off the zone alone, as this did, left the hidden draw pile fanning the deck's back and
    // every other pile fanning the weave that belongs to no game (L17).
    const table = tableOf(twoSeatSetup())
    table.run(null, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
    const view = project(table.state(), registry, null, renderedDeck())
    render(<TableRenderer view={view} mode="tv" scale={1} faces={FACES} shuffles={[{ pile: 'discard', seq: 12 }]} />)

    const top = document.querySelector('[data-zone="discard"] .byd-pile-top')!
    expect(top.getAttribute('data-face')).toBe('back')
    const topSrc = top.querySelector('img')?.getAttribute('src') ?? null
    expect(backs(), 'the deck has backs to be worn at all').not.toHaveLength(0)
    expect(backs(), 'the pile draws one of the deck’s own backs before it is shuffled').toContain(topSrc)
    expect(fanOf('discard')).toHaveLength(4)
    for (const card of fanOf('discard')) expect(card.querySelector('img')?.getAttribute('src') ?? null).toBe(topSrc)
    expect(document.querySelectorAll('[data-zone="discard"] [data-face="front"]')).toHaveLength(0)
  })

  it('fans the deck’s own back over a public pile whose cards lie face-up, and no front (#326)', () => {
    // A discard everyone reads: its cards lie face-up and their fronts are on the screen. The fan
    // is still four backs — that is what a stack being shuffled shows — so it wears the back the
    // deck gives those very cards, which is public whichever way a card lies (#313), and no front
    // is drawn during the fan that the shuffle would be telling anybody about.
    const table = tableOf(twoSeatSetup())
    table.run(null, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
    for (const id of [...table.state().zones['discard']!.order]) table.run(null, { v: 'flip', component: id, face: 'front' })
    const view = project(table.state(), registry, null, renderedDeck())
    render(<TableRenderer view={view} mode="tv" scale={1} faces={FACES} shuffles={[{ pile: 'discard', seq: 12 }]} />)

    const top = document.querySelector('[data-zone="discard"] .byd-pile-top')!
    expect(top.getAttribute('data-face')).toBe('front')
    expect(fronts(), 'the pile shows one of the deck’s own fronts').toContain(top.querySelector('img')?.getAttribute('src') ?? null)
    expect(fanOf('discard')).toHaveLength(4)
    for (const card of fanOf('discard')) {
      expect(card.getAttribute('data-face')).toBe('back')
      expect(backs()).toContain(card.querySelector('img')?.getAttribute('src') ?? null)
    }
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
