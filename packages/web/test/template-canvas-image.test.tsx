// @vitest-environment jsdom
// What a picture actually covers on the card, measured in pixels rather than read out of the
// template. The box is what the designer grabs — the handles hang on its corners, the selection
// outline follows it, and the guides snap to its edges — so a picture that stops short of the
// box's edges leaves the whole editor pointing at air. jsdom paints nothing and answers nothing
// here, so the markup the real component produces is drawn in a real engine and the colours are
// read back off the screenshot.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { newElement } from '../src/editor/canvas.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '../src/editor/types.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

const INK = '#e02b2b'

// A picture of a given shape, in one flat colour: what is asked of the screenshot is only
// "is the card's paper still showing here", so the picture needs no detail. The box the tool
// places is 40 × 30 mm, so 4:1 is far too wide for it and 1:4 far too tall — either way a
// fitting that keeps the whole picture must leave a wide band of nothing.
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
  const doc = projectDoc()
  const el = newElement('image', { taken: ['frame', 'title', 'body'], field: 'bild', card: CARD_STANDARD_63x88.physical })
  // The picture tool places a picture, and saying so is what lets the switch be turned off on it.
  if (el.kind !== 'image') throw new Error(`the picture tool placed a ${el.kind}`)
  doc.template.faces['front']!.base.push(fit ? { ...el, fit } : el)
  for (const row of doc.rows) row.fields['bild'] = src
  return doc
}

function markup(doc: ProjectDoc): string {
  const { container, unmount } = render(
    <TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="image-1" onSelectElement={vi.fn()} onPatch={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onSelectFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} />,
  )
  const html = container.innerHTML
  unmount()
  return html
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

type Seen = { box: { w: number; h: number }; drag: { w: number; h: number }; edges: Record<'n' | 'e' | 's' | 'w', string> }

// The colour the screen really carries just inside the middle of each edge of the picture's box.
// The middle of an edge and not its corner, because the corners are where the drag handles are
// drawn — sampling those would measure the editor's own furniture instead of the card. The page
// reads its own screenshot back through a canvas, so the answer is the painted pixel and never a
// second guess at what `object-fit` would have done with it.
async function measure(doc: ProjectDoc): Promise<Seen> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
      .replace(
        '<div id="root"></div>',
        `<div id="root"><div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${markup(doc)}</div></main></div></div>`,
      )
    await page.setContent(shell, { waitUntil: 'load' })
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))))
    const shot = (await page.screenshot()).toString('base64')
    return await page.evaluate(async (data) => {
      const rect = document.querySelector('[data-element="image-1"]')!.getBoundingClientRect()
      const dragged = document.querySelector('[data-drag="image-1"]')!.getBoundingClientRect()
      const shown = new Image()
      shown.src = `data:image/png;base64,${data}`
      await shown.decode()
      const sheet = Object.assign(document.createElement('canvas'), { width: shown.width, height: shown.height })
      const ink = sheet.getContext('2d')!
      ink.drawImage(shown, 0, 0)
      const at = (x: number, y: number) => {
        const [r, g, b] = ink.getImageData(Math.round(x), Math.round(y), 1, 1).data
        return `#${[r, g, b].map((c) => (c as number).toString(16).padStart(2, '0')).join('')}`
      }
      // Three pixels in from the edge: a millimetre drawn at the stage's zoom lands on halves of
      // a pixel, and the edge pixel itself is the one the browser antialiases.
      const in3 = 3
      const midX = (rect.left + rect.right) / 2
      const midY = (rect.top + rect.bottom) / 2
      return {
        box: { w: Math.round(rect.width), h: Math.round(rect.height) },
        drag: { w: Math.round(dragged.width), h: Math.round(dragged.height) },
        edges: { n: at(midX, rect.top + in3), s: at(midX, rect.bottom - in3), w: at(rect.left + in3, midY), e: at(rect.right - in3, midY) },
      }
    }, shot)
  } finally {
    await page.close()
  }
}

describe('the box a picture is edited by', () => {
  // 4:1 and 1:4 against a 4:3 box, so both directions a letterbox can fall in are asked for: a
  // picture too wide used to leave the paper showing above and below it, a picture too tall to
  // either side — a centimetre of nothing between what is seen and the corner being dragged.
  it.each([
    ['too wide for its box', picture(400, 100)],
    ['too tall for its box', picture(100, 400)],
  ])('carries a picture %s out to all four of its edges, so the handles and guides sit on what is seen', async (_what, src) => {
    const seen = await measure(withPicture(src))
    // The box is the one the tool placed, and the layer that takes the pointer is the same size.
    expect(seen.box.w).toBeGreaterThan(0)
    expect(seen.drag).toEqual(seen.box)
    expect(seen.edges).toEqual({ n: INK, e: INK, s: INK, w: INK })
  }, 60_000)

  // The other half of the promise: the switch that lets a picture stop keeping its proportions
  // is a choice between two ways of meeting the frame, never a way back to a gap inside it.
  it('does the same for a picture that has been told not to keep its proportions', async () => {
    const seen = await measure(withPicture(picture(400, 100), 'fill'))
    expect(seen.edges).toEqual({ n: INK, e: INK, s: INK, w: INK })
  }, 60_000)
})
