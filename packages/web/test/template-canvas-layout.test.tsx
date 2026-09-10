// @vitest-environment jsdom
// Whether the layer that takes the pointer really lies over the card is a layout question, and
// jsdom answers none: the card is drawn in millimetres, inside a zoom, by a compiler. So the real
// component's markup is measured in a real engine — the boxes a designer grabs must be the boxes
// they see, or every drag is off by the difference.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { chromium, type Browser } from 'playwright'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The template mode as the editor mounts it, in one of its panels, taken from a real mount.
function markup(): string {
  const { container, unmount } = render(
    <TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={vi.fn()} onPatch={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onReorder={vi.fn()} onSelectFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} />,
  )
  const html = container.innerHTML
  unmount()
  return html
}

// The same canvas with the binding's last entry chosen, which is what opens the form (#32). The
// choosing has to happen in React, so it happens here and the markup that comes out is measured.
async function markupWithForm(): Promise<string> {
  const user = userEvent.setup()
  const { container, unmount } = render(
    <TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={vi.fn()} onPatch={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onReorder={vi.fn()} onSelectFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} />,
  )
  const select = screen.getByLabelText('Fält') as HTMLSelectElement
  await user.selectOptions(select, within(select).getByRole('option', { name: 'nytt fält…' }))
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

// The second door into a new field (#32). The properties are a column that scrolls, so a form
// hanging out of the picker would be cut off at the panel's edge — which is the opposite mistake
// to the one the table's head had to avoid, and needs measuring for the same reason.
describe('the form the binding opens (#32)', () => {
  it('stands in the column rather than over the properties under it, and inside the panel’s own edges', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    try {
      const shell = read('index.html')
        .replace('<script type="module" src="/src/main.tsx"></script>', '')
        .replace('</head>', `<style>${read('src/editor/editor.css')}</style></head>`)
        .replace(
          '<div id="root"></div>',
          `<div id="root"><div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${await markupWithForm()}</div></main></div></div>`,
        )
      await page.setContent(shell, { waitUntil: 'load' })
      const seen = await page.evaluate(() => {
        const box = (el: Element | null) => {
          const r = (el ?? document.body).getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        const props = document.querySelector('.byd-canvas-props')!
        return {
          props: box(props),
          form: box(document.querySelector('.byd-newfield')),
          // Every other property of the element, which the form must not lie across.
          others: [...document.querySelectorAll('.byd-props > label:not(.byd-props-field)')].map((el) => ({ name: el.textContent?.split('\n')[0]?.trim() ?? '', box: box(el) })),
          sideways: props.scrollWidth - props.clientWidth,
        }
      })
      const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

      expect(seen.form.w).toBeGreaterThan(0)
      expect(seen.others.length).toBeGreaterThan(3)
      // The properties are a column that scrolls, so a sheet hanging over it would cover the
      // controls under the picker and be cut off at the panel's edge. It takes its own place in
      // the column instead — which is the opposite answer to the table head's, and right for the
      // opposite reason.
      expect(seen.others.filter((o) => overlaps(seen.form, o.box)).map((o) => o.name)).toEqual([])
      expect(seen.form.x).toBeGreaterThanOrEqual(seen.props.x)
      expect(seen.form.x + seen.form.w).toBeLessThanOrEqual(seen.props.x + seen.props.w)
      // And it does not push the column sideways to make room for itself.
      expect(seen.sideways).toBe(0)
    } finally {
      await page.close()
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
