// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { VisibleComponentState } from '@byd/protocol'
import { HandFan } from '../src/online/HandFan.js'

const base = { id: 'c1', type: { id: 'card.standard.63x88', version: 1 }, zone: 'hand:A', x: 0, y: 0, rot: 0 }
const mine: VisibleComponentState = { ...base, face: 'front', cardRef: 'dragon', faces: { front: 'a'.repeat(64) } }
const opaque: VisibleComponentState = { ...base, id: 'c2', face: 'back', cardRef: null, faces: { back: 'b'.repeat(64) } }

describe('a texture the online fan is still waiting for (#10)', () => {
  it('names the card the seat holds, and says nothing about one it may not see', () => {
    render(<HandFan cards={[mine, opaque]} faces="http://faces.test" onPlay={() => undefined} onOpen={() => undefined} />)

    expect(document.querySelector('[data-hand-card="c1"] [data-texture="pending"]')!.textContent).toContain('dragon')
    const hidden = document.querySelector('[data-hand-card="c2"] [data-texture="pending"]')!
    expect(hidden.textContent).toMatch(/[Rr]enderas/)
    expect(hidden.textContent).not.toMatch(/dragon/)
  })
})

describe('retrying a lost texture in the fan', () => {
  it('does not play the card the player only meant to reload', () => {
    vi.useFakeTimers()
    const onPlay = vi.fn()
    render(<HandFan cards={[mine]} faces="http://faces.test" onPlay={onPlay} onOpen={() => undefined} />)
    const img = () => document.querySelector('img') as HTMLImageElement
    for (let i = 0; i <= 8; i++) {
      fireEvent.error(img())
      act(() => vi.advanceTimersByTime(1500 * (i + 1)))
    }

    const button = screen.getByRole('button', { name: /försök igen/i })
    // One at a time, as a thumb produces them: a press that reached the fan would arm a drag.
    act(() => {
      fireEvent.pointerDown(button, { clientX: 10, clientY: 10 })
    })
    act(() => {
      fireEvent.pointerUp(button, { clientX: 10, clientY: 10 })
    })
    act(() => {
      fireEvent.click(button)
    })

    expect(onPlay).not.toHaveBeenCalled()
    expect(document.querySelector('[data-texture="pending"]')).not.toBeNull()
    vi.useRealTimers()
  })
})
