// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { HandGrid } from '../src/player/HandGrid.js'
import { buildScene } from './scene.js'

describe('HandGrid', () => {
  it("shows the seat's own cards by name oldest first, and nothing from anywhere else", () => {
    const { view } = buildScene()
    render(<HandGrid view={view('A')} selected={new Set()} onToggle={() => undefined} onOpen={() => undefined} />)
    const cards = [...document.querySelectorAll('[data-hand-card]')]
    // The scene draws the dragon last of the two, so it is the one nearest the growing end (#415).
    expect(cards.map((c) => c.textContent)).toEqual([expect.stringContaining('knight'), expect.stringContaining('dragon')])
    expect(screen.queryByText('wizard')).toBeNull()
  })
})

// What the card is called is the row's own title, with its capitals and its diacritics (#412).
// The id is the row's address and was never a word for a reader: a wizard-built deck slugs the
// title into it, and an imported one numbers it `c-001`.
describe('a card is called by its title (#412, A4)', () => {
  const named = (title?: string) => {
    const { view } = buildScene()
    const snapshot = view('A')
    return {
      ...snapshot,
      components: snapshot.components.map((c) => (c.zone === 'hand:A' ? { ...c, cardRef: 'bjornen', ...(title === undefined ? {} : { title }) } : c)),
    }
  }

  it('writes and speaks «Björnen» where the row id is `bjornen`', () => {
    render(<HandGrid view={named('Björnen')} selected={new Set()} onToggle={() => undefined} onOpen={() => undefined} />)
    const card = document.querySelector('[data-hand-card]')!
    expect(card.textContent).toContain('Björnen')
    expect(card.getAttribute('aria-label')).toContain('Björnen')
    expect(card.textContent).not.toContain('bjornen')
    expect(card.getAttribute('aria-label')).not.toContain('bjornen')
  })

  it('falls back to the id for a deck whose rows carry no title, as it always did', () => {
    render(<HandGrid view={named()} selected={new Set()} onToggle={() => undefined} onOpen={() => undefined} />)
    const card = document.querySelector('[data-hand-card]')!
    expect(card.textContent).toContain('bjornen')
    expect(card.getAttribute('aria-label')).toContain('bjornen')
  })
})

// A press marks a card and a second unmarks it (#1147, beställarens val B): the strip's tap that held
// a card up, its drag up that lifted it and its rest that marked it are gone with the strip. What a
// marked card is for is the bar under the grid; the grid only says which and in what order.
describe('marking cards (#1147)', () => {
  it('a press marks the card, Space does the same, and marked cards carry the order they were marked in', () => {
    const { view } = buildScene()
    const onToggle = vi.fn()
    const snapshot = view('A')
    const ids = snapshot.components.filter((c) => c.zone === 'hand:A').map((c) => c.id)
    const { rerender } = render(<HandGrid view={snapshot} selected={new Set()} onToggle={onToggle} onOpen={() => undefined} />)
    const card = [...document.querySelectorAll('[data-hand-card]')].find((c) => c.textContent?.includes('dragon'))!
    fireEvent.click(card)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0]?.[0]).toMatchObject({ cardRef: 'dragon' })
    // One marked card carries no number: there is no order to tell.
    rerender(<HandGrid view={snapshot} selected={new Set([ids[0]!])} onToggle={onToggle} onOpen={() => undefined} />)
    expect(document.querySelector('[aria-pressed="true"]')).not.toBeNull()
    expect(document.querySelector('.byd-grid-at')).toBeNull()
    rerender(<HandGrid view={snapshot} selected={new Set([ids[1]!, ids[0]!])} onToggle={onToggle} onOpen={() => undefined} />)
    expect(document.querySelector(`[data-hand-card="${ids[1]}"] .byd-grid-at`)?.textContent).toBe('1')
    expect(document.querySelector(`[data-hand-card="${ids[0]}"] .byd-grid-at`)?.textContent).toBe('2')
  })

  it('Enter opens the address panel on the card, and marks nothing', () => {
    const { view } = buildScene()
    const onToggle = vi.fn()
    const onOpen = vi.fn()
    render(<HandGrid view={view('A')} selected={new Set()} onToggle={onToggle} onOpen={onOpen} />)
    const card = document.querySelector<HTMLElement>('[data-hand-card]')!
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })
})

describe('textures in the hand (TUNN-SKIVA §5)', () => {
  it('shows the front image of a card whose hash is known, by name otherwise', () => {
    const { view } = buildScene()
    const snapshot = view('A')
    const hand = snapshot.components.filter((c) => c.zone === 'hand:A')
    const first = hand[0]!
    const second = hand[1]!
    const withFaces = { ...snapshot, components: snapshot.components.map((c) => (c.id === first.id ? { ...c, faces: { front: 'a'.repeat(64), back: 'b'.repeat(64) } } : c)) }
    render(<HandGrid view={withFaces} selected={new Set()} faces="http://faces.test" onToggle={() => undefined} onOpen={() => undefined} />)
    const img = document.querySelector(`[data-hand-card="${first.id}"] img`) as HTMLImageElement
    expect(img.src).toBe(`http://faces.test/faces/${'a'.repeat(64)}`)
    expect(document.querySelector(`[data-hand-card="${second.id}"] img`)).toBeNull()
    expect(document.querySelector(`[data-hand-card="${second.id}"]`)!.textContent).toContain('knight')
  })
})

describe('a texture the phone is still waiting for (#10)', () => {
  it('holds the card open with its name, and says nothing about one the seat may not see', () => {
    const { view } = buildScene()
    const snapshot = view('A')
    const hand = snapshot.components.filter((c) => c.zone === 'hand:A')
    const mine = hand[0]!
    const notMine = hand[1]!
    const withFaces = {
      ...snapshot,
      components: snapshot.components.map((c) =>
        c.id === mine.id
          ? { ...c, faces: { front: 'a'.repeat(64) } }
          : c.id === notMine.id
            ? { ...c, cardRef: null, faces: { back: 'b'.repeat(64) } }
            : c,
      ),
    }
    render(<HandGrid view={withFaces} selected={new Set()} faces="http://faces.test" onToggle={() => undefined} onOpen={() => undefined} />)

    expect(document.querySelector(`[data-hand-card="${mine.id}"] [data-texture="pending"]`)!.textContent).toContain('dragon')
    const opaque = document.querySelector(`[data-hand-card="${notMine.id}"] [data-texture="pending"]`)!
    expect(opaque.textContent).toMatch(/[Ll]addar/)
    expect(opaque.textContent).not.toMatch(/knight/)
  })
})

// The hand card is a control, and a control cannot hold another (UX-37, #82): a screen reader
// does not reach a button inside a button, and browsers do not agree on what a press means. So
// a card in the grid carries no way back of its own; it is read by holding it up, and the
// held-up card carries the retry.
describe('a texture the phone has given up on (#82)', () => {
  it('leaves the card one control and nothing nested in it, and a press still marks it', () => {
    vi.useFakeTimers()
    const { view } = buildScene()
    const snapshot = view('A')
    const mine = snapshot.components.find((c) => c.zone === 'hand:A')!
    const withFaces = { ...snapshot, components: snapshot.components.map((c) => (c.id === mine.id ? { ...c, faces: { front: 'a'.repeat(64) } } : c)) }
    const onToggle = vi.fn()
    render(<HandGrid view={withFaces} selected={new Set()} faces="http://faces.test" onToggle={onToggle} onOpen={() => undefined} />)
    const img = () => document.querySelector(`[data-hand-card="${mine.id}"] img`) as HTMLImageElement
    for (let i = 0; i <= 8; i++) {
      fireEvent.error(img())
      act(() => vi.advanceTimersByTime(1500 * (i + 1)))
    }
    const card = document.querySelector(`[data-hand-card="${mine.id}"]`)!
    expect(card.querySelector('[data-texture="failed"]')).not.toBeNull()

    expect(document.querySelectorAll('button button, button [role="button"], [role="button"] button')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /försök igen/i })).toBeNull()

    // What the finger does is untouched: a press on the lost card still marks it.
    fireEvent.click(card)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0]?.[0]).toMatchObject({ id: mine.id })
    vi.useRealTimers()
  })
})

describe('a hand with nothing in it (UX-16)', () => {
  it('points at the draw pile, and steps aside the moment a card arrives', () => {
    const { view } = buildScene()
    const dealt = view('A')
    const empty = { ...dealt, components: dealt.components.filter((c) => c.zone !== 'hand:A') }
    const props = { selected: new Set<string>(), onToggle: () => undefined, onOpen: () => undefined }
    const { rerender } = render(<HandGrid view={empty} {...props} />)
    expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(0)
    expect(screen.getByText(/Du har inga kort/).textContent).toBe('Du har inga kort. Dra ett kort från Draghög.')

    rerender(<HandGrid view={dealt} {...props} />)
    expect(screen.queryByText(/Du har inga kort/)).toBeNull()
    expect(document.querySelectorAll('[data-hand-card]')).toHaveLength(2)
  })

  // And with no card left to draw it does not ask for one (#751): an empty draw pile beside an
  // empty hand is a table where nothing can be drawn, and saying «Dra ett kort» there sends the
  // player looking for a verb that is not on the pile.
  it('does not ask for a card when no pile holds one', () => {
    const { view } = buildScene()
    const dealt = view('A')
    const piles = new Set(dealt.zones.filter((z) => z.kind === 'pile').map((z) => z.id))
    const nothing = {
      ...dealt,
      components: dealt.components.filter((c) => c.zone !== 'hand:A' && !piles.has(c.zone)),
      zones: dealt.zones.map((z) => (z.kind !== 'pile' ? z : z.mode === 'count' ? { ...z, count: 0 } : { ...z, order: [] })),
    }
    const props = { selected: new Set<string>(), onToggle: () => undefined, onOpen: () => undefined }
    render(<HandGrid view={nothing} {...props} />)
    expect(screen.getByText(/Du har inga kort/).textContent).toBe('Du har inga kort, och det finns inga att dra.')
  })
})

// The hand grows towards the reading direction (#415, decision B of 2026-09-22). A drawn card
// lands on top of the hand zone, which is index 0 of the projection's order — so the grid is
// the hand read from the bottom up, and the card that just arrived is the last one shown. The
// cards that were already there do not move, which is the whole of why this was chosen over
// scrolling the marking into a hand that reindexes under the finger.
describe('new cards lie last in the hand (#415, K4)', () => {
  const namesIn = (el: ParentNode) => [...el.querySelectorAll('[data-hand-card]')].map((c) => c.getAttribute('data-hand-card'))

  it('shows the hand oldest first, so a drawn card is last and the others keep their places', () => {
    const scene = buildScene()
    const before = scene.view('A')
    const { rerender } = render(<HandGrid view={before} selected={new Set()} onToggle={() => undefined} onOpen={() => undefined} />)
    const held = namesIn(document)

    scene.viewAfter({ v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const after = scene.view('A')
    rerender(<HandGrid view={after} selected={new Set()} onToggle={() => undefined} onOpen={() => undefined} />)

    const shown = namesIn(document)
    expect(shown).toHaveLength(held.length + 1)
    expect(shown.slice(0, held.length)).toEqual(held)
  })
})

// Re-sorting the hand by keyboard (K4; #483 fynd 12, beslut A efter prototyp 33): Alt and an
// arrow move the focused card one place along the hand, as Alt and an arrow move a layer or a
// column everywhere else in this tool. The grid says where the card should stand; the page
// turns that into the hand's own order.
describe('re-sorting the hand with the keyboard', () => {
  it('moves the focused card one place along the hand with Alt and an arrow, and not past either end', () => {
    const { view } = buildScene()
    const onReorder = vi.fn()
    render(<HandGrid view={view('A')} selected={new Set()} onToggle={() => undefined} onOpen={() => undefined} onReorder={onReorder} />)
    const [knight, dragon] = [...document.querySelectorAll<HTMLElement>('[data-hand-card]')]
    fireEvent.keyDown(knight!, { key: 'ArrowRight', altKey: true })
    expect(onReorder).toHaveBeenLastCalledWith(expect.objectContaining({ id: knight!.dataset['handCard'] }), 1)
    fireEvent.keyDown(knight!, { key: 'ArrowLeft', altKey: true })
    fireEvent.keyDown(dragon!, { key: 'ArrowRight', altKey: true })
    expect(onReorder).toHaveBeenCalledTimes(1)
  })
})
