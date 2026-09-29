// @vitest-environment jsdom
// jsdom 30 keeps the style sheet of a <style> removed along with an ancestor (#538): removing the
// element itself lets its sheet go, removing its parent does not. React unmounts a card preview by
// removing the element round it, so every wall of cards left its sheets behind, and every
// `getComputedStyle` after that walked all of them — which is what made one editor test lock its
// worker for 37 s and starve its neighbours of the CPU they needed to keep a deadline.
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the test document lets go of a style sheet whose element is gone (#538)', () => {
  it('when the <style> goes with the element round it', async () => {
    const before = document.styleSheets.length
    const { unmount } = render(
      <div>
        {Array.from({ length: 20 }, (_, i) => (
          <section key={i}>
            <style>{`.c${i} { color: red }`}</style>
          </section>
        ))}
      </div>,
    )
    expect(document.styleSheets.length).toBe(before + 20)
    unmount()
    await settle()
    expect(document.styleSheets.length).toBe(before)
  })

  it('when the <style> itself is removed, as it always did', async () => {
    const before = document.styleSheets.length
    const style = document.createElement('style')
    style.textContent = 'p { color: red }'
    document.body.append(style)
    style.remove()
    await settle()
    expect(document.styleSheets.length).toBe(before)
  })
})
