// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RadialMenu } from '../src/table/RadialMenu.js'

const verbs = [
  { label: 'Vänd', run: () => undefined },
  { label: 'Stäng', run: null, kind: 'no' as const },
]

describe('the ring of verbs (K14)', () => {
  // A ring that opened is a thing the keyboard has to be able to leave, the way it leaves every
  // other panel: Escape, without choosing a verb.
  it('closes on Escape without running a verb', () => {
    const onClose = vi.fn()
    const run = vi.fn()
    render(<RadialMenu id="c1" x={100} y={100} items={[{ label: 'Vänd', run }, ...verbs.slice(1)]} onClose={onClose} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
  })

  it('still closes from Stäng', () => {
    const onClose = vi.fn()
    render(<RadialMenu id="c1" x={100} y={100} items={verbs} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
