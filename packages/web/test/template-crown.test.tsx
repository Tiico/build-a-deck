// @vitest-environment jsdom
// The crown over the card, and the two columns beside it (#129).
//
// The Mall tab kept its groups in a silent side scroll. Measured here on a deck with eleven groups:
// 823 px of the row were out of sight at 1024 with no arrow, no fade and no keyboard way to the
// rest, eight of the twelve entries lay past the crown's own right edge, and the last one that did
// show was cut through the middle of its own word. The crown was two rows — 121 px — at every width
// for it. Letting the row wrap answers the first half and sends the bill to the second: every group
// shows, and the crown becomes 265 px at 1024 on this deck and more on a bigger one. The owner's
// answer is the menu: one button carrying the open group's name *and* its count, with the whole list
// behind it — the only shape in the prototype that hides nothing and costs no height.
//
// Beside the card, two more things the audit measured. The layer column scrolled its own heading,
// its count and the line about dragging out of sight along with the list — 690 px of scrolling at
// 1024 — and the properties column held its 280 px whether or not anything was selected, leaving
// the card 456 px of a 1024 px desk. It is folded by hand now — by hand and not by itself, because
// a column that opens and shuts as the selection changes moves the card under the pointer while it
// is being worked on.
//
// All of it is layout, so none of it can be asked of jsdom: the markup is taken from a real mount
// and measured in Chromium against the stylesheet the editor actually ships, the way
// `editor-window.test.tsx` and `editor-spacing.test.tsx` ask their own questions.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent, type UserEvent } from '@testing-library/user-event'
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

// A deck grouped as many ways as the one the audit measured: eleven values in one column, over
// sixty cards, already grouped when the tab opens. Eleven is what made the audit's own row 1076 px
// wide, and it is the number that tells a crown whose height depends on the deck from one whose
// height does not — five would have fitted on one line and proved nothing.
const TYPES = ['Playcard', 'Location', 'Effect', 'Event', 'Trap', 'Character', 'Artifact', 'Blessing', 'Curse', 'Terrain', 'Weather'] as const
function groupedDeck(): ProjectDoc {
  const { zones, seats, floor } = recipeSetup(4, [])
  const faces = template()
  for (const face of Object.values(faces.faces)) face.variantBy = 'typ'
  // And as many layers as a designed card has. The audit's front had twelve; three of them fit in
  // any column ever drawn, and a list that never scrolls says nothing about what scrolling does to
  // the words written round it.
  for (let i = 0; i < 16; i++) {
    faces.faces['front']!.base.push({ kind: 'shape', id: `mark-${i}`, x: 4 + i, y: 70, w: 6, h: 6, shape: 'rect', fill: '#334', strokeMm: 0.2, radiusMm: 1 })
  }
  return {
    name: 'Skogens herrar',
    template: faces,
    rows: Array.from({ length: 66 }, (_, i) => ({
      id: `card-${i}`,
      fields: {
        title: `Kort ${i + 1}`,
        body: 'En mening som är ungefär så lång som en riktig korttext brukar bli när den har fått plats.',
        typ: TYPES[i % TYPES.length]!,
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

// The Mall tab as the editor mounts it at a width, after whatever the designer did there. The doing
// has to happen in React — a fold and an open menu are state, not markup — so it happens here and
// what comes out is measured.
async function templateTab(width: number, did?: (user: UserEvent) => Promise<void>): Promise<string> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const user = userEvent.setup()
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('tab', { name: /mall/i }))
    await did?.(user)
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    unmount()
  }
}

async function measure<T>(width: number, height: number, html: string, read_: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage({ viewport: { width, height } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    return await read_(page)
  } finally {
    await page.close()
  }
}

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
  await run.projects.create(run.projectId, groupedDeck())
  // A fold is remembered in the browser, which is this one process for the whole file: without
  // this, the test that folds the properties leaves them folded for the next test, and the next
  // test goes looking for a button whose word has changed under it.
  localStorage.clear()
}, 60_000)
afterEach(async () => {
  await run.stop()
}, 60_000)

// The three desks the audit bound the editor to, narrowest first: 1024 is where every one of these
// measurements is worst, and it is the one the criteria are written at.
const DESKS = [
  [1024, 768],
  [1280, 800],
  [1440, 900],
] as const

// One row of controls: a tap target and the edge above and below it. The crown may be that tall and
// no taller, at any width and on any deck — what is measured is that it does not grow, so the number
// is the shape of the row and not the length of anybody's words. The slack over 61 is for a machine
// whose `system-ui` is a wider face than this one's; a second row would be 44 px more than that.
const ONE_ROW = 72

describe.each(DESKS)('the crown over the card on a %ix%i desk', (width, height) => {
  it('stays one row however many groups the deck has', async () => {
    const html = await templateTab(width)
    const crown = await measure(width, height, html, (page) =>
      page.evaluate(() => {
        const el = document.querySelector('.byd-canvas-strip')
        return el === null ? null : Math.round(el.getBoundingClientRect().height)
      }),
    )
    // A crown that is not on the page at all would otherwise measure a clean nothing.
    expect(crown, 'the Mall tab has no crown over the card').not.toBeNull()
    expect({ crown }).toEqual({ crown: expect.any(Number) })
    expect(crown!).toBeLessThanOrEqual(ONE_ROW)
  }, 120_000)

  it('hides nothing of itself, and cuts nothing off in the middle of its own word', async () => {
    const html = await templateTab(width)
    const seen = await measure(width, height, html, (page) =>
      page.evaluate(() => {
        const crown = document.querySelector('.byd-canvas-strip')!
        const box = crown.getBoundingClientRect()
        return {
          // The silent side scroll this issue is about, asked of the crown and of everything in it:
          // it was one element in, on the row of tabs, which is exactly why nothing said it was
          // there. Nothing in a crown standing at rest may have anything out of sight.
          hidden: [crown, ...crown.querySelectorAll('*')]
            .map((el) => ({ what: el.className || el.tagName, across: el.scrollWidth - el.clientWidth, down: el.scrollHeight - el.clientHeight }))
            .filter(({ across, down }) => across > 0 || down > 0)
            .map(({ what, across, down }) => `${what}: ${across} across, ${down} down`),
          controls: [...crown.querySelectorAll('button, select')].length,
          // A control whose box leaves the crown's is a control cut through — `typ = E` was the
          // last thing the old strip showed at 1024, and half a word is what a reader gets.
          cut: [...crown.querySelectorAll<HTMLElement>('button, select')]
            .filter((el) => el.checkVisibility())
            .map((el) => ({ what: el.textContent?.trim() ?? el.className, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.right > box.right + 1 || r.left < box.left - 1 || r.bottom > box.bottom + 1)
            .map(({ what, r }) => `${what}: ${Math.round(r.right)} past ${Math.round(box.right)}`),
        }
      }),
    )
    // Counted as well as measured: a crown with nothing in it hides nothing and cuts nothing.
    expect(seen.controls).toBeGreaterThanOrEqual(4)
    expect(seen.hidden).toEqual([])
    expect(seen.cut).toEqual([])
  }, 120_000)

  it('has every group of the deck behind its one button, counted, and none of them cut off', async () => {
    const html = await templateTab(width, async (user) => {
      await user.click(screen.getByRole('button', { name: /kortgrupper/i }))
    })
    const seen = await measure(width, height, html, (page) =>
      page.evaluate(() => {
        const menu = document.querySelector('.byd-canvas-groups')
        if (menu === null) return null
        const box = menu.getBoundingClientRect()
        const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
        return {
          groups: items.map((el) => el.firstChild?.textContent ?? ''),
          counted: items.filter((el) => (el.querySelector('small')?.textContent ?? '') !== '').length,
          // Sideways there is nothing to scroll: the list wraps. Down it may scroll, and a
          // scrollbar is a clue you can see — which is the whole difference from what was there.
          hidden: menu.scrollWidth - menu.clientWidth,
          cut: items.filter((el) => el.getBoundingClientRect().right > box.right + 1).map((el) => el.textContent ?? ''),
        }
      }),
    )
    expect(seen, 'the crown’s button opened no list of groups').not.toBeNull()
    // The base every card inherits, then the deck's eleven rules, each one carrying its count.
    expect(seen!.groups).toEqual(['Bas (alla)', ...TYPES.map((t) => `typ = ${t}`)])
    expect(seen!).toMatchObject({ counted: TYPES.length + 1, hidden: 0, cut: [] })
  }, 120_000)
})

// What the card is left of the desk, and what it is left when the designer says she is not working
// on an element's properties just now. The numbers are the columns' own — 68 for the tools, 220 for
// the layers, 280 for the properties — so what is asserted is the arithmetic and not a width
// anybody's font decides.
describe.each(DESKS)('the card on a %ix%i desk', (width, height) => {
  const stage = (page: Page) =>
    page.evaluate(() => {
      const el = document.querySelector('.byd-canvas-stage')
      return el === null ? null : Math.round(el.getBoundingClientRect().width)
    })

  it('gets the properties column’s 280 px when the properties are folded away', async () => {
    const open = await measure(width, height, await templateTab(width), stage)
    const folded = await measure(
      width,
      height,
      await templateTab(width, async (user) => {
        await user.click(screen.getByRole('button', { name: /fäll ihop egenskaperna/i }))
      }),
      stage,
    )
    // A card that was never drawn would otherwise gain nothing and report it as agreement.
    expect(open, 'the Mall tab drew no card').not.toBeNull()
    expect(open!).toBeGreaterThan(0)
    expect({ folded }).toEqual({ folded: open! + 280 })
  }, 120_000)
})

// The layer column's own crown and foot (#129). The heading, the count of cards the panel is about
// and the line about dragging used to scroll away with the list: at 1024 the list ran 690 px past
// the bottom of the window, and everything written round it went with it. They are a frame now, and
// only the list inside it moves.
describe.each(DESKS)('the layer column on a %ix%i desk', (width, height) => {
  it('keeps its heading, its count and its line about dragging while the list is scrolled', async () => {
    const html = await templateTab(width)
    const seen = await measure(width, height, html, (page) =>
      page.evaluate(() => {
        const column = document.querySelector<HTMLElement>('.byd-canvas-layers')!
        const box = column.getBoundingClientRect()
        // Whatever scrolls in there, scrolled as far as it goes — which is what a designer reading
        // the bottom of a long list has done.
        const scrollers = [column, ...column.querySelectorAll<HTMLElement>('*')].filter((el) => el.scrollHeight - el.clientHeight > 1)
        for (const el of scrollers) el.scrollTop = el.scrollHeight
        const within = (el: Element | null) => {
          if (el === null) return 'missing'
          const r = el.getBoundingClientRect()
          return r.top >= box.top - 1 && r.bottom <= box.bottom + 1 ? 'in the column' : `${Math.round(r.top)}, not between ${Math.round(box.top)} and ${Math.round(box.bottom)}`
        }
        return {
          // A list short enough to need no scrolling proves nothing about what scrolling does to
          // the words round it.
          scrolled: scrollers.map((el) => el.scrollHeight - el.clientHeight).reduce((a, b) => a + b, 0),
          heading: within(column.querySelector('h2')),
          count: within(column.querySelector('.byd-canvas-affects')),
          hint: within(column.querySelector('.byd-canvas-hint')),
        }
      }),
    )
    expect(seen.scrolled).toBeGreaterThan(0)
    expect(seen).toMatchObject({ heading: 'in the column', count: 'in the column', hint: 'in the column' })
  }, 120_000)
})
