// @vitest-environment jsdom
import { createServer, type Server, type Socket } from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// Short enough that a test can watch a whole plan run out, and wide enough that each state it
// passes through stands still long enough to be seen. The shape is the real one.
const FAST: StatusTiming = { slowAfterMs: 80, dropAfterMs: 80, connectTimeoutMs: 1_200, retryPlanMs: [30, 30] }
// For the round trip out and back: the first attempt is far enough away that "frånkopplad" is a
// state a reader could actually read, rather than one the test has to catch between polls. It has
// to clear the grace a break is given before it is said at all, with room left over — the gap was
// 170 ms once the grace arrived, and a loaded machine closed it.
const SLOWER: StatusTiming = { ...FAST, retryPlanMs: [600, 600, 600] }

// A socket that accepts the connection and then says nothing: a service that has stopped
// answering, which before #7 left `Ansluter…` standing for ever.
//
// It is that service only for as long as it keeps taking the call and staying quiet. One that
// hung up instead would tell the client the line *failed* rather than leaving it hanging, and a
// test written about a line that hangs would then quietly be running about a line that broke —
// which is the first thing that was suspected when this file read `offline` where it waited for
// `slow` (#265). It was not the fixture that time, and `stayedDeaf` is what lets a test say that
// rather than assume it.
//
// What it measures is that every call it took was still standing when the test put the phone
// down: a client left hanging never hangs up either — not even after it has given up, because
// giving up closes the WebSocket and leaves the socket under it to the teardown — so the only
// thing that can end a call early is this end letting go of it, and that is exactly the leak.
// It deliberately does not count the calls: a route may place more than one — `/table` asks over
// HTTP about the same room it is dialling — and how many is the page's business, not the
// fixture's.
async function deafServer(): Promise<{ url: string; stop(): Promise<void>; stayedDeaf(): boolean }> {
  const open: Socket[] = []
  const trouble: string[] = []
  let stopping = false
  const server: Server = createServer((s) => {
    open.push(s)
    // Without a listener a socket error is an uncaught exception that takes the whole worker with
    // it; here it is evidence instead.
    s.on('error', (e) => trouble.push(e.message))
    s.on('close', () => {
      if (!stopping) trouble.push('hung up')
    })
  })
  server.on('error', (e) => trouble.push(e.message))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `ws://127.0.0.1:${port}`,
    stayedDeaf: () => trouble.length === 0,
    stop: () =>
      new Promise<void>((resolve) => {
        stopping = true
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
    expect(deaf.stayedDeaf()).toBe(true)
    await deaf.stop()
  })

  // On a clock the test drives, not on the wall clock. A deaf service sends nothing, so the only
  // thing that can ever paint `slow` is the single timer the wait arms for itself — one render,
  // somewhere between the 80 ms a wait may go unremarked and the 1200 ms deadline. Waiting for
  // that on the wall clock is a race with no margin to widen: a machine that stops for longer than
  // the deadline lets both timers come due in the same turn of the loop, React folds the two
  // updates into one commit, and the screen goes from `connecting` straight to `offline` without
  // `slow` ever having been on it. `waitFor` is then still watching, patiently, four seconds long,
  // and reports the state it can see — which is how this read `expected 'offline' to be 'slow'`
  // once under the whole suite's load and never again on its own (#265). Driving the clock removes
  // the race rather than hiding it, and lets the order itself — taking long first, failed after —
  // be what is asserted, which is what the sentence above actually claims. The order is also what
  // rules the other suspect out: a fixture that hung up instead of staying silent would spend the
  // retry plan and say `offline` long before the deadline, and the first of these two reads would
  // catch it by name.
  it('says it is taking long before it says it has failed, so waiting is never silent', async () => {
    const deaf = await deafServer()
    vi.useFakeTimers()
    try {
      await open(live, { session: 's1', url: deaf.url })
      // Far enough past `slowAfterMs` to be unambiguous, far enough short of `connectTimeoutMs`
      // that the deadline has not been reached: the two are an order of magnitude apart on purpose.
      await act(() => vi.advanceTimersByTimeAsync(600))
      expect(noticeState()).toBe('slow')
      await act(() => vi.advanceTimersByTimeAsync(FAST.connectTimeoutMs))
      expect(noticeState()).toBe('offline')
    } finally {
      vi.useRealTimers()
    }
    expect(deaf.stayedDeaf()).toBe(true)
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

// The commonest thing that happens to a live line is that it breaks and is picked up again on
// the first attempt. Said at once, that is a message on the screen for half a second — a card
// mid-felt on the table, a bar in the editor's chrome that moves the whole page down and back up
// again — about something that is already over. Nothing that heals inside the grace is said at
// all, and that includes the good news: a reader who was never told the line went does not need
// telling it came back.
describe.each(LIVE)('$path when the line comes straight back', (live) => {
  const QUICK: StatusTiming = { ...FAST, dropAfterMs: 2_000, retryPlanMs: [30, 30, 30, 30, 30, 30] }

  it('says nothing at all about a break that was over before anyone could read about it', async () => {
    const id = await createSession(run)
    await open(live, { session: id, timing: QUICK, real: true })
    await waitFor(() => expect(noticeState()).toBeNull())

    const said: (string | null)[] = []
    const watch = setInterval(() => said.push(noticeState()), 10)
    try {
      await run.restart()
      // The picture is whole again: the client has been round the loop and is serving a snapshot.
      await waitFor(() => expect(document.querySelector('[data-page]')).toBeTruthy())
      await new Promise((r) => setTimeout(r, 300))
    } finally {
      clearInterval(watch)
    }
    expect([...new Set(said)]).toEqual([null])
    expect(document.title).not.toMatch(/Frånkopplad/)
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
