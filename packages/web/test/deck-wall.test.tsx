// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DeckWall } from '../src/editor/DeckWall.js'
import { projectDoc } from './project-doc.js'

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
})

describe('images on the wall (E1)', () => {
  it('draws a card whose row points at an asset with the image from the server', () => {
    const doc = projectDoc()
    const hash = 'f'.repeat(64)
    doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
    doc.rows[0]!.fields['art'] = `asset:${hash}`
    render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} assetBase="http://api.local" />)
    const img = document.querySelector('[data-card-ref="dragon"] img[data-element="art"]') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(`http://api.local/assets/${hash}`)
    // A card without an image draws the element empty, not with a reference as its address.
    expect(document.querySelector('[data-card-ref="knight"] img[data-element="art"]')).toBeNull()
  })
})

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
    expect(within(screen.getByRole('list', { name: 'Fysisk kontroll' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows the deck through another eye, with the trim drawn and at arm\'s length (E5)', () => {
    const el = wall()
    expect(el.getAttribute('data-eye')).toBe('normal')
    fireEvent.click(screen.getByRole('button', { name: 'Deuteranopi' }))
    expect(el.getAttribute('data-eye')).toBe('deuteranopia')
    // The simulation is the same transform the check uses, as a filter over the real cards.
    expect(document.querySelector('#byd-eye-deuteranopia feColorMatrix')).toBeTruthy()

    expect(el.getAttribute('data-trim')).toBeNull()
    fireEvent.click(screen.getByLabelText(/snitt och skyddsmarginal/))
    expect(el.getAttribute('data-trim')).toBe('true')
    fireEvent.click(screen.getByLabelText(/armlängds avstånd/))
    expect(el.getAttribute('data-arm')).toBe('true')
  })
})
