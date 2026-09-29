// @vitest-environment jsdom
// The crop window moved and sized by a single pointer without a drag (#579 F-7, beställarens
// beslut 2026-09-29, C): a pad of four arrows moves it and «Mindre» and «Större» size it round its
// middle, under the picture. No zoom (L33). Every press is one settled change, as a key press is,
// and none of them takes the window outside the picture or under its least size.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Crop } from '../src/editor/Crop.js'
import type { AssetCrop } from '@byd/protocol'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

function crop(start: AssetCrop) {
  const onChange = vi.fn()
  render(<Crop url="/x.png" ratio={1.5} crop={start} onChange={onChange} />)
  return onChange
}
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1) as [AssetCrop, boolean]

describe('the crop window without a drag (#579)', () => {
  it('moves the window a step with each arrow on the pad, as the arrow keys do', async () => {
    const user = userEvent.setup()
    const onChange = crop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
    await user.click(screen.getByRole('button', { name: 'Flytta utsnittet åt vänster' }))
    expect(last(onChange)).toEqual([{ x: 0.18, y: 0.2, w: 0.5, h: 0.5 }, true])
    await user.click(screen.getByRole('button', { name: 'Flytta utsnittet nedåt' }))
    expect(last(onChange)).toEqual([{ x: 0.2, y: 0.22, w: 0.5, h: 0.5 }, true])
  })

  it('makes the window smaller and larger round its middle', async () => {
    const user = userEvent.setup()
    const onChange = crop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
    await user.click(screen.getByRole('button', { name: 'Mindre utsnitt' }))
    expect(last(onChange)).toEqual([{ x: 0.21, y: 0.21, w: 0.48, h: 0.48 }, true])
    await user.click(screen.getByRole('button', { name: 'Större utsnitt' }))
    expect(last(onChange)).toEqual([{ x: 0.19, y: 0.19, w: 0.52, h: 0.52 }, true])
  })

  it('keeps the window inside the picture and over its least size', async () => {
    const user = userEvent.setup()
    const whole = crop({ x: 0, y: 0, w: 1, h: 1 })
    // A press that changes nothing is no change, and no step in the history either.
    await user.click(screen.getByRole('button', { name: 'Större utsnitt' }))
    await user.click(screen.getByRole('button', { name: 'Flytta utsnittet åt vänster' }))
    expect(whole).not.toHaveBeenCalled()
  })

  it('does not make a window at its least size any smaller', async () => {
    const user = userEvent.setup()
    const least = crop({ x: 0.4, y: 0.4, w: 0.1, h: 0.1 })
    await user.click(screen.getByRole('button', { name: 'Mindre utsnitt' }))
    expect(least).not.toHaveBeenCalled()
  })

  it('stands under the picture, where the keys are said, and each button is a whole target', () => {
    crop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
    const pad = screen.getByRole('group', { name: 'Flytta och ändra utsnittet' })
    expect(pad.querySelectorAll('button')).toHaveLength(6)
    expect(pad.compareDocumentPosition(document.querySelector('.byd-crop-keys')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
