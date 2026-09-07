// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
