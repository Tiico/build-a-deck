// @vitest-environment jsdom
// What the panel costs in a 280 px column is a layout question, and jsdom answers none: the
// gallery wraps, the rows are a grid, and both are decided by an engine. So the real component's
// markup is measured in a real one.
//
// Nothing here pins a pixel width that only holds on this machine. The tiles are SVG in a grid of
// their own and the gallery's height follows from how many stand on a row — neither is a
// measurement of a font, which is what CI's Linux would disagree about.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The template mode with a shape selected, which is the panel at its longest: an outline, what
// fills it, the line and what it casts.
function markup(): string {
  const doc: ProjectDoc = projectDoc()
  const front = doc.template.faces['front']!
  doc.template.faces['front'] = { ...front, base: front.base.map((e) => (e.id === 'frame' ? ({ ...e, shape: 'rect' } as Element) : e)) }
  const { container, unmount } = render(
    <TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="frame" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} onCatalogFont={vi.fn(async () => undefined)} />,
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

async function measure() {
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
      const gallery = document.querySelector('.byd-props-gallery')!
      const tiles = [...gallery.querySelectorAll('button')].map((b) => b.getBoundingClientRect())
      const top = Math.min(...tiles.map((t) => Math.round(t.top)))
      const panel = document.querySelector('.byd-canvas-props')!
      return {
        tiles: tiles.length,
        onFirstRow: tiles.filter((t) => Math.round(t.top) === top).length,
        widest: Math.max(...tiles.map((t) => Math.round(t.width))),
        gallery: Math.round(gallery.getBoundingClientRect().height),
        // Every grip beside a number, so none of them is a mark too small to take hold of.
        grips: [...document.querySelectorAll('.byd-props-grip')].map((g) => {
          const r = g.getBoundingClientRect()
          return { w: Math.round(r.width), h: Math.round(r.height) }
        }),
        sideways: panel.scrollWidth - panel.clientWidth,
      }
    })
  } finally {
    await page.close()
  }
}

// Seventeen tiles at 44 px took 290 of the panel's 658 — forty-four per cent of the panel was the
// gallery. At 30 they stand five to a row (L25).
describe('the shape gallery in the panel’s own column (L25)', () => {
  it('puts five tiles on a row, and takes a corner of the panel rather than half of it', async () => {
    const seen = await measure()
    expect(seen.tiles).toBeGreaterThan(15)
    expect(seen.onFirstRow).toBeGreaterThanOrEqual(5)
    // And the tiles themselves are under the editor's floor of 44, which is the exception L25
    // grants here and nowhere else in the panel.
    expect(seen.widest).toBeLessThan(44)
    // Four rows of tiles and the air between them, which is a fifth of what it was.
    expect(seen.gallery).toBeLessThanOrEqual(200)
  }, 60_000)

  // The exception from the tap rule is the gallery's tiles and nothing else in the panel (L25):
  // a grip is a thing to take hold of with a pointer, and a two-pixel mark is not one.
  it('leaves every grip big enough to take hold of, and the column never scrolls sideways', async () => {
    const seen = await measure()
    expect(seen.grips.length).toBeGreaterThan(3)
    expect(seen.grips.every((g) => g.w >= 16 && g.h >= 16)).toBe(true)
    expect(seen.sideways).toBe(0)
  }, 60_000)
})
