// @vitest-environment jsdom
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Refusal, useRefusal } from '../src/status/Refusal.js'
import { StatusNotice } from '../src/status/StatusNotice.js'
import { TablePage } from '../src/table/TablePage.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { JoinPage } from '../src/join/JoinPage.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { RouteStatus } from '../src/status/RouteStatus.js'
import { useLiveStatus } from '../src/status/useLiveStatus.js'
import type { TableConnection } from '../src/table/useTableClient.js'
import { DocumentTitle, usePageTitle } from '../src/status/DocumentTitle.js'
import { documentTitle } from '../src/status/title.js'
import { Language, translate, type T } from '../src/i18n/index.js'
import { NotFoundPage } from '../src/status/NotFoundPage.js'
import { STATUS_KEYS, noticeFor, refusal, refusalText, VOICES } from '../src/status/notice.js'

const english: T = (key, params) => translate('en', key, params)

// The nine shared states, said in the reader's own language (A4, #27). The states came in on a
// trunk of their own and were merged with the catalogue in `0c8cd71`; until now they answered
// the language picker with Swedish whatever it said.
describe('the nine states in the reader\'s own language (A4)', () => {
  it('says a page that does not exist in English, with no Swedish left behind it', () => {
    const { unmount } = render(
      <Language lang="en">
        <NotFoundPage />
      </Language>,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('We cannot find what you asked for')
    // The control: a query that matches nothing passes trivially, so the Swedish sentence is
    // asserted to be gone rather than merely unlooked-for.
    expect(document.body.textContent).not.toMatch(/hittar|Länken/)
    unmount()
    render(
      <Language lang="sv">
        <NotFoundPage />
      </Language>,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Vi hittar inte det du sökte')
  })

  // Every one of the nine, in each of the four voices, with what a reader actually reads: the
  // badge, the heading, the sentence and the words on the ways out. A voice that was left behind
  // would say the Swedish sentence twice, which is what this catches.
  it.each(VOICES)('says all nine states in English in the %s voice, and never twice the same as in Swedish', (voice) => {
    const same: string[] = []
    for (const state of STATUS_KEYS) {
      const there = noticeFor(state, voice, english)
      const here = noticeFor(state, voice)
      const parts = (n: ReturnType<typeof noticeFor>) => [n.mark, n.heading, n.text, ...n.actions.map((a) => a.label)]
      // `refused` has no sentence of its own until a reason is carried into it, so an empty text
      // in both languages is the one thing that is allowed to be alike.
      for (const [i, word] of parts(there).entries()) {
        if (word !== '' && word === parts(here)[i]) same.push(`${state}: ${word}`)
      }
      // Swedish has three letters English has not; a sentence that kept one never went through
      // the catalogue at all.
      expect({ state, swedish: parts(there).filter((w) => /[åäö]/i.test(w)) }).toEqual({ state, swedish: [] })
    }
    expect(same).toEqual([])
  })

  // A refusal arrives from the table as a developer's sentence in English. It is a fact about an
  // envelope and never shown as it stands, so it is a lookup into the catalogue like everything
  // else — including the sentence for a reason this client has never heard of.
  it('says why a move did not go through in the language the player is reading', () => {
    expect(refusalText('session has ended', english)).toBe('The table has ended and takes no more moves.')
    expect(refusalText('session has ended')).toBe('Bordet är avslutat och tar inte emot fler drag.')
    expect(refusalText('validated undo.self but no target', english)).toMatch(/^The table did not/)
    expect(refusal('an observer can only flag', 'phone', english).text).toMatch(/observer/i)
    expect(refusal('an observer can only flag', 'phone', english).heading).toBe('The move did not get through')
  })

  // The sentence is one thing; getting it to the control that asked is another. A refusal that
  // is looked up without a reader is Swedish however good the catalogue is.
  it('puts the refusal beside the control in the reader\'s language', async () => {
    function Asked() {
      const handle = useRefusal('phone')
      useEffect(() => {
        void handle.watch(Promise.resolve({ ok: false, reason: 'pile draw is empty' }))
      }, [handle.watch])
      return <Refusal handle={handle} />
    }
    render(
      <Language lang="en">
        <Asked />
      </Language>,
    )
    expect((await screen.findByTestId('refusal')).textContent).toBe('The pile is empty.')
    expect(document.body.textContent).not.toMatch(/Högen/)
  })

  // Two sentences belong to the message's own frame rather than to any one state: how old what
  // is behind it has become (#7), and when the next attempt is coming. The issue did not name
  // them; they stand in the same component and were just as Swedish.
  it('says how old the picture is and when the next attempt comes, in the reader\'s language', () => {
    const notice = noticeFor('dropped', 'table', english)
    render(
      <Language lang="en">
        <StatusNotice notice={notice} surface="card" asOf="19:04" countdown={{ seconds: 3, attempt: 2, attempts: 5 }} />
      </Language>,
    )
    expect(screen.getByText('What you see is from 19:04 and may have changed since.')).toBeTruthy()
    expect(screen.getByText(/Trying again in 3 s · attempt 2 of 5/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Det du ser|försök/)
  })

  // The catalogue is only half of it: a route that looks a state up without a reader gets
  // Swedish however well the state is written. Every route that can reach one without a table
  // behind it is opened here with nothing in its address.
  it.each([
    ['/table', () => <TablePage />, 'The table is over'],
    ['/observe', () => <ObserverPage />, 'The table is over'],
    ['/online', () => <OnlinePage />, 'The table is over'],
    ['/play', () => <PlayerPage />, 'The table is not there'],
    ['/join', () => <JoinPage />, 'The table is not there'],
  ])('opens %s with nothing in its address and says so in English', (path, page, heading) => {
    history.replaceState(null, '', path)
    render(<Language lang="en">{page()}</Language>)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(heading)
    expect(document.body.textContent).not.toMatch(/[åäö]/i)
    history.replaceState(null, '', '/')
  })

  // The other half of a route's message: the one a live connection puts there. It is looked up
  // in one place for all five routes, so one reader is all it takes to get it wrong everywhere.
  it('says what a live connection is doing in the reader\'s language', () => {
    const conn: TableConnection = {
      client: null,
      view: null,
      status: 'connecting',
      activity: [],
      observers: [],
      room: null,
      refused: null,
      trouble: null,
      schedule: { nextRetryAt: null, made: 0, of: 0 },
      retry: () => undefined,
    }
    function Connecting() {
      const live = useLiveStatus(conn, 'phone')
      return <RouteStatus status={live} over="sheet" links={{}} onRetry={() => undefined} />
    }
    render(
      <Language lang="en">
        <Connecting />
      </Language>,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Getting you connected…')
    expect(screen.getByText('We are looking up your table.')).toBeTruthy()
  })

  // A tab is a place too. It is the one surface a reader finds their way back by without
  // reading a word of the page, so it follows the picker like everything else.
  it('names the tab in the language the page is being read in', () => {
    function Tab() {
      usePageTitle({ room: '4KJ2' })
      return null
    }
    render(
      <Language lang="en">
        <DocumentTitle route="play">
          <Tab />
        </DocumentTitle>
      </Language>,
    )
    expect(document.title).toBe('Your hand · Room 4KJ2 · build-your-deck')
    expect(documentTitle('editor', { state: 'missing' }, english)).toBe('The game is not there · build-your-deck')
    expect(documentTitle('editor', { state: 'missing' })).toBe('Spelet finns inte · build-your-deck')
  })
})
