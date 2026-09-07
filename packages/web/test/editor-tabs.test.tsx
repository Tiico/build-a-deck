// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorTabs } from '../src/editor/EditorTabs.js'

describe('the editor tablist (APG tabs)', () => {
  it('is one tab stop and moves focus along the arrow keys', async () => {
    const user = userEvent.setup()
    render(<EditorTabs mode="wall" onSelect={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1'])

    await user.tab()
    expect(document.activeElement).toBe(tabs[0])
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1'])
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
    expect(document.activeElement).toBe(tabs[3])
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(tabs[0])
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(tabs[3])
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
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false'])

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
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0'])

    rerender(<EditorTabs mode="template" onSelect={vi.fn()} />)
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false'])
  })
})

describe('the editor tablist with the tables (#19)', () => {
  it('carries Bord as a fourth tab, last, reached by the same keys as the others', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<EditorTabs mode="wall" onSelect={onSelect} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Kortvägg', 'Mall', 'Tabell', 'Bord'])

    await user.tab()
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(tabs[3])
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0'])
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('tables')
  })
})
