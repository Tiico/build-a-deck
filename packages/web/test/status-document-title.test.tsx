// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { DocumentTitle, usePageTitle } from '../src/status/DocumentTitle.js'
import type { StatusKey } from '../src/status/notice.js'

// The tab and the page say the same thing at the same time (#1216). The page reported its state
// from an effect into the title's own state, and the title was written from an effect of that:
// one render and two flushes of effects behind the page. Under load that was seconds — a
// loaded machine once wrote «Laddar» two seconds after the page had stopped saying it — and
// `/observe` was caught saying «Frånkopplad» on the page while the tab still said it was
// watching the room, past every wait a test gives it.
//
// So the commit that puts a state on the page is the one that writes it in the tab. The
// mutation observer runs as soon as that commit has touched the page, before anything else React
// has scheduled, so it reads the tab exactly as that commit left it.
describe('the tab beside the page', () => {
  it('says the state in the same commit as the page says it', async () => {
    let say: (state: StatusKey | null) => void = () => undefined
    function Page() {
      const [state, setState] = useState<StatusKey | null>(null)
      say = setState
      usePageTitle({ state, room: '4RMGQ4' })
      return <p data-state={state ?? 'none'} />
    }
    render(
      <DocumentTitle route="observe">
        <Page />
      </DocumentTitle>,
    )
    await waitFor(() => expect(document.title).toBe('Tittar på rum 4RMGQ4 · Deckster'))

    const page = document.querySelector('p')!
    const seen: string[] = []
    const watch = new MutationObserver(() => seen.push(`${page.dataset['state']} · ${document.title}`))
    watch.observe(page, { attributes: true })
    // From outside `act`, as a socket's close is: nothing flushes on the test's behalf.
    say('dropped')
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    watch.disconnect()
    expect(seen[0]).toBe('dropped · Frånkopplad · Deckster')
  })
})
