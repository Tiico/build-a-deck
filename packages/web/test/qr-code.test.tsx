// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QrCode } from '../src/table/QrCode.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The code held up to a camera (#225).
//
// At 120 px the code is readable by the one phone held against the screen. At the start of a game
// there are four people round a table wanting to join at once, and the way they do it is by all
// looking at the same screen from where they are sitting. So the code has to be able to get big.

const JOIN = 'https://byd.example/join/ABCD'
const codeImage = () => screen.findByAltText(JOIN)

describe('a QR code that can be held up to the table (#225)', () => {
  it('is something to press, and says so', async () => {
    render(<QrCode text={JOIN} />)
    await codeImage()
    const open = screen.getByRole('button', { name: 'Visa koden större' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows the code big, with the address still readable for whoever types it', async () => {
    render(<QrCode text={JOIN} />)
    await codeImage()
    fireEvent.click(screen.getByRole('button', { name: 'Visa koden större' }))
    const big = await screen.findByRole('dialog', { name: 'Anslut med telefonen' })
    // Bigger than the code in the list, and said in the markup rather than left to a stylesheet
    // no test can see: a code that is large only because of a sheet is a code that is small the
    // day the sheet changes.
    const shown = big.querySelector('img') as HTMLImageElement
    expect(Number(shown.getAttribute('width'))).toBeGreaterThan(120)
    // The address stands as text as well, because not everyone at a table has a camera to hand.
    expect(big.textContent).toContain(JOIN)
  })

  it('closes with Escape and gives the focus back to the code it came from', async () => {
    render(<QrCode text={JOIN} />)
    await codeImage()
    const open = screen.getByRole('button', { name: 'Visa koden större' })
    fireEvent.click(open)
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(open)
  })

  it('closes when the press lands outside it', async () => {
    render(<QrCode text={JOIN} />)
    await codeImage()
    fireEvent.click(screen.getByRole('button', { name: 'Visa koden större' }))
    const big = await screen.findByRole('dialog')
    fireEvent.click(big.parentElement as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('stays a picture and nothing more where a press would be meaningless', async () => {
    // The TV draws the code as one line of its own chrome and nobody presses a television.
    render(<QrCode text={JOIN} size={52} enlarge={false} />)
    await codeImage()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
