// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DocumentTitle } from '../src/status/DocumentTitle.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { DEFAULT_EDITOR_TIMING, EditorPage, type EditorTiming } from '../src/editor/EditorPage.js'
import { requestLink } from '../src/account/api.js'
import { projectDoc } from './project-doc.js'
import { deafServer, goingDeafProxy, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

function open(query: string, timing?: EditorTiming) {
  history.replaceState(null, '', `/editor?${query}`)
  render(
    <DocumentTitle route="editor">
      <StatusLive>
        <EditorPage {...(timing ? { timing } : {})} />
      </StatusLive>
    </DocumentTitle>,
  )
}

const notice = () => document.querySelector('[data-status-notice]')
const noticeState = () => notice()?.getAttribute('data-status-notice') ?? null

// UX-07: an invalid project could give a blank page with a raw English sentence on it, no way
// back and nothing to try again.
describe('a project that does not exist', () => {
  it('says so in Swedish and never in the server s own words', async () => {
    open(`project=nope&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(noticeState()).toBe('missing'))
    const said = notice()!.textContent ?? ''
    expect(said).toMatch(/hittar inte spelet/i)
    expect(said).not.toMatch(/unknown project|could not load|Error/)
  })

  it('offers a way back to the games, as a link and not a reload', async () => {
    open(`project=nope&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(noticeState()).toBe('missing'))
    expect(within(notice() as HTMLElement).getByRole('link', { name: /mina spel/i }).getAttribute('href')).toMatch(/^\/(\?|$)/)
  })

  it('names the missing game in the tab', async () => {
    open(`project=nope&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(document.title).toBe('Spelet finns inte · build-your-deck'))
  })
})

// A game deleted while it is open (#485, fynd 1): the server closes the editor's line the way an
// unknown project is refused, and the editor says so at once, over the work it still holds.
describe('a project deleted while it is open', () => {
  it('says the game is not there, and keeps what is on the screen', async () => {
    await run.projects.create(run.projectId, projectDoc())
    open(`project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(document.querySelector('.byd-editor')).not.toBeNull())
    expect(noticeState()).toBeNull()
    expect((await fetch(`${run.http}/projects/${run.projectId}`, { method: 'DELETE' })).status).toBe(200)
    await waitFor(() => expect(noticeState()).toBe('missing'))
    expect(notice()!.textContent).not.toMatch(/unknown project/)
    // The work is still there behind the message.
    expect(document.querySelector('.byd-editor')).not.toBeNull()
  })
})

// And a save that the server refuses never shows the server's own words (#485): the editor put
// «unknown project» straight into its head.
describe('a refused save', () => {
  it('says why in the reader’s words', async () => {
    const { refusalText } = await import('../src/status/notice.js')
    expect(refusalText('unknown project')).toBe('Spelet finns inte längre. Det du har ändrat ligger kvar här.')
    expect(refusalText('missing')).toBe('Spelet finns inte längre. Det du har ändrat ligger kvar här.')
  })
})

describe('a project that belongs to someone else', () => {
  it('says it is shut rather than broken, and offers both a login and a way home', async () => {
    const owned = await startServer({ auth: true, authBypass: true })
    try {
      await owned.projects.create(owned.projectId, projectDoc(), 'någon-annan')
      // Logged in, but as someone the project does not belong to: shut, not broken.
      await requestLink(owned.http, 'ada@example.test', '/')
      open(`project=${owned.projectId}&server=${encodeURIComponent(owned.http)}`)
      await waitFor(() => expect(noticeState()).toBe('forbidden'))
      const panel = notice() as HTMLElement
      expect(panel.textContent).toMatch(/någon annan|inte tillgång/i)
      expect(within(panel).getByRole('link', { name: /logga in/i })).toBeTruthy()
      expect(within(panel).getByRole('link', { name: /mina spel/i })).toBeTruthy()
      await waitFor(() => expect(document.title).toBe('Ingen tillgång · build-your-deck'))
    } finally {
      await owned.stop()
    }
  })
})

describe('a server the editor cannot reach', () => {
  it('says there is no contact, keeps the work safe in the sentence, and offers a retry', async () => {
    open(`project=p1&server=${encodeURIComponent('http://127.0.0.1:1')}`)
    await waitFor(() => expect(noticeState()).toBe('offline'), { timeout: 4000 })
    const panel = notice() as HTMLElement
    expect(panel.textContent).toMatch(/når inte servern/i)
    expect(within(panel).getByRole('button', { name: /försök igen/i })).toBeTruthy()
    await waitFor(() => expect(document.title).toBe('Ingen kontakt · build-your-deck'))
  })

  it('asks the server again in place when a person presses, and opens the game when it answers', async () => {
    await run.projects.create(run.projectId, projectDoc())
    // The server is down when the editor opens and up again when the button is pressed. Nothing
    // is reloaded: the same request is made a second time, on the same page.
    await run.stop()
    open(`project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(noticeState()).toBe('offline'), { timeout: 4000 })
    await run.restart()
    await userEvent.click(screen.getByRole('button', { name: /försök igen/i }))
    expect(await screen.findByText('Skogens herrar')).toBeTruthy()
  })
})

// A server that takes the call and never answers (#876): «Öppnar spelet…» stood for ever, because
// opening the project had no deadline. D5's first connection has one everywhere else: the wait is
// said to be long, and then it is called off as no contact, with a retry and the way home.
describe('a server that takes the call and never answers', () => {
  // The two are an order of magnitude apart, as on the live routes (status-routes.test.tsx).
  const HELD: EditorTiming = { ...DEFAULT_EDITOR_TIMING, slowAfterMs: 80, connectTimeoutMs: 1_200 }

  // On a clock the test drives: a held answer sends nothing, so the only things that can move the
  // page are the wait's own timers, and on the wall clock a stalled machine lets both come due in
  // one turn and `slow` is never painted (the race #265 found on the live routes).
  it('says it is taking long before it says there is no contact', async () => {
    const deaf = await deafServer()
    vi.useFakeTimers()
    try {
      open(`project=p1&server=${encodeURIComponent(deaf.url.replace(/^ws/, 'http'))}`, HELD)
      expect(noticeState()).toBe('loading')
      await act(() => vi.advanceTimersByTimeAsync(600))
      expect(noticeState()).toBe('slow')
      expect(notice()!.textContent).toMatch(/spelet dröjer/i)
      expect(within(notice() as HTMLElement).getByRole('button', { name: /försök igen/i })).toBeTruthy()
      expect(within(notice() as HTMLElement).getByRole('link', { name: /mina spel/i })).toBeTruthy()
      expect(document.title).toBe('Laddar · build-your-deck')
      await act(() => vi.advanceTimersByTimeAsync(HELD.connectTimeoutMs))
      expect(noticeState()).toBe('offline')
      expect(document.title).toBe('Ingen kontakt · build-your-deck')
    } finally {
      vi.useRealTimers()
    }
    expect(deaf.stayedDeaf()).toBe(true)
    await deaf.stop()
  })

  // Asking again is a new call on the same page, not a reload, and it is what opens the game once
  // the server answers — the call that was held is never the one that brings it.
  it('asks again in place from the long wait, and opens the game when the server answers', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const line = await goingDeafProxy(run.http)
    line.deafen()
    try {
      open(`project=${run.projectId}&server=${encodeURIComponent(line.url.replace(/^ws/, 'http'))}`, { ...HELD, connectTimeoutMs: 60_000 })
      await waitFor(() => expect(noticeState()).toBe('slow'))
      expect(line.held()).toBeGreaterThan(0)
      line.hear()
      await userEvent.click(within(notice() as HTMLElement).getByRole('button', { name: /försök igen/i }))
      expect(await screen.findByText('Skogens herrar')).toBeTruthy()
      expect(noticeState()).toBeNull()
    } finally {
      await line.stop()
    }
  })

  it('asks again in place after giving up, and opens the game when the server answers', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const line = await goingDeafProxy(run.http)
    line.deafen()
    try {
      open(`project=${run.projectId}&server=${encodeURIComponent(line.url.replace(/^ws/, 'http'))}`, { ...HELD, connectTimeoutMs: 300 })
      await waitFor(() => expect(noticeState()).toBe('offline'))
      line.hear()
      await userEvent.click(within(notice() as HTMLElement).getByRole('button', { name: /försök igen/i }))
      expect(await screen.findByText('Skogens herrar')).toBeTruthy()
    } finally {
      await line.stop()
    }
  })

  // A server that answers in time is never said to be slow: the timers die with the answer.
  it('never says the wait is long when the answer comes in time', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const seen = new Set<string | null>()
    const watch = new MutationObserver(() => seen.add(noticeState()))
    watch.observe(document.body, { subtree: true, childList: true, attributes: true })
    try {
      open(`project=${run.projectId}&server=${encodeURIComponent(run.http)}`, { ...DEFAULT_EDITOR_TIMING, slowAfterMs: 1_000, connectTimeoutMs: 1_500 })
      await screen.findByText('Skogens herrar')
      // Past both timers: an answer that left them armed would put a notice over the open game.
      await new Promise((r) => setTimeout(r, 1_700))
      expect(noticeState()).toBeNull()
      expect(seen.has('slow')).toBe(false)
      expect(seen.has('offline')).toBe(false)
    } finally {
      watch.disconnect()
    }
  })
})

describe('a project on its way in', () => {
  it('says it is loading, in the editor s own words', async () => {
    await run.projects.create(run.projectId, projectDoc())
    open(`project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    expect(noticeState()).toBe('loading')
    expect(notice()!.textContent).toMatch(/öppnar spelet/i)
    await screen.findByText('Skogens herrar')
  })

  it('names the game in the tab once it is open', async () => {
    await run.projects.create(run.projectId, projectDoc())
    open(`project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    await screen.findByText('Skogens herrar')
    // The wall is where the editor opens, and the tab says so (#477).
    await waitFor(() => expect(document.title).toBe('Skogens herrar · Kortvägg · build-your-deck'))
  })
})

describe('a link with no project in it', () => {
  it('is a link to a game that does not exist, and says so', async () => {
    open('')
    await waitFor(() => expect(noticeState()).toBe('missing'))
  })
})
