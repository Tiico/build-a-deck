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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { layerPick } from './layers.js'
import { filePickerFaults } from './file-pickers.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// Every surface below begins by asking the fixture whether the server is answering, and only then
// stands the editor up (#149). The word it goes on to wait for — `Skogens herrar`, the name the
// fixture's own project carries — is content: it appears once an answer has come, so waiting for it
// was timing the server instead of asking it, and under a full run the timing lost. It lost badly,
// too, because there is nothing behind the word to wait longer for: the editor opens a project with
// a single `fetch` and keeps no second attempt, so a surface that lost that one request stood on
// the disconnected screen for the rest of the test. `run.answering()` is the attempt that is kept —
// the fixture asked again until it comes back, with its own patience, written down where it lives.
// The word stays where it is, now saying only what it can say: the editor has drawn the project.

// Every surface the editor can be showing at a width: one per tab in whichever strip the room
// mounts — the modes in the header on a desk, the stages in the bar on a smaller screen.
async function surfaces(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
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
  await run.answering()
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

// The card table with a picture in it, and the import held open (#193). Three of the editor's file
// pickers stand on this tab and not one of them is on a surface the sweep above can reach: the
// import is behind a box in the crown (#130), and the two image pickers exist only in a deck that
// has an image column at all — which the fixture, three rows of text, does not. That is how two
// transparent controls could sit in the densest tab the editor has with every describe green.
async function cardFiles(width: number): Promise<Record<string, string>> {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  await run.projects.create(run.otherProjectId, doc)
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.otherProjectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    fireEvent.click(screen.getByRole('button', { name: 'Importera' }))
    await screen.findByLabelText('Importera CSV…')
    // A marked card opens the action row, and the row draws a picker of its own the moment the
    // column it is set to is the image one (#17 on E1) — before that it offers a text field.
    fireEvent.click(screen.getByLabelText('markera dragon'))
    fireEvent.change(await screen.findByLabelText('Kolumn'), { target: { value: 'art' } })
    await screen.findByLabelText('Välj bild för de markerade korten')
    return { 'Tabell · filer': document.querySelector('.byd-editor')!.outerHTML }
  } finally {
    unmount()
  }
}

// The rulebook as it is once somebody has written in it (#184). The fixture deck has no rules, so
// the Regler tab in the sweep above is the empty state and always was — which is how a control in
// the written book came to be 24 px across, half a target, with nothing measuring it. The book is
// opened here the way a designer opens it, through the empty state's own button, so what is
// measured is the surface she meets.
async function writtenRules(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
    fireEvent.click(screen.getByRole('button', { name: 'Börja skriva reglerna' }))
    // One per block: the book the empty state makes has several, which is the point of it.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Lägg till efter/ }).length).toBeGreaterThan(1))
    return { 'Regler · skriven': document.querySelector('.byd-editor')!.outerHTML }
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
  await run.answering()
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

// The Bord tab with a table on it (#19), which `surfaces` above can never show: the list is the
// server's answer, and a game with no table at all draws one sentence and a button. Everything
// that tab is really made of — the four ways into a table, the QR and the ending — hangs off a row
// that only exists once a table has been started, so nothing here was ever measured. That is how
// `.byd-tables-ways` could ship targets 32 px high while every describe above went green.
async function tablesTab(width: number): Promise<Record<string, string>> {
  const started = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  if (!started.ok) throw new Error(`could not start a table: ${started.status}`)
  const table = ((await started.json()) as { id: string }).id
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  // The table's own door and not the server's, because that is what this surface waits on below:
  // a free seat is known to the table's snapshot alone, and `/sessions/<id>` is answered once the
  // actor behind it is standing. It answers for the server around it in the same breath.
  await run.answering(`/sessions/${encodeURIComponent(table)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    // A table nobody has played lies behind a fold (#176), and a fold is where this sweep would
    // otherwise stop: it would find two controls, measure them and call the tab clean.
    fireEvent.click(await screen.findByRole('button', { name: /Startade, aldrig spelade/ }))
    // Waited for by the one way that is not there until the table itself has answered: sitting
    // down needs a free seat, and a free seat is something only the table's own snapshot knows.
    // Waiting for it is what puts every way into the markup rather than most of them.
    await screen.findByRole('link', { name: /Spela härifrån/ })
    // The other five are in the row's menu, and a menu that is shut is five targets nobody has
    // ever measured — which is exactly how `.byd-tables-ways` shipped at 32 px (#133).
    fireEvent.click(screen.getByRole('button', { name: /Fler vägar in till bordet/ }))
    return { Bord: document.querySelector('.byd-editor')!.outerHTML }
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
// And what counts as being on the screen at all, everywhere below. `checkVisibility` says nothing
// about opacity unless it is asked, and every sweep in this file used to leave it unasked: a
// control at `opacity: 0` was therefore read as an ordinary drawn control, measured for its target
// and counted among the panel's own — which is how four transparent file pickers lived in the tool
// without a word being said (#193). Asked, it answers about the thing the eye can actually find.
// It is a widening and not a way out: nothing is made to pass this by disappearing from it, which
// is why every count below is asserted as a number. A control taken off the screen for the eye
// alone — `.byd-offscreen`, an input a label stands in front of — is still visible to this, and
// still has to be a target; what it is not is a sheet lying over other content.

describe.each(WIDTHS)('the editor at %ipx', (width) => {
  it('gives every control a 44 by 44 pixel hit area', async () => {
    const measured = await measure(width, (page) =>
      page.$$eval(TARGETS, (els) =>
        els
          .filter((el) => el.checkVisibility({ opacityProperty: true }))
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
          .filter((el) => el.checkVisibility({ opacityProperty: true }))
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
          .filter((el) => el.checkVisibility({ opacityProperty: true }))
          .map((el) => ({ what: el.getAttribute('data-card-ref') ?? '?', h: Math.round(el.getBoundingClientRect().height) }))
          .filter(({ h }) => h > tap + 1)
          .map(({ what, h }) => `${what}: ${h}`)
      }),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  // The same question the written rulebook is asked (#184), asked of the whole room (#193). A
  // control nobody can see is not a control that happens to be quiet: it is laid out, it is hit,
  // and it takes the click that belonged to whatever it covers — which is the bug #140 was opened
  // for and the bug the rulebook's own picker turned out to be. `checkVisibility` says nothing
  // about opacity unless it is asked, and every sweep above leaves it unasked; that default is
  // exactly how four transparent file pickers lived in the editor without a word being said.
  it('paints every control without waiting for a pointer to rest on it', async () => {
    const measured = await measure(width, (page) =>
      page.$$eval(TARGETS, (els) =>
        els
          .filter((el) => el.checkVisibility() && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
          // Named through the label when the control itself has nothing to say: a file input
          // carries neither text nor, usually, an `aria-label`, and a report reading `: 0` says
          // only that something in the room is invisible, not which thing.
          .map((el) => `${(el.getAttribute('aria-label') || el.textContent || el.closest('label')?.textContent || el.tagName).trim().slice(0, 24)}: ${getComputedStyle(el).opacity}`),
      ),
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  // And what a file picker in particular has to be (#193): named, reached through its label, lit
  // when the keyboard finds it, and as big as a thumb. Summed over the tabs rather than read tab
  // by tab, because which tab a picker stands on moves with the width — the typeface shelf is a
  // panel on a desk and a stage of its own below one.
  it('names every file picker, hands it the pointer through its label, and rings it when it takes focus', async () => {
    const measured = await measure(width, (page) => page.$$eval("input[type='file']", filePickerFaults))
    // The typeface shelf's, and the one the empty rulebook offers as its third way in (#131).
    expect({
      pickers: Object.values(measured).reduce((n, m) => n + m.pickers, 0),
      faults: Object.values(measured).flatMap((m) => m.faults),
    }).toEqual({ pickers: 2, faults: [] })
  }, 90_000)

  it('has exactly one panel on the screen at a time', async () => {
    // A `hidden` panel is only hidden while nothing in the stylesheet gives it a `display` of its
    // own; a mode that is closed but drawn is a second copy of the editor under the first.
    const measured = await measure(width, (page) => page.$$eval('.byd-editor > main > [role="tabpanel"]', (els) => els.filter((el) => el.checkVisibility({ opacityProperty: true })).length))
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
            .filter((el) => el.checkVisibility({ opacityProperty: true }))
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

// The written rulebook, held to the two rules the tabs are (#184): nothing in it is smaller than a
// target, and nothing in it pushes the page sideways. It is a desk surface like the canvas, so it
// is measured where the editor draws a book — below 768 the room has no canvas at all (L10), and
// the Regler tab there is its own business.
describe.each(WIDTHS)('the written rulebook, at %ipx', (width) => {
  it('gives every control in it a 44 by 44 pixel hit area', async () => {
    const measured = await measure(
      width,
      (page) =>
        page.$$eval(`.byd-rulebook :is(${TARGETS}), .byd-rules :is(${TARGETS})`, (els) => {
          const seen = els.filter((el) => el.checkVisibility({ opacityProperty: true }))
          return {
            // Counted as well as measured: a book that arrived empty would otherwise report a
            // clean surface, which is the shape of guard this repo keeps finding it needs.
            controls: seen.length,
            small: seen
              .map((el) => {
                const box = (el.closest('label') ?? el).getBoundingClientRect()
                return { what: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24), w: Math.round(box.width), h: Math.round(box.height) }
              })
              .filter(({ w, h }) => w < 44 || h < 44)
              .map(({ what, w, h }) => `${what}: ${w}×${h}`),
          }
        }),
      writtenRules,
    )
    expect(Object.values(measured).map((m) => m.small)).toEqual([[]])
    expect(Object.values(measured).map((m) => m.controls > 4)).toEqual([true])
  }, 90_000)

  // And that a reader can see them without a pointer (#184, and #144 before it on the canvas). A
  // control that is only painted while a pointer rests over it is not there at all for a thumb,
  // which has no hover to give, and a keyboard only finds it because `:focus-visible` paints it
  // back — that is the tab order rescuing the paint, not the paint being right.
  //
  // `checkVisibility` is asked about opacity here, which it does not look at by default. That
  // default is why the sweep above passes over the same button without a word.
  it('paints every control in it without waiting for a pointer to rest on it', async () => {
    const measured = await measure(
      width,
      (page) =>
        page.$$eval(`.byd-rulebook :is(${TARGETS}), .byd-rules :is(${TARGETS})`, (els) =>
          els
            .filter((el) => el.checkVisibility() && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
            .map((el) => `${(el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24)}: ${getComputedStyle(el).opacity}`),
        ),
      writtenRules,
    )
    expect(measured).toEqual(nothing(measured, [] as string[]))
  }, 90_000)

  // The picker the third way in asks for, held to what every file picker in the tool is held to
  // (#193). It is the one that was built right first (#131), and the corner it stands in and the
  // ring it lights are the editor's rule now rather than the book's own two lines — so this is
  // also the thing that says the move cost the book nothing.
  it('names the file picker, hands it the pointer through its label, and rings it when it takes focus', async () => {
    const measured = await measure(width, (page) => page.$$eval("input[type='file']", filePickerFaults), writtenRules)
    expect(measured).toEqual({ 'Regler · skriven': { pickers: 1, faults: [] } })
  }, 90_000)

  it('never makes the page scroll sideways', async () => {
    const measured = await measure(width, (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), writtenRules)
    expect(measured).toEqual(nothing(measured, 0))
  }, 90_000)
})

// The card table's three file pickers (#193), held to the two rules every control in the editor is
// held to: a target a thumb can hit, and paint that does not wait for a pointer. They are counted
// as well as measured, because a drawer that never opened or a deck that lost its image column
// would report a clean tab — which is the shape of guard this repo keeps finding it needs.
describe.each(WIDTHS)('the card table with a picture in it, at %ipx', (width) => {
  it('paints every file picker in it without waiting for a pointer to rest on it', async () => {
    const measured = await measure(
      width,
      (page) =>
        page.$$eval(".byd-table-wrap input[type='file']", (els) => {
          const seen = els.filter((el) => el.checkVisibility({ opacityProperty: true }))
          return {
            pickers: seen.length,
            unpainted: seen
              .filter((el) => !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
              .map((el) => `${(el.getAttribute('aria-label') || el.closest('label')?.textContent || el.tagName).trim().slice(0, 24)}: ${getComputedStyle(el).opacity}`),
          }
        }),
      cardFiles,
    )
    // The import, the action row's, and one in each of the three cards' image cells.
    expect(measured).toEqual({ 'Tabell · filer': { pickers: 5, unpainted: [] } })
  }, 90_000)

  it('names every file picker in it, hands each the pointer through its label, and rings them on focus', async () => {
    const measured = await measure(width, (page) => page.$$eval(".byd-table-wrap input[type='file']", filePickerFaults), cardFiles)
    expect(measured).toEqual({ 'Tabell · filer': { pickers: 5, faults: [] } })
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
          const seen = els.filter((el) => el.checkVisibility({ opacityProperty: true }))
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
          const seen = els.filter((el) => el.checkVisibility({ opacityProperty: true }))
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

// The Bord tab with a table in it (#19), held to the rule the editor writes down for itself:
// `--byd-tap` is 44 px, and every target in the editor is at least that at every width the audit
// checks. The ways into a table were the one place that was not — two buttons measured 88 × 32 and
// 81 × 32 at 1440 × 900 — and they were the only controls in the whole editor under 44 px that
// were not a `--byd-tick` box with a 44 px label around it.
describe.each(WIDTHS)('the Bord tab with a table, at %ipx', (width) => {
  it('gives every control in it a 44 by 44 pixel hit area', async () => {
    const measured = await measure(
      width,
      (page) =>
        page.$$eval(`.byd-tables :is(${TARGETS})`, (els) => {
          const seen = els.filter((el) => el.checkVisibility({ opacityProperty: true }))
          return {
            // Counted as well as measured: a row that never rendered would otherwise report a
            // clean tab, which is the shape of guard this repo keeps finding.
            controls: seen.length,
            small: seen
              .map((el) => {
                const box = (el.closest('label') ?? el).getBoundingClientRect()
                return { what: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24), w: Math.round(box.width), h: Math.round(box.height) }
              })
              .filter(({ w, h }) => w < 44 || h < 44)
              .map(({ what, w, h }) => `${what}: ${w}×${h}`),
          }
        }),
      tablesTab,
    )
    // The fold, the way standing ready, the button that opens the menu, the five ways in it, and
    // the button that starts another table.
    expect(measured).toEqual({ Bord: { controls: 9, small: [] } })
  }, 90_000)

  it('never makes the page scroll sideways', async () => {
    const measured = await measure(width, (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), tablesTab)
    expect(measured).toEqual(nothing(measured, 0))
  }, 90_000)
})

// The Bord tab (B5, K2, #127): the zone list on the left, the felt beside it, and above the felt
// the row that says what the surface just did and how to work it. `surfaces` reaches it too, and
// it is built on its own here all the same: what is asked of it below can only be asked of a tab
// that has a felt on it, and asking it of the other five would open a browser to say nothing.
async function bord(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
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
            zones: setup.querySelectorAll('[data-zone-row], [data-zone-family]').length,
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
    expect(measured).toEqual({ Bord: { zones: 4, past: [], sideways: [0, 0] } })
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
