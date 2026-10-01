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
import { fireEvent, render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The template mode with a shape selected, which is the panel at its longest: an outline, what
// fills it, the line and what it casts.
function markup(open = false): string {
  const doc: ProjectDoc = projectDoc()
  const front = doc.template.faces['front']!
  doc.template.faces['front'] = { ...front, base: front.base.map((e) => (e.id === 'frame' ? ({ ...e, shape: 'rect' } as Element) : e)) }
  const { container, unmount } = render(
    <TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="frame" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} />,
  )
  if (open) fireEvent.click(container.querySelector('.byd-props-more')!)
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

async function measure(open = false) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
      .replace(
        '<div id="root"></div>',
        `<div id="root"><div class="byd-editor" data-page="editor" data-mode="template"><header></header><div></div><main><div role="tabpanel">${markup(open)}</div></main></div></div>`,
      )
    await page.setContent(shell, { waitUntil: 'load' })
    return await page.evaluate(() => {
      const gallery = document.querySelector('.byd-props-gallery')!
      const box = (el: { getBoundingClientRect(): DOMRect }) => {
        const r = el.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      }
      const panel = document.querySelector('.byd-canvas-props')!
      const more = document.querySelector('.byd-props-more')
      return {
        tiles: [...gallery.querySelectorAll('button')].map(box),
        more: more ? { ...box(more), text: (more.textContent ?? '').trim(), expanded: more.getAttribute('aria-expanded') } : null,
        gallery: Math.round(gallery.getBoundingClientRect().height),
        // Every grip beside a number, so none of them is a mark too small to take hold of.
        grips: [...document.querySelectorAll('.byd-props-grip')].map(box),
        sideways: panel.scrollWidth - panel.clientWidth,
      }
    })
  } finally {
    await page.close()
  }
}

// The editor's floor of 44 px holds in the shape panel too (#570, beslut B; L25 reviderad): the
// gallery shows the five outlines most cards are made of at 44, and «Fler former» opens the other
// twelve in place. Seventeen tiles at 44 took a third more of the panel and made it scroll; five
// and a button take what the thirty-pixel grid took.
describe('the shape gallery at the floor of 44 (#570)', () => {
  it('shows the five most used outlines at 44 and says how many more there are', async () => {
    const seen = await measure()
    expect(seen.tiles).toHaveLength(5)
    expect(seen.tiles.every((t) => t.w >= 44 && t.h >= 44)).toBe(true)
    expect(seen.more).toEqual({ w: seen.more?.w, h: seen.more?.h, text: 'Fler former (12)', expanded: 'false' })
    expect(seen.more!.w >= 44 && seen.more!.h >= 44).toBe(true)
    // One row of tiles and the button under it: no more than the thirty-pixel grid it replaces.
    expect(seen.gallery).toBeLessThanOrEqual(120)
  }, 60_000)

  it('opens all seventeen at 44 in place', async () => {
    const seen = await measure(true)
    expect(seen.tiles.length).toBeGreaterThan(15)
    expect(seen.tiles.every((t) => t.w >= 44 && t.h >= 44)).toBe(true)
    expect(seen.more?.expanded).toBe('true')
    expect(seen.sideways).toBe(0)
  }, 60_000)

  it('gives every grip beside a number a 44 by 44 target, and the column never scrolls sideways', async () => {
    const seen = await measure()
    expect(seen.grips.length).toBeGreaterThan(3)
    expect(seen.grips.filter((g) => g.w < 44 || g.h < 44)).toEqual([])
    expect(seen.sideways).toBe(0)
  }, 60_000)
})
