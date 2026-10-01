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
    <TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} />,
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
    <TemplateCanvas doc={projectDoc()} face="front" row="dragon" selectedElement="title" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} />,
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
      .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
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
        .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
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
          // Every other property of the element: the rows of the panel's sections (L25) and the
          // labelled controls that are not the picker the form hangs from.
          others: [...document.querySelectorAll('.byd-props-rows > .byd-props-f, .byd-props-rows > label:not(.byd-props-field)')].map((el) => ({ name: el.textContent?.split('\n')[0]?.trim() ?? '', box: box(el) })),
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

// The row under the card that says which card it is (#478), measured where it is tightest: 1024
// is the desk's narrowest width, and the width of a 13-inch iPad held upright and of a Galaxy Tab
// lying down. The card that is shown has more to say than the row has room for, which is the case
// a real deck is in: the look follows the body, and the body is a sentence.
async function cardRowAt1024() {
  const doc = projectDoc()
  doc.template.faces.front!.variantBy = 'body'
  doc.rows[0]!.fields['title'] = 'Drakens förbannade vrede över kungariket'
  doc.rows[0]!.fields['body'] = 'Välj två andra spelare. De blandar en shot till varann och dricker den tillsammans.'
  const { container, unmount } = render(
    <TemplateCanvas doc={doc} face="front" row="dragon" onPickRow={vi.fn()} selectedElement={null} onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} />,
  )
  const html = container.innerHTML
  unmount()
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
      .replace(
        '<div id="root"></div>',
        `<div id="root"><div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${html}</div></main></div></div>`,
      )
    await page.setContent(shell, { waitUntil: 'load' })
    return await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const values = document.querySelector('.byd-card-row-values')!
      const button = rect('.byd-card-row-name')
      const name = rect('.byd-card-row-name span')
      return {
        main: Math.round(rect('.byd-canvas-main').right),
        row: Math.round(rect('.byd-card-row').right),
        room: Math.round(rect('.byd-canvas-room').right),
        props: Math.round(rect('.byd-canvas-props').left),
        cut: values.scrollWidth > values.clientWidth,
        above: name.top - button.top,
        below: button.bottom - name.bottom,
      }
    })
  } finally {
    await page.close()
  }
}

describe('the card row in the card’s column (#478)', () => {
  // A column that grew to fit a row it was meant to cut short pushed the card 30 px over the
  // properties, and painted over their left edge.
  it('cuts its values short rather than widening the column over the properties', async () => {
    const seen = await cardRowAt1024()
    // Not vacuous: the values really are longer than the row.
    expect(seen.cut).toBe(true)
    expect({ main: seen.main, row: seen.row, room: seen.room }).toEqual({ main: seen.props, row: seen.props, room: seen.props })
  }, 60_000)

  // The steps either side of the name are centred on their 44 px; the name stood at the top of
  // its own, a line flush with the button's upper edge beside two arrows in the middle of theirs.
  it('stands the card’s name in the middle of its button, like the steps beside it', async () => {
    const seen = await cardRowAt1024()
    expect(Math.abs(seen.above - seen.below)).toBeLessThanOrEqual(1)
  }, 60_000)
})

// Lagerlistans villkorslager kapas i början (#569, beställarens beslut B): alla sex i Sal's Saloon
// hette «om rarite…» vid 1024 och gick inte att skilja åt. Slutet syns nu — värdets sista tecken och
// antalet kort — och det är det enda som skiljer dem åt i en kolumn på 220 px. Mätt på Sal's Saloon
// själv, därför att beslutet är fattat mot den och dess antal: två villkor med samma antal skiljs åt
// högst av värdets sista bokstav, och med ett bredare typsnitt inte alls, vilket är beslutets kända
// begränsning.
describe('the condition layers in the layer list (#569)', () => {
  it('cuts a condition’s name at its start, so that each of Sal’s Saloon’s six can be told apart at 1024', async () => {
    // Sal's Saloon's six conditions as `spelkortDoc` makes them, one per rarity on `raritet`, over
    // the same number of cards each (the script itself reads its sheet through `import.meta.url`,
    // which jsdom's own URL cannot resolve).
    const SALS = { Karaktär: 10, Silver: 14, Koppar: 12, Special: 11, Guld: 18, Diamant: 12 }
    const doc = projectDoc()
    doc.template.faces.front!.base = [
      ...Object.keys(SALS).map((rarity) => ({ kind: 'if' as const, id: `if-${rarity}`, when: { field: 'raritet', equals: rarity }, children: [{ kind: 'shape' as const, id: `pill-${rarity}`, x: 5, y: 80, w: 26, h: 6, shape: 'rect' as const, fill: '#888888' }] })),
      ...doc.template.faces.front!.base,
    ]
    doc.rows = Object.entries(SALS).flatMap(([rarity, n]) => Array.from({ length: n }, (_, i) => ({ id: `${rarity}-${i}`, fields: { title: `${rarity} ${i}`, raritet: rarity, antal: 1 } })))
    const { container, unmount } = render(
      <TemplateCanvas doc={doc} face="front" row={doc.rows[0]!.id} onPickRow={vi.fn()} selectedElement={null} onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} />,
    )
    const html = container.innerHTML
    unmount()
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
    try {
      const shell = read('index.html')
        .replace('<script type="module" src="/src/main.tsx"></script>', '')
        .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
        .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${html}</div></main></div></div>`)
      await page.setContent(shell, { waitUntil: 'load' })
      const seen = (await page.evaluate(`(() => {
        const ctx = document.createElement('canvas').getContext('2d')
        return [...document.querySelectorAll('.byd-layer-name')].filter((el) => el.textContent.includes(' kort')).map((el) => {
          const cs = getComputedStyle(el); ctx.font = cs.font
          const text = el.textContent
          if (el.scrollWidth <= el.clientWidth + 1) return { text, seen: text }
          const room = el.clientWidth - ctx.measureText('…').width
          const fromEnd = cs.direction === 'rtl'
          let n = text.length
          while (n > 0 && ctx.measureText(fromEnd ? text.slice(-n) : text.slice(0, n)).width > room) n--
          return { text, seen: fromEnd ? '…' + text.slice(-n) : text.slice(0, n) + '…' }
        })
      })()`)) as { text: string; seen: string }[]
      // Not vacuous: the six are there, and they really are cut.
      expect(seen).toHaveLength(6)
      expect(seen.every((s) => s.seen !== s.text)).toBe(true)
      // The end of each is what shows, and the end holds the count whole. How much of the value
      // shows before it is the font's to say: one letter with the Mac's, none with the wider one CI
      // has — so conditions with different counts are always told apart, and equal counts are the
      // decision's known limitation rather than something this test can promise.
      expect(seen.every((s) => s.seen.startsWith('…') && s.text.endsWith(s.seen.slice(1)))).toBe(true)
      expect(seen.every((s) => /· \d+ kort$/.test(s.seen) && s.seen.includes(s.text.slice(s.text.lastIndexOf('·'))))).toBe(true)
      expect(new Set(seen.map((s) => s.seen)).size).toBeGreaterThanOrEqual(new Set(Object.values(SALS)).size)
    } finally {
      await page.close()
    }
  }, 60_000)
})
