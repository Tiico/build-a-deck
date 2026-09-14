// @vitest-environment jsdom
// Normalising the size of a deck's art (E1). The files arrive one per card, drawn by whoever drew
// them, and two files holding the same motif rarely hold it at the same size: one carries a wide
// transparent border, the next almost none. Fitting the files therefore draws the motif at a
// different size on every card. What is asked here is what the screen actually shows, so the
// markup the real component produces is drawn in a real engine and the ink is counted off the
// screenshot — and the measuring is done by the very function the editor runs, in a real browser,
// because jsdom has no pixels to measure.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import type { Motif } from '@byd/template'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '../src/editor/types.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// A colour no part of the editor paints, so the ink can be told from the furniture drawn over
// the card: the selection outline and the drag handles are in the editor own mark colour, and a
// bounding box that counted those would measure the tool rather than the card.
const INK = { css: '#12f0c8', rgb: [0x12, 0xf0, 0xc8] }

// One picture as a deck's art really arrives: a drawing sitting in the middle of a file, with
// however much transparent air the person who exported it happened to leave around it.
const picture = (size: number, border: number) => {
  const drawn = size - 2 * border
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="${border}" y="${border}" width="${drawn}" height="${drawn}" fill="${INK.css}"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

// Two files holding the same square motif: half of the one is air, a sixth of the other.
const LOOSE = { src: picture(200, 50), motif: { w: 200, h: 200, trim: { left: 50, top: 50, right: 50, bottom: 50 } } }
const TIGHT = { src: picture(120, 10), motif: { w: 120, h: 120, trim: { left: 10, top: 10, right: 10, bottom: 10 } } }

function withPicture(src: string, trim: boolean): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 5, y: 5, w: 40, h: 30, bind: { field: 'bild' }, fit: 'contain', ...(trim ? { trim: true } : {}) })
  for (const row of doc.rows) row.fields['bild'] = src
  return doc
}

function markup(doc: ProjectDoc, motifs: Record<string, Motif>): string {
  const { container, unmount } = render(
    <TemplateCanvas doc={doc} face="front" row="dragon" selectedElement={null} motifs={motifs} onSelectElement={vi.fn()} onPatch={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} />,
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

function page(body: string): string {
  return read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
}

// The ink's own rectangle on the screen, in whole pixels, relative to the picture's frame. The
// screenshot is read back through a canvas, so the answer is the painted pixel and never a second
// guess at what the CSS would have done with it.
async function inkBox(doc: ProjectDoc, motifs: Record<string, Motif>): Promise<{ w: number; h: number; x: number; y: number }> {
  const view = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await view.setContent(
      page(`<div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${markup(doc, motifs)}</div></main></div>`),
      { waitUntil: 'load' },
    )
    await view.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))))
    const shot = (await view.screenshot()).toString('base64')
    return await view.evaluate(async ([data, rgb]) => {
      const frame = document.querySelector('[data-element="art"]')!.getBoundingClientRect()
      const shown = new Image()
      shown.src = `data:image/png;base64,${data}`
      await shown.decode()
      const sheet = Object.assign(document.createElement('canvas'), { width: shown.width, height: shown.height })
      const ink = sheet.getContext('2d')!
      ink.drawImage(shown, 0, 0)
      const px = ink.getImageData(Math.round(frame.left), Math.round(frame.top), Math.round(frame.width), Math.round(frame.height))
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
      for (let y = 0; y < px.height; y++) {
        for (let x = 0; x < px.width; x++) {
          const at = (y * px.width + x) * 4
          // Close to the ink and nothing else: a few steps of tolerance so the browser own
          // colour handling counts, but not so many that the edge antialiasing does.
          if (rgb.every((c, i) => Math.abs(px.data[at + i]! - c) <= 12)) {
            x0 = Math.min(x0, x)
            y0 = Math.min(y0, y)
            x1 = Math.max(x1, x)
            y1 = Math.max(y1, y)
          }
        }
      }
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
    }, [shot, INK.rgb] as const)
  } finally {
    await view.close()
  }
}

describe('a picture fitted by its motif rather than by its file (E1)', () => {
  // Within two pixels either way, on a drawing some two hundred and fifty across: the two files
  // rasterise at different scales, so their edges land on different fractions of a device pixel.
  // The difference the measurement removes is a third of the drawing, not a percent of it.
  const alike = (a: { w: number; h: number; x: number; y: number }, b: typeof a) => {
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(2)
  }

  it('is the problem: two files of the same motif draw it at different sizes when the file is what is fitted', async () => {
    const loose = await inkBox(withPicture(LOOSE.src, false), {})
    const tight = await inkBox(withPicture(TIGHT.src, false), {})

    // Half of the one file is air and a sixth of the other, so fitting the files draws the same
    // drawing at half size on the one card and at five sixths on the next.
    expect(loose.w).toBeGreaterThan(0)
    expect(tight.w / loose.w).toBeGreaterThan(1.5)
  }, 120_000)

  it('draws the motif at one size on both cards once each file has been measured', async () => {
    const loose = await inkBox(withPicture(LOOSE.src, true), { [LOOSE.src]: LOOSE.motif })
    const tight = await inkBox(withPicture(TIGHT.src, true), { [TIGHT.src]: TIGHT.motif })

    alike(loose, tight)
    // And it is the whole 30 mm height of the frame, as fitting a square motif whole into a
    // 40 × 30 frame must be — the air is gone rather than merely equal.
    const frame = await inkBox(withPicture(picture(100, 0), false), {})
    alike(loose, { ...frame, w: frame.h, x: frame.x + (frame.w - frame.h) / 2 })
  }, 120_000)

  it('leaves the picture to its frame when nothing has measured that file, so a picture is never lost to this', async () => {
    const asked = await inkBox(withPicture(LOOSE.src, true), {})
    const plain = await inkBox(withPicture(LOOSE.src, false), {})

    alike(asked, plain)
  }, 120_000)
})
