// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlaySheet } from '../src/player/PlaySheet.js'
import { buildScene } from './scene.js'

describe('PlaySheet (C4 zone shortcuts)', () => {
  it('offers every non-hand zone as a target with its count, the floor last as "Bordet", and reports the choice', () => {
    const { view } = buildScene()
    const onPlay = vi.fn()
    render(<PlaySheet view={view('A')} count={1} label="dragon" onPlay={onPlay} onClose={() => undefined} />)
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual([expect.stringMatching(/Kasthög.*3/), expect.stringMatching(/Draghög.*3/), expect.stringMatching(/Bordet/)])
    expect(screen.getByText(/dragon/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Kasthög/ }))
    expect(onPlay).toHaveBeenCalledWith('discard')
  })
})
