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
 */
export async function standing(page: Page, html: string, at = '/'): Promise<void> {
  await page.goto(at)
  // The app's own root is emptied rather than written beside: a mover measured next to a mounted
  // React tree would inherit whatever that tree is in the middle of.
  await page.evaluate((markup) => {
    const root = document.querySelector('#root')
    if (!root) throw new Error('the app has no #root, so there is nothing to stand this in')
    root.innerHTML = markup
  }, html)
}
