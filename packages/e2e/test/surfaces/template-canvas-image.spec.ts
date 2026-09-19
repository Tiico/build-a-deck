import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { newElement } from '../../../web/src/editor/canvas.js'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// What a picture actually covers on the card, measured in pixels rather than read out of the
// template. The box is what the designer grabs — the handles hang on its corners, the selection
// outline follows it, and the guides snap to its edges — so a picture that stops short of the
// box's edges leaves the whole editor pointing at air.
//
// Migrated from `packages/web/test/template-canvas-image.test.tsx`, which mounted `TemplateCanvas`
// with sixteen mock callbacks and a forced selection. None of that is needed: a drag box is drawn
// for every element, not only the chosen one, so the state this measures is simply the Mall tab
// with a picture in the template — which is reached by making the game and opening it.
const INK = '#e02b2b'

// A picture of a given shape, in one flat colour: what is asked of the screenshot is only "is the
// card's paper still showing here", so the picture needs no detail. The box the tool places is
// 40 × 30 mm, so 4:1 is far too wide for it and 1:4 far too tall — either way a fitting that keeps
// the whole picture must leave a wide band of nothing.
//
// `preserveAspectRatio="none"` so that this stands in for the photographs a deck is really made
// of. An SVG left to itself keeps its own shape inside whatever viewport it is given, and would
// then letterbox a second time within the picture — the fixture would report a gap the card does
// not have, and would report one whatever the template said.
const picture = (w: number, h: number) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><rect width="${w}" height="${h}" fill="${INK}"/></svg>`).toString('base64')}`

// The deck as it is the moment a designer presses the picture tool and binds it to a column. The
// element is the one the tool places rather than one written by hand here, so what is measured is
// what the tool promises.
function withPicture(src: string, fit?: 'fill'): ProjectDoc {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 3 }) as unknown as ProjectDoc
  const el = newElement('image', { taken: ['frame', 'title', 'body'], field: 'bild', card: CARD_STANDARD_63x88.physical })
  // The picture tool places a picture, and saying so is what lets the switch be turned off on it.
  if (el.kind !== 'image') throw new Error(`the picture tool placed a ${el.kind}`)
  doc.template.faces['front']!.base.push(fit ? { ...el, fit } : el)
  for (const row of doc.rows) row.fields['bild'] = src
  return doc
}

type Seen = { box: { w: number; h: number }; drag: { w: number; h: number }; edges: Record<'n' | 'e' | 's' | 'w', string> }

// The colour the screen really carries just inside the middle of each edge of the picture's box.
// The middle of an edge and not its corner, because the corners are where the drag handles are
// drawn — sampling those would measure the editor's own furniture instead of the card. The page
// reads its own screenshot back through a canvas, so the answer is the painted pixel and never a
// second guess at what `object-fit` would have done with it.
async function measure(page: Page, doc: ProjectDoc): Promise<Seen> {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  await expect(page.locator('[data-drag="image-1"]')).toBeVisible()
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))))

  const shot = (await page.screenshot()).toString('base64')
  return page.evaluate(async (data) => {
    const rect = document.querySelector('[data-element="image-1"]')!.getBoundingClientRect()
    const dragged = document.querySelector('[data-drag="image-1"]')!.getBoundingClientRect()
    const shown = new Image()
    shown.src = `data:image/png;base64,${data}`
    await shown.decode()
    const sheet = Object.assign(document.createElement('canvas'), { width: shown.width, height: shown.height })
    const ink = sheet.getContext('2d')!
    ink.drawImage(shown, 0, 0)
    // The shot is the viewport at whatever scale the browser took it in; the boxes are in CSS
    // pixels, so one is expressed in the other rather than assumed equal.
    const scale = shown.width / window.innerWidth
    const at = (x: number, y: number) => {
      const [r, g, b] = ink.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data
      return `#${[r, g, b].map((c) => (c as number).toString(16).padStart(2, '0')).join('')}`
    }
    // Three pixels in from the edge: a millimetre drawn at the stage's zoom lands on halves of a
    // pixel, and the edge pixel itself is the one the browser antialiases.
    const in3 = 3
    const midX = (rect.left + rect.right) / 2
    const midY = (rect.top + rect.bottom) / 2
    return {
      box: { w: Math.round(rect.width), h: Math.round(rect.height) },
      drag: { w: Math.round(dragged.width), h: Math.round(dragged.height) },
      edges: { n: at(midX, rect.top + in3), s: at(midX, rect.bottom - in3), w: at(rect.left + in3, midY), e: at(rect.right - in3, midY) },
    }
  }, shot)
}

test.use({ viewport: { width: 1280, height: 800 } })

test.describe('the box a picture is edited by', () => {
  // 4:1 and 1:4 against a 4:3 box, so both directions a letterbox can fall in are asked for: a
  // picture too wide used to leave the paper showing above and below it, a picture too tall to
  // either side — a centimetre of nothing between what is seen and the corner being dragged.
  for (const [what, src] of [
    ['too wide for its box', picture(400, 100)],
    ['too tall for its box', picture(100, 400)],
  ] as const) {
    test(`carries a picture ${what} out to all four of its edges, so the handles and guides sit on what is seen`, async ({ page }) => {
      const seen = await measure(page, withPicture(src))
      // The box is the one the tool placed, and the layer that takes the pointer is the same size.
      expect(seen.box.w).toBeGreaterThan(0)
      expect(seen.drag).toEqual(seen.box)
      expect(seen.edges).toEqual({ n: INK, e: INK, s: INK, w: INK })
    })
  }

  // The other half of the promise: the switch that lets a picture stop keeping its proportions is
  // a choice between two ways of meeting the frame, never a way back to a gap inside it.
  test('does the same for a picture that has been told not to keep its proportions', async ({ page }) => {
    const seen = await measure(page, withPicture(picture(400, 100), 'fill'))
    expect(seen.edges).toEqual({ n: INK, e: INK, s: INK, w: INK })
  })
})
