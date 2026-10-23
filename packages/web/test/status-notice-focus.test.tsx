// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StatusNotice } from '../src/status/StatusNotice.js'
import { noticeFor, type StatusKey } from '../src/status/notice.js'

// Where the focus is in the commit that takes the message away (#1244). «Försök nu» took the
// focus into the message, and once the line was back the message left and the focus was handed to
// the view it lay over — from an effect, a commit after the message had gone. In between the
// focus stood on <body>, which a screen reader reads as the page starting over, and which the
// next Tab starts from the top of. The mutation observer runs as soon as that commit has touched
// the page, before anything else React has scheduled, so it reads the focus exactly as that
// commit left it.
describe('the focus when the message leaves', () => {
  it('is in the view in the same commit as the message goes, after «Försök nu»', async () => {
    let show: (state: StatusKey | null) => void = () => undefined
    function Route() {
      const [state, setState] = useState<StatusKey | null>('dropped')
      show = setState
      return (
        <>
          <div data-page="play">
            <button type="button">Kortet</button>
          </div>
          {state && <StatusNotice notice={noticeFor(state, 'table')} surface="card" onRetry={() => undefined} />}
        </>
      )
    }
    render(<Route />)
    const retry = screen.getByRole('button', { name: /försök/i })
    retry.focus()
    retry.click()
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))

    const seen: string[] = []
    const watch = new MutationObserver(() => {
      const at = document.activeElement
      seen.push(at === document.body ? 'body' : at?.closest('[data-page]') ? 'view' : (at?.tagName ?? 'none'))
    })
    watch.observe(document.body, { childList: true, subtree: true })
    // From outside `act`, as the line coming back is: nothing flushes on the test's behalf.
    show(null)
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    watch.disconnect()
    expect(seen[0]).toBe('view')
  })
})
