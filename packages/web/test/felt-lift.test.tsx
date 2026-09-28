// @vitest-environment jsdom
// Att läsa ett kort på filten (K26, #509): första trycket, klicket eller hovern lyfter kortet upp
// bredvid sig självt i golvets storlek, och ringen står bakom ett andra tryck. Bordslägets filt och
// distansvyns filt är samma renderare i `mode="table"`; TV:n läser genom INSPEKTION (K8, #508) och
// rörs inte här.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { liftBox } from '../src/table/lift.js'
import { forgetFits } from '../src/table/smallest.js'
import { buildScene } from './scene.js'
import { DEFAULT_BODY_PT, SCREENS, textPxOnCard } from './legibility.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const at = (x: number, y: number, pointerType = 'mouse') => ({ clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType })
const tap = (el: Element, x = 200, y = 200, pointerType = 'mouse') => {
  fireEvent.pointerDown(el, at(x, y, pointerType))
  fireEvent.pointerUp(el, at(x, y, pointerType))
}
const lifted = () => document.querySelector('[data-lift]')
const ring = () => document.querySelector('[data-radial]')

function felt(onAct: (i: unknown) => void = () => undefined) {
  const scene = buildScene()
  const r = render(<TableRenderer view={scene.view(null)} mode="table" scale={1} onAct={onAct} />)
  const card = (id: string) => document.querySelector(`[data-component="${id}"]`)!
  return { ...scene, ...r, card }
}

describe('where the lifted card goes and how big it is (K26, #509)', () => {
  // Skrivbordets skärmar som bordsläget mäts vid, och en platta som ligger ner.
  const windows = [
    { w: 1024, h: 768 },
    { w: 1280, h: 800 },
    { w: 1440, h: 900 },
    { w: 1920, h: 1080 },
  ]
  const leftCard = { left: 120, right: 170, top: 300, bottom: 370 }

  for (const win of windows) {
    it(`reads the wizard's body text at the desk floor or above at ${win.w} × ${win.h}`, () => {
      const box = liftBox(leftCard, win)
      const body = textPxOnCard(DEFAULT_BODY_PT, box.w)
      expect({ at: `${win.w} × ${win.h}`, body: Math.round(body * 10) / 10, reads: body >= SCREENS.desk.bodyPx.min }).toMatchObject({ reads: true })
    })

    it(`stays whole inside the window at ${win.w} × ${win.h}, wherever the card lies`, () => {
      for (const card of [leftCard, { left: win.w - 60, right: win.w - 10, top: 5, bottom: 75 }, { left: win.w / 2 - 25, right: win.w / 2 + 25, top: win.h - 80, bottom: win.h - 10 }]) {
        const box = liftBox(card, win)
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.top).toBeGreaterThanOrEqual(0)
        expect(box.left + box.w).toBeLessThanOrEqual(win.w)
        expect(box.top + box.h).toBeLessThanOrEqual(win.h)
      }
    })
  }

  // A card whose smallest text is under 8.5 pt (#523): the lift grows until that text reaches the
  // desk's floor for all text, as far as the window's height lets it, and never shrinks below the
  // size it has for the wizard's own frame.
  for (const win of windows) {
    // 5.5 pt: the desk's own lift already carries anything from 6.3 pt up.
    it(`grows for a card with 5.5 pt text until it reaches the desk floor at ${win.w} × ${win.h}, or the window`, () => {
      const plain = liftBox(leftCard, win)
      const box = liftBox(leftCard, win, 5.5)
      const px = textPxOnCard(5.5, box.w)
      const room = box.h >= win.h - 2 * 16 - 0.5
      expect({ at: `${win.w} × ${win.h}`, grew: box.w >= plain.w, reads: px >= SCREENS.desk.floorPx - 0.05 || room }).toEqual({ at: `${win.w} × ${win.h}`, grew: true, reads: true })
      expect(box.top + box.h).toBeLessThanOrEqual(win.h)
    })
  }

  it('really grows where the plain lift would leave 5.5 pt under the floor', () => {
    const win = { w: 1024, h: 768 }
    expect(textPxOnCard(5.5, liftBox(leftCard, win).w)).toBeLessThan(SCREENS.desk.floorPx)
    expect(liftBox(leftCard, win, 5.5).w).toBeGreaterThan(liftBox(leftCard, win).w)
  })

  it('does not change for a card whose smallest text is already read at its size', () => {
    const win = { w: 1280, h: 800 }
    expect(liftBox(leftCard, win, 9)).toEqual(liftBox(leftCard, win))
    expect(liftBox(leftCard, win, null)).toEqual(liftBox(leftCard, win))
  })

  it('keeps the card of a playing card, 63 by 88', () => {
    const box = liftBox(leftCard, { w: 1280, h: 800 })
    expect(box.w / box.h).toBeCloseTo(63 / 88, 3)
  })

  it('lies beside the card it lifts, on the side with room, and never over it', () => {
    const win = { w: 1280, h: 800 }
    const right = liftBox(leftCard, win)
    expect(right.left).toBeGreaterThan(leftCard.right)
    const onRight = { left: 1100, right: 1150, top: 300, bottom: 370 }
    const left = liftBox(onRight, win)
    expect(left.left + left.w).toBeLessThan(onRight.left)
  })

  it('stands level with the card it lifts where the window lets it', () => {
    const win = { w: 1280, h: 800 }
    const box = liftBox(leftCard, win)
    expect(box.top + box.h / 2).toBeCloseTo((leftCard.top + leftCard.bottom) / 2, 0)
  })
})

describe('the first press reads, the second asks (K26, #509)', () => {
  // The ring's verbs are not drawn over the text being read: the second press is a question, and
  // the card is put down when it is asked.
  it('a click on a face-up card lifts it and opens no ring; a second click puts it down and opens the ring', () => {
    const { card, faceUp } = felt()
    tap(card(faceUp))
    expect(lifted()?.getAttribute('data-lift')).toBe(faceUp)
    expect(ring()).toBeNull()
    tap(card(faceUp))
    expect(ring()?.getAttribute('data-radial')).toBe(faceUp)
    expect(lifted()).toBeNull()
  })

  it('a click on the lifted card opens the ring around the card it lifts, not around the lift', () => {
    const { card, faceUp } = felt()
    const el = card(faceUp)
    el.getBoundingClientRect = () => ({ left: 300, right: 350, top: 380, bottom: 450, x: 300, y: 380, width: 50, height: 70, toJSON: () => ({}) })
    tap(el, 320, 400)
    const look = lifted()!
    fireEvent.pointerDown(look, at(700, 300))
    fireEvent.click(look, at(700, 300))
    const opened = ring() as HTMLElement
    expect(opened.getAttribute('data-radial')).toBe(faceUp)
    expect({ x: opened.style.left, y: opened.style.top }).toEqual({ x: '325px', y: '415px' })
    expect(lifted()).toBeNull()
  })

  it('a click the browser makes of the tap that lifted the card does not ask anything', () => {
    const { card, faceUp } = felt()
    tap(card(faceUp))
    // A pointer's click, as the browser makes it of a tap: `detail` 1. The keyboard's is 0.
    fireEvent.click(lifted()!, { ...at(700, 300), detail: 1 })
    expect(ring()).toBeNull()
    expect(lifted()).not.toBeNull()
  })

  it('a face-down card has nothing to read, so a click still opens the ring', () => {
    const { card, faceDown } = felt()
    tap(card(faceDown))
    expect(lifted()).toBeNull()
    expect(ring()?.getAttribute('data-radial')).toBe(faceDown)
  })

  it('a hold reads as well, which is what K8 always said a hold did', () => {
    vi.useFakeTimers()
    const { card, faceUp } = felt()
    fireEvent.pointerDown(card(faceUp), at(200, 200, 'touch'))
    act(() => vi.advanceTimersByTime(400))
    expect(lifted()?.getAttribute('data-lift')).toBe(faceUp)
    expect(ring()).toBeNull()
    vi.useRealTimers()
  })

  it('a tap with a finger reads the same way a click does', () => {
    const { card, faceUp } = felt()
    fireEvent.pointerEnter(card(faceUp), at(200, 200, 'touch'))
    tap(card(faceUp), 200, 200, 'touch')
    expect(lifted()?.getAttribute('data-lift')).toBe(faceUp)
    expect(ring()).toBeNull()
  })

  const scene = () => buildScene()
  it('reads the face-up top of a public pile, and the second press opens the pile’s own ring', () => {
    felt()
    const top = document.querySelector('.byd-pile[data-zone="discard"] .byd-pile-top')!
    tap(top)
    expect(lifted()?.getAttribute('data-lift')).toBe(scene().state.zones['discard']!.order[0])
    expect(ring()).toBeNull()
    tap(top)
    expect(ring()?.getAttribute('data-radial')).toBe('discard')
  })

  it('a card that is being read is put down by a press on the bare felt, and by Escape', () => {
    const { card, faceUp } = felt()
    tap(card(faceUp))
    fireEvent.pointerDown(document.querySelector('[data-table]')!, at(20, 20))
    expect(lifted()).toBeNull()
    tap(card(faceUp))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(lifted()).toBeNull()
  })

  it('a press on another card moves the lift to it, and opens no ring', () => {
    const { card, faceUp, state } = felt()
    tap(card(faceUp))
    tap(document.querySelector('.byd-pile[data-zone="discard"] .byd-pile-top')!)
    expect(lifted()?.getAttribute('data-lift')).toBe(state.zones['discard']!.order[0])
    expect(ring()).toBeNull()
  })
})

describe('pointing reads, and a drag does not (K26, #509)', () => {
  it('a mouse resting on a face-up card lifts it, and leaving puts it down', () => {
    const { card, faceUp } = felt()
    fireEvent.pointerEnter(card(faceUp), at(200, 200))
    expect(lifted()?.getAttribute('data-lift')).toBe(faceUp)
    fireEvent.pointerLeave(card(faceUp), at(20, 20))
    expect(lifted()).toBeNull()
  })

  it('a card clicked stays lifted when the mouse moves on', () => {
    const { card, faceUp } = felt()
    fireEvent.pointerEnter(card(faceUp), at(200, 200))
    tap(card(faceUp))
    fireEvent.pointerLeave(card(faceUp), at(20, 20))
    expect(lifted()?.getAttribute('data-lift')).toBe(faceUp)
    expect(ring()).toBeNull()
  })

  it('a drag puts the lift away as it starts, and the card let go is not lifted after it', () => {
    const onAct = vi.fn()
    const { card, faceUp } = felt(onAct)
    fireEvent.pointerEnter(card(faceUp), at(200, 200))
    expect(lifted()).not.toBeNull()
    fireEvent.pointerDown(card(faceUp), at(200, 200))
    fireEvent.pointerMove(card(faceUp), at(320, 260))
    expect(lifted()).toBeNull()
    fireEvent.pointerUp(card(faceUp), at(320, 260))
    expect(onAct).toHaveBeenCalled()
    expect(lifted()).toBeNull()
    expect(ring()).toBeNull()
  })

  // The browser tells the card under a pointer that has not moved that the pointer entered it,
  // when the drag's capture is let go. That is the card just put down, not a card pointed at.
  it('the card let go is not read by the enter the release brings, only once the pointer moves on', () => {
    const { card, faceUp } = felt()
    fireEvent.pointerDown(card(faceUp), at(200, 200))
    fireEvent.pointerMove(card(faceUp), at(320, 260))
    fireEvent.pointerUp(card(faceUp), at(320, 260))
    fireEvent.pointerEnter(card(faceUp), at(320, 260))
    expect(lifted()).toBeNull()
    fireEvent.pointerLeave(card(faceUp), at(500, 500))
    fireEvent.pointerMove(document.querySelector('[data-table]')!, at(500, 500))
    fireEvent.pointerEnter(card(faceUp), at(330, 270))
    expect(lifted()?.getAttribute('data-lift')).toBe(faceUp)
  })

  it('the TV is left to its own inspection: a click there still opens the ring', () => {
    const scene = buildScene()
    render(<TableRenderer view={scene.view(null)} mode="tv" scale={1} onAct={() => undefined} />)
    tap(document.querySelector(`[data-component="${scene.faceUp}"]`)!)
    expect(lifted()).toBeNull()
    expect(ring()).not.toBeNull()
  })
})

describe('«Titta» on the felt holds the card up the same way (K8, K26)', () => {
  it('shows a face-down card lifted as its back, in the window’s size and not in fixed pixels', () => {
    const { card, faceDown } = felt()
    tap(card(faceDown))
    fireEvent.click(screen.getByRole('button', { name: 'Titta' }))
    const look = lifted()!
    expect(look.getAttribute('data-lift')).toBe(faceDown)
    expect(look.getAttribute('data-face')).toBe('back')
    expect(document.querySelector('.byd-inspect')).toBeNull()
  })
})

// A screen that watches (C8, #511, beslut A): the observer sees every hand and touches nothing. The
// same gesture reads there — a resting mouse or a press lifts the card beside itself — but nothing
// asks, because there is nothing she may do; and a card in a hand reads like any other, since
// seeing the hands is the whole of her role.
describe('the observer reads with the same lift, and asks nothing (C8, K26, #511)', () => {
  // Ada's own view carries her hand's faces, the way the observer's carries every hand's.
  const watching = () => {
    const scene = buildScene()
    const view = scene.view('A')
    render(<TableRenderer view={view} mode="tv" scale={1} watch />)
    const hand = view.components.filter((c) => c.zone === 'hand:A' && c.cardRef !== null)
    const el = (id: string) => document.querySelector(`[data-component="${id}"]`)!
    return { ...scene, hand, el }
  }

  it('lifts a card in a hand while the mouse rests on it, and puts it down when the mouse leaves', () => {
    const { hand, el } = watching()
    const card = hand[0]!.id
    fireEvent.pointerEnter(el(card), at(200, 200))
    expect(lifted()?.getAttribute('data-lift')).toBe(card)
    fireEvent.pointerLeave(el(card), at(20, 20))
    expect(lifted()).toBeNull()
  })

  it('keeps a pressed card lifted, never opens a ring, and puts it down on Escape', () => {
    const { faceUp, el } = watching()
    tap(el(faceUp))
    expect(lifted()?.getAttribute('data-lift')).toBe(faceUp)
    tap(el(faceUp))
    expect(ring()).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(lifted()).toBeNull()
  })

  it('reads a card in a hand with a finger as well', () => {
    const { hand, el } = watching()
    tap(el(hand[1]!.id), 200, 200, 'touch')
    expect(lifted()?.getAttribute('data-lift')).toBe(hand[1]!.id)
  })

  it('has nothing to read on a face-down card, and still opens nothing', () => {
    const { faceDown, el } = watching()
    tap(el(faceDown))
    fireEvent.pointerEnter(el(faceDown), at(200, 200))
    expect(lifted()).toBeNull()
    expect(ring()).toBeNull()
  })

  it('leaves a screen that does not watch as it was: the TV lifts nothing on a hover', () => {
    const scene = buildScene()
    render(<TableRenderer view={scene.view('A')} mode="tv" scale={1} />)
    fireEvent.pointerEnter(document.querySelector(`[data-component="${scene.faceUp}"]`)!, at(200, 200))
    expect(lifted()).toBeNull()
  })
})

// The felt asks what the lifted card's smallest text was fitted to (#523), and lifts it larger when
// its words need it: the same box `liftBox` gives for that size, on the page and not only on paper.
describe('a lifted card with small words is lifted larger (#523)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    forgetFits()
  })

  it('draws the lift at the size the card’s own smallest text needs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ smallestPt: 5.5 }), { status: 200 })))
    const scene = buildScene()
    const view = scene.view(null)
    const withFaces = { ...view, components: view.components.map((c) => (c.id === scene.faceUp ? { ...c, faces: { front: 'a'.repeat(64) } } : c)) }
    render(<TableRenderer view={withFaces} mode="table" scale={1} faces="http://faces.test" onAct={() => undefined} />)
    tap(document.querySelector(`[data-component="${scene.faceUp}"]`)!)
    await act(async () => undefined)
    const win = { w: window.innerWidth, h: window.innerHeight }
    const plain = liftBox({ left: 0, right: 0, top: 0, bottom: 0 }, win).w
    const grown = liftBox({ left: 0, right: 0, top: 0, bottom: 0 }, win, 5.5).w
    expect(grown).toBeGreaterThan(plain)
    expect(parseFloat((lifted() as HTMLElement).style.width)).toBeCloseTo(grown, 3)
  })
})
