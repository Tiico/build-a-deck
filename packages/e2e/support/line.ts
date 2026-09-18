import type { Page } from '@playwright/test'

/** A client's connection to the table, with a hand on it. */
export type Line = {
  /** Cuts the line the way a tunnel does: the socket dies, and every attempt to open a new one
   *  fails, until `restore` is called. */
  cut: () => Promise<void>
  /** Lets the client reach the server again. It reconnects on its own schedule, not on ours. */
  restore: () => void
}

/**
 * The connection, made breakable.
 *
 * Taking the network away with `context.setOffline` does not do this. Chromium's offline
 * emulation stops new requests and leaves an already-open WebSocket alive, so the client never
 * learns anything happened: it sits there `open`, the view stays fresh, and the test waits for a
 * message the product was right not to show. That was measured here before this file existed —
 * thirty seconds of waiting for a state nothing had entered.
 *
 * So the socket is proxied instead. Every frame is passed through untouched, which means the
 * table and the client are talking to each other for real; and when the line is cut, the page's
 * socket is closed under it exactly as a lost network closes one. While it is cut, each attempt
 * to reconnect is closed too — because a break that heals on the first retry is not a break the
 * reader is ever told about (the client's own rule: a drop is a drop once it has outlasted the
 * silence a wait is allowed), and a test that could not hold a line down could not reach the
 * state it is about.
 *
 * Install before navigating: a socket opened before the route is in place is not proxied at all.
 */
export async function breakableLine(page: Page, pattern = '**/sessions/**'): Promise<Line> {
  let cut = false
  const open: { close: () => void }[] = []

  await page.routeWebSocket(pattern, (ws) => {
    if (cut) {
      // 1006 is what a connection that died without a closing handshake looks like, which is
      // what a lost network is. A polite 1000 would tell the client it was meant, and a client
      // told a close was meant is right not to reconnect.
      ws.close({ code: 1006 })
      return
    }
    // Both halves pass everything through: with no message handlers registered, Playwright
    // forwards in both directions, so what the client and the table say to each other is
    // unchanged by being watched.
    ws.connectToServer()
    open.push({ close: () => ws.close({ code: 1006 }) })
  })

  return {
    cut: async () => {
      cut = true
      for (const ws of open.splice(0)) ws.close()
      // Nothing is waited for here. What the client does next — how long it waits, how many
      // times it tries — is the product's own schedule, and a test that paused for it would be
      // writing that schedule down in a second place.
    },
    restore: () => {
      cut = false
    },
  }
}
