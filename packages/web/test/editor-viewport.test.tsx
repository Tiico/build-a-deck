// @vitest-environment jsdom
// The editor at the widths the audit checks it at (UX-KONTROLLER, L12): 1280 and 1024, where the
// desk is and where the designer actually works, and 768 below them only to hold the editor to
// breaking nothing. A phone's width is no longer one of them — the editor degrades there rather
// than being guaranteed, and what it degrades *to* is `editor-rooms.test.tsx`'s business.
// Whether the document scrolls sideways, and how big a target is, are layout questions that only
// an engine with the real box model can answer — so the markup the editor actually mounts is
// measured in Chromium against the stylesheet it actually ships (#5).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { layerPick } from './layers.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// Every surface the editor can be showing at a width: one per tab in whichever strip the room
// mounts — the modes in the header on a desk, the stages in the bar on a smaller screen.
async function surfaces(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    const out: Record<string, string> = {}
    const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Editorlägen"] [role="tab"], [role="tablist"][aria-label="Editorns etapper"] [role="tab"]')]
    for (let i = 0; i < tabs().length; i++) {
      const tab = tabs()[i]!
      const name = tab.textContent?.trim() ?? String(i)
      fireEvent.click(tab)
      out[name] = document.querySelector('.byd-editor')!.outerHTML
    }
    return out
  } finally {
    unmount()
  }
}

// The form that makes a column (#32) is the one surface the tabs above can never show: it exists
// only while a door is being held open, so `.byd-newfield` is in none of that markup. That is how
// #45 could give the editor one tick box and still leave the three radios in this form drawn by
// the platform — nothing measured them. This holds the table's door open so something does.
async function newField(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kolumner' }))
    await screen.findByRole('form', { name: 'Nytt fält' })
    return { 'Nytt fält': document.querySelector('.byd-editor')!.outerHTML }
  } finally {
    unmount()
  }
}

// The property panel with a shape selected (L17), which none of the tabs above can show: the
// panel is empty until something is picked, so the gallery, the tiles and the shadow's chips —
// the densest thing the 280 px column ever holds — were measured by nothing at all. The back is
// captured too, because that is where the ready-made backs stand beside the layers.
async function shapePanel(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    const out: Record<string, string> = {}
    fireEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    // The fixture's front carries `frame`, a rectangle; picking it fills the property panel.
    await screen.findByRole('grid', { name: /lager/i })
    fireEvent.click(layerPick('frame'))
    // Everything the panel can hold at once: a star has the most numbers, and a pattern and a
    // shadow opened by hand put the rest of the controls on the screen beside them.
    fireEvent.click(screen.getByRole('button', { name: 'Stjärna' }))
    fireEvent.click(screen.getByLabelText('Mönster över fyllningen'))
    fireEvent.click(screen.getByRole('button', { name: 'Mjuk' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anpassa' }))
    out['Mall · form'] = document.querySelector('.byd-editor')!.outerHTML
    fireEvent.click(screen.getByRole('radio', { name: 'Baksida' }))
    out['Mall · baksida'] = document.querySelector('.byd-editor')!.outerHTML
    return out
  } finally {
    unmount()
  }
}

// The same surfaces, in a real engine at that width, measured by `read_`.
async function measure<T>(width: number, read_: (page: Page) => Promise<T>, of: (width: number) => Promise<Record<string, string>> = surfaces): Promise<Record<string, T>> {
  const marked = await of(width)
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    const out: Record<string, T> = {}
    for (const [name, html] of Object.entries(marked)) {
      await page.setContent(document_(html), { waitUntil: 'load' })
      out[name] = await read_(page)
    }
    return out
  } finally {
    await page.close()
  }
}

const nothing = <T,>(measured: Record<string, T>, empty: T) => Object.fromEntries(Object.keys(measured).map((name) => [name, empty]))

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

// A probe reads a number back out of the stylesheet, so it has to be hung inside the editor to
// inherit the editor's own tokens — and then must not be laid out by it. Standing in the flow it
// is a child like any other, and the editor's chrome is a column that lets its last child give
// way: a probe declaring 18 px was measured at 13, and the test then held every tick box in the
// editor to a number the editor never said. So every probe below is taken out of the flow first;
// the words are written out at each one because the page they run in cannot see this file.

const WIDTHS = [768, 1024, 1280] as const

// Everything a pointer or a thumb is meant to hit. A control inside a label is hit through the
// label — that is the target the eye sees and the one the browser forwards the click from.
const TARGETS = 'button, a[href], input, select, textarea, [role="option"], [role="tab"]'

describe.each(WIDTHS)('the editor at %ipx', (width) => {
  it('gives every control a 44 by 44 pixel hit area', async () => {
    const measured = await measure(width, (page) =>
      page.$$eval(TARGETS, (els) =>
        els
          .filter((el) => el.checkVisibility())
          .map((el) => {
            const target = el.closest('label') ?? el
            const box = target.getBoundingClientRect()
            return { what: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24), w: Math.round(box.width), h: Math.round(box.height) }
          })
          .filter(({ w, h }) => w < 44 || h < 44)
          .map(({ what, w, h }) => `${what}: ${w}×${h}`),
      ),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  // The editor's tick boxes (#45). A browser's own is 13 by 13, painted in whatever the platform
  // likes and stretched to whatever cell it lands in; the editor draws one box — one size, one
  // blue, and dark like the room it stands in — wherever a tick stands, so ticking a card and
  // ticking a rule look like the same act. The size and the blue are read back out of the
  // stylesheet through a probe, so the test says "the box the editor declares" and not a number
  // of its own.
  it('draws every tick box as the one box the editor declares', async () => {
    const measured = await measure(width, (page) =>
      page.$$eval("input[type='checkbox']", (els) => {
        const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
        probe.style.cssText = 'position: absolute; top: 0; left: 0; display: block; width: var(--byd-tick); height: var(--byd-tick); color: var(--byd-editor-primary-mark)'
        const want = `${probe.offsetWidth}×${probe.offsetHeight} ${getComputedStyle(probe).color} on dark`
        probe.remove()
        return els
          .filter((el) => el.checkVisibility())
          .map((el) => {
            const box = el.getBoundingClientRect()
            return {
              what: (el.getAttribute('aria-label') ?? el.parentElement?.textContent ?? el.tagName).trim().slice(0, 24),
              drawn: `${Math.round(box.width)}×${Math.round(box.height)} ${getComputedStyle(el).accentColor} on ${getComputedStyle(el).colorScheme}`,
            }
          })
          .filter(({ drawn }) => drawn !== want)
          .map(({ what, drawn }) => `${what}: ${drawn}, not ${want}`)
      }),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  // A tick is hit through the label around it, and that target grows *around* the drawn box and
  // never with it (#45): a row in the card table stays the height of one target and the rule
  // under it, so a taller tick can never push a card off the screen. Both numbers are read out of
  // the stylesheet, so the fact stays true when the editor changes what a target is worth.
  it('keeps a row in the card table the height of one target', async () => {
    const measured = await measure(width, (page) =>
      page.$$eval('.byd-data tbody tr', (els) => {
        const editor = document.querySelector('.byd-editor')!
        const probe = editor.appendChild(document.createElement('span'))
        probe.style.cssText = 'position: absolute; top: 0; left: 0; display: block; height: var(--byd-tap)'
        const tap = probe.offsetHeight
        probe.remove()
        return els
          .filter((el) => el.checkVisibility())
          .map((el) => ({ what: el.getAttribute('data-card-ref') ?? '?', h: Math.round(el.getBoundingClientRect().height) }))
          .filter(({ h }) => h > tap + 1)
          .map(({ what, h }) => `${what}: ${h}`)
      }),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  it('has exactly one panel on the screen at a time', async () => {
    // A `hidden` panel is only hidden while nothing in the stylesheet gives it a `display` of its
    // own; a mode that is closed but drawn is a second copy of the editor under the first.
    const measured = await measure(width, (page) => page.$$eval('.byd-editor > main > [role="tabpanel"]', (els) => els.filter((el) => el.checkVisibility()).length))
    expect(measured).toEqual(nothing(measured, 1))
  }, 90_000)

  it('never makes the page scroll sideways', async () => {
    const measured = await measure(width, (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    expect(measured).toEqual(nothing(measured, 0))
  }, 90_000)
})

// The property panel with a shape in it (L17), held to the same two rules the tabs are: nothing
// in it is smaller than a target, and nothing in it pushes the page sideways. It is the densest
// thing the editor's narrowest column ever holds — seventeen outlines, five tiles, four chips and
// five sliders — so it is the first place a panel would burst.
//
// Only where there is a canvas: below 768 px the editor has none at all (L10), so there is no
// property panel to measure and nothing this would be saying anything about.
describe.each([1024, 1280] as const)('the shape panel at %ipx', (width) => {
  it('gives every control a 44 by 44 pixel hit area', async () => {
    const measured = await measure(
      width,
      (page) =>
        page.$$eval(TARGETS, (els) =>
          els
            .filter((el) => el.checkVisibility())
            .map((el) => {
              const target = el.closest('label') ?? el
              const box = target.getBoundingClientRect()
              return { what: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24), w: Math.round(box.width), h: Math.round(box.height) }
            })
            .filter(({ w, h }) => w < 44 || h < 44)
            .map(({ what, w, h }) => `${what}: ${w}×${h}`),
        ),
      shapePanel,
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  it('never makes the page scroll sideways', async () => {
    const measured = await measure(width, (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), shapePanel)
    expect(measured).toEqual(nothing(measured, 0))
  }, 90_000)
})

// The form that makes a column, with its door held open (#50). A radio is a tick like any other:
// the designer picks the kind of field in the same breath as she names it, and the circle she
// picks it with stood 13 across in the platform's own paint and the darker of the two blues,
// beside a box the editor had already taught to be 18 and the lighter one. Same numbers as the
// tabs above, read the same way — out of the stylesheet through a probe, never out of this file.
describe.each(WIDTHS)('the form that makes a column, at %ipx', (width) => {
  it('draws every kind as the one tick box the editor declares', async () => {
    const measured = await measure(
      width,
      (page) =>
        page.$$eval(".byd-newfield input[type='radio']", (els) => {
          const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
          probe.style.cssText = 'position: absolute; top: 0; left: 0; display: block; width: var(--byd-tick); height: var(--byd-tick); color: var(--byd-editor-primary-mark)'
          const want = `${probe.offsetWidth}×${probe.offsetHeight} ${getComputedStyle(probe).color} on dark`
          probe.remove()
          const seen = els.filter((el) => el.checkVisibility())
          return {
            // The kinds are counted as well as measured: a selector that matched nothing would
            // otherwise report a clean form, which is the shape of guard this repo keeps finding.
            kinds: seen.length,
            drawn: seen
              .map((el) => {
                const box = el.getBoundingClientRect()
                return {
                  what: (el.parentElement?.textContent ?? el.tagName).trim().slice(0, 24),
                  drawn: `${Math.round(box.width)}×${Math.round(box.height)} ${getComputedStyle(el).accentColor} on ${getComputedStyle(el).colorScheme}`,
                }
              })
              .filter(({ drawn }) => drawn !== want)
              .map(({ what, drawn }) => `${what}: ${drawn}, not ${want}`),
          }
        }),
      newField,
    )
    expect(measured).toEqual({ 'Nytt fält': { kinds: 3, drawn: [] } })
  }, 90_000)

  it('gives every control in it a 44 by 44 pixel hit area', async () => {
    const measured = await measure(
      width,
      (page) =>
        page.$$eval(`.byd-newfield :is(${TARGETS})`, (els) => {
          const seen = els.filter((el) => el.checkVisibility())
          return {
            controls: seen.length,
            small: seen
              .map((el) => {
                const box = (el.closest('label') ?? el).getBoundingClientRect()
                return { what: (el.getAttribute('aria-label') ?? el.parentElement?.textContent ?? el.tagName).trim().slice(0, 24), w: Math.round(box.width), h: Math.round(box.height) }
              })
              .filter(({ w, h }) => w < 44 || h < 44)
              .map(({ what, w, h }) => `${what}: ${w}×${h}`),
          }
        }),
      newField,
    )
    // The name, the three kinds, and the two answers.
    expect(measured).toEqual({ 'Nytt fält': { controls: 6, small: [] } })
  }, 90_000)
})

// The Bord tab (B5, K2, #127): the zone list on the left, the felt beside it, and above the felt
// the row that says what the surface just did and how to work it. `surfaces` reaches it too, and
// it is built on its own here all the same: what is asked of it below can only be asked of a tab
// that has a felt on it, and asking it of the other five would open a browser to say nothing.
async function bord(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    // The draw pile is named twice over — once in the list and once on the felt — so asking for
    // it in the plural is waiting for both halves of the tab to be standing.
    await screen.findAllByText('Draghög')
    return { Bord: document.querySelector('.byd-editor')!.outerHTML }
  } finally {
    unmount()
  }
}

// The two widths the editor is held to (UX-KONTROLLER, L12). Both are asked, and the narrow one is
// where the answer was no: a surface as wide as its own longest sentence looks perfectly well
// behaved right up until the window stops being wider than the sentence (#127).
describe.each([1024, 1280] as const)('the Bord tab at %ipx', (width) => {
  // The felt's column is `minmax(0, 1fr)` and is told to take what is left. What it actually took
  // was the width of the instruction above it: that row is a flex line whose sentence does not
  // wrap, so its min-content contribution is the whole sentence, and an `auto` track cannot go
  // under what its widest item declares. Everything sharing the track went with it — the felt, the
  // phone's sheet — and at 1024 the row stood 201 px past the window with the zone list scrolled
  // off the other edge. The felt is measured here as a box and not as a picture: it clips its own
  // content and fits the table to whatever frame it is handed, which is `felt-refit`'s business.
  it('keeps every box the setup lays out inside the window', async () => {
    const measured = await measure(
      width,
      (page) =>
        page.evaluate(() => {
          const setup = document.querySelector('.byd-setup')!
          const boxes = [setup, ...setup.querySelectorAll('*')].filter((el) => el.parentElement === null || el.parentElement.closest('.byd-setup-felt') === null)
          return {
            // The reading is not vacuous: the tab is the table's, so the table has to be on it.
            zones: setup.querySelectorAll('[data-zone-row]').length,
            past: boxes
              .map((el) => ({ what: `${el.tagName.toLowerCase()}.${[...el.classList].join('.') || '—'}`, over: Math.round(el.getBoundingClientRect().right - window.innerWidth) }))
              .filter(({ over }) => over > 0)
              .map(({ what, over }) => `${what}: ${over} past the edge`),
            // The document and the panel the tab is drawn in, because the sideways scrollbar that
            // hides the list appears on whichever of the two is the one that scrolls.
            sideways: [document.documentElement, setup.closest('main')!].map((el) => el.scrollWidth - el.clientWidth),
          }
        }),
      bord,
    )
    expect(measured).toEqual({ Bord: { zones: 5, past: [], sideways: [0, 0] } })
  }, 90_000)

  // And the sentence itself is there to be read. Held off the window's edge it would still be a
  // sentence cut in half if the row kept it on one line and hid the rest, so what is asked is that
  // nothing of it is outside its own box either. No width is written down: the sentence is drawn
  // in whatever `system-ui` the machine has, and the question is whether it fits, not how wide it
  // came out (#95).
  it('says the whole of the instruction above the felt', async () => {
    const measured = await measure(
      width,
      (page) =>
        page.evaluate(() => {
          const said = document.querySelector('[data-setup-said]')!
          return {
            words: said.children.length,
            cut: [...said.children]
              .filter((el) => el.scrollWidth > el.clientWidth || el.getBoundingClientRect().right > window.innerWidth)
              .map((el) => (el.textContent ?? '').trim().slice(0, 24)),
          }
        }),
      bord,
    )
    // Nothing has been removed and nothing copied, so the row holds the instruction and nothing else.
    expect(measured).toEqual({ Bord: { words: 1, cut: [] } })
  }, 90_000)
})
