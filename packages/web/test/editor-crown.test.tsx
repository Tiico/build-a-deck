// @vitest-environment jsdom
// The crown a tab panel wears (#128, #130), as the beställare decided it: variant B.
//
// One mechanism on three surfaces — the card wall, the symbol library and the card table — because
// it is one question: what does a panel own at the top, and what scrolls under it. The row is
// exactly one row at every width; what does not fit falls into a named box that opens over the
// work, and the filters keep their place in the row with a side scroll of their own.
//
// Three things are measured here, and each is a sentence from the decision:
//
//   1. The crown is one row, and it costs at most what #130 allows. A crown that wraps was
//      measured at 113 px on the card table at every width — thirteen filter chips do not fit on a
//      line even at 1440 — and #130's own acceptance says at most 80 px. That number is not a
//      target to aim at; it is the number that rules a wrapping crown out.
//   2. The work has exactly one scroll region, and nothing scrolls inside anything else. Two bars
//      for one gesture is what the audit found on Symboler.
//   3. Every box says its state and not only its name. This is the price of B written down: a
//      colour-blindness filter left on without saying so is worse than no filter at all (E5), and
//      a box whose label hides what is chosen inside it is the same fault in miniature. It is
//      asked of the running surface rather than of the text on a button, because a label that
//      happens to contain a colon proves nothing: what has to be true is that changing the setting
//      changes what the closed box says.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { template } from './project-doc.js'
import { recipeSetup, startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// A deck with enough distinct values to make the filter row a real question: eight card types and
// five rarities is thirteen chips, which is the count the decision was measured against.
const TYPES = ['Playcard', 'Location', 'Effect', 'Event', 'Trap+', 'Trap-', 'Shopcard', 'Karaktär'] as const
const RARITIES = ['Diamant', 'Guld', 'Koppar', 'Silver', 'Special'] as const
function deckDoc(): ProjectDoc {
  const { zones, seats, floor } = recipeSetup(4, [{ name: 'Guld', start: 0 }])
  return {
    name: 'Skogens herrar',
    template: template(),
    rows: Array.from({ length: 60 }, (_, i) => ({
      id: `card-${i}`,
      fields: {
        title: `Kort ${i + 1}`,
        body: 'En mening ungefär så lång som en riktig korttext brukar bli när den fått plats.',
        typ: TYPES[i % TYPES.length]!,
        raritet: RARITIES[i % RARITIES.length]!,
        antal: (i % 4) + 1,
      },
    })),
    icons: {},
    fonts: {
      'sans-serif': { stack: 'sans-serif', asset: `asset:${'a'.repeat(64)}` },
      'system-ui': { stack: 'system-ui', asset: `asset:${'b'.repeat(64)}` },
    },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

// The three surfaces the decision names, by the tab that opens them.
const CROWNED = ['Kortvägg', 'Symboler', 'Tabell'] as const

async function surfaces(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    const out: Record<string, string> = {}
    for (const name of CROWNED) {
      fireEvent.click(screen.getByRole('tab', { name }))
      out[name] = document.querySelector('.byd-editor')!.outerHTML
    }
    return out
  } finally {
    unmount()
  }
}

async function measure<T>(width: number, height: number, read_: (page: Page) => Promise<T>): Promise<Record<string, T>> {
  const marked = await surfaces(width)
  const page = await browser.newPage({ viewport: { width, height } })
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
  await run.projects.create(run.projectId, deckDoc())
})
afterEach(async () => {
  await run.stop()
})

const DESKS = [
  [1024, 768],
  [1280, 800],
  [1440, 900],
] as const

describe.each(DESKS)('the crown on a %ix%i desk', (width, height) => {
  it('is one row, and costs no more than the tab asks of it', async () => {
    const measured = await measure(width, height, (page) =>
      page.evaluate(() => {
        const crown = document.querySelector<HTMLElement>('.byd-crown')
        if (!crown) return 'no crown at all'
        // One row: the crown is no taller than one target plus the air it keeps. Read out of the
        // stylesheet rather than written here, so the fact survives the ladder being retuned.
        const probe = document.querySelector('.byd-editor')!.appendChild(document.createElement('span'))
        probe.style.cssText = 'position: absolute; top: 0; left: 0; display: block; height: var(--byd-tap); padding: var(--byd-s2) 0'
        const oneRow = probe.offsetHeight
        probe.remove()
        const tall = Math.round(crown.getBoundingClientRect().height)
        // And the number #130 rules a wrapping crown out with.
        if (tall > 80) return `${tall}px, over the 80px the tab allows`
        return tall > oneRow + 1 ? `${tall}px, more than the ${oneRow}px one row costs` : 'one row'
      }),
    )
    expect(measured).toEqual(nothing(measured, 'one row'))
  }, 120_000)

  // The half of B that is not a box: the filters do not leave the row. Putting thirteen chips
  // behind `Filter (13) ▾` would hide the one thing on that surface that is a state rather than an
  // action, so they keep their place and get a side scroll of their own inside the row.
  it('keeps every filter in the row, scrolling sideways there rather than in a box', async () => {
    const measured = await measure(width, height, (page) =>
      page.evaluate(() => {
        const rail = document.querySelector<HTMLElement>('.byd-crown-rail-scroll')
        if (!rail) return 'no rail'
        const chips = rail.querySelectorAll('.byd-data-chip').length
        // Reachable, whether or not they all fit: what is past the edge is scrolled to and not
        // lost, and the rail is the only thing in the crown that scrolls at all.
        const over = rail.scrollWidth - rail.clientWidth
        return `${chips} chips, ${over > 0 ? `${over}px of them past the edge` : 'all of them in view'}`
      }),
    )
    // The deck's eight types and five rarities. Only the card table has filters at all.
    expect(measured['Kortvägg']).toBe('no rail')
    expect(measured['Symboler']).toBe('no rail')
    expect(measured['Tabell']).toMatch(/^13 chips, /)
  }, 120_000)

  it('leaves the work exactly one scroll region, with none inside another', async () => {
    const measured = await measure(width, height, (page) =>
      page.evaluate(() => {
        const panel = [...document.querySelectorAll<HTMLElement>('.byd-editor > main > [role="tabpanel"]')].find((el) => el.checkVisibility())!
        const scrollers = [...panel.querySelectorAll<HTMLElement>('*')].filter((el) => {
          const cs = getComputedStyle(el)
          const scrolls = (axis: string) => axis === 'auto' || axis === 'scroll'
          return (scrolls(cs.overflowY) && el.scrollHeight - el.clientHeight > 1) || (scrolls(cs.overflowX) && el.scrollWidth - el.clientWidth > 1)
        })
        // The filter row is a scroll of its own on purpose and is not the work: it is named, so it
        // can be told apart from a panel that scrolls because nobody stopped it.
        const work = scrollers.filter((el) => !el.closest('.byd-crown'))
        const nested = work.filter((el) => work.some((other) => other !== el && other.contains(el)))
        return {
          work: work.map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.') || '—'}`),
          nested: nested.map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.') || '—'}`),
        }
      }),
    )
    for (const [name, found] of Object.entries(measured)) {
      expect({ [name]: found.nested }).toEqual({ [name]: [] })
      expect({ [name]: found.work.length }).toEqual({ [name]: 1 })
    }
  }, 120_000)

})

// Width has nothing to do with this one: it is what the boxes say, not how they fit.
describe('what a box in the crown says', () => {
  it('is what is chosen inside it, and changes when that changes', async () => {
    atWidth(1280)
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    const { unmount } = render(<EditorPage />)
    try {
      await screen.findByText('Skogens herrar')
      const boxes = () => [...document.querySelectorAll<HTMLButtonElement>('.byd-crown-box')]
      const said = (box: HTMLButtonElement) => (box.textContent ?? '').replace('\u25be', '').trim()
      const counted: Record<string, number> = {}
      const deaf: Record<string, string[]> = {}
      for (const name of CROWNED) {
        fireEvent.click(screen.getByRole('tab', { name }))
        counted[name] = 0
        deaf[name] = []
        const many = boxes().length
        // A surface with no boxes would otherwise report a crown that says everything, which is
        // the shape of guard this repo keeps finding it needs.
        expect(`${name} has boxes: ${many > 0}`).toBe(`${name} has boxes: true`)
        for (let i = 0; i < many; i++) {
          const before = said(boxes()[i]!)
          fireEvent.click(boxes()[i]!)
          const drawer = document.querySelector('[data-crown-drawer]')
          // A box that opens no settings at all — the import and the export are done once and are
          // not a state — has nothing to say and is not asked to.
          const choice = drawer
            ? [...drawer.querySelectorAll<HTMLElement>('button[aria-pressed="false"], input[type="checkbox"]')].find(
                (el) => !(el instanceof HTMLInputElement) || !el.checked,
              )
            : undefined
          if (!choice) {
            if (drawer) fireEvent.click(boxes()[i]!)
            continue
          }
          fireEvent.click(choice)
          counted[name]++
          if (said(boxes()[i]!) === before) deaf[name]!.push(before)
          fireEvent.click(boxes()[i]!)
        }
      }
      expect(deaf).toEqual(Object.fromEntries(CROWNED.map((name) => [name, []])))
      // And at least one box somewhere was actually made to change its mind, so this cannot pass
      // by finding no setting anywhere. Not asked of every surface: the card table's one box is
      // the import, which is an action done once and not a state to be in, and a box with nothing
      // to say is exactly what B says should be there.
      const tried = Object.values(counted).reduce((a, b) => a + b, 0)
      expect(`boxes made to change their mind: ${tried > 0}`).toBe('boxes made to change their mind: true')
    } finally {
      unmount()
    }
  }, 120_000)
})
