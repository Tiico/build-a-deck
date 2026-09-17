// What the keys are on, seen (#235).
//
// The arrow keys have moved through the symbol library since #33, and `data-table.test.tsx` has a
// reading for it. The beställare still reported that pressing down did nothing — on a deploy that
// carries the code, `v0.13.0`, so the keys were not missing. What was missing was the answer:
//
//   .byd-symbol-list button:hover,
//   .byd-symbol-list button[aria-selected='true'] { border-color: var(--byd-editor-primary-mark); }
//
// One rule for both, and nothing but a 1 px border. With the pointer resting anywhere in the list —
// which is exactly where it is, since the list was opened by typing under it — the hovered row and
// the row the keys are on are drawn identically, and moving the keys changes a hairline on a row
// that already had one. A control that answers and cannot be seen to answer has not answered.
//
// Measured in Chromium against the stylesheet the editor ships, because "can this be told apart"
// is a question about painted pixels and not about a declaration.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}`
const shell = read('index.html')

// Three options in the library: one the keys are on, one merely under the pointer, and one at rest.
const page = `
<div class="byd-editor">
  <div class="byd-symbol-list byd-data-symbols" role="listbox" aria-label="Symboler">
    <button type="button" role="option" id="keys" aria-selected="true"><span>sköld</span></button>
    <button type="button" role="option" id="mouse" aria-selected="false"><span>svärd</span></button>
    <button type="button" role="option" id="rest" aria-selected="false"><span>hjärta</span></button>
  </div>
</div>`

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

const drawn = async () => {
  const p = await browser.newPage({ viewport: { width: 900, height: 600 } })
  try {
    await p.setContent(
      shell
        .replace('<script type="module" src="/src/main.tsx"></script>', '')
        .replace('</head>', `<style>${css}</style></head>`)
        .replace('<div id="root"></div>', `<div id="root">${page}</div>`),
      { waitUntil: 'load' },
    )
    await p.hover('#mouse')
    return await p.evaluate(() => {
      // Everything the eye can tell two rows apart by, short of the letters in them. The bar the
      // button language marks a chosen thing with (#44) is a `box-shadow`, so a reading that looked
      // only at fill and border would call the tool's own mark "no difference".
      const of = (id: string) => {
        const s = getComputedStyle(document.getElementById(id)!)
        return { fill: s.backgroundColor, line: s.borderTopColor, width: s.borderTopWidth, mark: s.boxShadow, weight: s.fontWeight }
      }
      return { keys: of('keys'), mouse: of('mouse'), rest: of('rest') }
    })
  } finally {
    await p.close()
  }
}

describe('the option the keys are on (#235)', () => {
  it('is drawn differently from the one merely under the pointer', async () => {
    const { keys, mouse } = await drawn()
    // The whole report: with the pointer in the list, moving the keys has to change something the
    // eye can find. Drawn the same, it cannot.
    expect(JSON.stringify(keys)).not.toBe(JSON.stringify(mouse))
  }, 90_000)

  it('carries a mark of its own and not only the hairline the pointer draws', async () => {
    const { keys, rest, mouse } = await drawn()
    // A border is what the pointer already gives, so the key's answer has to be something more —
    // here the bar the button language marks a chosen thing with (#44), never a fill.
    expect(keys.mark).not.toBe(rest.mark)
    expect(keys.mark).not.toBe(mouse.mark)
    expect(keys.fill).toMatch(/,\s*0\)$/)
  }, 90_000)

  it('still lets the pointer say what it is over', async () => {
    const { mouse, rest } = await drawn()
    expect(JSON.stringify(mouse)).not.toBe(JSON.stringify(rest))
  }, 90_000)
})
