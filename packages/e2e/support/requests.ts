import type { BrowserContext, Page } from '@playwright/test'

/** A request as it went out: its address, and the `Referer` it carried. */
export type Seen = { url: string; referer: string | undefined }

/**
 * Every request the context makes, in every tab, from before the first page is opened, with the
 * `Referer` the browser actually sent; every WebSocket its tabs open, whose handshake is a request
 * too; and every frame those sockets receive, for a journey to show its search finds something.
 *
 * `request.allHeaders()` is what the network stack put on the wire, and Chromium reports it only
 * with an answer. For a request still in flight when the journey ends, or one whose report arrives
 * after Playwright has stopped listening for it — which happens under load — the promise neither
 * resolves nor fails, for as long as the page lives (#1320). So `closeAndRead` ends every page of
 * the context first: every read still pending then fails, and that request is read from the headers
 * the page handed the network stack instead. The `Referer` there is the one the stack was given, and
 * the stack only ever shortens it by the policy, so a value absent from it was absent from what went
 * out.
 */
export function watchRequests(context: BrowserContext): { seen: Seen[]; frames: string[]; closeAndRead: () => Promise<void> } {
  const seen: Seen[] = []
  const frames: string[] = []
  const reading: Promise<void>[] = []
  context.on('request', (request) => {
    reading.push(
      request.allHeaders().then(
        (headers) => void seen.push({ url: request.url(), referer: headers['referer'] }),
        () => void seen.push({ url: request.url(), referer: request.headers()['referer'] }),
      ),
    )
  })
  const watch = (page: Page) =>
    page.on('websocket', (ws) => {
      seen.push({ url: ws.url(), referer: undefined })
      ws.on('framereceived', ({ payload }) => void frames.push(String(payload)))
    })
  for (const page of context.pages()) watch(page)
  context.on('page', watch)
  return {
    seen,
    frames,
    closeAndRead: async () => {
      await Promise.all(context.pages().map((page) => page.close()))
      await Promise.all(reading)
    },
  }
}
