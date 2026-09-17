// @vitest-environment jsdom
// The contents column beside the rulebook, measured on a book of the length a real one has (#210).
//
// `rules-layout` asks what the tab does with the width it has, on the little book the fixture
// writes. This file asks what it does with the *height*, and it has to build its own book to ask:
// five sections fit anywhere, and that is exactly why the fault shipped. The column was
// `position: sticky; top: 0` inside the tab's single scrolling area, so it hung with the book —
// and the rows past the fold could be read only once the book had been scrolled all the way down.
// A map whose last rows need the territory read first is not a map (#207, where this was measured).
//
// Every reading here is a relationship or a count: how many rows cannot be reached, how many
// scrolling areas there are and whether one sits inside the other, and whether the book's measure
// is still the width of 68 characters of the book's own face read off a probe in that same face.
// The runner is Linux and draws another face than a Mac, so a pixel written down here would be a
// fact about the machine and not about the tab.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import type { RuleBlock, RuleDoc } from '@byd/template'
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

// The four screens the column was measured at (#210, #207). 1920 is in the list because it is the
// one where the fault is nearly invisible — two rows out of reach rather than nine — and a fix
// that only helped the small screens would pass a test that stopped at 1440.
const SCREENS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const

// A rulebook of the shape a real one has: 22 sections and 32 subheadings, eight sections with no
// subheading at all and one with four, and Swedish headings long enough that some of them have to
// be broken in a column 200 px wide. It is the book prototype 6 took its measurements on (#207);
// the numbers in #210 belong to this book and to no other.
const SECTIONS: readonly (readonly [string, readonly string[]])[] = [
  ['Översikt', []],
  ['Uppställning', ['Bordets zoner', 'Vad varje spelare får i början', 'Leken blandas och delas']],
  ['En tur', ['Turordningen vid bordet', 'Att dra ett kort']],
  ['Handlingar', ['Spela ett kort publikt', 'Spela ett kort dolt framför dig', 'Byta kort med grannen', 'Att passa']],
  ['Spelet tar slut', ['Att räkna guldet', 'Oavgjort']],
  ['Korttyperna', ['Karaktärer', 'Föremål', 'Händelser']],
  ['Dueller', ['Att utmana någon', 'Att svara på en utmaning']],
  ['Guld och skulder', ['Att betala', 'Att låna av banken']],
  ['Zonerna i detalj', []],
  ['Sheriffen och hans stjärna', ['Vem bär stjärnan', 'Att avsätta sheriffen']],
  ['Saloongen', []],
  ['Vad som händer när leken tar slut', []],
  ['Hemliga uppdrag', ['Att avslöja sitt uppdrag']],
  ['Spela med två spelare', []],
  ['Spela med sex eller fler spelare', ['Två lag mot varandra']],
  ['Varianten Nattens tåg', ['Tågets zoner', 'Rånet']],
  ['Tidsgränser', []],
  ['Vanliga frågor', ['Kan jag spela två kort på samma tur?', 'Vad händer om leken tar slut mitt i en duell?', 'Får jag visa mina kort för någon annan?']],
  ['Ordlista', []],
  ['Symbolerna på korten', ['Stjärnan', 'Hästskon', 'Kulan']],
  ['För den som lär ut spelet', ['Den första omgången', 'Vanliga missförstånd']],
  ['Tack och rättigheter', []],
]

// Paragraphs of the length a rule paragraph has, so the book is as tall as its column is long.
const PARAGRAPHS: readonly string[] = [
  'Sal’s Saloon spelas runt en skärm. Varje spelare har en hand i telefonen och en egen yta framför sig på bordet, och det som spelas publikt vänds först när det når bordet.',
  'Leken ligger i Kortlek och det som spelats hamnar i Kasthög. När Kortlek är tom blandas Kasthög och blir den nya leken, utan att någon tur avbryts.',
  'Räknaren Guld står framför varje spelare och är alltid öppen. Ingen behöver komma ihåg vad någon annan har; det står på bordet hela tiden.',
  'Den som är osäker frågar den som lärde ut spelet. Står svaret inte i det här avsnittet står det i Vanliga frågor, och det som inte står någonstans avgörs av bordet tillsammans.',
  'Ett kort som ligger dolt framför dig räknas som ditt, men ingen annan vet vilket det är förrän du vänder det. Du får vända det när som helst på din egen tur.',
  'Reglerna versioneras med korten. Den som öppnar en äldre version av spelet läser de regler som gällde då, och inte de som gäller nu.',
]

/** The book above as a document, with what it is made of counted out for the readings to lean on. */
function aLongRulebook(): { rules: RuleDoc; sections: number; subheadings: number } {
  const blocks: RuleBlock[] = []
  let nth = 0
  const paragraph = (id: string) => blocks.push({ kind: 'text', id, text: PARAGRAPHS[nth++ % PARAGRAPHS.length]! })
  for (const [i, [section, under]] of SECTIONS.entries()) {
    blocks.push({ kind: 'heading', id: `s${i}`, level: 1, text: section })
    paragraph(`s${i}-p`)
    for (const [j, sub] of under.entries()) {
      blocks.push({ kind: 'heading', id: `s${i}-h${j}`, level: 2, text: sub })
      paragraph(`s${i}-h${j}-p`)
    }
  }
  return {
    rules: { title: 'Sal’s Saloon', blocks },
    sections: SECTIONS.length,
    subheadings: SECTIONS.reduce((n, [, under]) => n + under.length, 0),
  }
}

// A project of its own per reading, for the reason `rules-layout` gives: a reading that wrote a
// book to the server would leave the next one opening on somebody else's iteration.
let nth = 0

/** The rules tab, opened on the long book, as the markup the editor builds for it. */
async function theLongBook(width: number): Promise<string> {
  atWidth(width)
  const project = `${run.projectId}-${++nth}`
  const doc = projectDoc()
  doc.rules = aLongRulebook().rules
  await run.projects.create(project, doc)
  history.replaceState(null, '', `/editor?project=${project}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    fireEvent.click(document.getElementById(tabId('rules'))!)
    await waitFor(() => expect(document.querySelector('[data-rulebook]')).not.toBeNull())
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
  }
}

async function measure<T>(screen_: (typeof SCREENS)[number], read_: (page: Page) => Promise<T>): Promise<T> {
  const html = await theLongBook(screen_.width)
  const page = await browser.newPage({ viewport: { width: screen_.width, height: screen_.height } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

// What the page has to know about itself before it can answer any of the questions below: which
// boxes on the rules tab really scroll, which of them carries the book, and which carries the
// column. It is read off the computed style and the sizes rather than off a class name, so the
// readings say what a reader meets and not what the stylesheet meant to say. It is a source
// fragment because four readings need the same preamble and a scroll container is an object in the
// page that no argument can be handed across.
const SURFACE = `
  const panel = document.querySelector('.byd-rules')
  const spread = document.querySelector('.byd-rules-spread')
  const toc = document.querySelector('.byd-rules-toc')
  const book = document.querySelector('.byd-rulebook')
  const rows = [...toc.querySelectorAll('a[href]')]
  const scrolls = (el) => {
    const s = getComputedStyle(el)
    return /auto|scroll/.test(s.overflow + ' ' + s.overflowY) && el.scrollHeight - el.clientHeight > 1
  }
  const areas = [panel, ...panel.querySelectorAll('*')].filter(scrolls)
  const bookArea = areas.find((el) => el.contains(book)) ?? null
  const columnArea = areas.find((el) => el !== bookArea && (el === toc || el.contains(toc))) ?? null
  const rest = () => areas.forEach((el) => { el.scrollTop = 0 })
`

// The count the whole issue is about: rows of the contents a reader cannot bring into view without
// first scrolling the book. A row is in reach when asking the browser to show it leaves the book
// where it stood and puts the row inside the area the tab is read in — which is what the sticky
// column could not do, because scrolling towards its last row scrolled the book instead.
const outOfReach = (page: Page) =>
  page.evaluate<{ rows: number; out: string[]; tallerThanTheArea: boolean }>(`(() => {
    ${SURFACE}
    const area = spread.getBoundingClientRect()
    const tall = toc.getBoundingClientRect().height > area.height + 0.5 || (columnArea !== null && columnArea.scrollHeight - columnArea.clientHeight > 1)
    const out = []
    for (const row of rows) {
      rest()
      row.scrollIntoView({ block: 'nearest' })
      const moved = bookArea !== null && bookArea.scrollTop > 0.5
      const at = row.getBoundingClientRect()
      const seen = at.top >= area.top - 0.5 && at.bottom <= area.bottom + 0.5
      if (moved || !seen) out.push(row.textContent.replace(/\\s+/g, ' ').trim())
    }
    rest()
    return { rows: rows.length, out, tallerThanTheArea: tall }
  })()`)

// Two areas side by side and never one inside the other, which is the shape #210 asks for and the
// shape prototype 8 already paid for once: a scroller inside a scroller puts the thing that has to
// be read carefully below a fold inside a fold.
const areasOnTheSurface = (page: Page) =>
  page.evaluate<{ count: number; nested: string[]; book: string; column: string }>(`(() => {
    ${SURFACE}
    return {
      count: areas.length,
      nested: areas.filter((el) => areas.some((other) => other !== el && other.contains(el))).map((el) => el.className),
      book: bookArea === null ? 'nothing scrolls the book' : bookArea.className,
      column: columnArea === null ? 'nothing scrolls the column' : columnArea.className,
    }
  })()`)

// The book's own reading, taken on the long book at every width: it still scrolls, it never scrolls
// sideways, and its measure is still 68 characters of the face it happens to be set in.
const theBooksOwnReading = (page: Page) =>
  page.evaluate<{ measure: number; sixtyEight: number; scrolls: boolean; sideways: number; sections: number; subheadings: number }>(`(() => {
    ${SURFACE}
    const probe = book.appendChild(document.createElement('span'))
    probe.style.cssText = 'position: absolute; visibility: hidden; white-space: pre'
    probe.textContent = '0'.repeat(68)
    const sixtyEight = probe.getBoundingClientRect().width
    probe.remove()
    const paragraph = book.querySelector('p')
    const pad = getComputedStyle(paragraph)
    return {
      measure: Math.round(paragraph.getBoundingClientRect().width - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight)),
      sixtyEight: Math.round(sixtyEight),
      scrolls: bookArea !== null,
      sideways: bookArea === null ? 0 : bookArea.scrollWidth - bookArea.clientWidth,
      sections: book.querySelectorAll('h2').length,
      subheadings: book.querySelectorAll('h3').length,
    }
  })()`)

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

describe('the book this is measured on', () => {
  it('is the length a rulebook is, and not the fixture’s five sections', () => {
    const built = aLongRulebook()
    expect(built.sections).toBe(22)
    expect(built.subheadings).toBe(32)
    // Eight sections with nothing under them and one with four: a column of one shape would not be
    // the thing the reading is about.
    expect(SECTIONS.filter(([, under]) => under.length === 0).length).toBe(8)
    expect(Math.max(...SECTIONS.map(([, under]) => under.length))).toBe(4)
  }, 60_000)
})

describe.each(SCREENS)('the contents column at $width × $height', (screen_) => {
  it('has every one of its rows in reach without the book being scrolled first', async () => {
    const seen = await measure(screen_, outOfReach)
    // Not vacuous twice over: the column has a row per section of the long book, and it is longer
    // than the box it is read in — which is the premise the whole issue rests on.
    expect(seen.rows).toBe(22)
    expect(seen.tallerThanTheArea, 'the column fits the area, so this reading is about nothing').toBe(true)
    expect(seen.out, `${seen.out.length} of ${seen.rows} rows out of reach at ${screen_.width}`).toEqual([])
  }, 90_000)

  it('is a scrolling area of its own, beside the book’s and not inside it', async () => {
    const seen = await measure(screen_, areasOnTheSurface)
    expect(seen.nested, JSON.stringify(seen)).toEqual([])
    expect(seen.count, JSON.stringify(seen)).toBe(2)
    expect(seen.book, JSON.stringify(seen)).toContain('byd-rules')
    expect(seen.column, JSON.stringify(seen)).toContain('byd-rules-toc')
  }, 90_000)

  it('leaves the book scrolling as it did, at a measure of 68 characters of its own face', async () => {
    const seen = await measure(screen_, theBooksOwnReading)
    expect(seen.scrolls, JSON.stringify(seen)).toBe(true)
    expect(seen.sideways, JSON.stringify(seen)).toBe(0)
    // All 22 sections and all 32 subheadings are in the book, wherever the column stops: what
    // scrolls is not what is listed, and this issue does not touch what the column lists (#207 is
    // still open on that question).
    expect({ sections: seen.sections, subheadings: seen.subheadings }).toEqual({ sections: 22, subheadings: 32 })
    expect(Math.abs(seen.measure - seen.sixtyEight), `measured ${seen.measure}px against 68 characters at ${seen.sixtyEight}px`).toBeLessThanOrEqual(2)
  }, 90_000)
})

// What the column's new scrolling area would otherwise cost it: its own heading. `Innehåll` used to
// stand above rows that could not move, and a label that scrolls away is a column that stops saying
// what it is at exactly the moment somebody is looking through it for something. The wall's bands
// and the layer column keep theirs the same way (#179), and it is a heading over a list rather than
// a control, so nothing here waits for a pointer (#184).
describe('the column’s own heading', () => {
  it('stays over its rows however far the column is scrolled', async () => {
    const seen = await measure(SCREENS[2], (page) =>
      page.evaluate<{ within: number[]; opaque: boolean; scrolled: number }>(`(() => {
        ${SURFACE}
        const label = toc.querySelector('b')
        const at = []
        const far = columnArea === null ? 0 : columnArea.scrollHeight - columnArea.clientHeight
        for (const to of [0, far * 0.5, far]) {
          if (columnArea !== null) columnArea.scrollTop = Math.round(to)
          const box = toc.getBoundingClientRect()
          const mark = label.getBoundingClientRect()
          at.push(mark.top >= box.top - 0.5 && mark.bottom <= box.bottom + 0.5 ? 1 : 0)
        }
        const paint = getComputedStyle(label).backgroundColor
        rest()
        return { within: at, opaque: paint !== 'transparent' && !/, *0\\)$/.test(paint), scrolled: Math.round(far) }
      })()`),
    )
    // Not vacuous: there really is something to scroll past at this width.
    expect(seen.scrolled).toBeGreaterThan(0)
    expect(seen.within, 'the heading left the column while it was scrolled').toEqual([1, 1, 1])
    // And it is read against something, rather than against the rows sliding under it.
    expect(seen.opaque).toBe(true)
  }, 90_000)
})

// The keyboard's half of the same fault. In prototype 6's variant C a tab step in the column moved
// the whole spread — 407, 1 353 and 2 519 px at rows 15, 17 and 19 — and focus was lost in three
// cases out of three, because the scroll recomputed what the column was showing. With a column of
// its own, a tab step moves the column and nothing else.
describe('tabbing through the contents column', () => {
  it('moves the column and never the book, and never loses the row it was on', async () => {
    const seen = await measure(SCREENS[2], async (page) => {
      await page.evaluate(`(() => {
        ${SURFACE}
        window.__bydBook = bookArea
        rest()
        rows[0].focus()
      })()`)
      const steps: { nth: number; tag: string; book: number }[] = []
      for (let i = 0; i < 22; i++) {
        steps.push(
          await page.evaluate<{ nth: number; tag: string; book: number }>(`(() => {
            const rows = [...document.querySelector('.byd-rules-toc').querySelectorAll('a[href]')]
            const at = document.activeElement
            const book = window.__bydBook
            return { nth: rows.indexOf(at), tag: at === null ? 'nothing' : at.tagName.toLowerCase(), book: book === null ? 0 : Math.round(book.scrollTop) }
          })()`),
        )
        await page.keyboard.press('Tab')
      }
      return steps
    })
    // Every one of the 22 rows took the focus, in the book's own order, and the book never moved.
    expect(seen.map((s) => s.nth)).toEqual([...Array(22).keys()])
    expect(
      seen.filter((s) => s.book !== 0),
      'the book moved while the column was tabbed through',
    ).toEqual([])
    expect(
      seen.filter((s) => s.tag !== 'a'),
      'focus left the column',
    ).toEqual([])
  }, 120_000)
})

// The column is a `nav` with a name, and it lists the sections in the order the book has them.
// Giving it a scrolling area is a change to what it does with the height it has and to nothing else
// (L12): the role, the name and the order are what a reader who cannot see it navigates by.
describe('the column keeps what it is', () => {
  it('is still a named nav listing the book’s sections in the book’s order', async () => {
    const seen = await measure(SCREENS[2], (page) =>
      page.evaluate<{ tag: string; named: boolean; rows: string[]; hidden: number }>(`(() => {
        const toc = document.querySelector('.byd-rules-toc')
        const rows = [...toc.querySelectorAll('a[href]')]
        return {
          tag: toc.tagName.toLowerCase(),
          named: (toc.getAttribute('aria-label') ?? '').length > 0,
          rows: rows.map((a) => a.textContent.replace(/\\s+/g, ' ').trim()),
          hidden: rows.filter((a) => a.tabIndex < 0).length,
        }
      })()`),
    )
    expect(seen).toEqual({ tag: 'nav', named: true, rows: SECTIONS.map(([section]) => section), hidden: 0 })
  }, 90_000)
})
