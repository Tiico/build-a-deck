// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EndSheet, FlagSheet } from '../src/player/SessionSheets.js'

describe('session sheets', () => {
  it('announces the flag sheet as a modal and lets Escape cancel it', () => {
    const onFlag = vi.fn()
    const onClose = vi.fn()
    render(<FlagSheet onFlag={onFlag} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Flagga det här ögonblicket' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    fireEvent.keyDown(screen.getByPlaceholderText(/Vad hände/), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
    expect(onFlag).not.toHaveBeenCalled()
  })

  it('moves focus into the end-session modal and lets Escape keep the session open', () => {
    const onEnd = vi.fn()
    const onClose = vi.fn()
    render(<EndSheet version="v0.7" onEnd={onEnd} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Avsluta bordet?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inte än' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
    expect(onEnd).not.toHaveBeenCalled()
  })
})
