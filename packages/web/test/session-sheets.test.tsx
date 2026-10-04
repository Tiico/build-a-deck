// @vitest-environment jsdom
// The session's own sheets are modal, and a modal window owes the keyboard four things (#485,
// fynd 6; the same sheets #483 and #484 found): the focus goes in, Tab stays in, Escape answers from
// wherever the focus is, and the focus goes back to what opened it. They said `aria-modal` and did
// none of it — Tab walked out onto the table, and the focus fell to <body> when they closed.
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EndSheet, ExitSheet, FlagSheet } from '../src/player/SessionSheets.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

function Opener({ sheet }: { sheet: 'flag' | 'exit' | 'end' }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öppna
      </button>
      <button type="button">Bakom</button>
      {open && sheet === 'flag' && <FlagSheet onFlag={close} onClose={close} />}
      {open && sheet === 'exit' && <ExitSheet pile="Draghög" onLeave={close} onEnd={close} onClose={close} />}
      {open && sheet === 'end' && <EndSheet version="v1" onEnd={close} onClose={close} />}
    </>
  )
}

describe.each(['flag', 'exit', 'end'] as const)('the %s sheet', (sheet) => {
  it('holds Tab inside, closes on Escape, and hands the focus back to what opened it', async () => {
    const user = userEvent.setup()
    render(<Opener sheet={sheet} />)
    const opener = screen.getByRole('button', { name: 'Öppna' })
    await user.click(opener)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    for (let i = 0; i < 8; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    // Escape answers from wherever the focus fell, <body> included (#484 fynd 7).
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })
})
