import { expect, test, type Page } from '@playwright/test'
import type { Element } from '@byd/template'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { zoomTo } from '../../support/zoom.js'

// The placeholder on the template canvas (#802, beställarens beslut variant A, «rutan säger det»).
// Three layers that draw nothing on the card shown, as in the prototype: a fixed picture with none
// chosen, a picture bound to the column of words «typ», and a new row of icons with no names. Each
// wears a dashed frame on the canvas with a word in a dark tag, drawn at the screen's own size
// whatever the zoom, and none of it reaches the card the compiler draws.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

const LAYERS: Element[] = [
  { kind: 'image', id: 'image-1', x: 5, y: 30, w: 25, h: 25, bind: { literal: '' }, fit: 'cover' },
  { kind: 'image', id: 'image-2', x: 33.5, y: 30, w: 25, h: 25, bind: { field: 'typ' }, fit: 'cover' },
  { kind: 'icons', id: 'icons-1', x: 5, y: 60, w: 24, h: 6, bind: { literal: '' }, iconMm: 5, gapMm: 1 },
]

async function mall(page: Page) {
  await logIn(page.request)
  const doc = gameDoc({ name: 'Skogens herrar', cards: 2 })
  for (const row of doc.rows) row.fields['typ'] = 'Playcard'
  const front = doc.template.faces['front']!
  // The body moves up out of the way, so the three layers lie on the card's paper as in the
  // prototype rather than under a text.
  front.base = front.base.map((el) => (el.id === 'body' ? { ...el, y: 17, h: 10 } : el))
  front.base.push(...LAYERS)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-template').click()
  await expect(page.locator('[data-drag="icons-1"]')).toBeVisible()
}

const tag = (page: Page, id: string) => page.locator(`[data-drag="${id}"] .byd-placeholder-tag`)

test('says on the canvas what each empty layer lacks, and the card draws none of it', async ({ page }) => {
  await mall(page)
  await expect(tag(page, 'image-1')).toHaveAccessibleName('Ingen bild vald — välj en i spelets bilder.')
  await expect(tag(page, 'image-1')).toContainText('Ingen bild vald')
  await expect(tag(page, 'image-2')).toContainText('«typ» är text, inte bilder')
  await expect(tag(page, 'icons-1')).toContainText('Inga ikoner')
  await expect(tag(page, 'icons-1')).toHaveAttribute('title', 'Inga ikoner ännu — välj en ikon, eller ett fält där korten skriver {namn}.')
  // The layer is described by its tag, so the keyboard that arrives on it hears why it is empty.
  await expect(page.locator('[data-drag="image-2"]')).toHaveAccessibleDescription('«typ» är text, inte bilder — välj en bildkolumn eller en fast bild.')

  // The card is the compiler's, and it has neither the broken picture nor any of the words.
  const card = page.locator('.byd-canvas-stage [data-card]')
  await expect(card.locator('[data-element="image-2"] img')).toHaveCount(0)
  await expect(card).not.toContainText(/bild vald|ikoner|är text/)
})

test('draws the tag at the screen’s size at every zoom, inside the frame that lies on its layer', async ({ page }) => {
  await mall(page)
  const measure = async () => {
    const out: Record<string, { box: DOMRect; frame: DOMRect; tag: DOMRect; line: number }> = {}
    for (const { id } of LAYERS) {
      out[id] = await page.locator(`[data-drag="${id}"]`).evaluate((box) => ({
        box: box.getBoundingClientRect().toJSON() as DOMRect,
        frame: box.querySelector('.byd-placeholder')!.getBoundingClientRect().toJSON() as DOMRect,
        tag: box.querySelector('.byd-placeholder-tag')!.getBoundingClientRect().toJSON() as DOMRect,
        line: box.querySelector('.byd-placeholder-tag > i')!.getBoundingClientRect().height,
      }))
    }
    return out
  }

  await zoomTo(page, 100)
  const small = await measure()
  await zoomTo(page, 200)
  const large = await measure()

  for (const { id } of LAYERS) {
    for (const at of [small, large]) {
      const { box, frame, tag: word } = at[id]!
      // The frame is the layer, edge for edge.
      expect(Math.abs(frame.x - box.x) + Math.abs(frame.width - box.width) + Math.abs(frame.height - box.height)).toBeLessThan(1)
      // The tag stands inside it, centred.
      expect(word.left).toBeGreaterThanOrEqual(box.left)
      expect(word.right).toBeLessThanOrEqual(box.right)
      expect(Math.abs(word.x + word.width / 2 - (box.x + box.width / 2))).toBeLessThan(1)
      expect(Math.abs(word.y + word.height / 2 - (box.y + box.height / 2))).toBeLessThan(1)
    }
    // And it is written at the same size at both zooms: twice the card is not twice the word. A
    // line is measured and not the tag, because a sentence that wraps on the small layer may not
    // on the large one.
    expect(Math.abs(large[id]!.line - small[id]!.line)).toBeLessThan(0.5)
  }
  // The row of icons is a strip too thin for two lines at both, so it says the short form.
  await expect(tag(page, 'icons-1')).not.toContainText('ännu')
})
