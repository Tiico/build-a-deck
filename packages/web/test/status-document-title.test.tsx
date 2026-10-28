// @vitest-environment jsdom
import { useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
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

  // A live page reads its state off the clock while it renders (`useLiveStatus`: how long the line
  // has been down), so a render can see a state no update asked for. When nothing it holds has
  // changed — the observer measures itself after every commit and sets the same height again —
  // React throws that render away, keeps the page as it was, and keeps the effect's new dependencies
  // without running it. The next render that does commit the state then has nothing to report, and
  // the tab said «Tittar på rum …» over a page that said «Frånkopplad» for as long as anyone waited
  // (#1395). It was caught once in about 150 runs of status-routes under load, with every write of
  // the tab logged: the page rendered `dropped` five times and reported it none.
  it('says the state the page shows, even when a render React threw away saw it first (#1395)', async () => {
    let clock: StatusKey | null = null
    let bump: () => void = () => undefined
    function Page() {
      const [n, setN] = useState(0)
      const [, setSame] = useState(0)
      bump = () => setN((x) => x + 1)
      // Read off something outside React, as the clock is.
      const state = clock
      usePageTitle({ state, room: '4RMGQ4' })
      // As the observer measures itself after every commit and sets the height it already has.
      const measure = () => setSame(0)
      useEffect(() => {
        // Time passes between a commit and the render the next update asks for.
        if (n === 1) clock = 'dropped'
        measure()
      })
      return <p data-state={state ?? 'none'} />
    }
    render(
      <DocumentTitle route="observe">
        <Page />
      </DocumentTitle>,
    )
    await act(async () => bump())
    await act(async () => new Promise((done) => setTimeout(done, 20)))
    await act(async () => bump())
    expect(document.querySelector('p')!.dataset['state']).toBe('dropped')
    expect(document.title).toBe('Frånkopplad · Deckster')
  })
})
