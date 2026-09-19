import type { Page } from '@playwright/test'

/**
 * A piece of the app's markup, standing in the built app's own stylesheet.
 *
 * Some facts are about a state that is real but hard to arrive at: a ring pulsing while somebody
 * points, the glow on a card another player just moved, a texture that has not landed yet. Those
 * are worth gating and not worth building a whole journey to reach, so the markup is placed in a
 * page that is already the app.
 *
 * What makes this honest is *which* stylesheet it lands in. The web suite's version of this read
 * the CSS out of `src/` and pasted it into a bare document, so it measured the sources; this
 * navigates the running product first, so the rules that apply are the ones the build emitted and
 * the browser actually shipped. That distinction has been the whole of two issues here — the
 * felt's face travelling inside the blocking sheet (#95) and the editor's CSS being lifted out of
 * it (#186) — and neither was visible to anything that pasted its own stylesheet in.
 *
 * `at` is the route whose stylesheet is wanted. The entry's sheet covers the table, the phone and
 * the status surfaces; the editor's is a chunk of its own and arrives only on `/editor`.
 *
 * `needs` is how a route with a chunked stylesheet is waited for. `/editor` is fetched rather than
 * shipped (#186), so its rules land a moment after the page does, and markup measured in that gap
 * is measured against the entry's sheet alone — which is not a failure that looks like one. It
 * looks like a rule that is missing. So the wait is on a custom property that only that sheet
 * declares, read off the markup once it is standing: the sheet itself answering, rather than a
 * guess about how long it takes to arrive. It is read on an element and not on the root because
 * that is where these tokens live — the editor declares its own on `.byd-editor`.
 */
export async function standing(page: Page, html: string, { at = '/', needs }: { at?: string; needs?: { on: string; token: string } } = {}): Promise<void> {
  await page.goto(at)
  await inject(page, html)
  if (needs)
    await page
      .waitForFunction(
        ({ on, token }) => {
          const el = document.querySelector(on)
          return el !== null && getComputedStyle(el).getPropertyValue(token).trim() !== ''
        },
        needs,
        { timeout: 15_000 },
      )
      .catch(() => {
        throw new Error(`${needs.token} was never declared on ${needs.on}, so ${at}'s own stylesheet had not landed and nothing here would be measured against it`)
      })
}

/**
 * The same markup, in a page that is already standing.
 *
 * A file measuring one surface in many arrangements — every combination of strips the editor can
 * put up, say — wants the route once and the markup thirty-two times. Navigating for each would
 * be thirty-two builds of the same page to ask thirty-two questions of the same stylesheet.
 */
export async function inject(page: Page, html: string): Promise<void> {
  // The app's own root is emptied rather than written beside: a thing measured next to a mounted
  // React tree would inherit whatever that tree is in the middle of.
  await page.evaluate((markup) => {
    const root = document.querySelector('#root')
    if (!root) throw new Error('the app has no #root, so there is nothing to stand this in')
    root.innerHTML = markup
  }, html)
}
