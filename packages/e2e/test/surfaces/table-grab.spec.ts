import { expect, test } from '@playwright/test'
import { standing } from '../../support/surface.js'

// What the hand may take hold of on the felt (K14), measured in an engine that knows what a
// finger does. Two properties carry it and neither can be read in jsdom: `touch-action: none` is
// the difference between dragging the thing under the finger and scrolling the page out from
// under it, and the lift while something is dragged is the difference between carrying a thing
// over the table and shoving it along underneath what is already lying there.
//
// Migrated from `packages/web/test/table-grab.test.ts`. That version pasted `table.css` and
// `buttons.css` into a bare document to get the cascade the felt ships with — the felt is a room
// of the button language (L13, #90), so the shared sheet has to lie over its own. Standing the
// markup in the built app gets that cascade by having it rather than by reassembling it, which is
// also the only way it can be wrong in the same way the product would be.
const THINGS = `
  <div class="byd-table-frame" data-mode="tv" data-playable="true">
    <div data-table>
      <div class="byd-zone" data-area="table"><span>Spelyta</span></div>
      <div class="byd-card" data-component="c1"></div>
      <div class="byd-card" data-component="c2" data-dragging="true"></div>
      <div class="byd-token" data-counter-token="k1"><b>20</b></div>
      <div class="byd-token" data-counter-token="k2" data-dragging="true"><b>20</b></div>
    </div>
  </div>
  <div class="byd-table-frame" data-mode="tv">
    <div data-table><div class="byd-token" data-counter-token="k3"><b>20</b></div></div>
  </div>`

const SEEN = {
  'a zone on a playable felt': '[data-playable] .byd-zone',
  'a card on a playable felt': '[data-playable] [data-component="c1"]',
  'a card being dragged': '[data-playable] [data-component="c2"]',
  'a chip on a playable felt': '[data-playable] [data-counter-token="k1"]',
  'a chip being dragged': '[data-playable] [data-counter-token="k2"]',
  'a chip on a felt that is only shown': '.byd-table-frame:not([data-playable]) [data-counter-token="k3"]',
} as const


type Grab = { touchAction: string; zIndex: string; cursor: string }

const measure = (page: import('@playwright/test').Page): Promise<Record<string, Grab>> =>
  page.evaluate(
    (seen) =>
      Object.fromEntries(
        seen.map(([name, selector]) => {
          const el = document.querySelector(selector)
          if (!el) throw new Error(`nothing matches ${selector}, so "${name}" measures nothing`)
          const style = getComputedStyle(el)
          return [name, { touchAction: style.touchAction, zIndex: style.zIndex, cursor: style.cursor }]
        }),
      ),
    Object.entries(SEEN),
  )

test.use({ viewport: { width: 1280, height: 800 } })

test.describe('what a finger can take hold of on the felt (K14, #73)', () => {
  test('answers a finger on a chip as it does on a card, and lets the page scroll everywhere else', async ({ page }) => {
    await standing(page, THINGS)
    const seen = await measure(page)
    expect(seen['a chip on a playable felt']).toEqual({ touchAction: 'none', zIndex: 'auto', cursor: 'grab' })
    expect(seen['a card on a playable felt']).toEqual({ touchAction: 'none', zIndex: 'auto', cursor: 'grab' })
    // The controls: the felt itself is not a thing to be carried, and a table that is only being
    // shown has no hand at all — so `none` above is this rule and not the page's default.
    expect(seen['a zone on a playable felt']?.touchAction).toBe('auto')
    expect(seen['a chip on a felt that is only shown']).toEqual({ touchAction: 'auto', zIndex: 'auto', cursor: 'auto' })
  })

  test('lifts a chip over the felt while it is carried, as high as a card goes', async ({ page }) => {
    await standing(page, THINGS)
    const seen = await measure(page)
    expect(seen['a chip being dragged']?.zIndex).toBe(seen['a card being dragged']?.zIndex)
    // And the control: the lift is what being dragged does, not something every chip has.
    expect(seen['a chip being dragged']?.zIndex).not.toBe(seen['a chip on a playable felt']?.zIndex)
  })
})
