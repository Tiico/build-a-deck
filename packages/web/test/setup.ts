import { afterEach } from 'vitest'
import { cleanup, configure, getConfig } from '@testing-library/react'

// Testing Library only cleans up on its own with vitest globals; do it explicitly.
afterEach(cleanup)
// Every test is a tab of its own: what a page kept for the rest of its tab's life (the wizard's
// draft, #476) must not be found by the next test as if it were the same tab reloaded.
afterEach(() => {
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
})

// The event loop gets a turn after every test (#543). vitest goes from one test to the next on its
// own promises, which are microtasks, so a file of synchronous tests ran from its first to its last
// without a single timer or message being let through — and the worker's answer to its own RPC is
// such a message. `deck-wall-groups` is twenty synchronous tests that took 22 s alone and 112 s
// under load, and vitest ended a run with every test green on «Timeout calling onTaskUpdate».
// One macrotask per test costs a millisecond and lets every answer through between them.
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

// How long a `waitFor` or a `findBy` waits before it calls the thing it is waiting for a failure.
// Testing Library's own default is one second, and this suite does not run in one second's worth
// of quiet: a file starts a real server, opens real sockets, and half a dozen of them drive
// Chromium beside it. A React state update that lands in 40 ms on an idle machine can lose that
// race on a busy one, and then a passing test reports a wrong value — which is how eleven waits
// in this suite came to carry a longer timeout written out one at a time. The patience belongs in
// one place. Nothing is weakened by it: a wait that resolves still resolves at once, and a thing
// that never happens still fails, four seconds later and inside vitest's own five.
configure({ asyncUtilTimeout: 4000 })

// Those four seconds are the worker's own, not the wall clock's (#867).
//
// On a loaded machine the operating system can leave a worker unrun for longer than a wait's
// patience. When it runs it again, Node takes the timers that fell due before it reads the
// sockets — and a wait's deadline is such a timer, while the server's answer, in this very
// process, sits written and unread on a socket. So the deadline won by the order of a loop's
// phases: `setup-new-pile` read «Öppnar spelet…» where an editor that opens in 15 ms was waiting
// to be read. No number fixes that, since any deadline is shorter than some stall.
//
// So a wait that gave up is asked again when time it was counting was time the worker did not
// run: wall time that went by without the process spending CPU. Ordinary slowness — a render
// that took a second of its own work — is the worker's own time and counts as it always did, and
// so does a wait for something that never comes, which fails once its four seconds of running
// time are spent. Only a stall long enough to be one is subtracted, never the jitter of a busy
// scheduler. `test/waits-outlast-a-held-worker.test.tsx` holds the worker with SIGSTOP to show
// both halves.
//
// The wrapper is Testing Library's own seam around every wait. user-event goes through it too;
// an action is asked again only if it rejected *and* the worker was held while it ran, and an
// action that rejects is a failing test either way.
const TICK_MS = 50
const HELD_AT_LEAST_MS = 250
const realSetInterval = setInterval
const realClearInterval = clearInterval
// Read off the real clock even where a test fakes it: a faked clock that jumps is not a stall.
const now = performance.now.bind(performance)
function watchHolds(): () => { took: number; held: number } {
  const started = now()
  let last = started
  let cpu = process.cpuUsage()
  let held = 0
  const look = () => {
    const at = now()
    const used = process.cpuUsage(cpu)
    cpu = process.cpuUsage()
    const idle = at - last - TICK_MS - (used.user + used.system) / 1000
    if (idle >= HELD_AT_LEAST_MS) held += idle
    last = at
  }
  const timer = realSetInterval(look, TICK_MS)
  return () => {
    realClearInterval(timer)
    look()
    return { took: now() - started, held }
  }
}
const inner = getConfig().asyncWrapper
configure({
  asyncWrapper: (cb) =>
    inner(async () => {
      let own = 0
      for (;;) {
        const stop = watchHolds()
        let result: Awaited<ReturnType<typeof cb>>
        try {
          result = await cb()
        } catch (err) {
          const { took, held } = stop()
          own += took - held
          if (held === 0 || own >= getConfig().asyncUtilTimeout) throw err
          continue
        }
        stop()
        return result
      }
    }),
})

// jsdom 30 keeps the style sheet of a <style> that leaves the document along with an ancestor
// (#538): removing the element itself lets its sheet go, removing the element round it does not.
// React unmounts a card preview by removing the element round it, so every wall of cards left its
// sheets in `document.styleSheets` — 132 of them per editor — and every `getComputedStyle` after
// that walked all of them. One editor test came to lock its worker for 37 s, and the CPU it took is
// what made its neighbours' deadlines expire before an answer already on the socket was read.
// So a <style> that went with its ancestor is put back and taken out by itself, the one removal
// jsdom does let go of. `test/jsdom-stylesheets.test.tsx` says when this is no longer needed.
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const released = new WeakSet<Element>()
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.removedNodes) {
        // By node type, not `instanceof Element`: a removal can be reported after the environment
        // has been torn down and `Element` and `Node` are gone, which threw into the run's output.
        if (node.nodeType !== 1 || node.isConnected) continue
        const element = node as Element
        for (const style of [...(element.localName === 'style' ? [element] : []), ...element.querySelectorAll('style')]) {
          if (released.has(style)) continue
          released.add(style)
          document.documentElement.append(style)
          style.remove()
        }
      }
  }).observe(document, { childList: true, subtree: true })
}

// Under jsdom, its WebSocket wraps Node's undici, which dispatches jsdom Events on a Node
// EventTarget and throws. The `ws` client speaks the same API and has no such split.
import { WebSocket as WsClient } from 'ws'
import { setWebSocketImplementation, type WebSocketCtor } from '../src/client.js'
import { setEditSocketImplementation, type EditSocketCtor, type WebSocketLike } from '../src/editor/ProjectClient.js'
if (typeof document !== 'undefined') setWebSocketImplementation(WsClient as unknown as WebSocketCtor)

// A cookie jar for fetch under jsdom: the session cookie (G1) must survive from the login link to
// the next request, as it does in a browser. Cookies are kept per origin and sent back to it.
const jar = new Map<string, Map<string, string>>()
const cookieFor = (origin: string): string => {
  const bag = jar.get(origin)
  return bag && bag.size > 0 ? [...bag].map(([k, v]) => `${k}=${v}`).join('; ') : ''
}

// The editor's own socket (D3) needs the stand-in and the cookie: a browser sends the session
// with the handshake, and under jsdom nothing does it for us.
export class EditSocket extends WsClient {
  constructor(url: string) {
    const cookie = cookieFor(new URL(url).origin.replace(/^ws/, 'http'))
    super(url, cookie ? { headers: { cookie } } : {})
  }
}
setEditSocketImplementation(EditSocket as unknown as EditSocketCtor)

// An actor that will not make a version of what it is holding, because someone else already made
// one from the same rev. Everything else about the socket is what a socket does.
//
// It stands here, beside the real one, because the refusal is the actor's own answer and not
// something that can be raced into being from outside: with a live actor (D3) an editor is told
// about someone else's version as it happens, so the window in which a save of its own can
// collide is a moment too short to arrange. What is under test wherever this is used is what the
// editor does when a save it asked for did not happen — which is a fact, not a timing.
export const RefusesToSave = class implements WebSocketLike {
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    queueMicrotask(() => this.onopen?.())
  }
  send(data: string): void {
    if ((JSON.parse(data) as { t: string }).t !== 'save') return
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ v: 'refused', why: 'conflict' }) }))
  }
  close(): void {
    this.readyState = 3
  }
} as unknown as EditSocketCtor

if (typeof document !== 'undefined') {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const stored = jar.get(url.origin)
    const headers = new Headers(init?.headers)
    if (stored && stored.size > 0 && !headers.has('cookie')) headers.set('cookie', [...stored].map(([k, v]) => `${k}=${v}`).join('; '))
    // A file's bytes, as a browser would send them. jsdom's `Blob` has no `stream()`, so the
    // runtime's own fetch does not recognise it as a body at all and sends the string
    // "[object Blob]" in its place — which meant every upload from a jsdom test carried thirteen
    // bytes of nothing while the test watched a 201 come back. It went unseen for as long as the
    // server believed the `content-type` header; the gate that reads the bytes found it at once
    // (#204). The bytes are read out here, where the rest of the browser is stood in for.
    const body = init?.body instanceof Blob ? new Uint8Array(await init.body.arrayBuffer()) : null
    const res = await realFetch(input, { ...init, headers, ...(body ? { body } : {}) })
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';')
      const [k, v] = (pair ?? '').split('=')
      if (!k) continue
      const bag = jar.get(url.origin) ?? new Map<string, string>()
      if (attrs.some((a) => /max-age=0/i.test(a))) bag.delete(k.trim())
      else bag.set(k.trim(), v ?? '')
      jar.set(url.origin, bag)
    }
    return res
  }) as typeof fetch
}

// A working `localStorage` under jsdom, when the runtime has left one that is not one.
//
// Node has grown a `localStorage` global of its own, and from Node 22 it is there without being
// asked for: an object with no `getItem` and no `setItem`, which needs `--localstorage-file` to
// become a store and warns that it was not given one. It shadows the window's, so under jsdom on
// such a runtime `localStorage.setItem` is not a function — and everything the tool remembers in
// the browser (the reader's language, a column's width) is written through a `try`/`catch` that
// treats a browser refusing storage as a browser that simply forgets. So nothing throws, nothing
// is remembered, and no test about remembering can pass.
//
// The stand-in is the same shape as the socket's above: the real API where there is one, and an
// in-memory Storage where the runtime has left something that only looks like it.
if (typeof document !== 'undefined' && typeof globalThis.localStorage?.setItem !== 'function') {
  const held = new Map<string, string>()
  const store: Storage = {
    get length() {
      return held.size
    },
    clear: () => held.clear(),
    getItem: (key: string) => held.get(key) ?? null,
    key: (at: number) => [...held.keys()][at] ?? null,
    removeItem: (key: string) => void held.delete(key),
    setItem: (key: string, value: string) => void held.set(key, String(value)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true })
  Object.defineProperty(window, 'localStorage', { value: store, configurable: true, writable: true })
}
