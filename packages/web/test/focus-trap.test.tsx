// @vitest-environment jsdom
// The keyboard held inside a modal window while it stands (#296). The editor had no such thing:
// the history panel says `aria-modal="false"` and the question is a strip a reader may tab past.
// A library dialog is modal — the table behind it is not the thing being asked about — so the
// focus moves in when it opens, cycles inside while it is open, and goes back to the control that
// opened it when it closes, whichever way it closes.
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useFocusTrap } from '../src/editor/focusTrap.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

function Window({ onEscape, initial }: { onEscape(): void; initial?: boolean | undefined }) {
  const box = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  useFocusTrap(box, { onEscape, ...(initial ? { initial: () => search.current } : {}) })
  return (
    <div ref={box} role="dialog" aria-label="Fönstret">
      <button type="button">Första</button>
      <input ref={search} aria-label="Sök" />
      <button type="button" disabled>
        Avstängd
      </button>
      <button type="button">Sista</button>
    </div>
  )
}

function Page({ initial }: { initial?: boolean }) {
  return (
    <>
      <button type="button">Öppna</button>
      <Window onEscape={() => undefined} initial={initial} />
      <button type="button">Utanför</button>
    </>
  )
}

const named = (name: string) => screen.getByRole('button', { name })

describe('the focus held inside a modal window (#296)', () => {
  it('moves the focus onto the first thing inside when it opens, or onto what the window names', () => {
    const { unmount } = render(<Page />)
    expect(document.activeElement).toBe(named('Första'))
    unmount()
    render(<Page initial />)
    expect(document.activeElement).toBe(screen.getByLabelText('Sök'))
  })

  it('wraps Tab from the last thing to the first, and Shift+Tab from the first to the last, skipping what is refused', async () => {
    const user = userEvent.setup()
    render(<Page />)
    named('Sista').focus()
    await user.tab()
    expect(document.activeElement).toBe(named('Första'))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(named('Sista'))
    // And the way between them is the ordinary one: nothing here is a roving list.
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByLabelText('Sök'))
  })

  it('pulls the focus back in when it lands outside, as a click beside the window would put it', () => {
    render(<Page />)
    named('Utanför').focus()
    expect(document.activeElement).toBe(named('Första'))
  })

  it('answers Escape, and lets nothing behind the window hear it', () => {
    const onEscape = vi.fn()
    const behind = vi.fn()
    document.addEventListener('keydown', behind)
    try {
      render(
        <>
          <button type="button">Öppna</button>
          <Window onEscape={onEscape} />
        </>,
      )
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
      expect(onEscape).toHaveBeenCalledTimes(1)
      expect(behind).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', behind)
    }
  })

  it('gives the focus back to whatever had it before the window opened', () => {
    function Opener() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Öppna
          </button>
          {open && <Window onEscape={() => setOpen(false)} />}
        </>
      )
    }
    render(<Opener />)
    named('Öppna').focus()
    fireEvent.click(named('Öppna'))
    expect(document.activeElement).toBe(named('Första'))
    fireEvent.keyDown(named('Första'), { key: 'Escape' })
    expect(document.activeElement).toBe(named('Öppna'))
  })
})
