// @vitest-environment jsdom
// Whether the layer that takes the pointer really lies over the card is a layout question, and
// jsdom answers none: the card is drawn in millimetres, inside a zoom, by a compiler. So the real
// component's markup is measured in a real engine — the boxes a designer grabs must be the boxes
// they see, or every drag is off by the difference.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The template mode as the editor mounts it, in one of its panels, taken from a real mount.
function markup(): string {
  const { container, unmount } = render(
    <TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={vi.fn()} onPatch={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onReorder={vi.fn()} onSelectFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onReset={vi.fn()} />,
  )
  const html = container.innerHTML
  unmount()
  return html
}

type Box = { x: number; y: number; w: number; h: number }
type Seen = {
  elements: Record<string, Box>
  drags: Record<string, Box>
  handles: Record<string, Box>
  touchAction: string
  panels: { tools: Box; layers: Box; stage: Box; props: Box }
  overflow: number
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function measure(): Promise<Seen> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${read('src/editor/editor.css')}</style></head>`)
      .replace(
        '<div id="root"></div>',
        `<div id="root"><div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${markup()}</div></main></div></div>`,
      )
    await page.setContent(shell, { waitUntil: 'load' })
    return await page.evaluate(() => {
      const box = (el: Element | null): Box => {
        const r = (el ?? document.body).getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      const byId = (selector: string, attribute: string) =>
        Object.fromEntries([...document.querySelectorAll(selector)].map((el) => [el.getAttribute(attribute)!, box(el)]))
      const drag = document.querySelector('[data-drag="title"]')!
      return {
        elements: byId('#canvas [data-element]', 'data-element'),
        drags: byId('[data-drag]', 'data-drag'),
        handles: byId('[data-handle]', 'data-handle'),
        touchAction: getComputedStyle(drag).touchAction,
        panels: {
          tools: box(document.querySelector('.byd-canvas-tools')),
          layers: box(document.querySelector('.byd-canvas-layers')),
          stage: box(document.querySelector('.byd-canvas-stage')),
          props: box(document.querySelector('.byd-canvas-props')),
        },
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
  } finally {
    await page.close()
  }
}

describe('the drag layer where it is actually drawn (#18)', () => {
  it('lies exactly over the element it grabs, at the stage’s zoom', async () => {
    const seen = await measure()
    expect(Object.keys(seen.drags).sort()).toEqual(['body', 'frame', 'title'])
    for (const [id, drag] of Object.entries(seen.drags)) {
      expect({ [id]: drag }).toEqual({ [id]: seen.elements[id] })
      expect({ [id]: drag.w > 0 && drag.h > 0 }).toEqual({ [id]: true })
    }
    // A trackpad and a touch screen must drag the element, not scroll the stage.
    expect(seen.touchAction).toBe('none')
  }, 60_000)

  it('puts a handle on each corner of the selected element and nowhere else', async () => {
    const seen = await measure()
    const title = seen.drags['title']!
    // A handle is centred on its corner; a millimetre drawn at the stage's zoom lands on halves
    // of a pixel, so a pixel either way is the corner.
    const at = (corner: string, x: number, y: number) => {
      const h = seen.handles[corner]!
      expect({ [corner]: Math.abs(h.x + h.w / 2 - x) <= 1 && Math.abs(h.y + h.h / 2 - y) <= 1 }).toEqual({ [corner]: true })
    }
    at('nw', title.x, title.y)
    at('ne', title.x + title.w, title.y)
    at('sw', title.x, title.y + title.h)
    at('se', title.x + title.w, title.y + title.h)
    // Big enough to hit with a mouse on a card drawn at the stage's zoom.
    for (const [corner, handle] of Object.entries(seen.handles)) {
      expect({ [corner]: handle.w >= 6 && handle.h >= 6 }).toEqual({ [corner]: true })
    }
  }, 60_000)
})

describe('the four panels of the template mode (#18)', () => {
  it('lays the tool rail, the layers, the card and the properties side by side without overlapping', async () => {
    const { panels, overflow } = await measure()
    const order = [panels.tools, panels.layers, panels.stage, panels.props]
    for (const panel of order) expect(panel.w).toBeGreaterThan(0)
    for (let i = 1; i < order.length; i++) expect(order[i]!.x).toBeGreaterThanOrEqual(order[i - 1]!.x + order[i - 1]!.w)
    // The card gets what is left over, and the window never scrolls sideways.
    expect(panels.stage.w).toBeGreaterThan(panels.props.w)
    expect(overflow).toBe(0)
  }, 60_000)
})
