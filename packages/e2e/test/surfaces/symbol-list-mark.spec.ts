// What the keys are on, seen (#235).
//
// The arrow keys have moved through the symbol library since #33, and `data-table.test.tsx` has a
// reading for it. The beställare still reported that pressing down did nothing — on a deploy that
// carries the code, `v0.13.0`, so the keys were not missing. What was missing was the answer:
//
//   .byd-symbol-list button:hover,
//   .byd-symbol-list button[aria-selected='true'] { border-color: var(--byd-editor-primary-mark); }
//
// The rule is `.byd-pick-list`'s since #215, where what a narrowing list *is* was lifted out of the
// symbol library and shared with the rulebook's `[[`. The markup below wears both classes for the
// same reason the shipped list does: the shared one is what a list of this kind is, and the second
// is what this particular one holds.
//
// One rule for both, and nothing but a 1 px border. With the pointer resting anywhere in the list —
// which is exactly where it is, since the list was opened by typing under it — the hovered row and
// the row the keys are on are drawn identically, and moving the keys changes a hairline on a row
// that already had one. A control that answers and cannot be seen to answer has not answered.
//
// Measured in Chromium against the stylesheet the editor ships, because "can this be told apart"
// is a question about painted pixels and not about a declaration.
//
// Migrated from `packages/web/test/symbol-list-mark.test.ts`, which pasted `editor.css` and
// `buttons.css` into a bare document. The editor's sheet is a chunk of its own, linked only when
// `/editor` opens (#186), so it is now reached by opening that route — and waited for by a token
// only that sheet declares, because markup measured before it lands is measured against the
// entry's sheet and reads as a rule that is missing.
import { expect, test } from '@playwright/test'
import { standing } from '../../support/surface.js'

const MARKUP = `
<div class="byd-editor">
  <div class="byd-pick-list byd-symbol-list byd-data-symbols" role="listbox" aria-label="Symboler">
    <button type="button" role="option" id="keys" aria-selected="true"><span>sköld</span></button>
    <button type="button" role="option" id="mouse" aria-selected="false"><span>svärd</span></button>
    <button type="button" role="option" id="rest" aria-selected="false"><span>hjärta</span></button>
  </div>
</div>`


// The editor declares its own tokens on `.byd-editor`; this is the one the mark below is drawn in,
// so it is also the honest thing to wait for.
const EDITOR = { on: '.byd-editor', token: '--byd-editor-primary-mark' }

const drawn = async (page: import('@playwright/test').Page) => {
  await standing(page, MARKUP, { at: '/editor', needs: EDITOR })
  await page.hover('#mouse')
  return page.evaluate(() => {
    // Everything the eye can tell two rows apart by, short of the letters in them. The bar the
    // button language marks a chosen thing with (#44) is a `box-shadow`, so a reading that looked
    // only at fill and border would call the tool's own mark "no difference".
    const of = (id: string) => {
      const el = document.getElementById(id)
      if (!el) throw new Error(`there is no #${id} to read`)
      const s = getComputedStyle(el)
      return { fill: s.backgroundColor, line: s.borderTopColor, width: s.borderTopWidth, mark: s.boxShadow, weight: s.fontWeight }
    }
    return { keys: of('keys'), mouse: of('mouse'), rest: of('rest') }
  })
}

test.use({ viewport: { width: 900, height: 600 } })

test.describe('the option the keys are on (#235)', () => {
  test('is drawn differently from the one merely under the pointer', async ({ page }) => {
    const { keys, mouse } = await drawn(page)
    // The whole report: with the pointer in the list, moving the keys has to change something the
    // eye can find. Drawn the same, it cannot.
    expect(JSON.stringify(keys)).not.toBe(JSON.stringify(mouse))
  })

  test('carries a mark of its own and not only the hairline the pointer draws', async ({ page }) => {
    const { keys, rest, mouse } = await drawn(page)
    // A border is what the pointer already gives, so the key's answer has to be something more —
    // here the bar the button language marks a chosen thing with (#44), never a fill.
    expect(keys.mark).not.toBe(rest.mark)
    expect(keys.mark).not.toBe(mouse.mark)
    expect(keys.fill).toMatch(/,\s*0\)$/)
  })

  test('still lets the pointer say what it is over', async ({ page }) => {
    const { mouse, rest } = await drawn(page)
    expect(JSON.stringify(mouse)).not.toBe(JSON.stringify(rest))
  })
})
