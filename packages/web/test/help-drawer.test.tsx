// @vitest-environment jsdom
// The one help pattern (L32, #303): a question mark that opens a box under itself. The box is
// layered over the work and never in its flow, so the surface is the same height whether the help
// is open or closed — which is the whole reason the pattern was chosen over the two others.
//
// Hover does not open it. The way in is click and focus, nothing else: a box that opens on hover
// vanishes when the pointer moves to reach it, and the phone has no hover at all (L32).
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Help } from '../src/editor/HelpDrawer.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const mount = () =>
  render(
    <div className="byd-editor">
      <button type="button">Före</button>
      <Help topic="lagerlistan">
        <p>Håll Alt och tryck pil upp eller ner.</p>
      </Help>
      <button type="button">Efter</button>
    </div>,
  )
const ask = () => screen.getByRole('button', { name: 'Hjälp om lagerlistan' })
const box = () => screen.queryByRole('dialog', { name: 'lagerlistan' })

describe('the question mark', () => {
  it('is named by what it is about, and says whether its box is open', () => {
    mount()
    expect(ask().getAttribute('aria-expanded')).toBe('false')
    expect(box()).toBeNull()
    fireEvent.click(ask())
    expect(ask().getAttribute('aria-expanded')).toBe('true')
    expect(box()).not.toBeNull()
    expect(ask().getAttribute('aria-controls')).toBe(box()!.id)
  })

  it('moves the focus into the box when it opens', () => {
    mount()
    fireEvent.click(ask())
    expect(box()!.contains(document.activeElement)).toBe(true)
  })

  it('opens from the keyboard with Enter and with Space', async () => {
    const user = userEvent.setup()
    mount()
    ask().focus()
    await user.keyboard('{Enter}')
    expect(box()).not.toBeNull()
    await user.keyboard('{Escape}')
    expect(box()).toBeNull()
    expect(document.activeElement).toBe(ask())
    await user.keyboard(' ')
    expect(box()).not.toBeNull()
  })

  it('does not open on hover', () => {
    mount()
    fireEvent.mouseEnter(ask())
    fireEvent.mouseOver(ask())
    fireEvent.pointerEnter(ask())
    expect(box()).toBeNull()
    expect(ask().getAttribute('aria-expanded')).toBe('false')
  })

  it('holds the help text inside the box and nowhere else', () => {
    mount()
    expect(screen.queryByText('Håll Alt och tryck pil upp eller ner.')).toBeNull()
    fireEvent.click(ask())
    expect(box()!.textContent).toContain('Håll Alt och tryck pil upp eller ner.')
  })
})

describe('closing the box', () => {
  it('closes on Escape and hands the focus back to the question mark', () => {
    mount()
    fireEvent.click(ask())
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(box()).toBeNull()
    expect(document.activeElement).toBe(ask())
  })

  it('closes on its own cross and hands the focus back', () => {
    mount()
    fireEvent.click(ask())
    fireEvent.click(screen.getByRole('button', { name: 'Stäng hjälpen' }))
    expect(box()).toBeNull()
    expect(document.activeElement).toBe(ask())
  })

  it('closes on a press outside it, and the focus goes back to the question mark when the press landed on nothing', () => {
    mount()
    fireEvent.click(ask())
    fireEvent.pointerDown(document.body)
    expect(box()).toBeNull()
    expect(document.activeElement).toBe(ask())
  })

  it('closes on a press on another control, and leaves the focus where the pointer put it', () => {
    mount()
    fireEvent.click(ask())
    const after = screen.getByRole('button', { name: 'Efter' })
    fireEvent.pointerDown(after)
    after.focus()
    expect(box()).toBeNull()
    expect(document.activeElement).toBe(after)
  })

  it('closes when the focus tabs out of it, and the next stop is the one after the question mark', async () => {
    const user = userEvent.setup()
    mount()
    fireEvent.click(ask())
    await user.tab()
    expect(box()).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Efter' }))
  })

  it('toggles closed from the question mark itself', () => {
    mount()
    fireEvent.click(ask())
    fireEvent.pointerDown(ask())
    fireEvent.click(ask())
    expect(box()).toBeNull()
    expect(ask().getAttribute('aria-expanded')).toBe('false')
  })
})

// The reading itself is `placement.test.ts`; this is the wiring — that the box asks where the room
// is and is laid there. The box is fixed to the window and never inside a column's own overflow,
// because the layer column is 220 px wide and clips what hangs out of it.
const rect = (x: number, y: number, w: number, h: number) => () => ({ x, y, top: y, left: x, right: x + w, bottom: y + h, width: w, height: h, toJSON: () => ({}) }) as DOMRect

describe('where the box goes (#229, L32)', () => {
  it('opens downward under a question mark near the top, hanging from its left edge', () => {
    window.innerHeight = 800
    window.innerWidth = 1280
    mount()
    ask().getBoundingClientRect = rect(100, 60, 22, 22)
    fireEvent.click(ask())
    const b = box()!
    expect(b.getAttribute('data-place-y')).toBe('down')
    expect(b.getAttribute('data-place-x')).toBe('start')
    expect(b.style.top).toBe('88px')
    expect(b.style.left).toBe('100px')
    expect(b.style.bottom).toBe('')
  })

  it('flips upward when it stands at the foot of the window', () => {
    window.innerHeight = 800
    window.innerWidth = 1280
    mount()
    ask().getBoundingClientRect = rect(100, 760, 22, 22)
    fireEvent.click(ask())
    const b = box()!
    expect(b.getAttribute('data-place-y')).toBe('up')
    expect(b.style.bottom).toBe('46px')
    expect(b.style.top).toBe('')
  })

  it('hangs from its right edge when its left would run off the window', () => {
    window.innerHeight = 800
    window.innerWidth = 1280
    mount()
    ask().getBoundingClientRect = rect(1200, 60, 22, 22)
    fireEvent.click(ask())
    const b = box()!
    expect(b.getAttribute('data-place-x')).toBe('end')
    expect(b.style.right).toBe('58px')
    expect(b.style.left).toBe('')
  })
})
