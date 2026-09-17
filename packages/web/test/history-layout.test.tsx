// @vitest-environment jsdom
// The history's rows, measured in a real engine (#177).
//
// What a row says is `history-rows.test.ts`'s; this file is about what the row does with it once
// there is more of it than there used to be. A row now carries a clock, a heading, a summary and
// up to three chips where it used to carry a number and one word, and the panel it does that in is
// a fixed column beside the work. Every reading here is a relationship — this is inside that, this
// does not reach into that, this is at least as tall as the token says — and never a width in
// pixels: the runner is Linux with other faces than a Mac's, and a number measured here would say
// more about the machine than about the panel.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import type { ProjectDoc } from '@byd/server'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { atWidth } from './viewport.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = ['src/editor/editor.css', 'src/buttons.css', 'src/a11y.css', 'src/rules/rules.css'].map(read).join('\n')
const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The desk the granskning measured the editor at.
const WIDTH = 1440

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

// A history with every kind of row in it, because every kind is a different shape: a save that
// only touched cards, one that moved a part of the game, one that moved all four of them, one
// somebody named — and the version the editor is standing on, which carries a marker besides.
async function aHistoryOfEveryShape(): Promise<void> {
  const doc = projectDoc()
  await run.projects.create(run.projectId, doc)
  let rev = 1
  const save = async (change: (d: typeof doc) => void) => {
    const next = structuredClone((await run.projects.at(run.projectId, rev))!)
    change(next)
    const saved = await run.projects.replace(run.projectId, rev, next)
    if (typeof saved !== 'string') rev = saved.rev
  }
  await save((d) => d.rows.push({ id: 'troll', fields: { title: 'Troll', antal: 1 } }))
  await save((d) => (d.rules = { title: 'Så spelas det', blocks: [{ kind: 'text', id: 'a', text: 'Dra ett kort.' }] }))
  // Every part of the game at once, which is the row that says how many instead of showing chips.
  await save((d) => {
    d.template = { faces: { ...d.template.faces, back: { base: [], variants: {} } } }
    d.setup = { ...d.setup, seats: ['A', 'B', 'C'] }
    d.icons = { skold: 'asset:abc' }
    d.rules = { title: 'Så spelas det', blocks: [{ kind: 'text', id: 'a', text: 'Dra två kort.' }] }
    d.rows.push({ id: 'alv', fields: { title: 'Alv', antal: 3 } })
    d.rows.splice(1, 1)
  })
  await save((d) => (d.rows[0]!.fields['antal'] = 4))
  // A name long enough to want more room than the row has, which is the case the row has to
  // survive rather than the case it is designed for.
  await run.projects.label(run.projectId, 4, 'Balansering före det andra blindtestet med nya folket')
}

// The panel's markup as the editor builds it. `filled` waits for the summaries to be in the rows;
// without it the markup is the panel the moment it opens, which is the other half of #177's last
// acceptance criterion and a shape of its own to measure.
async function markupOfPanel(filled: boolean): Promise<string> {
  atWidth(WIDTH)
  await run.answering()
  // Against a fixture on this machine the summaries come back before anybody could see the panel
  // without them, so the state is held open rather than waited for. It is a real state — over a
  // home connection, on a history of a year, it is the state the panel opens in every time.
  const held = filled ? null : vi.spyOn(ProjectClient.prototype, 'changes').mockReturnValue(new Promise(() => undefined))
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByRole('button', { name: /rev \d/ })
    fireEvent.click(screen.getByRole('button', { name: /rev \d/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })
    await waitFor(() => expect(panel.querySelector(filled ? '.byd-history-parts i' : 'li[data-waiting]')).not.toBeNull())
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
    held?.mockRestore()
  }
}

// The panel measured where a browser can lay it out.
async function measure<T>(read_: (page: Page) => Promise<T>, filled = true): Promise<T> {
  const markup = await markupOfPanel(filled)
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } })
  try {
    await page.setContent(document_(markup), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

describe(`a row in the history, laid out at ${WIDTH}px`, () => {
  it('keeps every part of a row inside its own column, whatever length the words are', async () => {
    await aHistoryOfEveryShape()
    const measured = await measure((page) =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('.byd-history li > button')]
        const of = (row: HTMLElement, sel: string) => row.querySelector<HTMLElement>(sel)
        return {
          // Not vacuous: there are rows, and some of them do carry chips.
          rows: rows.length,
          chips: document.querySelectorAll('.byd-history-parts i').length,
          // What the save changed and which parts it touched share one line, and they never lie
          // over each other on it: the words give way, the chips do not.
          overlapping: rows
            .filter((row) => {
              const words = of(row, '.byd-history-line > [data-said]')!.getBoundingClientRect()
              const parts = of(row, '.byd-history-parts')!.getBoundingClientRect()
              return parts.width > 0 && words.right > parts.left + 0.5
            })
            .map((row) => row.textContent?.trim().slice(0, 40) ?? ''),
          // And the whole line stays inside the row: a chip pushed past the right edge is a chip
          // the panel has to be scrolled sideways to read, which is no chip at all.
          outside: rows
            .filter((row) => {
              const line = of(row, '.byd-history-line')!.getBoundingClientRect()
              const parts = of(row, '.byd-history-parts')!.getBoundingClientRect()
              return parts.width > 0 && parts.right > line.right + 0.5
            })
            .map((row) => row.textContent?.trim().slice(0, 40) ?? ''),
          // A word too long for its column is cut off there rather than painted over its
          // neighbour. The box always fits — it is the text inside it that used to spill — so
          // what is asked is whether anything that does not fit is clipped at all.
          spilling: rows
            .flatMap((row) => [of(row, '.byd-history-what b')!, of(row, '.byd-history-what [data-said]')!])
            .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
            .map((el) => el.textContent?.trim().slice(0, 40) ?? ''),
          // And a chip is never cut off and never laid over the words: it is the thing the eye is
          // scanning for. A row of chips packed to the right spills to the LEFT when there is not
          // room for it, straight over what the row says, which is how this was found.
          crowded: [...document.querySelectorAll<HTMLElement>('.byd-history-parts i')]
            .filter((chip) => {
              const box = chip.getBoundingClientRect()
              const room = chip.parentElement!.getBoundingClientRect()
              return box.left < room.left - 0.5 || box.right > room.right + 0.5 || chip.scrollWidth > chip.clientWidth + 1
            })
            .map((chip) => chip.textContent?.trim() ?? ''),
        }
      }),
    )
    expect(measured).toEqual({ rows: measured.rows, chips: measured.chips, overlapping: [], outside: [], spilling: [], crowded: [] })
    expect(measured.rows).toBeGreaterThan(4)
    expect(measured.chips).toBeGreaterThan(0)
  }, 60_000)

  it('gives every row a target a thumb could hit, and keeps the marker on the line it belongs to', async () => {
    await aHistoryOfEveryShape()
    const measured = await measure((page) =>
      page.evaluate(() => {
        // The size is read back out of the stylesheet rather than written down here.
        const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
        probe.style.cssText = 'position: absolute; top: 0; left: 0; display: block; height: var(--byd-tap)'
        const tap = probe.offsetHeight
        probe.remove()
        const rows = [...document.querySelectorAll<HTMLElement>('.byd-history li > button')]
        const marker = document.querySelector<HTMLElement>('.byd-history li[data-current] small')!
        const markerRow = marker.closest('button')!
        return {
          tap,
          short: rows.filter((row) => row.getBoundingClientRect().height < tap).map((row) => `${row.textContent?.trim().slice(0, 30)}: ${Math.round(row.getBoundingClientRect().height)}`),
          // "öppen nu" belongs beside what the row says, not on a line of its own under it.
          markerOnItsOwnLine: marker.getBoundingClientRect().top >= markerRow.querySelector('.byd-history-what')!.getBoundingClientRect().bottom,
        }
      }),
    )
    expect(measured.tap).toBeGreaterThanOrEqual(44)
    expect({ short: measured.short, markerOnItsOwnLine: measured.markerOnItsOwnLine }).toEqual({ short: [], markerOnItsOwnLine: false })
  }, 60_000)

  it('paints every chip without waiting for a pointer, and never makes the panel scroll sideways', async () => {
    await aHistoryOfEveryShape()
    const measured = await measure((page) =>
      page.evaluate(() => ({
        // A chip drawn only while a pointer rests over it is not there for a thumb and not there
        // for a keyboard either (#184, #140).
        unpainted: [...document.querySelectorAll<HTMLElement>('.byd-history-parts i, .byd-history-daymark h3, .byd-history time')]
          .filter((el) => el.checkVisibility() && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
          .map((el) => `${el.textContent?.trim()}: ${getComputedStyle(el).opacity}`),
        sideways: (() => {
          const scroller = document.querySelector<HTMLElement>('.byd-history-scroll')!
          return scroller.scrollWidth - scroller.clientWidth
        })(),
      })),
    )
    expect(measured).toEqual({ unpainted: [], sideways: 0 })
  }, 60_000)
})

// #177's last acceptance criterion, measured rather than argued: the rows get their text when the
// answer comes and the list does not stand waiting for it — and, the half that is easy to lose,
// the list does not move when it lands. A row that grows by a line the moment its summary arrives
// pushes everything under it down, and the version somebody was about to click is no longer where
// she was about to click it.
describe('the list does not move when the summaries land', () => {
  const heights = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.byd-history li')].map((li) => `${li.getAttribute('data-rev')}: ${Math.round(li.getBoundingClientRect().height)}`),
    )

  it('gives a row the same height before its summary comes back as after', async () => {
    await aHistoryOfEveryShape()
    const waiting = await measure(heights, false)
    const landed = await measure(heights, true)
    // Not vacuous: the two really are the panel in its two states, and the later one says things
    // the earlier one does not.
    expect(waiting.length).toBeGreaterThan(4)
    const said = await measure((page) => page.evaluate(() => document.querySelector('.byd-history')!.textContent ?? ''), true)
    expect(said).toMatch(/mallen|reglerna|bordet|symbolerna|delar ändrade/)
    expect(waiting).toEqual(landed)
  }, 60_000)
})

// ── The same panel at the depth a project that has been worked on actually has ──────────────
//
// Everything above is measured against five saves made in one minute, and five saves made in one
// minute is a history where every surface looks fine (#175–#179). A project somebody has worked
// in is the other thing: twenty-odd versions over several calendar days, a deck of three hundred
// cards rather than three, and rows of wildly unequal length — a bulk import beside a single word
// rewritten — in a fixed 372 px column that has to hold all of it and be scrolled to be read.
const CARDS = 308

const deck = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => ({ id: `kort-${from + i}`, fields: { title: `Kort ${from + i}`, body: 'Ett kort med en rad text på sig.', antal: (i % 3) + 1 } }))

// Five calendar days, every one of them in the past, whatever o'clock the suite happens to run
// at. They are laid out from this morning's midnight backwards and never from `now` minus a span
// of hours, because a day is a day on the reader's calendar: at ten past midnight, "two hours
// ago" is yesterday, and a fixture that drifts into another day by the hour it ran is a fixture
// that fails once a night.
function workingDays(): number[][] {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const start = midnight.getTime()
  const onDay = (back: number, hours: number[]) => hours.map((h) => start - back * 86_400_000 + h * 3_600_000)
  // Today is however much of today there has been so far, shared out: the newest save is a moment
  // ago and the oldest is just after midnight, at three in the afternoon as at three in the night.
  const sinceMidnight = Date.now() - start
  const today = [1, 2, 3, 4].map((i) => start + Math.floor((sinceMidnight * i) / 5))
  return [onDay(7, [9, 11, 14, 17]), onDay(4, [8, 10, 13, 16, 20]), onDay(2, [9, 12, 18]), onDay(1, [10, 13, 16, 19, 21]), today]
}

// Twenty-one saves that are twenty-one different kinds of afternoon: cards written one at a time
// and three hundred imported at once, a part of the game moved on its own, two moved together,
// all four moved in one save, a save that touched nothing the history can name, and four versions
// somebody thought worth a name — one of them a name longer than the row it has to fit in.
const SAVES: { label?: string; change?: (d: ProjectDoc) => void }[] = [
  {},
  { change: (d) => d.rows.push(...deck(1, 9)) },
  { change: (d) => [0, 3].forEach((i) => (d.rows[i]!.fields['title'] = `${d.rows[i]!.fields['title']} den store`)) },
  { change: (d) => (d.rules = { title: 'Så spelas det', blocks: [{ kind: 'text', id: 'a', text: 'Dra ett kort.' }] }) },
  { label: 'Alla korten importerade', change: (d) => d.rows.push(...deck(CARDS - d.rows.length, d.rows.length + 1)) },
  { change: (d) => d.rows.slice(20, 32).forEach((r) => (r.fields['antal'] = 4)) },
  {
    change: (d) => {
      d.template = { faces: { ...d.template.faces, back: { base: [], variants: {} } } }
      d.setup = { ...d.setup, seats: ['A', 'B', 'C', 'D'] }
    },
  },
  { change: (d) => (d.rows = [d.rows[4]!, ...d.rows.slice(0, 4), ...d.rows.slice(8)]) },
  // Nothing the history knows how to name: the deck's palette, and nothing else.
  { change: (d) => (d.palette = { anfall: '#c0392b', försvar: '#2c7fb8' }) },
  {
    label: 'Balansering före det andra blindtestet med nya folket',
    change: (d) => {
      d.template = { faces: { ...d.template.faces, back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' }], variants: {} } } }
      d.setup = { ...d.setup, seats: ['A', 'B', 'C'] }
      d.rules = { title: 'Så spelas det', blocks: [{ kind: 'text', id: 'a', text: 'Dra två kort.' }] }
      d.icons = { sköld: 'asset:abc' }
      d.rows.slice(0, 2).forEach((r) => (r.fields['antal'] = 2))
    },
  },
  { change: (d) => (d.rows[7]!.fields['body'] = 'Ett kort med en annan rad text på sig.') },
  { change: (d) => (d.icons = { sköld: 'asset:abc', svärd: 'asset:def' }) },
  {
    change: (d) => {
      d.template = { faces: { ...d.template.faces, back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#123456' }], variants: {} } } }
      d.rules = { title: 'Så spelas det', blocks: [{ kind: 'text', id: 'a', text: 'Dra tre kort.' }] }
      d.icons = { sköld: 'asset:abc', svärd: 'asset:def', hjärta: 'asset:ghi' }
    },
  },
  { label: 'Nytt namn inför mässan', change: (d) => (d.name = 'Skogens andar') },
  { change: (d) => (d.columns = ['antal', 'title', 'body']) },
  { change: (d) => d.rows.slice(40, 80).forEach((r) => (r.fields['body'] = 'Omskriven text.')) },
  { change: (d) => (d.rows = [...d.rows.slice(2), ...deck(8, 900)]) },
  { change: (d) => (d.setup = { ...d.setup, seats: ['A', 'B', 'C', 'D', 'E', 'F'] }) },
  { change: (d) => (d.rules = { title: 'Så spelas det', blocks: [{ kind: 'text', id: 'a', text: 'Dra tre kort och lägg ett.' }] }) },
  { label: 'Inför tryck', change: (d) => d.rows.slice(100, 196).forEach((r) => (r.fields['antal'] = 1)) },
  { change: (d) => (d.template = { faces: { ...d.template.faces, back: { base: [], variants: {} } } }) },
]

// The history built at those instants. The store stamps a version with the clock, so the clock is
// what is moved — `Date` alone, so that nothing waiting on a timer anywhere in this process is
// frozen along with it — and it is put back before anything is rendered against it.
async function aWorkedHistory(): Promise<{ versions: number; days: number }> {
  const when = workingDays().flat()
  if (when.length !== SAVES.length) throw new Error(`${SAVES.length} saves laid out over ${when.length} instants`)
  const doc = projectDoc()
  doc.rows = deck(8)
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    for (const [i, save] of SAVES.entries()) {
      vi.setSystemTime(when[i]!)
      if (i === 0) await run.projects.create(run.projectId, doc)
      else {
        const next = structuredClone((await run.projects.at(run.projectId, i))!)
        save.change!(next)
        const saved = await run.projects.replace(run.projectId, i, next)
        if (typeof saved === 'string') throw new Error(`save ${i + 1} came back as ${saved}`)
        if (saved.rev !== i + 1) throw new Error(`save ${i + 1} changed nothing and made no version`)
      }
      if (save.label) await run.projects.label(run.projectId, i + 1, save.label)
    }
  } finally {
    vi.useRealTimers()
  }
  return { versions: SAVES.length, days: workingDays().length }
}

describe(`the history at the depth of a worked project, laid out at ${WIDTH}px`, () => {
  // Not a claim about this fixture but about the class it stands for: a history of this depth is
  // taller than the panel and has to be scrolled, which is the whole of why the readings below
  // are different questions from the ones above.
  it('is more than twice the panel it has to be read in', async () => {
    const built = await aWorkedHistory()
    expect(built.versions).toBeGreaterThanOrEqual(15)
    expect(built.versions).toBeLessThanOrEqual(30)
    const seen = await measure((page) =>
      page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.byd-history-scroll')!
        return {
          rows: document.querySelectorAll('.byd-history li').length,
          days: [...document.querySelectorAll('.byd-history-daymark h3')].map((h) => h.textContent ?? ''),
          counts: [...document.querySelectorAll('.byd-history-daymark span')].map((h) => h.textContent ?? ''),
          taller: panel.scrollHeight / panel.clientHeight,
          sideways: panel.scrollWidth - panel.clientWidth,
        }
      }),
    )
    expect(seen.rows).toBe(built.versions)
    // Several different calendar days, the two nearest of them named rather than dated.
    expect(seen.days.length).toBe(built.days)
    expect(seen.days.slice(0, 2)).toEqual(['I dag', 'I går'])
    expect(seen.days.slice(2).every((d) => /\d/.test(d))).toBe(true)
    expect(seen.counts.every((c) => /\d+ versione?r/.test(c))).toBe(true)
    expect(seen.taller).toBeGreaterThan(2)
    // However long the history, it is read by scrolling one way only.
    expect(seen.sideways).toBe(0)
  }, 60_000)

  // The reading this depth exists to take. A history of five saves does not scroll at all, so the
  // day headings were never asked to survive being scrolled past — and a stack of rows with the
  // day gone off the top is a list of clocks that repeat every twenty-four hours: 09:00 four
  // times over, and no way to tell which 09:00 is which.
  it('keeps the day over the rows it belongs to, however far down the history is scrolled', async () => {
    await aWorkedHistory()
    const orphaned = await measure((page) =>
      page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.byd-history-scroll')!
        const room = () => panel.getBoundingClientRect()
        const inView = (el: Element, box: DOMRect) => {
          const r = el.getBoundingClientRect()
          return r.bottom > box.top + 0.5 && r.top < box.bottom - 0.5
        }
        const lost: string[] = []
        const far = panel.scrollHeight - panel.clientHeight
        for (const at of [0, far * 0.25, far * 0.5, far * 0.75, far]) {
          panel.scrollTop = Math.round(at)
          const box = room()
          // The first row a reader's eye lands on at this scroll position, and the day it is under.
          const row = [...panel.querySelectorAll<HTMLElement>('li')].find((li) => inView(li, box))
          if (!row) continue
          const mark = row.closest('section')!.querySelector('.byd-history-daymark')!
          if (!inView(mark, box)) lost.push(`${Math.round(at)}: ${row.textContent?.replace(/\s+/g, ' ').trim().slice(0, 34)}`)
        }
        panel.scrollTop = 0
        return lost
      }),
    )
    expect(orphaned).toEqual([])
  }, 60_000)

  // And the way out of the panel, for the same reason: at this depth the × is a screenful and a
  // half above whatever a reader is looking at, and nothing else closes the history.
  it('keeps the way out of the history in reach from the bottom of it', async () => {
    await aWorkedHistory()
    const seen = await measure((page) =>
      page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('.byd-history-scroll')!
        scroller.scrollTop = scroller.scrollHeight
        const panel = document.querySelector<HTMLElement>('.byd-history')!
        const box = panel.getBoundingClientRect()
        const close = panel.querySelector<HTMLElement>('header button')!.getBoundingClientRect()
        const within = close.bottom > box.top + 0.5 && close.top < box.bottom - 0.5
        const tall = scroller.scrollHeight > scroller.clientHeight
        scroller.scrollTop = 0
        return { within, tall }
      }),
    )
    expect(seen).toEqual({ within: true, tall: true })
  }, 60_000)

  // The same readings the shallow fixture takes, against rows of wildly unequal length: three
  // hundred cards imported in one save beside a single word rewritten, a name longer than the row
  // it sits in, and a save that moved all four parts of the game.
  it('holds rows of every length without one of them spilling into another', async () => {
    await aWorkedHistory()
    const measured = await measure((page) =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('.byd-history li > button')]
        const of = (row: HTMLElement, sel: string) => row.querySelector<HTMLElement>(sel)
        const name = (el: Element) => el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) ?? ''
        return {
          // Not vacuous: the fixture's whole point is that these rows are not alike.
          chips: document.querySelectorAll('.byd-history-parts i').length,
          // A heading that really is longer than the room it has, so the ellipsis above is not a
          // reading about nothing.
          clipped: rows.filter((row) => { const b = of(row, '.byd-history-what b')!; return b.scrollWidth > b.clientWidth + 1 }).length,
          overlapping: rows
            .filter((row) => {
              const words = of(row, '.byd-history-line > [data-said]')!.getBoundingClientRect()
              const parts = of(row, '.byd-history-parts')!.getBoundingClientRect()
              return parts.width > 0 && words.right > parts.left + 0.5
            })
            .map(name),
          outside: rows
            .filter((row) => {
              const line = of(row, '.byd-history-line')!.getBoundingClientRect()
              const parts = of(row, '.byd-history-parts')!.getBoundingClientRect()
              return parts.width > 0 && parts.right > line.right + 0.5
            })
            .map(name),
          spilling: rows
            .flatMap((row) => [of(row, '.byd-history-what b')!, of(row, '.byd-history-what [data-said]')!])
            .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
            .map(name),
          crowded: [...document.querySelectorAll<HTMLElement>('.byd-history-parts i')]
            .filter((chip) => {
              const box = chip.getBoundingClientRect()
              const room = chip.parentElement!.getBoundingClientRect()
              return box.left < room.left - 0.5 || box.right > room.right + 0.5 || chip.scrollWidth > chip.clientWidth + 1
            })
            .map(name),
          // No row overlaps the one under it, which is what unequal heights are able to do.
          stacked: rows
            .slice(1)
            .filter((row, i) => row.getBoundingClientRect().top < rows[i]!.getBoundingClientRect().bottom - 0.5)
            .map(name),
        }
      }),
    )
    expect(measured).toEqual({ ...measured, overlapping: [], outside: [], spilling: [], crowded: [], stacked: [] })
    expect(measured.chips).toBeGreaterThan(4)
    expect(measured.clipped).toBeGreaterThan(0)
  }, 60_000)

  // The version the editor is standing on is the newest, so it is the first row of the first day:
  // a reader opening the history sees where she is without scrolling for it, at any depth.
  it('puts the version the editor stands on at the top, said in a word and not by its edge alone', async () => {
    await aWorkedHistory()
    const seen = await measure((page) =>
      page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.byd-history-scroll')!
        const all = [...panel.querySelectorAll<HTMLElement>('li')]
        const current = panel.querySelector<HTMLElement>('li[data-current]')!
        const box = panel.getBoundingClientRect()
        const mark = current.getBoundingClientRect()
        return {
          nth: all.indexOf(current),
          said: current.querySelector('small')?.textContent ?? '',
          visible: mark.top >= box.top - 0.5 && mark.bottom <= box.bottom + 0.5,
        }
      }),
    )
    expect(seen).toEqual({ nth: 0, said: 'öppen nu', visible: true })
  }, 60_000)
})
