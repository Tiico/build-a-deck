// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Texture } from '../src/table/Texture.js'

describe('Texture', () => {
  it('keeps a named fallback visible while the texture is pending', () => {
    const { container } = render(<Texture src="http://faces.test/faces/card" label="Drake" />)

    expect(screen.getByText('Drake')).toBeTruthy()
    expect(screen.getByText('Kortet renderas…')).toBeTruthy()
    expect(container.querySelector('img')).toHaveProperty('hidden', true)
  })

  it('swaps complete images atomically, including when a new texture replaces the old one', () => {
    const { container, rerender } = render(<Texture src="http://faces.test/faces/card-v1" label="Drake" />)
    let image = container.querySelector('img')!

    fireEvent.load(image)
    expect(image.hidden).toBe(false)
    expect(screen.queryByText('Kortet renderas…')).toBeNull()

    rerender(<Texture src="http://faces.test/faces/card-v2" label="Drake" />)
    image = container.querySelector('img')!
    expect(image.src).toBe('http://faces.test/faces/card-v2')
    expect(image.hidden).toBe(true)
    expect(screen.getByText('Kortet renderas…')).toBeTruthy()

    fireEvent.load(image)
    expect(image.hidden).toBe(false)
    expect(screen.queryByText('Kortet renderas…')).toBeNull()
  })

  it('ends with a comprehensible error and lets the user retry', () => {
    vi.useFakeTimers()
    const { container } = render(<Texture src="http://faces.test/faces/card" label="Drake" />)
    const image = container.querySelector('img')!

    for (let attempt = 0; attempt < 8; attempt++) {
      fireEvent.error(image)
      act(() => vi.advanceTimersByTime(1500 * (attempt + 1)))
    }
    fireEvent.error(image)

    expect(screen.getByText('Texturen kunde inte visas.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    expect(screen.getByText('Kortet renderas…')).toBeTruthy()
    expect(image.hidden).toBe(true)
    vi.useRealTimers()
  })
})
