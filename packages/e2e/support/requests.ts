import type { BrowserContext, Page } from '@playwright/test'

/** A request as it went out: its address, and the `Referer` it carried. */
export type Seen = { url: string; referer: string | undefined }

/**
 * Every request the context makes, from before the first page is opened, with the `Referer` the
 * browser actually sent; and every WebSocket the page opens, whose handshake is a request too.
 *
 * `request.allHeaders()` is what the network stack put on the wire, and Chromium reports it only
 * with an answer. For a request still in flight when the journey ends, or one whose report arrives
 * after Playwright has stopped listening for it — which happens under load — the promise neither
 * resolves nor fails, for as long as the page lives (#1320). So `closeAndRead` ends the page first:
 * every read still pending then fails, and that request is read from the headers the page handed
 * the network stack instead. The `Referer` there is the one the stack was given, and the stack only
 * ever shortens it by the policy, so a value absent from it was absent from what went out.
 */
export function watchRequests(context: BrowserContext, page: Page): { seen: Seen[]; closeAndRead: () => Promise<void> } {
  const seen: Seen[] = []
  const reading: Promise<void>[] = []
  context.on('request', (request) => {
    reading.push(
      request.allHeaders().then(
        (headers) => void seen.push({ url: request.url(), referer: headers['referer'] }),
        () => void seen.push({ url: request.url(), referer: request.headers()['referer'] }),
      ),
    )
  })
  page.on('websocket', (ws) => void seen.push({ url: ws.url(), referer: undefined }))
  return {
    seen,
    closeAndRead: async () => {
      await page.close()
      await Promise.all(reading)
    },
  }
}
