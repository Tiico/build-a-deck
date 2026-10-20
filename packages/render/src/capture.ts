import type { Page } from 'playwright'

// A screenshot of a page that has drawn (#533).
//
// `Page.captureScreenshot` asks viz, Chromium's compositor, for a copy of the page's surface. The
// copy is sent to the page's frame sink, and a page whose renderer has not yet drawn has no frame
// sink in viz: the request comes back empty at once (`FrameSinkManagerImpl::RequestCopyOfOutput`;
// viz's own comment names the case, a copy asked for «before the renderer loads the document»).
// Chromium asks five more times back to back, all inside a few milliseconds, and then answers
// «Unable to capture screenshot».
//
// On an idle machine that gap is closed long before anyone asks. On a loaded CI runner it is not:
// the page's script is done — `setContent` has returned, `evaluate` has measured the card — while
// its compositor has yet to connect to viz. The bench in #533 caught it about once in ten
// thousand captures on CI's own runners, always a page's first capture, and Chromium's trace
// showed every one of those copy requests arriving 130–260 ms before the page's first surface.
//
// So a capture waits for the page to draw. `requestAnimationFrame` is driven by begin-frames that
// viz sends through the page's frame sink, so a callback that runs proves the sink exists; the
// second one is the frame drawn after it, with whatever the page last laid out.
export async function capture(page: Page, options: NonNullable<Parameters<Page['screenshot']>[0]>): Promise<Buffer> {
  await page.evaluate(() => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn))))
  return page.screenshot(options)
}
