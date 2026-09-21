// @vitest-environment jsdom
// The hit order on a shape of the designer's own (L26, #309), which is the half of the decision
// jsdom cannot answer: «punkten ligger alltid över kanten och över fyllningen» is a question
// about what a press at a given pixel actually lands on, and that is stacking, layout and the
// stage's zoom together. So the real component's markup is laid out in a real engine and asked
// the same question a pointer asks — `elementFromPoint`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
// Aliased: the browser's own `Element` is what the measurement below talks about, and two
// meanings of one word in one file is the kind of thing a reader has to hold in their head.
import type { Element as Layer, ProjectDoc } from '../src/editor/types.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// The fixture's `frame` is a 61 × 86 rectangle at 1, 1, made the designer's own: the four
// corners it already consisted of, with a fifth point pulled off the left edge so that one point
// is somewhere other than a corner of the box.
const POINTS = [
  { x: 0, y: 0 },
  { x: 61, y: 0 },
  { x: 61, y: 86 },
  { x: 0, y: 86 },
  // The one point that is somewhere other than a corner of the box, and the one that carries a
  // curve: standing on it is what brings its two handles out (L38).
  { x: 12, y: 43, in: { dx: -6, dy: -4 }, out: { dx: 6, dy: 4 } },
]

function markup(): string {
  const doc: ProjectDoc = projectDoc()
  const front = doc.template.faces['front']!
  doc.template.faces['front'] = { ...front, base: front.base.map((e) => (e.id === 'frame' ? ({ ...e, shape: 'rect', radiusMm: 0, points: POINTS } as Layer) : e)) }
  const { container, unmount } = render(
    <TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="frame" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} onReplaceFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} onFontFile={async () => 'Typsnitt'} onFontLicence={vi.fn()} onRemoveFont={vi.fn()} onCatalogFont={vi.fn(async () => undefined)} />,
  )
  // Standing on the curved point is what draws its handles, so the markup that is measured is
  // the markup a designer shaping a curve actually has in front of her (L38).
  act(() => (container.querySelector('[data-point="4"]') as HTMLElement).focus())
  const html = container.innerHTML
  unmount()
  return html
}

type Seen = {
  // What a press at the middle of each mark lands on, as `data-point`, `data-mid`, `data-drag`.
  onPoint: string | null
  onMid: string | null
  onFill: string | null
  // The mark's middle against the millimetre it stands for, in pixels.
  offBy: number
  // How far across the mid-dot is drawn compared with a point, at the same zoom.
  midOpacity: string
  midBorder: string
  pointBorder: string
  // Three kinds of mark on one outline, and the form has to carry the difference (L38).
  pointRadius: string
  midRadius: string
  handleRadius: string
  handleInk: string
  armStyle: string
  onHandle: string | null
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
      const middle = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }
      const names = (at: { x: number; y: number }) => {
        const hit = document.elementFromPoint(at.x, at.y)
        return hit === null ? null : (hit.getAttribute('data-point') ?? hit.getAttribute('data-mid') ?? hit.getAttribute('data-drag'))
      }
      // The point pulled off the left edge, which is the one that stands over the fill rather
      // than over a corner of the box — the press that has something to compete with.
      const point = document.querySelector('[data-point="4"]')!
      const handle = document.querySelector('[data-arm="out"]')!
      const arm = document.querySelector('.byd-point-arm')!
      // The mid-dot of the closing edge, which is the one that lies over the fill rather than
      // out on the box's own edge where the stage's own scroll can clip it.
      const mid = document.querySelector('[data-mid="4"]')!
      const drag = document.querySelector('[data-drag="frame"]')!.getBoundingClientRect()
      const mark = middle(point)
      return {
        onPoint: names(mark),
        onMid: names(middle(mid)),
        // Well inside the outline and away from every mark: the fill, which moves the element.
        onFill: names({ x: drag.x + drag.width * 0.6, y: drag.y + drag.height * 0.3 }),
        offBy: Math.max(Math.abs(mark.x - (drag.x + (drag.width * 12) / 61)), Math.abs(mark.y - (drag.y + (drag.height * 43) / 86))),
        pointRadius: getComputedStyle(point).borderTopLeftRadius,
        midRadius: getComputedStyle(mid).borderTopLeftRadius,
        handleRadius: getComputedStyle(handle).borderTopLeftRadius,
        handleInk: getComputedStyle(handle).backgroundColor,
        armStyle: getComputedStyle(arm).borderTopStyle,
        // A handle the point underneath it would swallow is a handle nobody can take hold of.
        onHandle: (() => {
          const hit = document.elementFromPoint(middle(handle).x, middle(handle).y)
          return hit === null ? null : hit.getAttribute('data-arm')
        })(),
        midOpacity: getComputedStyle(mid).opacity,
        midBorder: getComputedStyle(mid).borderTopWidth,
        pointBorder: getComputedStyle(point).borderTopWidth,
      }
    })
  } finally {
    await page.close()
  }
}

describe('the marks on a shape of the designer own, where they are actually drawn (L26)', () => {
  // The order that is not negotiable. A point that lost to the fill would mean a designer
  // aiming at a point moved the whole element instead, and a point that lost to a mid-dot would
  // mean the press she aimed at a point added one.
  it('gives a press on a point to the point, and a press on the fill to the element', async () => {
    const seen = await measure()
    expect(seen.onPoint).toBe('4')
    expect(seen.onMid).toBe('4')
    expect(seen.onFill).toBe('frame')
  }, 60_000)

  // A mark hung from its top-left corner would stand half its own width away from the point it
  // claims to be, which at 2,6 mm is more than the millimetre the arrow keys move.
  it('centres the mark on the millimetre it stands for', async () => {
    expect((await measure()).offBy).toBeLessThanOrEqual(1)
  }, 60_000)

  // Half the strength of a point (L26): hollow, thinner and faded, so fourteen marks on a small
  // banner read as seven points and seven places where a point could be.
  it('draws the mid-dot at half the strength of a point', async () => {
    const seen = await measure()
    expect(Number(seen.midOpacity)).toBeLessThanOrEqual(0.5)
    expect(Number.parseFloat(seen.midBorder)).toBeLessThan(Number.parseFloat(seen.pointBorder))
  }, 60_000)

  // The canvas now bears three kinds of mark on one outline, and the decision is that the form
  // carries the difference rather than the colour alone: a point is a square, a mid-dot a hollow
  // circle and a handle a filled circle on a dashed arm, in the felt's own amber (L38).
  it('tells the three marks apart by their form and not by their colour alone', async () => {
    const seen = await measure()
    expect(Number.parseFloat(seen.pointRadius)).toBe(0)
    expect(Number.parseFloat(seen.midRadius)).toBeGreaterThan(0)
    expect(Number.parseFloat(seen.handleRadius)).toBeGreaterThan(0)
    expect(seen.handleInk).toBe('rgb(255, 217, 138)')
    expect(seen.armStyle).toBe('dashed')
  }, 60_000)

  // A handle lies above the point it hangs on: it is the smaller and the newer of the two, and
  // a press that reached the point instead would move the whole point rather than bend the curve.
  it('gives a press on a handle to the handle', async () => {
    expect((await measure()).onHandle).toBe('out')
  }, 60_000)
})
