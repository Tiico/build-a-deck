// @vitest-environment jsdom
// The door to who has the game (L63, #1250) is the one piece of the editor's header whose content
// changes while the designer is looking at it: a co-editor arrives. Whatever it draws, the row it
// stands in must not move under the pointer when that happens — a tab that slides between a press
// and its release is a tab that is not chosen (#1231). So the editor is mounted with the people in
// it, and its markup is laid in Chromium against the stylesheet it ships, in the Mac's face and in
// one as wide as CI's DejaVu (Verdana), since a row that holds in the narrow face says nothing
// about the wide one (#1009).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { capture } from '@byd/render'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`
// Verdana is about as wide as DejaVu, the face CI's Linux draws system-ui with.
const WIDE = ".byd-editor, .byd-editor * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"
const FACES = { mac: '', wide: WIDE } as const

const document_ = (html: string, extra: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}${extra}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

const OTHERS = ['Bo', 'Lo', 'Mi', 'Ylva', 'Gus', 'Åsa', 'Pim', 'Ruth']
const COUNTS = [1, 2, 4, 8] as const

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

// The editor as it stands with `n` people in it, the designer one of them. The others are real
// editors on the fixture's server, so the door is drawn from the presence the actor sends.
async function withIn(width: number, n: number): Promise<string> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  await run.answering()
  const { unmount } = render(<EditorPage />)
  const others: ProjectClient[] = []
  try {
    await screen.findByText('Skogens herrar')
    // The designer is in it too, once the actor has said so: alone is one face and not none.
    const door = await screen.findByRole('button', { name: 'Dela · vilka som har spelet' })
    await waitFor(() => expect(door.querySelectorAll('i')).toHaveLength(1))
    for (const name of OTHERS.slice(0, n - 1)) others.push(await ProjectClient.open({ http: run.http, id: run.projectId, name }))
    // The door's name says how many are here: the stack is hidden from a reader.
    if (n > 1) await screen.findByRole('button', { name: `Dela: vilka som har spelet, ${n} online` })
    return document.querySelector('.byd-editor')!.outerHTML
  } finally {
    for (const other of others) other.close()
    unmount()
  }
}

// Where every piece of the header stands, left and right edge, by what it is, and what the door
// hangs from the header's edge.
const row = (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector('.byd-editor > header')!
    const pieces: Record<string, Element | null> = {
      'hemvägen': header.querySelector(':scope > .byd-editor-home'),
      'namnet': header.querySelector(':scope > .byd-editor-name'),
      '⋯': header.querySelector(':scope > .byd-editor-more'),
      'versionen': header.querySelector(':scope > .byd-editor-rev'),
      'sparstatusen': header.querySelector(':scope > .byd-editor-saved'),
      'ångra/gör om': header.querySelector(':scope > .byd-editor-steps'),
    }
    for (const tab of header.querySelectorAll('[role=tab]')) pieces[tab.textContent!.trim()] = tab
    const at: Record<string, [number, number]> = {}
    for (const [name, el] of Object.entries(pieces)) {
      if (!el) throw new Error(`the header has no ${name}`)
      const b = el.getBoundingClientRect()
      at[name] = [b.left, b.right]
    }
    const doorEl = header.querySelector(':scope > .byd-editor-here')!
    const door = doorEl.getBoundingClientRect()
    const tap = parseFloat(getComputedStyle(document.querySelector('.byd-editor')!).getPropertyValue('--byd-tap'))
    const tabs = [...header.querySelectorAll('[role=tab]')]
    const lastTab = tabs[tabs.length - 1]!.getBoundingClientRect()
    const save = header.querySelector(':scope > .byd-editor-save')!.getBoundingClientRect()
    const edge = header.getBoundingClientRect().bottom
    const stackEl = doorEl.querySelector('.byd-editor-here-others')
    const stack = stackEl && (() => {
      const b = stackEl.getBoundingClientRect()
      // Each face, and whether it is what is drawn at its own middle: a face under a strip that
      // stands below the header is a face nobody sees.
      const faces = [...stackEl.children].map((face) => {
        const f = face.getBoundingClientRect()
        const top = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2)
        return { said: face.textContent, drawn: top !== null && face.contains(top) }
      })
      return { left: b.left, right: b.right, middle: b.top + b.height / 2, below: b.bottom - edge, faces, hidden: stackEl.getAttribute('aria-hidden') }
    })()
    return {
      at,
      door: { left: door.left, width: door.width, faces: doorEl.querySelectorAll(':scope > i').length },
      tap,
      room: { after: lastTab.right, before: save.left },
      edge,
      stack,
    }
  })

async function laid(html: string, width: number, extra: string) {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    await page.setContent(document_(html, extra), { waitUntil: 'load' })
    return await row(page)
  } finally {
    await page.close()
  }
}

// Between 1024 and 1279 the door is one face, «en tummyta bred» (L63). The rule said it as a
// ceiling, `max-width`, and it held only because every button in the editor has a target as its
// floor (`.byd-editor button`): the prototype for #1250 drew the header without that floor and
// measured a door 24 px wide alone and 44 with company, and a row that moved 8–20 px. The width is
// now said as a width, and this holds it to the target alone and in company, in both faces.
describe('the door to who has the game at 1024 (L63, #1250)', () => {
  it('is one target wide alone and with company, and nothing before it moves when someone comes in', async () => {
    const alone = await withIn(1024, 1)
    const two = await withIn(1024, 2)
    for (const [face, extra] of Object.entries(FACES)) {
      const before = await laid(alone, 1024, extra)
      const after = await laid(two, 1024, extra)
      expect(before.tap, 'the editor names its target').toBeGreaterThan(0)
      expect({ face, alone: before.door.width, two: after.door.width }).toEqual({ face, alone: before.tap, two: before.tap })
      expect({ face, door: after.door.left, at: after.at }).toEqual({ face, door: before.door.left, at: before.at })
    }
  }, 60_000)
})

// The others hang from the header's edge (L63, reviderat 2026-10-24, variant B). With 2, 4 and 8
// in, at the three widths the desk is judged at and in both faces, nothing before «Dela» is a
// pixel from where it stood alone — at 1280 the tabs slid 58–81 px and at 1440 in the wide face
// 69–89 px, and the game's name was cut to «S…» (#1250). The door keeps its width, the stack is
// drawn where the decision put it, over whatever stands under the header, and never under the
// neighbours in the row.
describe('the people in the header stand still (L63, #1250)', () => {
  for (const width of [1024, 1280, 1440]) {
    it(`moves nothing before «Dela» at ${width} with 1, 2, 4 and 8 in`, async () => {
      const html: Record<number, string> = {}
      for (const n of COUNTS) html[n] = await withIn(width, n)
      for (const [face, extra] of Object.entries(FACES)) {
        const alone = await laid(html[1]!, width, extra)
        expect(alone.stack, 'alone, nothing hangs from the header').toBeNull()
        expect(alone.door.faces).toBe(1)
        for (const n of COUNTS.slice(1)) {
          const m = await laid(html[n]!, width, extra)
          expect({ face, n, door: m.door, at: m.at }).toEqual({ face, n, door: alone.door, at: alone.at })
          const others = n - 1
          const said = others <= 3 ? OTHERS.slice(0, others).map((who) => who[0]) : [...OTHERS.slice(0, 2).map((who) => who[0]), `+${others - 2}`]
          const stack = m.stack!
          expect({ face, n, said: stack.faces.map((f) => f.said), drawn: stack.faces.every((f) => f.drawn), hidden: stack.hidden }).toEqual({ face, n, said, drawn: true, hidden: 'true' })
          // Its middle on the header's lower edge, reaching at most ten pixels under it.
          expect(Math.abs(stack.middle - m.edge), `${face} ${n}: the stack's middle on the edge`).toBeLessThanOrEqual(1.5)
          expect(stack.below).toBeLessThanOrEqual(10)
          // Between the last tab and «Spara»: under the door and nothing else in the row.
          expect(stack.left, `${face} ${n}: clear of the tabs`).toBeGreaterThanOrEqual(m.room.after - 0.5)
          expect(stack.right, `${face} ${n}: clear of «Spara»`).toBeLessThanOrEqual(m.room.before + 0.5)
        }
      }
    }, 120_000)
  }
})

// Every control the stack can hang over, and the ring the keyboard draws around it (#1321). The
// stack is drawn over what stands under the header's edge, and it lay over the bottom of the door's
// own ring — at 1024 over nearly all of it — and over the ring of «Bord» beside the door. A ring the
// designer cannot see whole is a focus she has to guess at (L12: the editor's accessibility is not
// relaxed). So each control whose ring the stack's box reaches is given the focus with real Tab
// presses, since `focus()` draws no ring in Chromium, and the ring is read off the painted page
// along all four of its sides.
const HANGS_OVER = (page: Page) =>
  page.evaluate(() => {
    const stack = document.querySelector('.byd-editor-here-others')!.getBoundingClientRect()
    const focusable = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const shown = (el: Element) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0
    // The editor's ring reaches 5 px out (`.byd-editor :focus-visible`: 3 px, 2 px off the box);
    // anything within 8 px of the stack is counted, so a ring is never missed by rounding.
    const out = [...document.querySelectorAll<HTMLElement>(focusable)].filter(shown).filter((el) => {
      const b = el.getBoundingClientRect()
      const reach = 8
      return b.left - reach < stack.right && b.right + reach > stack.left && b.top - reach < stack.bottom && b.bottom + reach > stack.top
    })
    return out.map((el) => {
      el.setAttribute('data-hung-over', '')
      return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName
    })
  })

// Tab until the keyboard stands on the control, and read the ring around it off the photograph: a
// band `outline-width` wide, `outline-offset` out from the box, walked along its middle, corners
// and all. It is photographed twice, with the stack and with the stack hidden, so what the stack
// covers is told apart from what something else already clips (a scrolling region's ring is cut by
// its own ancestors whether anyone is here or not).
type Sides = { top: number; bottom: number; left: number; right: number }
async function ringOf(page: Page, index: number): Promise<{ what: string; sampled: number; missing: Sides; covered: Sides }> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  // A tab in the editor's tablist is reached with the arrows in the app (roving tabindex), and the
  // markup laid here has no script to move them, so the one tab being read is put in Tab's order.
  // The ring is the same either way: what draws it is the keyboard, not how it got there.
  await page.evaluate((n) => {
    const target = document.querySelectorAll<HTMLElement>('[data-hung-over]')[n]!
    if (target.tabIndex < 0) target.tabIndex = 0
  }, index)
  let there = false
  for (let i = 0; i < 80 && !there; i++) {
    await page.keyboard.press('Tab')
    there = await page.evaluate((n) => document.activeElement === document.querySelectorAll('[data-hung-over]')[n], index)
  }
  if (!there) {
    const said = await page.evaluate((n) => document.querySelectorAll('[data-hung-over]')[n]!.outerHTML.slice(0, 160), index)
    throw new Error(`the keyboard never reached ${said}`)
  }
  const shot = (await capture(page, {})).toString('base64')
  const hide = await page.addStyleTag({ content: '.byd-editor-here-others { visibility: hidden !important; }' })
  const bare = (await capture(page, {})).toString('base64')
  await hide.evaluate((el) => el.remove())
  return page.evaluate(
    async ({ shot, bare, index }) => {
      const el = document.querySelectorAll<HTMLElement>('[data-hung-over]')[index]!
      const what = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName
      const style = getComputedStyle(el)
      const width = parseFloat(style.outlineWidth)
      const out = parseFloat(style.outlineOffset) + width / 2
      const radius = parseFloat(style.borderTopLeftRadius) || 0
      const ring = (style.outlineColor.match(/\d+/g) ?? []).slice(0, 3).map(Number)
      const read = async (png: string) => {
        const image = new Image()
        image.src = `data:image/png;base64,${png}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const g = canvas.getContext('2d')!
        g.drawImage(image, 0, 0)
        const scale = image.width / window.innerWidth
        return (x: number, y: number) => [...g.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data].slice(0, 3)
      }
      const withStack = await read(shot)
      const without = await read(bare)
      // Antialiasing on the corners blends the band's edge, never its middle into a face's colour.
      const near = (c: number[]) => c.every((v, i) => Math.abs(v - ring[i]!) <= 48)
      // The middle of the band, which follows the box's corners: a rounded rectangle `out` past the
      // box with the radius grown by as much. Walked every 2 px, each point said by the side it is on.
      const b = el.getBoundingClientRect()
      const r = Math.min(radius, b.width / 2, b.height / 2) + out
      const box = { left: b.left - out, right: b.right + out, top: b.top - out, bottom: b.bottom + out }
      const points: { side: 'top' | 'bottom' | 'left' | 'right'; x: number; y: number }[] = []
      for (let x = box.left + r; x <= box.right - r; x += 2) points.push({ side: 'top', x, y: box.top }, { side: 'bottom', x, y: box.bottom })
      for (let y = box.top + r; y <= box.bottom - r; y += 2) points.push({ side: 'left', x: box.left, y }, { side: 'right', x: box.right, y })
      const corners = [
        { cx: box.left + r, cy: box.top + r, from: Math.PI, sideX: 'left', sideY: 'top' },
        { cx: box.right - r, cy: box.top + r, from: 1.5 * Math.PI, sideX: 'right', sideY: 'top' },
        { cx: box.right - r, cy: box.bottom - r, from: 0, sideX: 'right', sideY: 'bottom' },
        { cx: box.left + r, cy: box.bottom - r, from: 0.5 * Math.PI, sideX: 'left', sideY: 'bottom' },
      ] as const
      const step = r > 0 ? 2 / r : Math.PI
      for (const c of corners) {
        for (let a = 0; a <= Math.PI / 2; a += step) {
          const t = c.from + a
          const x = c.cx + r * Math.cos(t)
          const y = c.cy + r * Math.sin(t)
          points.push({ side: Math.abs(Math.cos(t)) > Math.abs(Math.sin(t)) ? c.sideX : c.sideY, x, y })
        }
      }
      // How many samples on each side are not the ring's colour, and how many of those the stack is
      // what covers.
      const missing = { top: 0, bottom: 0, left: 0, right: 0 }
      const covered = { top: 0, bottom: 0, left: 0, right: 0 }
      for (const p of points) {
        const drawn = near(withStack(p.x, p.y))
        if (!drawn) missing[p.side]++
        if (!drawn && near(without(p.x, p.y))) covered[p.side]++
      }
      return { what, sampled: points.length, missing, covered }
    },
    { shot, bare, index },
  )
}

describe('the ring around what the stack hangs over (#1321)', () => {
  for (const width of [1024, 1280, 1440]) {
    it(`is drawn whole at ${width} with 1, 4 and 8 others in`, async () => {
      for (const others of [1, 4, 8]) {
        const html = await withIn(width, others + 1)
        for (const [face, extra] of Object.entries(FACES)) {
          const page = await browser.newPage({ viewport: { width, height: 800 } })
          try {
            await page.setContent(document_(html, extra), { waitUntil: 'load' })
            const over = await HANGS_OVER(page)
            // The door is always among them: the stack hangs from it.
            expect(over, `${width} ${face} ${others}`).toContain(`Dela: vilka som har spelet, ${others + 1} online`)
            const none = { top: 0, bottom: 0, left: 0, right: 0 }
            for (let i = 0; i < over.length; i++) {
              const { what, sampled, missing, covered } = await ringOf(page, i)
              expect(sampled, what).toBeGreaterThan(20)
              expect({ width, face, others, what, covered }).toEqual({ width, face, others, what, covered: none })
              // The door's ring, which the stack hangs from, is whole: nothing else cuts it either.
              if (what.startsWith('Dela')) expect({ width, face, others, what, missing }).toEqual({ width, face, others, what, missing: none })
            }
          } finally {
            await page.close()
          }
        }
      }
    }, 240_000)
  }
})
