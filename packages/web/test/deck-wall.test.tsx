// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DeckWall } from '../src/editor/DeckWall.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

describe('DeckWall (C as the home view)', () => {
  it('renders every row as a compiled card with its copies and warnings, and reports clicks on cards and elements', () => {
    const doc = projectDoc()
    doc.rows[2]!.fields['body'] = 'Har {magi}.'
    const onSelectRow = vi.fn()
    const onSelectElement = vi.fn()
    render(<DeckWall doc={doc} face="front" selectedRow="knight" onSelectRow={onSelectRow} onSelectElement={onSelectElement} />)

    const cards = [...document.querySelectorAll('[data-card-ref]')]
    expect(cards.map((c) => c.getAttribute('data-card-ref'))).toEqual(['dragon', 'knight', 'wizard'])
    expect(screen.getByText('Drake')).toBeTruthy()
    expect(cards[0]!.querySelector('[data-copies]')!.textContent).toBe('×2')
    expect(cards[1]!.querySelector('[data-copies]')).toBeNull()
    expect(cards[2]!.querySelector('[data-warnings]')!.textContent).toBe('1')
    expect(cards[0]!.querySelector('[data-warnings]')).toBeNull()
    expect(cards[1]!.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(cards[0]!)
    expect(onSelectRow).toHaveBeenCalledWith('dragon')
    fireEvent.click(cards[2]!.querySelector('[data-element="title"]')!)
    expect(onSelectElement).toHaveBeenCalledWith('title')
  })

  it('opens the card that was clicked, not the one that happened to be selected (#234)', () => {
    const doc = projectDoc()
    const onSelectRow = vi.fn()
    const onSelectElement = vi.fn()
    // `knight` is the selected card and wears the ring; `wizard` is the one the hand goes to.
    render(<DeckWall doc={doc} face="front" selectedRow="knight" onSelectRow={onSelectRow} onSelectElement={onSelectElement} />)
    const wizard = document.querySelector('[data-card-ref="wizard"]')!

    // Almost the whole of a card is its elements — the front's frame shape alone covers 61 × 86 of
    // its 63 × 88 — so a click on a card is nearly always a click on an element of it. The preview
    // stops that click from travelling, which is right: the element is the more particular answer.
    // But the wall still has to say which card the element belongs to, or the view that opens is
    // about whichever card was selected before.
    fireEvent.click(wizard.querySelector('[data-element="title"]')!)
    expect(onSelectElement).toHaveBeenCalledWith('title')
    expect(onSelectRow).toHaveBeenCalledWith('wizard')
  })

  it('says the card is chosen before it says which element, so the element is read on the right card', () => {
    const doc = projectDoc()
    const said: string[] = []
    render(
      <DeckWall
        doc={doc}
        face="front"
        selectedRow="knight"
        onSelectRow={(id) => said.push(`row:${id}`)}
        onSelectElement={(id) => said.push(`element:${id}`)}
      />,
    )
    fireEvent.click(document.querySelector('[data-card-ref="wizard"]')!.querySelector('[data-element="title"]')!)
    expect(said).toEqual(['row:wizard', 'element:title'])
  })
})

describe('images on the wall (E1)', () => {
  it('draws a card whose row points at an asset with the image from the server', () => {
    const doc = projectDoc()
    const hash = 'f'.repeat(64)
    doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
    doc.rows[0]!.fields['art'] = `asset:${hash}`
    render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} assetBase="http://api.local" />)
    // The element is the frame and the picture hangs inside it (E1), so the box a designer
    // grabs stays the box however the picture is fitted into it.
    const img = document.querySelector('[data-card-ref="dragon"] [data-element="art"] img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(`http://api.local/assets/${hash}`)
    // A card without an image draws the frame empty, not with a reference as its address.
    expect(document.querySelector('[data-card-ref="knight"] [data-element="art"]')).not.toBeNull()
    expect(document.querySelector('[data-card-ref="knight"] [data-element="art"] img')).toBeNull()
  })
})

// Since #128 the wall wears a crown: the report and the eyes are behind named boxes that open over
// the deck, rather than a 320 px dock and a row of segments standing there all the time. A box is
// found by the name it starts with, because what follows it is the state it is saying.
const openBox = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))

describe('the physical checks on the wall (E5)', () => {
  const tiny = { kind: 'text', id: 'flavour', x: 6, y: 70, w: 51, h: 10, bind: { field: 'flavour' }, font: { family: 'system-ui', sizePt: 5 }, color: '#111111' } as const
  const paper = { kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#ffffff' } as const
  const body = { kind: 'text', id: 'body', x: 6, y: 30, w: 51, h: 30, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 9 }, color: '#111111' } as const
  const faulty = () => {
    const doc = projectDoc()
    doc.template.faces['front']!.base = [paper, body, tiny]
    doc.template.faces['back']!.base = [paper]
    return doc
  }
  const wall = (doc = faulty()) => {
    render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />)
    return document.querySelector('[data-wall]') as HTMLElement
  }

  it('gathers the deck\'s faults by kind, says what stops an order, and marks the cards a fault touches', () => {
    wall()
    openBox(/^Fysisk kontroll/)
    const report = screen.getByRole('list', { name: 'Fysisk kontroll' })
    const rows = within(report).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.textContent).toContain('för liten text')
    expect(rows[0]!.textContent).toContain('3 kort')
    expect(rows[0]!.getAttribute('data-severity')).toBe('error')
    expect(screen.getByText(/stoppar en order/)).toBeTruthy()

    fireEvent.click(within(rows[0]!).getByRole('button', { name: /för liten text/ }))
    expect(document.querySelectorAll('[data-card-ref][data-marked]')).toHaveLength(3)
    expect(within(rows[0]!).getByText(/5 pt/)).toBeTruthy()
    // Clicking it again lets the deck go.
    fireEvent.click(within(rows[0]!).getByRole('button', { name: /för liten text/ }))
    expect(document.querySelectorAll('[data-card-ref][data-marked]')).toHaveLength(0)
  })

  it('says so plainly when nothing is wrong', () => {
    const clean = faulty()
    clean.template.faces['front']!.base = [paper, body]
    wall(clean)
    openBox(/^Fysisk kontroll/)
    expect(screen.getByText(/klarar kontrollen/)).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Fysisk kontroll' })).toBeNull()
  })

  it('leaves the card\'s own badge alone: a template fault is said once in the report, not on every card', () => {
    const doc = faulty()
    doc.rows[0]!.fields['body'] = 'Har {magi}.'
    wall(doc)
    // One unknown icon on this card, and nothing added for the three cards' shared fault.
    expect(document.querySelector('[data-card-ref="dragon"] [data-warnings]')!.textContent).toBe('1')
    expect(document.querySelector('[data-card-ref="knight"] [data-warnings]')).toBeNull()
    openBox(/^Fysisk kontroll/)
    expect(within(screen.getByRole('list', { name: 'Fysisk kontroll' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows the deck through another eye, with the trim drawn and at arm\'s length (E5)', () => {
    const el = wall()
    expect(el.getAttribute('data-eye')).toBe('normal')
    // The box says which eye is chosen before it is opened, which is the whole price of putting
    // the eyes behind a door: a simulation left on unannounced is worse than none (E5).
    expect(screen.getByRole('button', { name: /^Ögon/ }).textContent).toContain('Som du ser det')
    openBox(/^Ögon/)
    fireEvent.click(screen.getByRole('button', { name: 'Deuteranopi' }))
    expect(el.getAttribute('data-eye')).toBe('deuteranopia')
    expect(screen.getByRole('button', { name: /^Ögon/ }).textContent).toContain('Deuteranopi')
    // The simulation is the same transform the check uses, as a filter over the real cards.
    expect(document.querySelector('#byd-eye-deuteranopia feColorMatrix')).toBeTruthy()

    expect(el.getAttribute('data-trim')).toBeNull()
    expect(screen.getByRole('button', { name: /^Guider/ }).textContent).toContain('(0)')
    openBox(/^Guider/)
    fireEvent.click(screen.getByLabelText(/snitt och skyddsmarginal/))
    expect(el.getAttribute('data-trim')).toBe('true')
    fireEvent.click(screen.getByLabelText(/armlängds avstånd/))
    expect(el.getAttribute('data-arm')).toBe('true')
    expect(screen.getByRole('button', { name: /^Guider/ }).textContent).toContain('(2)')
  })
})
