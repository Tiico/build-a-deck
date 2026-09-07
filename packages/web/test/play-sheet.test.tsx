// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlaySheet } from '../src/player/PlaySheet.js'
import { buildScene } from './scene.js'

describe('PlaySheet (C4 zone shortcuts)', () => {
  it('offers every non-hand zone as a target by its shortcut, says where a card goes, the floor last as "Bordet", and reports the choice', () => {
    const { view } = buildScene()
    const onPlay = vi.fn()
    render(<PlaySheet view={view('A')} count={1} label="dragon" onPlay={onPlay} onClose={() => undefined} />)
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual([expect.stringMatching(/^Kasta3 kort · överst i Kasthög$/), expect.stringMatching(/^Lägg underst3 kort · underst i Draghög$/), expect.stringMatching(/^Bordetlägg fritt$/)])
    expect(screen.getByText(/dragon/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Kasta/ }))
    expect(onPlay).toHaveBeenCalledWith('discard', 'top')
    fireEvent.click(screen.getByRole('button', { name: /Lägg underst/ }))
    expect(onPlay).toHaveBeenCalledWith('draw', 'bottom')
  })

  it('a zone without a shortcut is offered by its name, on top', () => {
    const { view } = buildScene()
    const v = view('A')
    const plain = { ...v, zones: v.zones.map((z) => (z.id === 'discard' ? { ...z, shortcut: undefined } : z)) }
    const onPlay = vi.fn()
    render(<PlaySheet view={plain} count={1} label="dragon" onPlay={onPlay} onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Kasthög/ }))
    expect(onPlay).toHaveBeenCalledWith('discard', 'top')
  })

  it('is announced as a modal and Escape closes it without playing a card', () => {
    const { view } = buildScene()
    const onPlay = vi.fn()
    const onClose = vi.fn()
    render(<PlaySheet view={view('A')} count={1} label="dragon" onPlay={onPlay} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Spela till' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
    expect(onPlay).not.toHaveBeenCalled()
  })
})
