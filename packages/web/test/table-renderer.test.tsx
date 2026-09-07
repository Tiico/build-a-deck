// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { TableRenderer, type TableHandle } from '../src/table/TableRenderer.js'
import { buildScene } from './scene.js'
import { activeBounds, cameraOf, frameRect, pad } from '../src/table/camera.js'

describe('TableRenderer', () => {
  it('places a face-up card by name at its position, and a face-down one as a back without a name', () => {
    const { view, faceUp, faceDown } = buildScene()
    const snapshot = view(null)
    render(<TableRenderer view={snapshot} mode="table" scale={2} />)

    const up = screen.getByText('wizard').closest('[data-component]')!
    expect(up.getAttribute('data-component')).toBe(faceUp)
    expect(up.getAttribute('data-face')).toBe('front')
    // table area starts at (-500, -300); the card lies at (100, 50) inside it; scale 2 → px
    expect((up as HTMLElement).style.left).toBe('200px')
    expect((up as HTMLElement).style.top).toBe('100px')

    const down = document.querySelector(`[data-component="${faceDown}"]`)!
    expect(down.getAttribute('data-face')).toBe('back')
    expect(down.textContent).toBe('')
  })
})

describe('piles', () => {
  it('draws each pile with its count, and the top card of a public pile by name', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    render(<TableRenderer view={snapshot} mode="table" />)

    const draw = document.querySelector('[data-zone="draw"]')!
    expect(draw.getAttribute('data-count')).toBe('3')
    expect(draw.textContent).not.toMatch(/dragon|knight|wizard|rogue|priest|archer|golem|witch|bard|ogre/)

    const discard = snapshot.zones.find((z) => z.id === 'discard')!
    const topRef = snapshot.components.find((c) => discard.mode === 'order' && c.id === discard.order[0])!.cardRef
    const el = document.querySelector('[data-zone="discard"]')!
    expect(el.getAttribute('data-count')).toBe('3')
    expect(el.textContent).toContain(topRef)
  })
})

describe('the top of a hidden pile (K15)', () => {
  it('a hidden pile whose top lies face-up shows that card by name; the ring flips the top by naming the pile', () => {
    vi.useFakeTimers()
    const { view, flipDrawTop } = buildScene()
    const onAct = vi.fn()
    const { rerender } = render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const top = document.querySelector('[data-zone="draw"] .byd-pile-top')!
    expect(top.getAttribute('data-face')).toBe('back')
    fireEvent.pointerDown(top, client(-200, 0))
    act(() => vi.advanceTimersByTime(400))
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Vänd översta' }), client(-200, -60))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'flip', component: { top: 'draw' }, face: 'front' }])

    const flipped = flipDrawTop()
    rerender(<TableRenderer view={flipped} mode="tv" scale={1} onAct={onAct} />)
    const shown = document.querySelector('[data-zone="draw"] .byd-pile-top')!
    expect(shown.getAttribute('data-face')).toBe('front')
    expect(shown.textContent).toBe('witch')
    fireEvent.pointerDown(shown, client(-200, 0))
    act(() => vi.advanceTimersByTime(400))
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Vänd översta' }), client(-200, -60))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'flip', component: { top: 'draw' }, face: 'back' }])
    vi.useRealTimers()
  })
})

describe('the camera (C5)', () => {
  it('in TV mode frames what is in play, padded, at the frame\'s aspect: the table is laid out under that camera', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    const size = { w: 1000, h: 500 }
    render(<TableRenderer view={snapshot} mode="tv" camera size={size} glideMs={0} />)

    const floor = snapshot.zones.find((z) => z.id === snapshot.floor)!.geometry
    const cam = frameRect(pad(activeBounds(snapshot)!, 60), size, floor, 520)
    const { scale, left, top } = cameraOf(cam, size, floor)
    expect(scale).toBeGreaterThan(1)
    const frame = document.querySelector('.byd-table-frame')!
    expect(frame.getAttribute('data-camera')).toBe('follow')
    const world = document.querySelector('.byd-camera-world') as HTMLElement
    expect(world.style.left).toBe(`${left}px`)
    expect(world.style.top).toBe(`${top}px`)
    const table = document.querySelector('[data-table]') as HTMLElement
    expect(table.style.width).toBe(`${floor.w * scale}px`)
  })

  it('a scroll zooms around the pointer for a moment, a double tap goes close and back, and the camera returns by itself', () => {
    vi.useFakeTimers()
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    render(<TableRenderer view={view(null)} mode="tv" camera size={size} glideMs={0} />)
    const frame = document.querySelector('.byd-table-frame')!
    const table = document.querySelector('[data-table]') as HTMLElement
    const following = table.style.width

    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
    const zoomed = parseFloat(table.style.width)
    expect(zoomed).toBeGreaterThan(parseFloat(following))
    act(() => vi.advanceTimersByTime(5900))
    expect(table.style.width).toBe(`${zoomed}px`)
    act(() => vi.advanceTimersByTime(200))
    expect(table.style.width).toBe(following)

    fireEvent.doubleClick(frame, { clientX: 500, clientY: 250 })
    expect(parseFloat(table.style.width)).toBeGreaterThan(parseFloat(following))
    fireEvent.doubleClick(frame, { clientX: 500, clientY: 250 })
    expect(table.style.width).toBe(following)
    vi.useRealTimers()
  })
})

describe('hands', () => {
  it('shows each hand as a count, oriented toward its edge in table mode', () => {
    const { view } = buildScene()
    const { unmount } = render(<TableRenderer view={view(null)} mode="table" />)
    const a = document.querySelector('[data-zone="hand:A"]')!
    expect(a.getAttribute('data-count')).toBe('2')
    expect(a.textContent).toBe('2')
    expect(a.textContent).not.toMatch(/dragon|knight/)
    // hand:A sits below the table centre, hand:B above: they face opposite ways
    expect(a.getAttribute('data-rot')).toBe('0')
    const b = document.querySelector('[data-zone="hand:B"]')!
    expect(b.getAttribute('data-count')).toBe('0')
    expect(b.getAttribute('data-rot')).toBe('180')
    unmount()

    render(<TableRenderer view={view(null)} mode="tv" />)
    expect(document.querySelector('[data-zone="hand:B"]')!.getAttribute('data-rot')).toBe('0')
  })
})

describe('dynamic piles', () => {
  it('marks a pile formed during play as dynamic and labels only setup piles by name', () => {
    const scene = buildScene()
    // Stack the face-down card onto the face-up one: an ad hoc pile forms where the lower card lay.
    render(<TableRenderer view={scene.viewAfterStack()} mode="table" />)
    const dynamic = document.querySelector('[data-zone][data-dynamic="true"]')!
    expect(dynamic.getAttribute('data-count')).toBe('2')
    expect(dynamic.textContent).not.toContain('Spelyta')
    const draw = document.querySelector('[data-zone="draw"]')!
    expect(draw.getAttribute('data-dynamic')).toBe('false')
    expect(draw.textContent).toContain('Draghög')
  })
})

// In tv mode at scale 1 with jsdom's zero-sized boxes, client pixels are table millimetres
// offset by the floor's origin (-500, -300): a card at absolute (-400, -250) sits at client (100, 50).
const client = (mmX: number, mmY: number) => ({ clientX: mmX + 500, clientY: mmY + 300, pointerId: 1, isPrimary: true, button: 0 })

describe('direct manipulation (K1, K2, C)', () => {
  it('dragging a loose card onto another sends a stack; dropping it on the floor sends a move', () => {
    const { view, faceUp, faceDown } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card, client(-390, -240))
    fireEvent.pointerMove(card, client(-190, -90))
    fireEvent.pointerUp(card, client(-190, -90))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'stack', component: faceUp, onto: faceDown }])

    fireEvent.pointerDown(card, client(-390, -240))
    fireEvent.pointerMove(card, client(-340, -140))
    fireEvent.pointerUp(card, client(-340, -140))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'move', component: faceUp, to: 'table', x: 150, y: 150 }])
  })

  it('a card follows the pointer while it is dragged, lifted above the rest', () => {
    const { view, faceUp } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={() => undefined} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`) as HTMLElement
    fireEvent.pointerDown(card, client(-390, -240))
    fireEvent.pointerMove(card, client(-290, -140))
    expect(card.style.left).toBe('200px')
    expect(card.style.top).toBe('150px')
    expect(card.getAttribute('data-dragging')).toBe('true')
  })

  it('a hold opens a ring of verbs around the finger; releasing on one sends it', () => {
    vi.useFakeTimers()
    const { view, faceUp } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card, client(-390, -240))
    expect(document.querySelector('[data-radial]')).toBeNull()
    act(() => vi.advanceTimersByTime(400))
    const ring = document.querySelector('[data-radial]')!
    expect(ring.getAttribute('data-radial')).toBe(faceUp)
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Vänd' }), client(-390, -300))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'flip', component: faceUp, face: 'back' }])
    expect(document.querySelector('[data-radial]')).toBeNull()
    vi.useRealTimers()
  })

  it('a hold on a pile offers shuffle and split; the pile label drags the whole pile', () => {
    vi.useFakeTimers()
    const { view } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const top = document.querySelector('[data-zone="discard"] .byd-pile-top')!
    fireEvent.pointerDown(top, client(200, 0))
    act(() => vi.advanceTimersByTime(400))
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Blanda' }), client(200, -60))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'shuffle', pile: 'discard' }])
    vi.useRealTimers()

    const label = document.querySelector('[data-zone="discard"] .byd-pile-count')!
    fireEvent.pointerDown(label, client(200, 50))
    fireEvent.pointerMove(label, client(300, 150))
    fireEvent.pointerUp(label, client(300, 150))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'movePile', pile: 'discard', to: 'table', x: 300, y: 100 }])
  })

  it('dragging the top card off a pile drops it where it is released', () => {
    const { view } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const top = document.querySelector('[data-zone="draw"] .byd-pile-top')!
    fireEvent.pointerDown(top, client(-200, 0))
    fireEvent.pointerMove(top, client(-100, 100))
    fireEvent.pointerUp(top, client(-100, 100))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'split', pile: 'draw', at: 1, x: -100, y: 100 }])
  })

  it('without onAct the table only shows: nothing moves and no ring opens', () => {
    vi.useFakeTimers()
    const { view, faceUp } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`) as HTMLElement
    fireEvent.pointerDown(card, client(-390, -240))
    act(() => vi.advanceTimersByTime(400))
    expect(document.querySelector('[data-radial]')).toBeNull()
    fireEvent.pointerMove(card, client(-290, -140))
    expect(card.getAttribute('data-dragging')).toBeNull()
    vi.useRealTimers()
  })
})

describe('inspection (K8)', () => {
  it('"Titta" in the ring shows the card enlarged until tapped away; a hidden card enlarges as a back', () => {
    vi.useFakeTimers()
    const { view, faceUp, faceDown } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={() => undefined} />)
    expect(document.querySelector('[data-inspect]')).toBeNull()

    fireEvent.pointerDown(document.querySelector(`[data-component="${faceUp}"]`)!, client(-390, -240))
    act(() => vi.advanceTimersByTime(400))
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Titta' }), client(-390, -300))
    const inspect = document.querySelector('[data-inspect]')!
    expect(inspect.getAttribute('data-inspect')).toBe(faceUp)
    expect(inspect.textContent).toContain('wizard')
    fireEvent.click(inspect.parentElement!)
    expect(document.querySelector('[data-inspect]')).toBeNull()

    fireEvent.pointerDown(document.querySelector(`[data-component="${faceDown}"]`)!, client(-190, -90))
    act(() => vi.advanceTimersByTime(400))
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Titta' }), client(-190, -150))
    expect(document.querySelector('[data-inspect]')!.getAttribute('data-face')).toBe('back')
    expect(document.querySelector('[data-inspect]')!.textContent).not.toMatch(/rogue/)
    vi.useRealTimers()
  })
})

describe('textures (TUNN-SKIVA §5)', () => {
  it('shows the face image when its hash is known, the back image when only that is, and a plain back otherwise', () => {
    const { view, faceUp, faceDown } = buildScene()
    const snapshot = view(null)
    const withFaces = {
      ...snapshot,
      components: snapshot.components.map((c) =>
        c.id === faceUp ? { ...c, faces: { front: 'a'.repeat(64), back: 'b'.repeat(64) } } : c.id === faceDown ? { ...c, faces: { back: 'b'.repeat(64) } } : c,
      ),
    }
    render(<TableRenderer view={withFaces} mode="table" faces="http://faces.test" />)
    const up = document.querySelector(`[data-component="${faceUp}"] img`) as HTMLImageElement
    expect(up.src).toBe(`http://faces.test/faces/${'a'.repeat(64)}`)
    const down = document.querySelector(`[data-component="${faceDown}"] img`) as HTMLImageElement
    expect(down.src).toBe(`http://faces.test/faces/${'b'.repeat(64)}`)
    const plain = document.querySelector('[data-zone="discard"] img')
    expect(plain).toBeNull()
  })
})

describe('textures that are not ready yet', () => {
  it('retries an image that failed to load, with a cache-busting query, a bounded number of times', () => {
    vi.useFakeTimers()
    const { view, faceUp } = buildScene()
    const snapshot = view(null)
    const withFaces = { ...snapshot, components: snapshot.components.map((c) => (c.id === faceUp ? { ...c, faces: { front: 'a'.repeat(64) } } : c)) }
    render(<TableRenderer view={withFaces} mode="table" faces="http://faces.test" />)
    const img = () => document.querySelector(`[data-component="${faceUp}"] img`) as HTMLImageElement
    const base = `http://faces.test/faces/${'a'.repeat(64)}`
    expect(img().src).toBe(base)

    fireEvent.error(img())
    expect(img().src).toBe(base)
    act(() => vi.advanceTimersByTime(1500))
    expect(img().src).toBe(`${base}?t=1`)

    fireEvent.error(img())
    act(() => vi.advanceTimersByTime(3000))
    expect(img().src).toBe(`${base}?t=2`)
    vi.useRealTimers()
  })

  it('waits behind a fallback that names a face-up card and never names a face-down one', () => {
    const { state, view, faceUp, faceDown } = buildScene()
    const snapshot = view(null)
    const withFaces = {
      ...snapshot,
      components: snapshot.components.map((c) =>
        c.id === faceUp ? { ...c, faces: { front: 'a'.repeat(64) } } : c.id === faceDown ? { ...c, faces: { back: 'b'.repeat(64) } } : c,
      ),
    }
    render(<TableRenderer view={withFaces} mode="table" faces="http://faces.test" />)

    const up = document.querySelector(`[data-component="${faceUp}"] [data-texture="pending"]`)!
    expect(up.textContent).toMatch(state.components[faceUp]!.cardRef)

    const down = document.querySelector(`[data-component="${faceDown}"] [data-texture="pending"]`)!
    expect(down.textContent).toMatch(/[Rr]enderas/)
    expect(down.textContent).not.toMatch(state.components[faceDown]!.cardRef)
  })
})

describe('presence (K6): the others on the table', () => {
  const peers = [
    { id: 'p1', seat: 'B', name: 'Bo', cursor: { x: -400, y: -250 }, drag: null },
    { id: 'p2', seat: null, name: 'bordet', cursor: null, drag: { component: 'cX', x: -200, y: -100 } },
  ]
  it('draws a dot with the name in the seat colour for each cursor, and a lifted ghost where someone carries a card', () => {
    const { view, faceDown } = buildScene()
    const withDrag = peers.map((p) => (p.drag ? { ...p, drag: { ...p.drag, component: faceDown } } : p))
    render(<TableRenderer view={view(null)} mode="tv" scale={1} peers={withDrag} />)
    const dot = document.querySelector('[data-cursor="p1"]') as HTMLElement
    expect(dot.textContent).toContain('Bo')
    expect(dot.style.left).toBe('100px')
    expect(dot.style.top).toBe('50px')
    const ghost = document.querySelector('[data-ghost-of="p2"]') as HTMLElement
    expect(ghost.getAttribute('data-component')).toBe(faceDown)
    expect(ghost.style.left).toBe('300px')
    expect(ghost.textContent).toContain('bordet')
    // The carried card is drawn where the other's hand is, not where the log has it.
    expect((document.querySelector(`[data-component="${faceDown}"]:not([data-ghost-of])`) as HTMLElement).getAttribute('data-carried')).toBe('true')
  })

  it('shows a pointing pulse where someone points, with their name', () => {
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} pulses={[{ id: 'p1', seat: 'B', name: 'Bo', x: 0, y: 0, at: Date.now() }]} />)
    const pulse = document.querySelector('[data-pulse]') as HTMLElement
    expect(pulse.textContent).toContain('Bo')
    expect(pulse.style.left).toBe('500px')
    expect(pulse.style.top).toBe('300px')
  })

  it('reports its own pointer, a carried card, a drop, and a point on the felt', () => {
    vi.useFakeTimers()
    const { view, faceUp } = buildScene()
    const onPresence = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={() => undefined} onPresence={onPresence} />)
    const table = document.querySelector('[data-table]')!
    fireEvent.pointerMove(table, client(0, 0))
    expect(onPresence).toHaveBeenLastCalledWith({ kind: 'cursor', x: 0, y: 0 })
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card, client(-390, -240))
    fireEvent.pointerMove(card, client(-290, -140))
    expect(onPresence).toHaveBeenLastCalledWith({ kind: 'drag', component: faceUp, x: -300, y: -150 })
    fireEvent.pointerUp(card, client(-290, -140))
    expect(onPresence).toHaveBeenLastCalledWith({ kind: 'drop' })
    fireEvent.pointerDown(table, client(0, 100))
    act(() => vi.advanceTimersByTime(500))
    expect(onPresence).toHaveBeenLastCalledWith({ kind: 'point', x: 0, y: 100 })
    fireEvent.pointerLeave(table)
    expect(onPresence).toHaveBeenLastCalledWith({ kind: 'away' })
    vi.useRealTimers()
  })

  it('a card that just moved carries the colour of who moved it', () => {
    const { view, faceUp } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} recent={[{ component: faceUp, seat: 'A', at: Date.now() }]} />)
    expect(document.querySelector(`[data-component="${faceUp}"]`)!.getAttribute('data-by')).toBe('A')
  })
})

describe('a rotated table (C5): my seat at the bottom', () => {
  it('rotates the table plane and maps pointers back, so a drag moves the card the way the finger went', () => {
    const { view, faceUp } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} rotate={180} onAct={onAct} />)
    expect(document.querySelector('[data-table]')!.getAttribute('data-rotate')).toBe('180')
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    // Screen (500,300) is the table's centre; moving the finger up-left on a table turned
    // around moves the card down-right in table coordinates.
    fireEvent.pointerDown(card, { clientX: 500, clientY: 300, pointerId: 1, isPrimary: true, button: 0 })
    fireEvent.pointerMove(card, { clientX: 450, clientY: 250, pointerId: 1 })
    fireEvent.pointerUp(card, { clientX: 450, clientY: 250, pointerId: 1 })
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'move', component: faceUp, to: 'table', x: 150, y: 100 }])
  })

  it('answers where a client point is on the table, for things dragged in from outside', () => {
    const { view } = buildScene()
    const ref = createRef<TableHandle>()
    render(<TableRenderer ref={ref} view={view(null)} mode="tv" scale={1} rotate={180} />)
    expect(ref.current?.toTable(500, 300)).toEqual({ x: 0, y: 0 })
    expect(ref.current?.toTable(600, 400)).toEqual({ x: -100, y: -100 })
  })
})

describe('what the screen is pointed at (C)', () => {
  it('reports the card under the pointer, and that there is none again when it leaves', () => {
    const { view, faceUp } = buildScene()
    const onInspect = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={2} onInspect={onInspect} />)

    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerEnter(card)
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ id: faceUp }))
    fireEvent.pointerLeave(card)
    expect(onInspect).toHaveBeenLastCalledWith(null)

    // The top of a pile is a card too: a face-up discard is worth looking at.
    const top = document.querySelector('[data-zone="discard"] .byd-pile-top')!
    fireEvent.pointerEnter(top)
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ zone: 'discard' }))
  })
})

describe('how a pile says what it is', () => {
  it('is a count badge with the name in caps beneath on the TV, and one pill on the felt', () => {
    const { view } = buildScene()
    const { unmount } = render(<TableRenderer view={view(null)} mode="tv" scale={1} />)
    const tv = document.querySelector('[data-zone="discard"]')!
    expect(tv.querySelector('.byd-pile-n')!.textContent).toBe('3')
    expect(tv.querySelector('.byd-pile-name')!.textContent).toBe('Kasthög')
    unmount()

    render(<TableRenderer view={view(null)} mode="table" scale={1} />)
    const felt = document.querySelector('[data-zone="discard"]')!
    expect(felt.querySelector('.byd-pile-n')!.textContent).toBe('3')
    expect(felt.querySelector('.byd-pile-name')!.textContent).toBe('Kasthög')
    // A pile that only exists because someone stacked two cards has no name to say (K1).
    expect(document.querySelector('[data-zone="draw"] .byd-pile-name')!.textContent).toBe('Draghög')
  })
})

describe('where a seat has its name (B)', () => {
  it('writes the name along that seat’s own edge and leaves the count on the fan', () => {
    const { view } = buildScene()
    const { unmount } = render(<TableRenderer view={view(null)} mode="table" scale={1} />)
    const ada = document.querySelector('[data-seat-name="A"]')!
    expect(ada.textContent).toBe('Ada')
    // A's hand lies along the bottom edge, B's along the top: each name turns toward its seat.
    expect(ada.getAttribute('data-edge')).toBe('S')
    expect(document.querySelector('[data-seat-name="B"]')!.getAttribute('data-edge')).toBe('N')
    expect(document.querySelector('[data-zone="hand:A"] .byd-hand-count')!.textContent).toBe('2')
    unmount()

    // On the TV the dock says who sits where; the felt does not repeat it.
    render(<TableRenderer view={view(null)} mode="tv" scale={1} />)
    expect(document.querySelector('[data-seat-name]')).toBeNull()
    expect(document.querySelector('[data-zone="hand:A"] .byd-hand-count')!.textContent).toBe('2')
  })
})
