// @vitest-environment jsdom
// «Fler filter» rolls the chip row to its end and then has nothing left to promise, so it goes
// (#557 E-3). It went with the focus on it, and the focus fell to <body>. The focus now
// lands on the last chip, the one the roll brought into view.
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { CrownRail } from '../src/editor/Crown.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// jsdom lays nothing out, so the row is given the sizes a real one has: 600 px of chips in a
// 300 px window, and a scroll that moves it.
function sized(el: HTMLElement): void {
  let left = 0
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => 600 })
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 300 })
  Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => left })
  el.scrollBy = ((opts: ScrollToOptions) => {
    left = Math.min(300, left + (opts.left ?? 0))
    el.dispatchEvent(new Event('scroll'))
  }) as typeof el.scrollBy
}

describe('«Fler filter» at the end of the row (#557)', () => {
  it('hands the focus to the last chip when it goes, not to the page', async () => {
    const user = userEvent.setup()
    const { container, rerender } = render(
      <CrownRail label="Filter">
        {['a', 'b', 'c', 'd'].map((c) => (
          <button key={c} type="button">
            {c}
          </button>
        ))}
      </CrownRail>,
    )
    sized(container.querySelector('.byd-crown-rail-scroll') as HTMLElement)
    // The effect measures on every render; one more render measures the sizes given above.
    rerender(
      <CrownRail label="Filter">
        {['a', 'b', 'c', 'd'].map((c) => (
          <button key={c} type="button">
            {c}
          </button>
        ))}
      </CrownRail>,
    )
    const more = await screen.findByRole('button', { name: 'Fler filter' })
    more.focus()
    // A press rolls four fifths of the window, so the second one reaches the end.
    await user.keyboard('{Enter}')
    await act(async () => undefined)
    expect(document.activeElement).toBe(more)
    await user.keyboard('{Enter}')
    await act(async () => undefined)
    expect(screen.queryByRole('button', { name: 'Fler filter' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'd' }))
  })
})
