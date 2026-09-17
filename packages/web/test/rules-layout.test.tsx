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

// The rules tab as markup, in each of its three states: the disposition an empty tab proposes, the
// book that stands there once a way in has been taken, and a file lying in that book as a proposal
// (#131). The third is the one the decision between prototype 8's A and B turned on: A had two
// scrolling areas at 1024 and 1280, so the thing that has to be read carefully fell below a fold.
type Scrolling = { areas: number; nested: string[] }
type State = 'empty' | 'written' | 'proposal'
const STATES: readonly State[] = ['empty', 'written', 'proposal']

// A file that rewrites one of the template's sections and has nothing to say about the other four,
// so the proposal carries every mark there is: rewritten, new, going, and the setup left alone.
const OVER = ['# Uppställning', '', 'Var och en får fem guld.', '', '# Två spelare', '', 'Fyra kort läggs åt sidan utan att någon ser dem.'].join('\n')

// A project of its own per reading. Two of the three states write a book to the server, so a
// second reading against the same project would open on a book somebody else's iteration made.
let nth = 0

async function rules(width: number, state: State): Promise<string> {
  atWidth(width)
  const project = `${run.projectId}-${++nth}`
  await run.projects.create(project, projectDoc())
  history.replaceState(null, '', `/editor?project=${project}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(document.getElementById(tabId('rules'))!)
    if (state !== 'empty') {
      fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
      await waitFor(() => expect(document.querySelector('[data-rulebook]')).not.toBeNull())
    }
    if (state === 'proposal') {
      fireEvent.change(screen.getByLabelText('Importera över boken'), { target: { files: [new File([OVER], 'regler-v4.md', { type: 'text/markdown' })] } })
      await screen.findByRole('region', { name: 'Vad importen gör med boken du har' })
    }
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
  }
}

async function measure<T>(screen_: (typeof SCREENS)[number], state: State, read_: (page: Page) => Promise<T>): Promise<T> {
  const html = await rules(screen_.width, state)
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
})
afterEach(async () => {
  await run.stop()
})

describe.each(SCREENS)('the rules tab at $width × $height', (screen_) => {
  it.each([
    ['the disposition an empty tab proposes', 'empty'],
    ['the book a way in wrote', 'written'],
    ['the file lying in that book as a proposal', 'proposal'],
  ] as const)('gives %s a measure of 68 characters of the book’s own face', async (_what, state) => {
    const measured = await measure(screen_, state, measureAndProbe)
    expect(Math.abs(measured.measure - measured.sixtyEight), `measured ${measured.measure}px against 68 characters at ${measured.sixtyEight}px`).toBeLessThanOrEqual(2)
  }, 90_000)

  it('holds the whole tab inside the window, in all three states, and never scrolls it sideways', async () => {
    for (const state of STATES) {
      const measured = await measure(screen_, state, (page) =>
        page.evaluate(() => {
          const doc = document.documentElement
          const main = document.querySelector('main')!
          return { page: `${doc.scrollHeight - doc.clientHeight}/${doc.scrollWidth - doc.clientWidth}`, work: `${main.scrollHeight - main.clientHeight}/${main.scrollWidth - main.clientWidth}` }
        }),
      )
      expect(measured, state).toEqual({ page: '0/0', work: '0/0' })
    }
  }, 120_000)

  it('scrolls in one place, never in a box inside another box', async () => {
    const read: Record<string, Scrolling> = {}
    for (const state of STATES)
      read[state] = await measure(screen_, state, (page) =>
        page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>('.byd-rules')!
          const scrolls = (el: HTMLElement) => /auto|scroll/.test(`${getComputedStyle(el).overflow}${getComputedStyle(el).overflowY}`) && el.scrollHeight - el.clientHeight > 1
          const scrolling = [panel, ...panel.querySelectorAll<HTMLElement>('*')].filter(scrolls)
          return { areas: scrolling.length, nested: scrolling.filter((el) => scrolling.some((other) => other !== el && other.contains(el))).map((el) => el.className) }
        }),
      )
    // One scrolling area at most, and never one inside another. It is the measurement prototype 8
    // was decided on: A had the page's and the dialog's at 1024 and 1280, so the part that has to
    // be read carefully lay below a fold. How much there is to scroll depends on how tall the
    // window is, so what is claimed is the count and never that there is something to scroll.
    const said = JSON.stringify(read)
    expect(Object.fromEntries(STATES.map((state) => [state, (read[state] as Scrolling).nested])), said).toEqual({ empty: [], written: [], proposal: [] })
    for (const state of STATES) expect((read[state] as Scrolling).areas, `${state} of ${said}`).toBeLessThan(2)
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
    const empty = await measure(SCREENS[0], 'empty', box)
    const written = await measure(SCREENS[0], 'written', box)
    expect(written).toEqual(empty)
  }, 120_000)
})

// The file the import asks for, in both the states that offer it (#131). It used to be a
// transparent `<input type="file">` stretched over the visible label with `inset: 0` — the
// familiar styled-picker trick, and a control the eye cannot find sitting exactly where the click
// lands. #184's guard read it for what it is, an unpainted control; #140 had already paid for the
// same shape once, when a transparent button over half a cell swallowed the click the caret was
// meant to get and typed a `{` into a card. The input is off the screen now instead, which makes
// three things true that do not follow from one another, so all three are asked:
//
// the label is what a pointer meets, the label is bound to the input — that is what makes the
// drawn thing the control rather than a picture of one — and the input can still take focus,
// which is the whole difference between taking it off the screen and taking it out of the page.
// A `display: none` would satisfy #184's guard by disappearing from it, and would leave the
// import reachable by mouse only; `focused` is the line that would go red instead. The ring is
// asked for in the same breath, because focus that lands somewhere nobody can see is the same
// control being unreachable a second way round — and the ring has to be the label's, the input
// being nowhere the eye can follow it to.
describe('the file the import asks for', () => {
  const picker = (page: Page) =>
    page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('.byd-rules-ways input[type="file"]')
      if (!input) return { control: 'no file input at all' }
      const label = input.labels?.[0] ?? null
      const box = label?.getBoundingClientRect()
      const met = box ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) : null
      input.focus()
      const ring = label === null ? null : getComputedStyle(label)
      return {
        control: label === null ? 'an input bound to no label' : 'a label bound to the input',
        meets: met === input ? 'the file input' : met === label ? 'the label' : `a ${met?.tagName.toLowerCase() ?? 'nothing'}`,
        focused: document.activeElement === input,
        ring: ring !== null && ring.outlineStyle !== 'none' && parseFloat(ring.outlineWidth) > 0 ? 'drawn on the label' : 'nowhere',
      }
    })
  const want = { control: 'a label bound to the input', meets: 'the label', focused: true, ring: 'drawn on the label' }

  it('draws the label as the control, in the empty tab', async () => {
    expect(await measure(SCREENS[1], 'empty', picker)).toEqual(want)
  }, 120_000)

  it('draws the label as the control, in the written book', async () => {
    expect(await measure(SCREENS[1], 'written', picker)).toEqual(want)
  }, 120_000)
})
