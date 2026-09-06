// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckWall } from '../src/editor/DeckWall.js'
import { projectDoc } from './project-doc.js'

describe('DeckWall (C as the home view)', () => {
  it('renders every row as a compiled card with its copies and warnings, and reports clicks on cards and elements', () => {
    const doc = projectDoc()
    doc.rows['wizard'] = { ...doc.rows['wizard'], body: 'Har {magi}.' }
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
