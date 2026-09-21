// @vitest-environment jsdom
// The crop sheet's room (#297, L33). Two things were measured wrong before this: the one corner
// handle stood −4 px outside a box that clipped its overflow, so half of it was not on the
// screen; and a sheet with no ceiling grew with the column until, at 1440, the status, «Hela
// bilden» and the key row were under the fold. «En beskärningsyta som kräver rullning för att nå
// 'Hela bilden' är ingen arbetsyta.»
//
// jsdom lays nothing out, so the editor with the sheet open is captured as markup and measured in
// real Chromium against the sheets the editor ships, at the two desktop sizes the editor is
// reviewed at. Every reading is a box against a box or against the viewport — never a font pixel,
// so a Mac and a Linux machine measure the same thing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { chromium, type Browser } from 'playwright'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const SIZES = [
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
]
// The file's own shape, as the editor measures it: twice as wide as tall, and twice as tall as
// wide. The portrait one is the one a ceiling is for — width alone would let it grow to 780 px.
const SHAPES = [
  { shape: 'landscape', file: { w: 400, h: 200 } },
  { shape: 'portrait', file: { w: 200, h: 400 } },
]

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// The editor with the sheet open on a picture two cards are drawn from, so the card column is
// there to be measured too, as markup.
async function sheetOpen(width: number, file: { w: number; h: number }): Promise<string> {
  atWidth(width)
  const put = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG })
  const { hash } = (await put.json()) as { hash: string }
  await fetch(`${run.http}/assets/${hash}/motif`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ w: file.w, h: file.h, trim: { left: 0, top: 0, right: 0, bottom: 0 } }),
  })
  const doc: ProjectDoc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${hash}`
  doc.rows[1]!.fields['art'] = `asset:${hash}`
  doc.pictures = { [hash]: { name: 'skog.png' } }
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const user = userEvent.setup()
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('tab', { name: 'Media' }))
    await user.click(await screen.findByRole('button', { name: 'skog.png' }))
    // The file's measure has arrived when the picture wears its shape.
    await waitFor(() => {
      const [wide = '0', high = '1'] = (document.querySelector('.byd-crop-picture') as HTMLElement).style.aspectRatio.split('/')
      expect(Number(wide) / Number(high)).toBe(file.w / file.h)
    })
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
  }
}

type Box = { top: number; left: number; right: number; bottom: number }
type Fit = {
  sheet: Box
  corners: Box[]
  picture: { w: number; h: number }
  ceiling: number
  // The parts that have to be reachable without scrolling, as whether each is wholly inside the
  // viewport — and whether the sheet has anything to scroll at all.
  status: boolean
  whole: boolean
  keys: boolean
  done: boolean
  card: boolean
  scrolls: boolean
}

const FIT = () => {
  const box = (el: Element | null): Box => {
    const r = el!.getBoundingClientRect()
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom }
  }
  const inView = (el: Element | null): boolean => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth
  }
  const dialog = document.querySelector('.byd-media-sheet') as HTMLElement
  const picture = document.querySelector('.byd-crop-picture')!.getBoundingClientRect()
  return {
    sheet: box(document.querySelector('.byd-crop-sheet')),
    corners: [...document.querySelectorAll('.byd-crop-corner')].map(box),
    picture: { w: picture.width, h: picture.height },
    ceiling: parseFloat(getComputedStyle(document.querySelector('.byd-crop-picture')!).getPropertyValue('--byd-crop-ceiling')),
    status: inView(dialog.querySelector('.byd-crop-status')),
    whole: inView([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Hela bilden') ?? null),
    keys: inView(dialog.querySelector('.byd-crop-keys')),
    done: inView([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Klart') ?? null),
    card: inView(dialog.querySelector('.byd-media-crop-card')),
    scrolls: dialog.scrollHeight > dialog.clientHeight,
  }
}

async function measure(html: string, size: { w: number; h: number }): Promise<Fit> {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return (await page.evaluate(FIT)) as Fit
  } finally {
    await page.close()
  }
}

describe('the crop sheet fits the editor’s room (#297, L33)', () => {
  it.each(SIZES.flatMap((size) => SHAPES.map((shape) => ({ ...size, ...shape }))))(
    'at $w×$h with a $shape file: four whole corners inside the sheet, and everything reachable without scrolling',
    async ({ w, h, file }) => {
      const fit = await measure(await sheetOpen(w, file), { w, h })

      // The whole-picture crop is the hard case: every corner overhangs the picture's edge into
      // the sheet's air, and every one of them is wholly there.
      expect(fit.corners).toHaveLength(4)
      for (const corner of fit.corners) {
        expect(corner.left).toBeGreaterThanOrEqual(fit.sheet.left)
        expect(corner.top).toBeGreaterThanOrEqual(fit.sheet.top)
        expect(corner.right).toBeLessThanOrEqual(fit.sheet.right)
        expect(corner.bottom).toBeLessThanOrEqual(fit.sheet.bottom)
      }
      // The ceiling holds, and the picture keeps its shape under it.
      expect(fit.ceiling).toBeGreaterThan(0)
      expect(fit.picture.h).toBeLessThanOrEqual(fit.ceiling + 0.5)
      expect(fit.picture.w / fit.picture.h).toBeCloseTo(file.w / file.h, 1)
      expect({ status: fit.status, whole: fit.whole, keys: fit.keys, done: fit.done, card: fit.card, scrolls: fit.scrolls }).toEqual({ status: true, whole: true, keys: true, done: true, card: true, scrolls: false })
    },
    60_000,
  )
})
