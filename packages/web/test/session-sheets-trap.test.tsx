// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EndSheet, ExitSheet, FlagSheet } from '../src/player/SessionSheets.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The way-out, flag and end sheets say `aria-modal="true"` (#484 fynd 7, shared with /play). A
// modal window holds the keyboard: Tab walked out of them into the table behind, and Escape was
// only heard while the focus happened to stand inside. They now keep the promise they make.
const sheets = [
  ['the way out', (onClose: () => void) => <ExitSheet onLeave={() => undefined} onEnd={() => undefined} onClose={onClose} />, 'Stanna'],
  ['the flag', (onClose: () => void) => <FlagSheet onFlag={() => undefined} onClose={onClose} />, null],
  ['the end', (onClose: () => void) => <EndSheet version="v1" onEnd={() => undefined} onClose={onClose} />, 'Inte än'],
] as const

describe('a session sheet holds the keyboard while it stands (#484)', () => {
  it.each(sheets)('%s: Tab stays inside, and Escape closes it wherever the focus fell', async (_what, sheet) => {
    const onClose = vi.fn()
    render(
      <>
        <button type="button">behind</button>
        {sheet(onClose)}
      </>,
    )
    const user = userEvent.setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement), `after ${i + 1} Tab`).toBe(true)
    }
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each(sheets.filter(([, , first]) => first !== null))('%s: opens on the harmless answer', (_what, sheet, first) => {
    render(sheet(() => undefined))
    expect((document.activeElement as HTMLElement).textContent).toMatch(new RegExp(`^${first}`))
  })
})
