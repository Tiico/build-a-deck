// @vitest-environment jsdom
import { createServer, type Server, type Socket } from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { DocumentTitle } from '../src/status/DocumentTitle.js'
import { StatusLive } from '../src/status/StatusLive.js'
import type { StatusTiming } from '../src/status/connection.js'
import { TablePage } from '../src/table/TablePage.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { JoinPage } from '../src/join/JoinPage.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { admit, asTable, createSession, roomOf, startServer, type Running } from './fixture.js'
import type { Route } from '../src/status/title.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// Short enough that a test can watch a whole plan run out, and wide enough that each state it
// passes through stands still long enough to be seen. The shape is the real one.
const FAST: StatusTiming = { slowAfterMs: 80, connectTimeoutMs: 1_200, retryPlanMs: [30, 30] }
// For the round trip out and back: the first attempt is far enough away that "frånkopplad" is a
// state a reader could actually read, rather than one the test has to catch between polls.
const SLOWER: StatusTiming = { ...FAST, retryPlanMs: [250, 250, 250] }

// A socket that accepts the connection and then says nothing: a service that has stopped
// answering, which before #7 left `Ansluter…` standing for ever.
async function deafServer(): Promise<{ url: string; stop(): Promise<void> }> {
  const open: Socket[] = []
  const server: Server = createServer((s) => open.push(s))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `ws://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        for (const s of open) s.destroy()
        server.close(() => resolve())
      }),
  }
}

type Live = { path: string; route: Route; page: (timing: StatusTiming) => React.ReactElement; seated: boolean }
const LIVE: Live[] = [
  { path: '/table', route: 'table', page: (timing) => <TablePage timing={timing} />, seated: false },
  { path: '/join', route: 'join', page: (timing) => <JoinPage timing={timing} />, seated: false },
  { path: '/play', route: 'play', page: (timing) => <PlayerPage timing={timing} />, seated: true },
  { path: '/online', route: 'online', page: (timing) => <OnlinePage timing={timing} />, seated: true },
  { path: '/observe', route: 'observe', page: (timing) => <ObserverPage timing={timing} />, seated: false },
]

// Admission (DRIFT §9) is part of opening a route now: the table with the host key, a seat or an
// observer with a token bought from the code, and /join with the code itself. `real` says whether
// there is a room to be admitted to — a room that does not exist has no key to hand out.
async function open(live: Live, opts: { session: string; url?: string; timing?: StatusTiming; real?: boolean }) {
  const q = new URLSearchParams({ server: opts.url ?? run.url })
  const room = opts.real ? roomOf(opts.session) : null
  if (live.route === 'join') {
    q.set('code', room?.code ?? 'NOSUCH')
  } else {
    q.set('session', opts.session)
    if (live.seated) {
      q.set('seat', 'A')
      q.set('name', 'Ada')
    }
    if (live.route === 'observe') q.set('name', 'Eva')
    if (room) {
      // The code travels with everyone the join page lets in, and is what names the room.
      q.set('code', room.code)
      if (live.route === 'table') q.set('host', room.hostKey)
      else q.set('token', await admit(run, opts.session, live.seated ? 'A' : null, live.seated ? 'Ada' : 'Eva'))
    }
  }
  history.replaceState(null, '', `${live.path}?${q.toString()}`)
  return render(
    <DocumentTitle route={live.route}>
      <StatusLive>{live.page(opts.timing ?? FAST)}</StatusLive>
    </DocumentTitle>,
  )
}

const notice = () => document.querySelector('[data-status-notice]')
const noticeState = () => notice()?.getAttribute('data-status-notice') ?? null

describe.each(LIVE)('$path when the room does not exist', (live) => {
  it('says so in Swedish, never in the server s own words', async () => {
    await open(live, { session: 'no-such-room' })
    await waitFor(() => expect(noticeState()).toBe('missing'))
    const said = notice()!.textContent ?? ''
    expect(said).toMatch(/bordet/i)
    expect(said).not.toMatch(/unknown session|Error/)
  })

  it('offers a way out that is a link and not a reload', async () => {
    await open(live, { session: 'no-such-room' })
    await waitFor(() => expect(noticeState()).toBe('missing'))
    const out = within(notice() as HTMLElement).getAllByRole('link')
    expect(out.length).toBeGreaterThan(0)
    expect(out.map((a) => a.getAttribute('href'))).toContainEqual(expect.stringMatching(/^\/(\?|$)/))
  })

  it('says it in the tab as well, so a screen nobody is watching is honest', async () => {
    await open(live, { session: 'no-such-room' })
    await waitFor(() => expect(document.title).toBe('Bordet finns inte · build-your-deck'))
  })

  it('announces it assertively, because it is an answer to something someone asked for', async () => {
    await open(live, { session: 'no-such-room' })
    await waitFor(() => expect(document.querySelector('[data-status-live="assertive"]')!.textContent).toMatch(/bordet/i))
    expect(document.querySelector('[data-status-live="polite"]')!.textContent).toBe('')
  })
})

describe.each(LIVE)('$path while the service does not answer at all', (live) => {
  it('stops waiting, explains why, and offers a retry and a way home', async () => {
    const deaf = await deafServer()
    await open(live, { session: 's1', url: deaf.url })
    await waitFor(() => expect(noticeState()).toBe('offline'), { timeout: 4000 })
    const panel = notice() as HTMLElement
    expect(panel.textContent).toMatch(/når inte|kontakt/i)
    expect(within(panel).getByRole('button', { name: /försök/i })).toBeTruthy()
    expect(within(panel).getAllByRole('link').length).toBeGreaterThan(0)
    await waitFor(() => expect(document.title).toBe('Ingen kontakt · build-your-deck'))
    await deaf.stop()
  })

  it('says it is taking long before it says it has failed, so waiting is never silent', async () => {
    const deaf = await deafServer()
    await open(live, { session: 's1', url: deaf.url })
    await waitFor(() => expect(noticeState()).toBe('slow'))
    await deaf.stop()
  })
})

describe.each(LIVE)('$path when the line dies mid-game', (live) => {
  it('lays the message over what is on the screen instead of tearing it down', async () => {
    const id = await createSession(run)
    await open(live, { session: id, real: true })
    await waitFor(() => expect(noticeState()).toBeNull())
    const before = document.querySelector('[data-page]')!.innerHTML.length

    await run.stop()
    await waitFor(() => expect(noticeState()).toBe('dropped'))
    expect(document.querySelector('[data-page]')!.innerHTML.length).toBeGreaterThan(before / 2)
  })

  it('marks the old picture as old and takes it out of reach', async () => {
    const id = await createSession(run)
    await open(live, { session: id, real: true })
    await waitFor(() => expect(noticeState()).toBeNull())
    await run.stop()
    await waitFor(() => expect(noticeState()).toBe('dropped'))
    const stale = document.querySelector('.byd-status-stale')
    expect(stale).toBeTruthy()
    expect(stale!.hasAttribute('inert')).toBe(true)
    expect(notice()!.textContent).toMatch(/Det du ser är från \d\d:\d\d/)
    await waitFor(() => expect(document.title).toBe('Frånkopplad · build-your-deck'))
  })

  it('says the line is down assertively, because the screen has stopped being true', async () => {
    const id = await createSession(run)
    await open(live, { session: id, real: true })
    await waitFor(() => expect(noticeState()).toBeNull())
    await run.stop()
    await waitFor(() => expect(document.querySelector('[data-status-live="assertive"]')!.textContent).toMatch(/kontakt|frånkopplad|bröts/i))
  })
})

// The transport tries again by itself, and the countdown is what makes that visible instead of
// a screen that keeps blinking for reasons nobody is told (#7).
describe('the wait for the next automatic attempt', () => {
  it('is counted down in seconds, and stops counting once the plan is spent', async () => {
    const id = await createSession(run)
    await open(LIVE[0]!, { session: id, timing: { ...FAST, retryPlanMs: [1_500] }, real: true })
    await waitFor(() => expect(noticeState()).toBeNull())
    await run.stop()

    await waitFor(() => expect(noticeState()).toBe('dropped'))
    await waitFor(() => expect(notice()!.textContent).toMatch(/Nytt försök om \d s · försök 1 av 1/))
    // The one attempt in the plan is made and fails: from here a person decides, and nothing
    // pretends to still be trying.
    await waitFor(() => expect(notice()!.textContent).not.toMatch(/Nytt försök/), { timeout: 4000 })
    expect(within(notice() as HTMLElement).getByRole('button', { name: /försök nu/i })).toBeTruthy()
  })
})

describe.each(LIVE)('$path when the line comes back', (live) => {
  it('restores the snapshot and says so, once', async () => {
    const id = await createSession(run)
    await open(live, { session: id, timing: SLOWER, real: true })
    await waitFor(() => expect(noticeState()).toBeNull())
    await run.restart()
    await waitFor(() => expect(noticeState()).toBe('dropped'))
    await waitFor(() => expect(noticeState()).toBe('resumed'), { timeout: 4000 })
    expect(notice()!.textContent).toMatch(/igen/i)
    // Coming back is not an emergency: nothing on the screen has stopped being true.
    await waitFor(() => expect(document.querySelector('[data-status-live="polite"]')!.textContent).toMatch(/igen/i))
    expect(document.querySelector('[data-status-live="assertive"]')!.textContent).toBe('')
  })

  it('writes nothing to the log twice on the way back', async () => {
    const id = await createSession(run)
    await open(live, { session: id, timing: SLOWER, real: true })
    await waitFor(() => expect(noticeState()).toBeNull())
    await run.restart()
    await waitFor(() => expect(noticeState()).toBe('resumed'), { timeout: 4000 })

    const lines = await run.store.read(id)
    const batches = lines.map((l) => l.batch)
    expect(new Set(batches).size).toBe(batches.length)
  })
})

describe('a room that is up says which room it is in the tab', () => {
  it.each(LIVE)('$path', async (live) => {
    const id = await createSession(run)
    await open(live, { session: id, real: true })
    await waitFor(() => expect(noticeState()).toBeNull())
    // The room code is what a room is called out loud (DRIFT §9), so it is what the tab says.
    await waitFor(() => expect(document.title).toContain(roomOf(id).code))
    expect(document.title.endsWith('· build-your-deck')).toBe(true)
  })
})

describe('a table that is up is not covered by anything', () => {
  it('shows no message at all while everything is working', async () => {
    const id = await createSession(run)
    const other = TableClient.connect(await asTable(run, id))
    await other.ready()
    await open(LIVE[0]!, { session: id, real: true })
    await waitFor(() => expect(document.querySelector('[data-table]')).toBeTruthy())
    expect(noticeState()).toBeNull()
    expect(screen.queryByRole('heading', { name: /kontakt|finns inte/i })).toBeNull()
    expect(document.querySelector('.byd-status-stale')).toBeNull()
    other.close()
  })
})
