// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import type { Intent, Snapshot } from '@byd/protocol'
import { TableRenderer, type FeltKeyboard, type TableHandle } from '../src/table/TableRenderer.js'
import { buildScene, tableOf } from './scene.js'
import { twoSeatSetup } from './fixture.js'
import { activeBounds, cameraOf, frameRect, overscanPx, pad, reachOf, union, type Rect } from '../src/table/camera.js'
import { feltScale, fitScale, TV_AIR_PX } from '../src/table/fit.js'
import { feltWithHands, handCountAt, handExtent, handRotation, type TableMode } from '../src/table/hand.js'
import { DEFAULT_TIMING } from '../src/status/connection.js'
import { RING_MARGIN } from '../src/table/ring.js'
import { CARD_MM } from '../src/table/drop.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Linjerna handarnas antalsbrickor hänger från, som en ruta (#413). Kameran ramar in spelet, och
// brickorna står utanför det vid kanten; det här är vad bilden måste hålla utöver spelet, och
// renderaren räknar fram det på precis det här sättet.
const countLines = (snapshot: Snapshot): Rect | null => {
  const floorZone = snapshot.zones.find((z) => z.id === snapshot.floor)!
  return union(snapshot.zones.filter((z) => z.kind === 'hand').map((z) => ({ ...handCountAt(z, floorZone, handRotation(z, floorZone, 'tv')), w: 0, h: 0 })))
}

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

// The felt writes the card's name beside its picture, so it writes the word the card is called
// by — the row's title — and not the row id (#412). The word is the same one the keyboard speaks,
// because both read it off the projection through the same place.
describe('the felt writes the card’s title (#412)', () => {
  const feltWith = (extra: { title?: string }) => {
    const { view, faceUp } = buildScene()
    const snapshot = view(null)
    const named = { ...snapshot, components: snapshot.components.map((c) => (c.id === faceUp ? { ...c, cardRef: 'bjornen', ...extra } : c)) }
    const { container } = render(<TableRenderer view={named} mode="table" scale={2} />)
    return container.querySelector(`[data-component="${faceUp}"] span`)!.textContent
  }

  it('writes «Björnen» for the row `bjornen`, and the id for a row with no title', () => {
    expect(feltWith({ title: 'Björnen' })).toBe('Björnen')
    expect(feltWith({})).toBe('bjornen')
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
    render(<TableRenderer view={snapshot} mode="tv" camera="follow" size={size} glideMs={0} />)

    const floorZone = snapshot.zones.find((z) => z.id === snapshot.floor)!
    const floor = floorZone.geometry
    // Vad bilden ska hålla: spelet med sin överskanning, och handbrickornas linjer med sin egen
    // luft (#413). Räckvidden rymmer båda, så att den vy en hand kan zooma ut till aldrig är
    // smalare än den vy kameran ramar in själv.
    const cam = frameRect(pad(activeBounds(snapshot)!, 60), size, reachOf(floor, countLines(snapshot)), 520, overscanPx(size), { rect: countLines(snapshot)!, margin: TV_AIR_PX })
    const { scale, left, top } = cameraOf(cam, size, floor)
    // Inte tomt: bilden håller båda villkoren, och det är det som gör den till en bild av något.
    // Spelet står sin överskanning innanför, och brickornas linjer sin egen luft (#322, #413).
    const play = pad(activeBounds(snapshot)!, 60)
    expect((play.y - cam.y) * scale).toBeGreaterThanOrEqual(overscanPx(size) - 0.005)
    expect((countLines(snapshot)!.y - cam.y) * scale).toBeCloseTo(TV_AIR_PX)
    const frame = document.querySelector('.byd-table-frame')!
    expect(frame.getAttribute('data-camera')).toBe('follow')
    const world = document.querySelector('.byd-camera-world') as HTMLElement
    expect(world.style.left).toBe(`${left}px`)
    expect(world.style.top).toBe(`${top}px`)
    const table = document.querySelector('[data-table]') as HTMLElement
    expect(table.style.width).toBe(`${floor.w * scale}px`)
  })

  // Vyn stannar (#325). Prototypen väntade sju sekunder och stod kvar; C5:s gamla sex sekunder
  // är upphävda, så en kamera som återgår av sig själv är numera felet och inte regeln.
  it('a scroll zooms around the pointer and the view stays: the camera never returns by itself', () => {
    vi.useFakeTimers()
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} />)
    const frame = document.querySelector('.byd-table-frame')!
    const table = document.querySelector('[data-table]') as HTMLElement
    const following = table.style.width

    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
    const zoomed = parseFloat(table.style.width)
    expect(zoomed).toBeGreaterThan(parseFloat(following))
    act(() => vi.advanceTimersByTime(7000))
    expect(table.style.width).toBe(`${zoomed}px`)

    // Dubbeltrycket är kvar som det var: det går nära och tillbaka. Med en egen vy stående är
    // «tillbaka» det första det gör, eftersom vyn står kvar tills någon lämnar tillbaka den.
    fireEvent.doubleClick(frame, { clientX: 500, clientY: 250 })
    expect(table.style.width).toBe(following)
    fireEvent.doubleClick(frame, { clientX: 500, clientY: 250 })
    expect(parseFloat(table.style.width)).toBeGreaterThan(parseFloat(following))
    vi.useRealTimers()
  })

  // Panorering som i Figma och Miro (#325): mittenknappen och drag. Markören visar grepp medan
  // det pågår, och ingenting markeras som text.
  it('panorerar med mittenknapp och drag, och visar grepp medan handen håller i', () => {
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} />)
    const frame = document.querySelector('.byd-table-frame')!
    // En vy som redan rymmer hela räckvidden går inte att panorera i, så hjulet går in först. Två
    // steg, eftersom räckvidden numera rymmer handbrickornas linjer också (#413) och ett steg
    // lämnar mindre att panorera i än de hundra pixlarna nedan ber om.
    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
    const world = document.querySelector('.byd-camera-world') as HTMLElement
    const before = parseFloat(world.style.left)

    fireEvent.pointerDown(frame, { button: 1, buttons: 4, clientX: 500, clientY: 250, pointerId: 3, isPrimary: true })
    expect(frame.getAttribute('data-pan')).toBe('panning')
    fireEvent.pointerMove(frame, { clientX: 400, clientY: 250, pointerId: 3 })
    // Bordet följer handen: hundra pixlar åt vänster flyttar världen hundra pixlar åt vänster.
    expect(parseFloat(world.style.left)).toBeCloseTo(before - 100, 6)
    fireEvent.pointerUp(frame, { clientX: 400, clientY: 250, pointerId: 3 })
    expect(frame.getAttribute('data-pan')).toBeNull()
    // Och vyn står kvar där den släpptes.
    expect(parseFloat(world.style.left)).toBeCloseTo(before - 100, 6)
  })

  // Space + drag är det andra greppet (#325), för den som saknar hjul. Det får inte ta Space
  // ifrån ett fokuserat kort, som äger tangenten som aktivering (K17).
  it('panorerar med Space + drag, men bara när inget kort har fokus (K17)', () => {
    const { view, faceUp } = buildScene()
    const size = { w: 1000, h: 500 }
    const activated: string[] = []
    render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} keyboard={oneStop(`card:${faceUp}`, activated)} />)
    const frame = document.querySelector('.byd-table-frame')!
    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
    const world = document.querySelector('.byd-camera-world') as HTMLElement
    const before = parseFloat(world.style.left)

    // Kortet har fokus: Space öppnar det, och ingenting beväpnas.
    const card = document.querySelector(`[data-kbd="card:${faceUp}"]`) as HTMLElement
    card.focus()
    fireEvent.keyDown(card, { key: ' ', code: 'Space' })
    expect(activated).toEqual([`card:${faceUp}`])
    expect(frame.getAttribute('data-pan')).toBeNull()
    fireEvent.pointerDown(frame, { button: 0, buttons: 1, clientX: 500, clientY: 250, pointerId: 5, isPrimary: true })
    fireEvent.pointerMove(frame, { clientX: 400, clientY: 250, pointerId: 5 })
    expect(parseFloat(world.style.left)).toBe(before)
    fireEvent.pointerUp(frame, { clientX: 400, clientY: 250, pointerId: 5 })
    fireEvent.keyUp(card, { key: ' ', code: 'Space' })

    // Inget kort har fokus: Space är greppet, och markören säger det innan handen går ned.
    card.blur()
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
    expect(frame.getAttribute('data-pan')).toBe('ready')
    fireEvent.pointerDown(frame, { button: 0, buttons: 1, clientX: 500, clientY: 250, pointerId: 6, isPrimary: true })
    expect(frame.getAttribute('data-pan')).toBe('panning')
    fireEvent.pointerMove(frame, { clientX: 400, clientY: 250, pointerId: 6 })
    expect(parseFloat(world.style.left)).toBeCloseTo(before - 100, 6)
    fireEvent.pointerUp(frame, { clientX: 400, clientY: 250, pointerId: 6 })
    fireEvent.keyUp(document.body, { key: ' ', code: 'Space' })
    expect(frame.getAttribute('data-pan')).toBeNull()
    expect(activated).toEqual([`card:${faceUp}`])
  })

  // Klungan i filtens nedre högra hörn (#325, A · Hörnet). Den finns bara medan kameran är
  // manuell, så den kostar noll yta under det mesta av ett spel.
  it('lägger kamerakontrollerna i hörnet bara medan vyn är egen, och «Visa hela bordet» lämnar tillbaka den', async () => {
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} />)
    const frame = document.querySelector('.byd-table-frame')!
    const table = document.querySelector('[data-table]') as HTMLElement
    const following = table.style.width
    expect(screen.queryByRole('button', { name: 'Visa hela bordet' })).toBeNull()

    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
    const home = await screen.findByRole('button', { name: 'Visa hela bordet' })
    // Knapparna finns, och nivån står mellan dem.
    expect(screen.getByRole('button', { name: 'Zooma in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zooma ut' })).toBeTruthy()

    fireEvent.click(home)
    expect(table.style.width).toBe(following)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Visa hela bordet' })).toBeNull())
  })

  // Fälld undan, aldrig stängd (#325): vägen hem och vägen tillbaka till knapparna står kvar.
  it('fäller undan klungan utan att någonsin kunna stänga den', async () => {
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} />)
    const frame = document.querySelector('.byd-table-frame')!
    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })

    fireEvent.click(await screen.findByRole('button', { name: 'Fäll undan kamerakontrollerna' }))
    const back = await screen.findByRole('button', { name: 'Ta fram kamerakontrollerna' })
    expect(back.getAttribute('aria-expanded')).toBe('false')
    // Fälld bär den fortfarande vägen hem, och inget annat är borta.
    expect(screen.getByRole('button', { name: 'Visa hela bordet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Zooma in' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Zooma ut' })).toBeNull()

    fireEvent.click(back)
    const fold = await screen.findByRole('button', { name: 'Fäll undan kamerakontrollerna' })
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Zooma in' })).toBeTruthy()
  })

  // Tangentbordet når allt (#325): den som inte har mus ska kunna ta över vyn och lämna
  // tillbaka den. Piltangenterna bärs av Skift, eftersom de bara är filtens roverlista.
  it('når kameran utan mus: ± zoomar, Skift + piltangent panorerar, Escape lämnar tillbaka vyn', async () => {
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} />)
    const table = document.querySelector('[data-table]') as HTMLElement
    const following = table.style.width

    fireEvent.keyDown(document.body, { key: '+' })
    const zoomed = parseFloat(table.style.width)
    expect(zoomed).toBeGreaterThan(parseFloat(following))

    const world = document.querySelector('.byd-camera-world') as HTMLElement
    const before = parseFloat(world.style.left)
    fireEvent.keyDown(document.body, { key: 'ArrowRight', shiftKey: true })
    expect(parseFloat(world.style.left)).toBeLessThan(before)
    // En bar piltangent är roverlistans och rör inte kameran (K17, #2).
    const panned = parseFloat(world.style.left)
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(parseFloat(world.style.left)).toBe(panned)

    fireEvent.keyDown(document.body, { key: '-' })
    expect(parseFloat(table.style.width)).toBeLessThan(zoomed)

    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(table.style.width).toBe(following))
  })

  // Observatören delar hjulet men inte inramningen (#325, C5): hon får ta över vyn precis som
  // TV:n, men ingen kamera följer spelet åt henne — hennes filt är passad som förut tills hon
  // själv ber om något annat.
  it('ger observatören samma hjul som TV:n, utan att rama in åt henne', async () => {
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    render(<TableRenderer view={view(null)} mode="tv" camera="hand" size={size} glideMs={0} />)
    expect(document.querySelector('.byd-camera-world')).toBeNull()
    const fitted = parseFloat((document.querySelector('[data-table]') as HTMLElement).style.width)

    const frame = document.querySelector('.byd-table-frame')!
    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
    expect(parseFloat((document.querySelector('[data-table]') as HTMLElement).style.width)).toBeGreaterThan(fitted)

    fireEvent.click(await screen.findByRole('button', { name: 'Visa hela bordet' }))
    await waitFor(() => expect(document.querySelector('.byd-camera-world')).toBeNull())
    expect(parseFloat((document.querySelector('[data-table]') as HTMLElement).style.width)).toBe(fitted)
  })

  // Kantmarkeringen är borttagen (#392). De fyra pilarna i bildkanten var runda och gula och såg
  // ut precis som klungans knappar, men låg under `pointer-events: none`: ett tryck på dem gjorde
  // ingenting. Och på den yta de var skrivna för — TV:n — finns ingen hand som kunnat följa dem
  // ändå, eftersom panorering bara finns som drag och tangenter. Vyn står kvar som förut, och
  // vägen ut ur den är «Visa hela bordet» och `Escape`.
  it('ritar ingen kantmarkering, inte ens när spelet ligger utanför den egna vyn', async () => {
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} />)
    const frame = document.querySelector('.byd-table-frame')!
    expect(document.querySelectorAll('.byd-camera-edge')).toHaveLength(0)

    // Långt in, och i ett hörn: då ligger resten av spelet utanför bilden.
    fireEvent.wheel(frame, { deltaY: -1600, clientX: 900, clientY: 450 })
    // Vyn är egen nu — klungan står där — och det är i det läget markeringen tändes förut.
    await screen.findByRole('button', { name: 'Visa hela bordet' })
    expect(document.querySelectorAll('.byd-camera-edge')).toHaveLength(0)
    expect(screen.queryByText('Mer av bordet ligger åt det här hållet')).toBeNull()
  })

  // Läget lagras per skärm och aldrig i loggen (#325, L4): en vy är ingen händelse. Den här
  // skärmen minns sin egen bild över en omladdning; ingen annan skärm vid bordet vet om den.
  it('minns vyn och det fällda läget per skärm, och säger ingenting till bordet om det', async () => {
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    const onAct = vi.fn()
    const first = render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} onAct={onAct} remember="s1" />)
    const frame = document.querySelector('.byd-table-frame')!
    const following = (document.querySelector('[data-table]') as HTMLElement).style.width
    fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
    const zoomed = (document.querySelector('[data-table]') as HTMLElement).style.width
    expect(zoomed).not.toBe(following)
    fireEvent.click(await screen.findByRole('button', { name: 'Fäll undan kamerakontrollerna' }))
    await screen.findByRole('button', { name: 'Ta fram kamerakontrollerna' })
    first.unmount()

    // Samma skärm igen: bilden och den undanfällda klungan står som de lämnades.
    render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} onAct={onAct} remember="s1" />)
    expect((document.querySelector('[data-table]') as HTMLElement).style.width).toBe(zoomed)
    expect(await screen.findByRole('button', { name: 'Ta fram kamerakontrollerna' })).toBeTruthy()
    // Och ingenting av det har gått till bordet: en vy är ingen händelse.
    expect(onAct).not.toHaveBeenCalled()
  })

  it('ritar rätt även på en skärm där lagringen vägrar svara', () => {
    const { view } = buildScene()
    const size = { w: 1000, h: 500 }
    const had = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('privat läge')
      },
    })
    try {
      render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={size} glideMs={0} remember="s2" />)
      const frame = document.querySelector('.byd-table-frame')!
      const following = (document.querySelector('[data-table]') as HTMLElement).style.width
      fireEvent.wheel(frame, { deltaY: -400, clientX: 500, clientY: 250 })
      expect((document.querySelector('[data-table]') as HTMLElement).style.width).not.toBe(following)
    } finally {
      if (had) Object.defineProperty(window, 'localStorage', had)
    }
  })

  it('on the TV leaves the overscan margin around what it frames; the observer and the phone are fitted as before (#322)', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    // A square frame, so the margin is 30 px and what is in play — wider than it is tall — is
    // bound by the frame's width: framed automatically, it stands exactly 30 px inside each side.
    const size = { w: 1000, h: 1000 }
    const floorZone = snapshot.zones.find((z) => z.id === snapshot.floor)!
    const floor = floorZone.geometry
    const { unmount } = render(<TableRenderer view={snapshot} mode="tv" camera="follow" size={size} glideMs={0} />)
    const world = document.querySelector('.byd-camera-world') as HTMLElement
    const table = document.querySelector('[data-table]') as HTMLElement
    const scale = parseFloat(table.style.width) / floor.w
    const framed = pad(activeBounds(snapshot)!, 60)
    const left = parseFloat(world.style.left) + (framed.x - floor.x) * scale
    // Minst marginalen, och numera mer än den: sedan #413 håller bilden också handbrickornas
    // linjer med sin egen luft, och de ligger utanför spelet vid kanten, så bilden dras tillbaka
    // förbi vad överskanningen ensam hade bett om. Marginalen är ett golv och inte ett mått.
    expect(left).toBeGreaterThanOrEqual(30 - 0.005)
    expect(left + framed.w * scale).toBeLessThanOrEqual(1000 - 30 + 0.005)
    // Och det som drog tillbaka den är brickornas luft, inte något annat: den övre linjen står
    // exakt sin pillerbredd innanför bildens kant (#413).
    const lines = countLines(snapshot)!
    const top = parseFloat(world.style.top) + (lines.y - floor.y) * scale
    expect(top).toBeCloseTo(TV_AIR_PX)
    unmount()

    // The observer is the same `mode` without the camera (C8): the felt with its hands on is
    // fitted to the frame with the TV's own air and nothing more. The phone's table mode (K9)
    // lies on wood that is fitted by its own rule. Neither knows the overscan margin.
    const drawn = (mode: TableMode) =>
      feltWithHands(floor, snapshot.zones.filter((z) => z.kind === 'hand').map((z) => handExtent(z, floorZone, handRotation(z, floorZone, mode))))
    const observer = render(<TableRenderer view={snapshot} mode="tv" size={size} />)
    expect(document.querySelector('.byd-camera-world')).toBeNull()
    expect((document.querySelector('[data-table]') as HTMLElement).style.width).toBe(`${floor.w * fitScale(drawn('tv'), size, TV_AIR_PX)}px`)
    observer.unmount()
    render(<TableRenderer view={snapshot} mode="table" size={size} />)
    expect(document.querySelector('.byd-camera-world')).toBeNull()
    expect((document.querySelector('[data-table]') as HTMLElement).style.width).toBe(`${floor.w * feltScale(drawn('table'), size)}px`)
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

// Tangentbordsspåret med en enda hållplats på det: så lite av `useFeltKeyboard` som krävs för
// att filten ska rita en nod med `data-kbd` som går att ge fokus, vilket är det K17:s regel om
// Space handlar om.
const oneStop = (key: string, activated: string[]): FeltKeyboard => ({
  labels: new Map([[key, 'Ett kort']]),
  open: null,
  itemProps: () => ({ tabIndex: 0, ref: () => undefined, onFocus: () => undefined, onKeyDown: () => undefined }),
  onActivate: (which) => activated.push(which),
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

  // A click is not a hold: with a mouse, 350 ms of stillness is a demand the hand cannot meet,
  // and the least tremor turns the wait into a drag nobody asked for. So the table has one rule
  // instead of two — a drag moves the thing, a click asks what may be done with it — and the
  // gesture that until now did nothing at all is the shortest way to Vänd (K14).
  it('a click that never became a drag opens the ring where the pointer is', () => {
    const { view, faceDown } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const card = document.querySelector(`[data-component="${faceDown}"]`)!
    fireEvent.pointerDown(card, client(-200, -100))
    fireEvent.pointerUp(card, client(-200, -100))
    const ring = document.querySelector('[data-radial]') as HTMLElement
    expect(ring.getAttribute('data-radial')).toBe(faceDown)
    // Around the pointer, not around the card: the ring opens where the hand already is.
    expect(ring.style.left).toBe('300px')
    expect(ring.style.top).toBe('200px')
    fireEvent.click(screen.getByRole('button', { name: 'Vänd' }))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'flip', component: faceDown, face: 'front' }])
    expect(document.querySelector('[data-radial]')).toBeNull()
  })

  // Vänd sits straight above the pointer, so a card near the top of the window would put the one
  // verb the gesture exists for past the edge of the screen.
  it('pulls the ring inside the window when the card it belongs to lies at the rim', () => {
    const { view, faceUp } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={() => undefined} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    // jsdom's window is 1024 x 768; the card sits at client (110, 60), inside the ring's reach
    // of both the top and the left edge.
    fireEvent.pointerDown(card, client(-390, -240))
    fireEvent.pointerUp(card, client(-390, -240))
    const ring = document.querySelector('[data-radial]') as HTMLElement
    expect(ring.style.left).toBe(`${RING_MARGIN}px`)
    expect(ring.style.top).toBe(`${RING_MARGIN}px`)
  })

  it('pulls a ring opened by a hold in just the same way', () => {
    vi.useFakeTimers()
    const { view, faceUp } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={() => undefined} />)
    fireEvent.pointerDown(document.querySelector(`[data-component="${faceUp}"]`)!, client(-390, -240))
    act(() => vi.advanceTimersByTime(400))
    const ring = document.querySelector('[data-radial]') as HTMLElement
    expect([ring.style.left, ring.style.top]).toEqual([`${RING_MARGIN}px`, `${RING_MARGIN}px`])
    vi.useRealTimers()
  })

  it('a click on the top of a pile and on its label both open the pile ring', () => {
    const { view } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const top = document.querySelector('[data-zone="discard"] .byd-pile-top')!
    fireEvent.pointerDown(top, client(200, 0))
    fireEvent.pointerUp(top, client(200, 0))
    expect(document.querySelector('[data-radial]')?.getAttribute('data-radial')).toBe('discard')
    fireEvent.click(screen.getByRole('button', { name: 'Blanda' }))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'shuffle', pile: 'discard' }])

    const label = document.querySelector('[data-zone="discard"] .byd-pile-count')!
    fireEvent.pointerDown(label, client(200, 50))
    fireEvent.pointerUp(label, client(200, 50))
    expect(document.querySelector('[data-radial]')?.getAttribute('data-radial')).toBe('discard')
  })

  // The ring closes by letting go of it: the backdrop covers the screen, so anywhere outside the
  // verbs is a way out. A verb that only means "never mind" is a verb K14 never listed, and it
  // takes a place in a ring where every other place does something.
  it('offers only verbs, and closes on a press outside them', () => {
    const { view, faceUp } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card, client(-390, -240))
    fireEvent.pointerUp(card, client(-390, -240))
    const ring = document.querySelector('[data-radial]')!
    expect([...ring.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Vänd', 'Vrid', 'Titta', 'Avslöja'])
    fireEvent.pointerUp(document.querySelector('.byd-radial-backdrop')!)
    expect(document.querySelector('[data-radial]')).toBeNull()
  })

  it('offers a pile only its own verbs, and closes the same way', () => {
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={vi.fn()} />)
    const label = document.querySelector('[data-zone="discard"] .byd-pile-count')!
    fireEvent.pointerDown(label, client(100, 100))
    fireEvent.pointerUp(label, client(100, 100))
    const ring = document.querySelector('[data-radial]')!
    expect([...ring.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Blanda', 'Dra 1', 'Dela på hälften', 'Vänd översta', 'Titta'])
    fireEvent.pointerUp(document.querySelector('.byd-radial-backdrop')!)
    expect(document.querySelector('[data-radial]')).toBeNull()
  })

  // Vilken sida av högen som är "bredvid den" är högens egen sak (K21): den som lägger leken vid
  // filtens vänsterkant vill inte ha sina kort utanför bordet. Ringens verb läser samma sida som
  // designerns åtgärder, för det är ett kort som läggs bredvid en hög i båda fallen.
  it('lägger det som delas av åt det håll högen säger, inte alltid åt vänster', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    const rightwards = { ...snapshot, zones: snapshot.zones.map((z) => (z.id === 'discard' ? { ...z, beside: 'right' as const } : z)) }
    const sent: Intent[][] = []
    render(<TableRenderer view={rightwards} mode="tv" scale={1} onAct={(i) => sent.push(i)} />)
    const label = document.querySelector('[data-zone="discard"] .byd-pile-count')!
    fireEvent.pointerDown(label, client(100, 100))
    fireEvent.pointerUp(label, client(100, 100))
    fireEvent.click(screen.getByRole('button', { name: 'Dela på hälften' }))

    const split = sent.flat()[0] as { v: string; x: number }
    const discard = snapshot.zones.find((z) => z.id === 'discard')!
    expect(split.v).toBe('split')
    expect(split.x).toBeGreaterThan(discard.geometry.x)
  })

  // Without the Stäng button the ring is a pointer surface with no way out for a hand on a
  // keyboard, and a focus that has landed in it would have nowhere to go. Escape is that way.
  it('closes on Escape, which is the way out the button used to be', () => {
    const { view, faceUp } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={vi.fn()} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card, client(-390, -240))
    fireEvent.pointerUp(card, client(-390, -240))
    expect(document.querySelector('[data-radial]')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('[data-radial]')).toBeNull()
  })

  it('a drag is not a click: moving the card away sends the drop and opens nothing', () => {
    const { view, faceUp, faceDown } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card, client(-390, -240))
    fireEvent.pointerMove(card, client(-190, -90))
    fireEvent.pointerUp(card, client(-190, -90))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'stack', component: faceUp, onto: faceDown }])
    expect(document.querySelector('[data-radial]')).toBeNull()
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

  it('draws the card in the hand where it will land, and not half a card off it (#223)', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    const onAct = vi.fn()
    render(<TableRenderer view={snapshot} mode="tv" scale={1} onAct={onAct} />)
    const top = document.querySelector('[data-zone="draw"] .byd-pile-top')!
    // Taken a third into the card rather than at its middle, so a ghost centred on the pointer and
    // a ghost holding the grip cannot come out at the same place.
    const grab = { x: -200 - CARD_MM.w / 2 + CARD_MM.w / 3, y: 0 - CARD_MM.h / 2 + CARD_MM.h / 3 }
    fireEvent.pointerDown(top, client(grab.x, grab.y))
    fireEvent.pointerMove(top, client(-100, 100))
    const ghost = document.querySelector('[data-ghost]') as HTMLElement
    expect(ghost).toBeTruthy()
    // What the hand is holding stands where the card is about to be put down: the drop's own
    // answer, read off the intent the very same gesture sends.
    fireEvent.pointerUp(top, client(-100, 100))
    const [[[landed]]] = onAct.mock.calls as [[[Extract<Intent, { v: 'split' }>]]]
    // The ghost is placed in the felt's own pixels and the intent names a point on the table, so
    // the floor's corner is what makes the two comparable; at scale 1 a millimetre is a pixel.
    const floor = snapshot.zones.find((z) => z.id === snapshot.floor)!.geometry
    expect(parseFloat(ghost.style.left)).toBeCloseTo(landed.x! - floor.x, 6)
    expect(parseFloat(ghost.style.top)).toBeCloseTo(landed.y! - floor.y, 6)
  })

  it('dragging the top card off a pile drops it holding the point it was taken by', () => {
    const { view } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const top = document.querySelector('[data-zone="draw"] .byd-pile-top')!
    // Taken at the draw pile's own middle, which is where its top card's middle is drawn, and
    // carried 100 mm along and 100 mm down. So the card's middle lands there and its corner half
    // a card short of it (#223) — cornered at the pointer, as this was, the card jumped half its
    // own size up and to the left the instant it came off the pile.
    fireEvent.pointerDown(top, client(-200, 0))
    fireEvent.pointerMove(top, client(-100, 100))
    fireEvent.pointerUp(top, client(-100, 100))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'split', pile: 'draw', at: 1, x: -100 - CARD_MM.w / 2, y: 100 - CARD_MM.h / 2 }])
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

// The felt card is a control the keyboard names, so it carries no way back of its own (UX-37,
// #82); the card held up by "Titta" is the big, quiet view that does.
describe('a lost card held up by "Titta" (#82)', () => {
  it('carries the way back, and pressing it retries without putting the card down', () => {
    vi.useFakeTimers()
    const { view, faceUp } = buildScene()
    const snapshot = view(null)
    const withFaces = { ...snapshot, components: snapshot.components.map((c) => (c.id === faceUp ? { ...c, faces: { front: 'a'.repeat(64) } } : c)) }
    render(<TableRenderer view={withFaces} mode="tv" scale={1} faces="http://faces.test" onAct={() => undefined} />)
    fireEvent.pointerDown(document.querySelector(`[data-component="${faceUp}"]`)!, client(-390, -240))
    act(() => vi.advanceTimersByTime(400))
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Titta' }), client(-390, -300))
    const img = () => document.querySelector('[data-inspect] img') as HTMLImageElement
    for (let i = 0; i <= 8; i++) {
      fireEvent.error(img())
      act(() => vi.advanceTimersByTime(1500 * (i + 1)))
    }
    const button = screen.getByRole('button', { name: 'Försök igen' })
    expect(document.querySelectorAll('button button, button [role="button"], [role="button"] button')).toHaveLength(0)

    // The held card is put down by a click anywhere; a click on the way back is not that click.
    act(() => {
      fireEvent.click(button)
    })
    expect(document.querySelector('[data-inspect]')).not.toBeNull()
    expect(document.querySelector('[data-inspect] [data-texture="pending"]')).not.toBeNull()
    expect(img().src).toBe(`http://faces.test/faces/${'a'.repeat(64)}?retry=1&t=9`)

    fireEvent.click(document.querySelector('[data-inspect]')!.parentElement!)
    expect(document.querySelector('[data-inspect]')).toBeNull()
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

  // A face-down pile wears its top card's own back from the first frame (#313, #14). The component
  // is not in the projection at all — a hidden pile hands out no id (K15) — so the back arrives on
  // the zone, and the pile has to prefer it over the deck's compiled default.
  it('shows a face-down pile the back its own top card wears, not the deck’s default', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    const own = 'c'.repeat(64)
    const hidden = {
      ...snapshot,
      zones: snapshot.zones.map((z) => (z.id === 'draw' ? { id: z.id, kind: z.kind, name: z.name, geometry: z.geometry, dynamic: z.dynamic, mode: 'count' as const, count: 5, back: own } : z)),
      components: snapshot.components.filter((c) => c.zone !== 'draw'),
    }
    render(<TableRenderer view={hidden} mode="table" faces="http://faces.test" back={() => <span data-deck-back="" />} />)
    const img = document.querySelector('[data-zone="draw"] img') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toBe(`http://faces.test/faces/${own}`)
    // And the deck's own default is not drawn beside it.
    expect(document.querySelector('[data-zone="draw"] [data-deck-back]')).toBeNull()
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

describe('counters on the table (C4)', () => {
  it('draws a counter token as a chip with its name and value, never as a card', () => {
    const { view } = buildScene()
    const v = view(null)
    const chip = { id: 'k1', type: { id: 'token.counter', version: 1 }, zone: 'table', face: 'front', x: 10, y: 10, rot: 0, counter: 17, cardRef: 'Liv' }
    // Drawn at a scale that gives the 24 mm chip room for the word in it; below that it keeps
    // the value alone, which `table-token.test.tsx` measures.
    render(<TableRenderer view={{ ...v, components: [...v.components, chip] }} mode="tv" scale={2} />)
    const el = document.querySelector('[data-counter-token="k1"]')!
    expect(el).toBeTruthy()
    expect(el.textContent).toContain('17')
    expect(el.textContent).toContain('Liv')
    expect(document.querySelector('[data-component="k1"]')).toBeNull()
  })
})

describe('an overlay on the felt (B5)', () => {
  it('renders what the editor lays over the table inside the felt, with the felt\'s own pixel mapping', () => {
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={2} overlay={(fit) => <div data-overlay style={{ left: fit.left(-400), top: fit.top(-200), width: fit.px(50) }} />} />)
    const overlay = document.querySelector('[data-table] [data-overlay]') as HTMLElement
    // The floor starts at (-500, -300); scale 2.
    expect(overlay.style.left).toBe('200px')
    expect(overlay.style.top).toBe('200px')
    expect(overlay.style.width).toBe('100px')
  })
})

// The drop and the patch are not the same moment (K1). The pointer goes up, the intent travels,
// and until it comes back the table still says where the card was. What is drawn over that gap
// decides whether a move looks like a move or like a flinch.
describe('the gap between the drop and the patch (K1)', () => {
  it('a dropped card keeps where it was put while the table still says where it came from', () => {
    const { view, faceUp } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const placed = () => document.querySelector(`[data-component="${faceUp}"]`) as HTMLElement
    // The card lies at (100, 50) inside the table area; scale 1 → px.
    expect(placed().style.left).toBe('100px')
    expect(placed().style.top).toBe('50px')

    fireEvent.pointerDown(placed(), client(100, 50))
    fireEvent.pointerMove(placed(), client(300, 150))
    fireEvent.pointerUp(placed(), client(300, 150))
    expect(onAct).toHaveBeenCalledTimes(1)

    // Nothing has come back yet: the view is the one it was dropped on. The card must stand where
    // it was put, not back where it came from.
    expect(placed().style.left).toBe('300px')
    expect(placed().style.top).toBe('150px')
  })

  it('gives the card back to the table when nothing ever comes of the drop', () => {
    vi.useFakeTimers()
    const { view, faceUp } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const placed = () => document.querySelector(`[data-component="${faceUp}"]`) as HTMLElement

    fireEvent.pointerDown(placed(), client(100, 50))
    fireEvent.pointerMove(placed(), client(300, 150))
    fireEvent.pointerUp(placed(), client(300, 150))
    expect(placed().style.left).toBe('300px')

    // A refused drop never becomes a patch, so the placement has nothing to wait for. It is held
    // only as long as the tool still considers the connection fine; after that the table is the
    // truth again and the reader sees where the card really is.
    act(() => vi.advanceTimersByTime(DEFAULT_TIMING.slowAfterMs))
    expect(placed().style.left).toBe('100px')
    expect(placed().style.top).toBe('50px')
    vi.useRealTimers()
  })

  // Drawing the top card off a pile is the same gap, and the one place it was never closed: the
  // drag has no component id to hold — a hidden pile gives none — so the drop fell through the
  // guard that holds a loose card and a whole pile, and the card was drawn back into the stack
  // for one round trip.
  it('a card drawn off a pile keeps where it was put, and the pile stays one card shorter', () => {
    const { view } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const pile = () => document.querySelector('[data-zone="draw"]') as HTMLElement
    const drawn = () => document.querySelector('[data-ghost]') as HTMLElement | null
    expect(pile().getAttribute('data-count')).toBe('3')

    const top = pile().querySelector('.byd-pile-top')!
    fireEvent.pointerDown(top, client(-200, 0))
    fireEvent.pointerMove(top, client(-100, 100))
    const carried = { left: drawn()!.style.left, top: drawn()!.style.top }
    expect(pile().getAttribute('data-count')).toBe('2')

    fireEvent.pointerUp(top, client(-100, 100))
    expect(onAct).toHaveBeenCalledTimes(1)
    // Nothing has come back yet: the card is where it was let go of, and the pile has not grown
    // it back.
    expect(pile().getAttribute('data-count')).toBe('2')
    expect(drawn()).not.toBeNull()
    expect({ left: drawn()!.style.left, top: drawn()!.style.top }).toEqual(carried)
  })

  it('gives the drawn card back to the table the moment the split comes back', () => {
    const { view, viewAfterDrawTop } = buildScene()
    const onAct = vi.fn()
    const { rerender } = render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const top = document.querySelector('[data-zone="draw"] .byd-pile-top')!
    fireEvent.pointerDown(top, client(-200, 0))
    fireEvent.pointerMove(top, client(-100, 100))
    fireEvent.pointerUp(top, client(-100, 100))
    expect(document.querySelector('[data-ghost]')).not.toBeNull()

    // The pile it came out of is a card shorter, which is the table saying it has moved it. From
    // here the table is the truth again, and holding the placement would draw the card twice.
    rerender(<TableRenderer view={viewAfterDrawTop(-100, 100)} mode="tv" scale={1} onAct={onAct} />)
    expect(document.querySelector('[data-ghost]')).toBeNull()
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('2')
  })

  // A whole pile moved across the felt waits for the same patch a card does.
  it('a dropped pile keeps where it was put while the table still says where it came from', () => {
    const { view } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const pile = () => document.querySelector('[data-zone="draw"]') as HTMLElement
    const handle = pile().querySelector('.byd-pile-count')!
    const home = pile().style.left

    fireEvent.pointerDown(handle, client(-200, 0))
    fireEvent.pointerMove(handle, client(-100, 60))
    const carried = pile().style.left
    expect(carried).not.toBe(home)

    fireEvent.pointerUp(handle, client(-100, 60))
    expect(onAct).toHaveBeenCalledTimes(1)
    expect(pile().style.left).toBe(carried)
  })
})

// The ghost dragged off a hidden pile is that same top card on its way somewhere (#313): it wears
// the back the zone named for the pile, not the deck's default, or the card would change back as
// it lifted.
describe('the back of a hidden pile while it is dragged off', () => {
  it('wears the back the zone names on the ghost as well', () => {
    const hash = 'c'.repeat(64)
    const snapshot = buildScene().view(null)
    const view = { ...snapshot, zones: snapshot.zones.map((z) => (z.id === 'draw' && z.mode === 'count' ? { ...z, back: hash } : z)) }
    render(<TableRenderer view={view} mode="tv" scale={1} faces="http://faces.test" onAct={() => undefined} />)
    const top = document.querySelector('[data-zone="draw"] .byd-pile-top')!
    fireEvent.pointerDown(top, client(-200, 0))
    fireEvent.pointerMove(top, client(-100, 100))
    const ghost = document.querySelector('[data-ghost] img') as HTMLImageElement | null
    expect(ghost?.src).toBe(`http://faces.test/faces/${hash}`)
  })
})

// Högens bottenkort (K23, #331): variant A, kortkanten. Bottenkortets nederkant sticker fram
// under högen, ritad av samma kortväg som toppen, och går att inspektera; ett nedvänt visar sin
// baksida. Ensamt i högen är det toppen och ritas en gång; en tom hög visar inget bottenkort.
describe('the bottom card of a pile (K23)', () => {
  const withBottom = (face: 'front' | 'back', visibility: 'none' | 'all' = 'none') => {
    const setup = twoSeatSetup()
    setup.zones = setup.zones.map((z) => (z.id === 'draw' ? { ...z, visibility, bottom: { cardRef: 'ogre', face } } : z))
    return tableOf(setup)
  }
  const edge = () => document.querySelector('[data-zone="draw"] .byd-pile-bottom') as HTMLElement | null
  const top = () => document.querySelector('[data-zone="draw"] .byd-pile-top') as HTMLElement

  it('a face-up bottom card sticks out under a hidden pile by name, below the top and offset down', () => {
    const { view } = withBottom('front')
    render(<TableRenderer view={view(null)} mode="table" scale={1} />)
    expect(edge()).toBeTruthy()
    expect(edge()!.getAttribute('data-face')).toBe('front')
    expect(edge()!.textContent).toContain('ogre')
    // The top still says nothing: the pile is hidden and its top lies face down.
    expect(top().getAttribute('data-face')).toBe('back')
    expect(top().textContent).toBe('')
    // Drawn before the top in the stack, so the top covers all but the edge that is let out.
    expect(edge()!.compareDocumentPosition(top()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Let out by moving the whole card down, never by shortening it: the edge must lie below
    // the pile's own box, or the top covers all of it.
    expect(edge()!.style.top).toBe('')
    expect(edge()!.style.transform).toMatch(/^translateY\((\d+(\.\d+)?)px\)$/)
    expect(parseFloat(edge()!.style.transform.replace('translateY(', ''))).toBeGreaterThan(0)
  })

  it('a face-down bottom card shows only a back: no name, and the back the zone says it wears', () => {
    const { view } = withBottom('back')
    const snapshot = view(null)
    const own = 'd'.repeat(64)
    const withBack = { ...snapshot, zones: snapshot.zones.map((z) => (z.id === 'draw' && z.mode === 'count' ? { ...z, bottom: { back: own } } : z)) }
    render(<TableRenderer view={withBack} mode="table" scale={1} faces="http://faces.test" />)
    expect(edge()!.getAttribute('data-face')).toBe('back')
    expect(document.querySelector('[data-zone="draw"]')!.textContent).not.toContain('ogre')
    const img = edge()!.querySelector('img') as HTMLImageElement
    expect(img.src).toBe(`http://faces.test/faces/${own}`)
  })

  it('a public pile lets its bottom card out too, and a lone card or an empty pile shows no edge', () => {
    const { view, viewAfter } = withBottom('back', 'all')
    const { rerender } = render(<TableRenderer view={view(null)} mode="table" scale={1} />)
    expect(edge()).toBeTruthy()
    expect(edge()!.getAttribute('data-face')).toBe('back')
    rerender(<TableRenderer view={viewAfter({ v: 'draw', from: 'draw', to: 'table', count: 9 })} mode="table" scale={1} />)
    expect(edge()).toBeNull()
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('1')
    rerender(<TableRenderer view={viewAfter({ v: 'draw', from: 'draw', to: 'table', count: 1 })} mode="table" scale={1} />)
    expect(edge()).toBeNull()
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('0')
  })

  it('the edge is inspected like the top: a face-up one by name, a face-down one as a back', () => {
    const up = withBottom('front')
    const onInspect = vi.fn()
    const { unmount } = render(<TableRenderer view={up.view(null)} mode="tv" scale={1} onInspect={onInspect} />)
    fireEvent.pointerEnter(edge()!)
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ zone: 'draw', cardRef: 'ogre', face: 'front' }))
    fireEvent.pointerLeave(edge()!)
    expect(onInspect).toHaveBeenLastCalledWith(null)
    unmount()

    const down = withBottom('back')
    render(<TableRenderer view={down.view(null)} mode="tv" scale={1} onInspect={onInspect} />)
    fireEvent.pointerEnter(edge()!)
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ zone: 'draw', cardRef: null, face: 'back' }))
  })
})
