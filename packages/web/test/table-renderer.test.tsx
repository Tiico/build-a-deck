// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { buildScene } from './scene.js'

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

describe('hands', () => {
  it('shows each hand as a count with the seat name, oriented toward its edge in table mode', () => {
    const { view } = buildScene()
    const { unmount } = render(<TableRenderer view={view(null)} mode="table" />)
    const a = document.querySelector('[data-zone="hand:A"]')!
    expect(a.getAttribute('data-count')).toBe('2')
    expect(a.textContent).toContain('Ada')
    expect(a.textContent).not.toMatch(/dragon|knight/)
    // hand:A sits below the table centre, hand:B above: they face opposite ways
    expect(a.getAttribute('data-rot')).toBe('0')
    const b = document.querySelector('[data-zone="hand:B"]')!
    expect(b.getAttribute('data-count')).toBe('0')
    expect(b.getAttribute('data-rot')).toBe('180')
    expect(b.textContent).toContain('B')
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

describe('inspection (K8)', () => {
  it('holding a card shows it enlarged until released; a hidden card enlarges as a back', () => {
    const { view, faceUp, faceDown } = buildScene()
    render(<TableRenderer view={view(null)} mode="table" />)
    expect(document.querySelector('[data-inspect]')).toBeNull()

    fireEvent.mouseDown(document.querySelector(`[data-component="${faceUp}"]`)!)
    const inspect = document.querySelector('[data-inspect]')!
    expect(inspect.getAttribute('data-inspect')).toBe(faceUp)
    expect(inspect.textContent).toContain('wizard')
    fireEvent.mouseUp(document)
    expect(document.querySelector('[data-inspect]')).toBeNull()

    fireEvent.mouseDown(document.querySelector(`[data-component="${faceDown}"]`)!)
    expect(document.querySelector('[data-inspect]')!.getAttribute('data-face')).toBe('back')
    expect(document.querySelector('[data-inspect]')!.textContent).not.toMatch(/rogue/)
  })
})
