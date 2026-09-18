// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorTabs } from '../src/editor/EditorTabs.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// A roving tabindex is one stop wherever it stands, and a tablist has exactly one selected tab.
// How many tabs there are is the subject of one test in this file and of none of the others, so
// the rest read the shape off the tablist in front of them rather than spelling out a count that
// every new tab would have to come back here and change.
const roving = (at: number, tabs: readonly Element[]) => tabs.map((_, i) => (i === at ? '0' : '-1'))
const chosen = (at: number, tabs: readonly Element[]) => tabs.map((_, i) => String(i === at))
const tabindexes = (tabs: readonly Element[]) => tabs.map((t) => t.getAttribute('tabindex'))
const selected = (tabs: readonly Element[]) => tabs.map((t) => t.getAttribute('aria-selected'))

describe('the editor tablist (APG tabs)', () => {
  it('is one tab stop and moves focus along the arrow keys', async () => {
    const user = userEvent.setup()
    render(<EditorTabs mode="wall" onSelect={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabindexes(tabs)).toEqual(roving(0, tabs))

    await user.tab()
    expect(document.activeElement).toBe(tabs[0])
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabindexes(tabs)).toEqual(roving(1, tabs))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(tabs[0])
  })
})

describe('the editor tablist at its ends', () => {
  it('jumps to the first and last tab with Home and End, and wraps around', async () => {
    const user = userEvent.setup()
    render(<EditorTabs mode="wall" onSelect={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')

    await user.tab()
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(tabs.at(-1))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(tabs[0])
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(tabs.at(-1))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[0])
  })
})

describe('the editor tablist activates on purpose, not in passing', () => {
  it('leaves the mode alone while focus moves and switches it on Enter, Space or click', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<EditorTabs mode="wall" onSelect={onSelect} />)
    const tabs = screen.getAllByRole('tab')

    await user.tab()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(onSelect).not.toHaveBeenCalled()
    expect(selected(tabs)).toEqual(chosen(0, tabs))

    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('table')
    await user.keyboard('{ArrowLeft} ')
    expect(onSelect).toHaveBeenLastCalledWith('template')
    await user.click(tabs[0]!)
    expect(onSelect).toHaveBeenLastCalledWith('wall')
  })
})

describe('the editor tablist when the mode changes elsewhere', () => {
  it('puts the tab stop back on the open tab (the wall opens the template by itself)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<EditorTabs mode="wall" onSelect={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')
    await user.tab()
    await user.keyboard('{End}')
    expect(tabindexes(tabs)).toEqual(roving(tabs.length - 1, tabs))

    rerender(<EditorTabs mode="template" onSelect={vi.fn()} />)
    expect(tabindexes(tabs)).toEqual(roving(1, tabs))
    expect(selected(tabs)).toEqual(chosen(1, tabs))
  })
})

describe('the editor tablist with the symbols (E4), the rules (B7) and the tables (#19)', () => {
  it('carries Symboler, Regler and Bord, reached by the same keys as the others', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<EditorTabs mode="wall" onSelect={onSelect} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(expect.arrayContaining(['Symboler', 'Regler', 'Bord']))

    await user.tab()
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(tabs.at(-1))
    expect(tabindexes(tabs)).toEqual(roving(tabs.length - 1, tabs))
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('tables')
  })
})

describe('the editor tablist with the media library (#222)', () => {
  it('carries Media beside Symboler, where the game’s pictures are found and tidied', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<EditorTabs mode="wall" onSelect={onSelect} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Kortvägg', 'Mall', 'Tabell', 'Symboler', 'Media', 'Regler', 'Bord'])

    await user.tab()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(tabs[4])
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('media')
  })
})
