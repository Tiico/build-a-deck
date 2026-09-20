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
const css = `${read('src/editor/editor.css')}\n${read('src/rules/rules-open.css')}
${read('src/rules/rules.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

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

// The rules tab as markup, in each of its states: the disposition an empty tab proposes, the book
// that stands there once a way in has been taken, and a file lying in that book as a proposal
// (#131). The third is the one the decision between prototype 8's A and B turned on: A had two
// scrolling areas at 1024 and 1280, so the thing that has to be read carefully fell below a fold.
//
// The measure of 68 characters is asked of the three the designer writes in and not of the fourth:
// the presented book is the table's own 380 px drawer by decision (#227), and the whole point of
// the switch is that the two books are set to different measures.
type Scrolling = { areas: number; nested: string[] }
// And since #227 a fourth: the written book read as the players are handed it, which is the same
// spread with the table's own drawer standing in the reading area against a felt.
type State = 'empty' | 'written' | 'proposal' | 'table'
const STATES: readonly State[] = ['empty', 'written', 'proposal', 'table']

// A file that rewrites one of the template's sections and has nothing to say about the other four,
// so the proposal carries every mark there is: rewritten, new, going, and the setup left alone.
const OVER = ['# Skogens herrar', '', '# Uppställning', '', 'Var och en får fem guld.', '', '# Två spelare', '', 'Fyra kort läggs åt sidan utan att någon ser dem.'].join('\n')

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
    if (state === 'table') {
      fireEvent.click(screen.getByRole('button', { name: 'Som på bordet' }))
      // Luckan hämtas med sin egen stilmall sedan #346, så den finns inte i samma bildruta som
      // trycket. Markupen plockas först när den är framme — utan väntan vore det läget bara en
      // tom läsyta, och Chromium hade mätt en bild produkten aldrig visar. Väntan står här och
      // inte i påståendena: det som mäts efteråt är exakt detsamma som förut.
      await waitFor(() => expect(document.querySelector('.byd-rules-panel')).not.toBeNull())
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

  it('holds the whole tab inside the window, in each of its states, and never scrolls it sideways', async () => {
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

  it('scrolls the book and the column apart, never in a box inside another box', async () => {
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
    // Never one inside another, which is the measurement prototype 8 was decided on: A had the
    // page's and the dialog's at 1024 and 1280, so the part that has to be read carefully lay
    // below a fold inside a fold. The tab used to be allowed one area at all; since #210 it has
    // two, the book's and the column's, side by side. How much there is to scroll depends on how
    // tall the window is and how long this fixture's book happens to be, so what is claimed here
    // is the ceiling and never that there is something to scroll — `rules-column` is where a book
    // long enough to make both of them scroll is built and counted.
    const said = JSON.stringify(read)
    expect(Object.fromEntries(STATES.map((state) => [state, (read[state] as Scrolling).nested])), said).toEqual({ empty: [], written: [], proposal: [], table: [] })
    for (const state of STATES) expect((read[state] as Scrolling).areas, `${state} of ${said}`).toBeLessThan(3)
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

// The ＋ between the blocks, which must be one target per gap and not two lying over each other
// (#216, on #184).
//
// #184 took the ＋ out of hover and made it something that is always there, which is right: a way
// in that only exists under a pointer does not exist for a keyboard or a finger. What it did not
// carry was the height. `.byd-rules-add` declares 24 × 24, but `.byd-editor button` sets
// `min-height: var(--byd-tap)` at (0,1,1) against the rule's own (0,1,0) and wins — so the target
// is really 44 tall, hung at the top of each block, and any block shorter than that has its ＋
// standing over its neighbour's. A heading is shorter than that. So is a one-line paragraph.
//
// Measured rather than reasoned about: two 44 px squares are either overlapping on a real screen
// or they are not, and the stylesheet is not where that is decided.
describe('the ways in between the blocks (#216)', () => {
  const plusses = (page: Page) =>
    page.evaluate(() => {
      const boxes = [...document.querySelectorAll<HTMLElement>('.byd-rules-add')].map((el) => {
        const r = el.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, label: el.getAttribute('aria-label') ?? '' }
      })
      const over: string[] = []
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!
          const b = boxes[j]!
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) over.push(`${a.label} lies over ${b.label}`)
        }
      }
      // The smallest target among them, so a ＋ cannot be kept apart from its neighbour by being
      // made too small to press.
      const least = boxes.length === 0 ? 0 : Math.min(...boxes.map((b) => Math.min(b.bottom - b.top, b.right - b.left)))
      return { count: boxes.length, over, least }
    })

  it('gives every gap a ＋ of its own that no other ＋ lies over', async () => {
    const { count, over, least } = await measure(SCREENS[1], 'written', plusses)
    expect(count).toBeGreaterThan(1)
    expect(over).toEqual([])
    expect(least).toBeGreaterThanOrEqual(44)
  }, 120_000)
})

// The presented mode (#227, approved 2026-09-19: A's toggle, A's column, C's felt). Three of the
// acceptance criteria are layout and nothing else, so they are asked of a real engine here rather
// than reasoned about in a stylesheet: the drawer is the table's own 380 px, it stands against a
// felt instead of the editor's dark bottom, and the reading area is the same box in both modes so
// that the spread does not jump under the reader when she presses the switch.
//
// No pixel of any text is asserted. 380 is a number the product owner decided and the stylesheet
// declares; the box is compared with itself in the other mode; and the felt is compared with the
// editor's own ground rather than with a colour written down here.
describe('the book as at the table (#227)', () => {
  // The spread's two boxes, read the same way in whichever mode the tab is in.
  const spread = (page: Page) =>
    page.evaluate(() => {
      const box = (sel: string) => {
        const r = document.querySelector(sel)?.getBoundingClientRect()
        return r ? { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } : null
      }
      return { reading: box('.byd-rules-reading'), toc: box('.byd-rules-toc') }
    })
  const presented = (page: Page) =>
    page.evaluate(() => {
      const box = (el: Element | null) => {
        const r = el?.getBoundingClientRect()
        return r ? { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } : null
      }
      const panel = document.querySelector<HTMLElement>('.byd-rules-panel')!
      const felt = document.querySelector<HTMLElement>('.byd-rules-felt')!
      const button = document.querySelector<HTMLElement>('.byd-rules-open')!
      const b = button.getBoundingClientRect()
      const p = panel.getBoundingClientRect()
      return {
        reading: box(document.querySelector('.byd-rules-reading')),
        panel: box(panel),
        toc: box(document.querySelector('.byd-rules-toc')),
        ground: getComputedStyle(felt).backgroundImage + getComputedStyle(felt).backgroundColor,
        editorGround: getComputedStyle(document.querySelector('.byd-editor')!).backgroundColor,
        // The button that opens the drawer, and whether its own drawer is lying over it. Both
        // readings: the rectangles, and what a finger would actually meet in the middle of it.
        underItsOwnDrawer: b.left < p.right && p.left < b.right && b.top < p.bottom && p.top < b.bottom,
        meets: document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.className ?? 'nothing',
      }
    })

  it('gives the drawer the table’s own 380 px, and stands it against a felt and not the editor’s bottom', async () => {
    const seen = await measure(SCREENS[0], 'table', presented)
    expect(seen.panel!.width).toBe(380)
    // A felt is a ground of its own: green, and nothing like the dark the editor is drawn on.
    expect(seen.ground).toMatch(/gradient/)
    expect(seen.ground).not.toContain(seen.editorGround)
  }, 120_000)

  it('leaves the column standing and the reading area in the same box it had in the other mode', async () => {
    const written = await measure(SCREENS[0], 'written', spread)
    const table = await measure(SCREENS[0], 'table', spread)
    expect(table.toc).toEqual(written.toc)
    expect(table.reading).toEqual(written.reading)
  }, 180_000)

  // The finding the prototype measured and the decision turned into a requirement: `Regler` stands
  // at `right: 16px; top: 16px` of the felt and the drawer takes the outermost 380 px, so an open
  // drawer used to cover the very button that opened it. It is the table's own stylesheet, so
  // fixing it here fixes it at the table and on the TV as well.
  it('never lays the open drawer over the button that opens it', async () => {
    const seen = await measure(SCREENS[0], 'table', presented)
    expect({ under: seen.underItsOwnDrawer, meets: seen.meets }).toEqual({ under: false, meets: 'byd-rules-open' })
  }, 120_000)
})
