import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Testing Library only cleans up on its own with vitest globals; do it explicitly.
afterEach(cleanup)

// Under jsdom, its WebSocket wraps Node's undici, which dispatches jsdom Events on a Node
// EventTarget and throws. The `ws` client speaks the same API and has no such split.
import { WebSocket as WsClient } from 'ws'
import { useWebSocketImplementation, type WebSocketCtor } from '../src/client.js'
import { useEditSocketImplementation, type EditSocketCtor } from '../src/editor/ProjectClient.js'
if (typeof document !== 'undefined') useWebSocketImplementation(WsClient as unknown as WebSocketCtor)

// A cookie jar for fetch under jsdom: the session cookie (G1) must survive from the login link to
// the next request, as it does in a browser. Cookies are kept per origin and sent back to it.
const jar = new Map<string, Map<string, string>>()
const cookieFor = (origin: string): string => {
  const bag = jar.get(origin)
  return bag && bag.size > 0 ? [...bag].map(([k, v]) => `${k}=${v}`).join('; ') : ''
}

// The editor's own socket (D3) needs the stand-in and the cookie: a browser sends the session
// with the handshake, and under jsdom nothing does it for us.
useEditSocketImplementation(
  class extends WsClient {
    constructor(url: string) {
      const cookie = cookieFor(new URL(url).origin.replace(/^ws/, 'http'))
      super(url, cookie ? { headers: { cookie } } : {})
    }
  } as unknown as EditSocketCtor,
)

if (typeof document !== 'undefined') {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const stored = jar.get(url.origin)
    const headers = new Headers(init?.headers)
    if (stored && stored.size > 0 && !headers.has('cookie')) headers.set('cookie', [...stored].map(([k, v]) => `${k}=${v}`).join('; '))
    const res = await realFetch(input, { ...init, headers })
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
