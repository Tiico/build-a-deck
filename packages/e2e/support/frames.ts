import type { Page, WebSocket } from '@playwright/test'

/** Every frame a page was sent, and every frame it sent, as they went over the wire. */
export type Wire = {
  /** What the server sent this client, newest last, as the bytes arrived. */
  received: () => string[]
  /** What this client sent the server. */
  sent: () => string[]
  /** How many sockets this page opened. Zero means the spec watched nothing. */
  sockets: () => number
  /** Waits until a received frame satisfies `want`, so a spec never sleeps for one. */
  until: (want: (frame: string) => boolean, budgetMs?: number) => Promise<string>
}

/**
 * The traffic between a client and the table, read off the socket rather than off the screen.
 *
 * This is the shape the repo's own rule asks for: hidden information is verified on the network
 * traffic, not on the screen, and a test that reads raw frames is the proof. The reason is
 * exact. A card that is absent from a player's screen may still have been sent to their browser —
 * projected into the DOM and hidden with CSS, held in a store the view does not read, or sitting
 * in a frame the client simply ignored. Every one of those passes a test that looks at the
 * screen, and every one of them is a leak: the bytes are on the other person's machine, and a
 * console is one keystroke away. Only the wire can tell the difference.
 *
 * Attach before navigating. A socket opened before the listener is on it is a socket whose first
 * frames are gone — which is the very failure `#109` was, in the product rather than in a test.
 */
export function watchWire(page: Page): Wire {
  const received: string[] = []
  const sent: string[] = []
  const waiting: { want: (frame: string) => boolean; resolve: (frame: string) => void }[] = []
  let sockets = 0

  page.on('websocket', (ws: WebSocket) => {
    sockets++
    ws.on('framereceived', ({ payload }) => {
      const frame = text(payload)
      received.push(frame)
      for (const w of [...waiting])
        if (w.want(frame)) {
          waiting.splice(waiting.indexOf(w), 1)
          w.resolve(frame)
        }
    })
    ws.on('framesent', ({ payload }) => sent.push(text(payload)))
  })

  return {
    received: () => [...received],
    sent: () => [...sent],
    sockets: () => sockets,
    until: (want, budgetMs = 10_000) =>
      new Promise((resolve, reject) => {
        // What has already arrived counts. A spec that asks after the fact must not wait for the
        // frame to be sent a second time, because it never will be.
        const already = received.find(want)
        if (already !== undefined) return resolve(already)
        const entry = { want, resolve }
        waiting.push(entry)
        setTimeout(() => {
          if (!waiting.includes(entry)) return
          waiting.splice(waiting.indexOf(entry), 1)
          reject(new Error(`no frame matched within ${budgetMs} ms; ${received.length} arrived`))
        }, budgetMs).unref?.()
      }),
  }
}

// A frame is a string or the bytes of one. Binary is decoded rather than skipped: a leak that
// travelled as bytes would otherwise be a leak this never looked at.
const text = (payload: string | Buffer): string => (typeof payload === 'string' ? payload : payload.toString('utf8'))

/**
 * The frames in this traffic that name `secret`, wherever in them it appears.
 *
 * The search is over the raw text and deliberately dumb about *where* it looks. A cleverer one —
 * parsing each frame and checking the fields a leak is *expected* in — would only ever find the
 * leaks somebody already thought of, and the ones worth catching are the others: a field added
 * next month carrying the whole component, a debug echo, a projection that forgot a seat.
 *
 * It is not dumb about *what* counts as a match, and that distinction was paid for. A bare
 * substring search says `kort-1` is present in a frame whose only card is `kort-12`, so a leak
 * test built on one reports the first card of any deck with more than nine as leaking into
 * every frame — a failure with a real leak's exact shape and no leak behind it. The identity is
 * therefore matched as the whole JSON string it always travels as, quotes and all, which is
 * still every field and every nesting and no longer every prefix.
 */
export const mentions = (frames: readonly string[], secret: string): string[] => frames.filter((f) => f.includes(JSON.stringify(secret)))

/**
 * Every card identity a zone was shown to carry, gathered out of the traffic itself.
 *
 * A client learns what is in a zone from a snapshot and then from patches, so the answer is not
 * in any one frame — it is what the frames add up to. This gathers rather than replays: it wants
 * the set of identities that were ever named for that zone, which is exactly the question a leak
 * spec asks. Order and current contents are the client's business and not this function's.
 *
 * `cardRef` is the secret. It is the card's identity — which card this is — and the projection
 * hands out `null` in its place to anyone who may not know (`project` in `packages/engine`). A
 * component's own id travels to everyone and is a UUID, so nothing here can confuse the two:
 * knowing that *a* card is in a hand is not a leak, and knowing *which* one is.
 */
export function cardsIn(frames: readonly string[], zone: string): string[] {
  const found = new Set<string>()
  for (const frame of frames) {
    let parsed: unknown
    try {
      parsed = JSON.parse(frame)
    } catch {
      continue
    }
    walk(parsed, (node) => {
      if (node['zone'] === zone && typeof node['cardRef'] === 'string') found.add(node['cardRef'])
    })
  }
  return [...found]
}

// Every object anywhere in a frame. A projected component turns up inside a snapshot, inside a
// patch operation, and inside a rewind preview, and a search that knew which of those to look in
// would stop finding leaks the day a fourth is added.
function walk(node: unknown, visit: (o: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) return void node.forEach((n) => walk(n, visit))
  if (node === null || typeof node !== 'object') return
  visit(node as Record<string, unknown>)
  for (const value of Object.values(node as Record<string, unknown>)) walk(value, visit)
}
