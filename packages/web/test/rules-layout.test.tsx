// @vitest-environment jsdom
// What the rules tab does with the height and the width it has (#131). The tab used to put a
// paragraph in the top left corner of 1440 × 900 and leave the rest dark; it now lays the book's
// disposition out beside the column the book is found in. Whether a measure is a measure, whether
// the pair stays where it is when the window grows, and what scrolls when it does not fit are
// layout questions, so they are asked of a real engine against the stylesheet the editor ships —
// the way `editor-viewport` and `editor-tables-layout` ask theirs.
//
// No pixel count of any piece of text is asserted here. CI draws a different face from a Mac, so
// what is claimed is a relationship: the measure is 68 characters *of the book's own face*, read
// off a probe in that same face, and it is the same measure at every width.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { tabId } from '../src/editor/EditorTabs.js'
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

// The three the audit measured at, each with the height it was measured with (UX-KONTROLLER, L12).
const SCREENS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
] as const

// The rules tab as markup, in either of its two states: the disposition an empty tab proposes, and
// the book that stands there once a way in has been taken.
async function rules(width: number, written: boolean): Promise<string> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(document.getElementById(tabId('rules'))!)
    if (written) {
      fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
      await waitFor(() => expect(document.querySelector('[data-rulebook]')).not.toBeNull())
    }
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
  }
}

async function measure<T>(screen_: (typeof SCREENS)[number], written: boolean, read_: (page: Page) => Promise<T>): Promise<T> {
  const html = await rules(screen_.width, written)
  const page = await browser.newPage({ viewport: { width: screen_.width, height: screen_.height } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

// The width of the book's text, and the width of 68 characters written in the book's own face, in
// the same browser and the same moment. A probe rather than a number is the whole point: the face
// is whatever the machine has, and only the relationship between the two is a fact about the app.
const measureAndProbe = (page: Page) =>
  page.evaluate(() => {
    const book = document.querySelector<HTMLElement>('.byd-rulebook')!
    const probe = book.appendChild(document.createElement('span'))
    probe.style.cssText = 'position: absolute; visibility: hidden; white-space: pre'
    probe.textContent = '0'.repeat(68)
    const sixtyEight = probe.getBoundingClientRect().width
    probe.remove()
    const paragraph = book.querySelector<HTMLElement>('p')!
    const pad = getComputedStyle(paragraph)
    return {
      measure: Math.round(paragraph.getBoundingClientRect().width - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight)),
      sixtyEight: Math.round(sixtyEight),
    }
  })

let run: Running
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, projectDoc())
})
afterEach(async () => {
  await run.stop()
})

describe.each(SCREENS)('the rules tab at $width × $height', (screen_) => {
  it.each([
    ['the disposition an empty tab proposes', false],
    ['the book a way in wrote', true],
  ] as const)('gives %s a measure of 68 characters of the book’s own face', async (_what, written) => {
    const measured = await measure(screen_, written, measureAndProbe)
    expect(Math.abs(measured.measure - measured.sixtyEight), `measured ${measured.measure}px against 68 characters at ${measured.sixtyEight}px`).toBeLessThanOrEqual(2)
  }, 90_000)

  it('holds the whole tab inside the window, in both states, and never scrolls it sideways', async () => {
    for (const written of [false, true]) {
      const measured = await measure(screen_, written, (page) =>
        page.evaluate(() => {
          const doc = document.documentElement
          const main = document.querySelector('main')!
          return { page: `${doc.scrollHeight - doc.clientHeight}/${doc.scrollWidth - doc.clientWidth}`, work: `${main.scrollHeight - main.clientHeight}/${main.scrollWidth - main.clientWidth}` }
        }),
      )
      expect(measured, written ? 'written' : 'empty').toEqual({ page: '0/0', work: '0/0' })
    }
  }, 120_000)

  it('scrolls in one place, never in a box inside another box', async () => {
    for (const written of [false, true]) {
      const measured = await measure(screen_, written, (page) =>
        page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>('.byd-rules')!
          const scrolls = (el: HTMLElement) => /auto|scroll/.test(`${getComputedStyle(el).overflow}${getComputedStyle(el).overflowY}`) && el.scrollHeight - el.clientHeight > 1
          const scrolling = [panel, ...panel.querySelectorAll<HTMLElement>('*')].filter(scrolls)
          return { how_many_at_most_one: Math.min(scrolling.length, 2), nested: scrolling.filter((el) => scrolling.some((other) => other !== el && other.contains(el))).map((el) => el.className) }
        }),
      )
      expect(measured, written ? 'written' : 'empty').toEqual({ how_many_at_most_one: measured.how_many_at_most_one, nested: [] })
      expect(measured.how_many_at_most_one).toBeLessThan(2)
    }
  }, 120_000)
})

// The claim the whole decision rests on: an empty tab and a written book are one surface and not
// two. That is not a matter of taste once it is said this way — the column the reader finds her
// way with stands in the same place, at the same width, before and after a word is written.
describe('the empty tab and the written book are one surface', () => {
  it('leaves the column the book is found in exactly where it stood', async () => {
    const box = (page: Page) =>
      page.evaluate(() => {
        const toc = document.querySelector<HTMLElement>('.byd-rules-toc')!.getBoundingClientRect()
        return { left: Math.round(toc.left), width: Math.round(toc.width) }
      })
    const empty = await measure(SCREENS[0], false, box)
    const written = await measure(SCREENS[0], true, box)
    expect(written).toEqual(empty)
  }, 120_000)
})
