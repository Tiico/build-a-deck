// @vitest-environment jsdom
// The crop opens as a sheet over the library (#297, L33, C · Arket). Cropping is a thing done with
// full attention on one picture at a time, so the workspace takes the library's room and «Klart»
// gives it back. What is asked here is the sheet as a window: that it opens from the tile, that
// the keyboard is held inside it, and that closing it — by «Klart» or by Escape — puts the hand
// back on the tile that opened it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import type { Motif } from '@byd/template'
import { MediaPanel } from '../src/editor/MediaPanel.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const BASE = 'http://api.local'
const FILE: Motif = { w: 400, h: 200, trim: { left: 0, top: 0, right: 0, bottom: 0 } }
const motifs = { [`${BASE}/assets/${SKOG}`]: FILE }

function deckWithArt(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${SKOG}`
  doc.rows[1]!.fields['art'] = `asset:${SKOG}`
  doc.pictures = { [SKOG]: { name: 'skog.png' } }
  return doc
}

const tile = () => screen.getByRole('button', { name: 'skog.png' })
const sheet = () => screen.getByRole('dialog', { name: 'Beskärning' })

describe('the crop opens as a sheet over the library (#297, L33)', () => {
  it('opens from the tile with the window and «Klart» inside, and «Klart» hands the focus back to the tile', () => {
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    tile().focus()
    fireEvent.click(tile())

    const dialog = sheet()
    const window_ = within(dialog).getByRole('button', { name: /Beskärning: visar/ })
    expect(document.activeElement).toBe(window_)
    expect(within(dialog).getByRole('button', { name: 'Hela bilden' })).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Klart' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(tile())
  })

  // The change is applied when the handle is released, so a close never discards anything, and
  // Escape may close the sheet exactly as «Klart» does.
  it('closes on Escape and puts the hand back on the tile', () => {
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)
    tile().focus()
    fireEvent.click(tile())

    fireEvent.keyDown(sheet(), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(tile())
  })

  it('keeps the library out of reach while it lies over it: the tiles are inert, and a focus that lands there is pulled back', () => {
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)
    fireEvent.click(tile())

    expect(tile().closest('.byd-media-library')?.hasAttribute('inert')).toBe(true)
    tile().focus()
    expect(sheet().contains(document.activeElement)).toBe(true)
  })
})

// The picture as laid out: jsdom lays nothing out, so the box the drag is measured against is
// said here — 400 × 200, the file's own shape — and every pointer distance below is a share of it.
const laidOut = () => {
  const real = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('byd-crop-picture')) return { x: 0, y: 0, left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, toJSON: () => ({}) } as DOMRect
    return real.call(this)
  })
}
afterEach(() => vi.restoreAllMocks())

const corner = (name: string) => within(sheet()).getByRole('button', { name })
const drag = (el: HTMLElement, dx: number, dy: number) => {
  fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(el, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 })
  fireEvent.pointerUp(el, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 })
}

describe('four corners resize the window, each with the opposite corner still (#297, L33)', () => {
  it('names all four corners', () => {
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)
    fireEvent.click(tile())
    expect(['Övre vänstra hörnet', 'Övre högra hörnet', 'Nedre vänstra hörnet', 'Nedre högra hörnet'].map((name) => corner(name).tagName)).toHaveLength(4)
  })

  // Forty pixels across and twenty down is a tenth of the picture either way.
  it.each([
    { name: 'Övre vänstra hörnet', dx: 40, dy: 20, crop: { x: 0.1, y: 0.1, w: 0.9, h: 0.9 } },
    { name: 'Övre högra hörnet', dx: -40, dy: 20, crop: { x: 0, y: 0.1, w: 0.9, h: 0.9 } },
    { name: 'Nedre vänstra hörnet', dx: 40, dy: -20, crop: { x: 0.1, y: 0, w: 0.9, h: 0.9 } },
    { name: 'Nedre högra hörnet', dx: -40, dy: -20, crop: { x: 0, y: 0, w: 0.9, h: 0.9 } },
  ])('$name: dragged in by a tenth, the window is cut there and applied on release, as one edit', ({ name, dx, dy, crop }) => {
    laidOut()
    const onCrop = vi.fn()
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onCrop={onCrop} />)
    fireEvent.click(tile())

    drag(corner(name), dx, dy)

    expect(onCrop.mock.calls).toEqual([[SKOG, crop]])
  })

  it('never lets a corner leave the picture: dragged out past the edge, the window stops at it', () => {
    laidOut()
    const onCrop = vi.fn()
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onCrop={onCrop} />)
    fireEvent.click(tile())

    drag(corner('Övre vänstra hörnet'), -80, -40)
    drag(corner('Nedre högra hörnet'), 80, 40)

    expect(onCrop.mock.calls).toEqual([
      [SKOG, { x: 0, y: 0, w: 1, h: 1 }],
      [SKOG, { x: 0, y: 0, w: 1, h: 1 }],
    ])
  })
})

describe('the keyboard cuts the window as the pointer does (#297, L33)', () => {
  it('resizes from a focused corner one step per press, and five steps with Shift, with the opposite corner still', () => {
    const onCrop = vi.fn()
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onCrop={onCrop} />)
    fireEvent.click(tile())

    fireEvent.keyDown(corner('Övre vänstra hörnet'), { key: 'ArrowRight' })
    fireEvent.keyDown(corner('Övre vänstra hörnet'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(corner('Nedre högra hörnet'), { key: 'ArrowLeft', shiftKey: true })

    expect(onCrop.mock.calls).toEqual([
      [SKOG, { x: 0.02, y: 0, w: 0.98, h: 1 }],
      [SKOG, { x: 0.02, y: 0.1, w: 0.98, h: 0.9 }],
      [SKOG, { x: 0.02, y: 0.1, w: 0.88, h: 0.9 }],
    ])
  })

  it('moves the window from the window itself, and Shift moves it further', () => {
    const onCrop = vi.fn()
    const doc = deckWithArt()
    doc.pictures![SKOG] = { name: 'skog.png', crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }
    render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={onCrop} />)
    fireEvent.click(tile())
    const window_ = within(sheet()).getByRole('button', { name: /Beskärning: visar/ })

    fireEvent.keyDown(window_, { key: 'ArrowRight' })
    fireEvent.keyDown(window_, { key: 'ArrowDown', shiftKey: true })

    expect(onCrop.mock.calls).toEqual([
      [SKOG, { x: 0.02, y: 0, w: 0.5, h: 0.5 }],
      [SKOG, { x: 0.02, y: 0.1, w: 0.5, h: 0.5 }],
    ])
    expect(window_.getAttribute('aria-label')).toBe('Beskärning: visar 2–52 % i sidled och 10–60 % i höjdled')
  })
})

// Three states and not two (L33): a change the server has not yet confirmed must not look like one
// it has. `saving` is the library's word for which pictures' crops are on their way — the client
// knows, because it holds every edit until the actor echoes it — and the status says so in amber
// until that word is withdrawn.
describe('the status says where the crop stands, in three states and in both places (#297, L33)', () => {
  const status = () => within(sheet()).getByRole('status')
  const mark = () => tile().closest('li')!.querySelector('.byd-media-mark')

  it('says «Hela bilden» without colour when no crop is stored, and wears no mark on the tile', () => {
    render(<MediaPanel doc={deckWithArt()} assetBase={BASE} motifs={motifs} onCrop={() => undefined} />)
    expect(mark()).toBeNull()
    fireEvent.click(tile())
    expect(status().getAttribute('data-state')).toBe('whole')
    expect(status().textContent).toBe('▢ Hela bilden')
  })

  it('turns amber the moment the window is cut, and stays amber while the client still holds the edit', () => {
    laidOut()
    const doc = deckWithArt()
    const { rerender } = render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={() => undefined} saving={[]} />)
    fireEvent.click(tile())

    fireEvent.pointerDown(corner('Nedre högra hörnet'), { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(corner('Nedre högra hörnet'), { clientX: 60, clientY: 80, pointerId: 1 })
    expect(status().getAttribute('data-state')).toBe('saving')
    expect(status().textContent).toBe('⟳ Ändrad — sparas …')
    fireEvent.pointerUp(corner('Nedre högra hörnet'), { clientX: 60, clientY: 80, pointerId: 1 })

    // The document has the window now, and the edit is still on its way.
    const cut = { ...doc, pictures: { [SKOG]: { name: 'skog.png', crop: { x: 0, y: 0, w: 0.9, h: 0.9 } } } }
    rerender(<MediaPanel doc={cut} assetBase={BASE} motifs={motifs} onCrop={() => undefined} saving={[SKOG]} />)
    expect(status().getAttribute('data-state')).toBe('saving')
    expect(mark()?.getAttribute('data-state')).toBe('saving')

    // The actor has echoed it: green, with the share of the picture the window shows.
    rerender(<MediaPanel doc={cut} assetBase={BASE} motifs={motifs} onCrop={() => undefined} saving={[]} />)
    expect(status().getAttribute('data-state')).toBe('saved')
    expect(status().textContent).toBe('✓ Beskuren · visar 81 %')
    expect(mark()?.getAttribute('data-state')).toBe('saved')
    expect(mark()?.textContent).toBe('▣ Beskuren')
  })

  it('goes back to «Hela bilden», and the tile loses its mark, when the crop is taken away', () => {
    const onCrop = vi.fn()
    const doc = deckWithArt()
    doc.pictures![SKOG] = { name: 'skog.png', crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }
    const { rerender } = render(<MediaPanel doc={doc} assetBase={BASE} motifs={motifs} onCrop={onCrop} saving={[]} />)
    expect(mark()?.textContent).toBe('▣ Beskuren')
    fireEvent.click(tile())
    expect(status().getAttribute('data-state')).toBe('saved')

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Hela bilden' }))
    expect(onCrop.mock.calls).toEqual([[SKOG, null]])
    const whole = { ...doc, pictures: { [SKOG]: { name: 'skog.png' } } }
    rerender(<MediaPanel doc={whole} assetBase={BASE} motifs={motifs} onCrop={onCrop} saving={[SKOG]} />)
    expect(status().getAttribute('data-state')).toBe('saving')
    rerender(<MediaPanel doc={whole} assetBase={BASE} motifs={motifs} onCrop={onCrop} saving={[]} />)
    expect(status().getAttribute('data-state')).toBe('whole')
    expect(mark()).toBeNull()
  })
})
