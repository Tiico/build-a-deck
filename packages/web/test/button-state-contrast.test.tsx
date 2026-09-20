// @vitest-environment jsdom
// What a button is drawn in while it is refused or busy, measured on the ground it is drawn on
// (#315).
//
// `.byd-editor > header > button:disabled { color: #5b6478 }` was a grey chosen for a button that
// stands on the header's own chrome. The first action does not stand on it: it is filled, and over
// `#1f6fd0` that grey measures 1.20:1. So the moment «Uppdatera bordet» began saying «Uppdaterar
// bordet…» while it worked, it said it in a word nobody could read — which is the exact fault #315
// was opened about, arriving through the fix for it. Scoping the rule off the filled action put it
// right; the ink a refused control is written in is still quiet enough to fail there, at 1.51:1,
// so it is the scope and not the colour that holds, and that is a thing a test has to say.
//
// Nothing in the suite could have caught that. `editor-contrast` and `button-language-contrast`
// both read tokens: they ask what colour a name has, never what colour a control *comes out* in a
// given state over the ground it actually sits on. A state rule is a colour laid on a surface the
// rule cannot see, so it is the one kind of colour that has to be measured on the page. Walking
// that way found the same fault standing in two more places: «Sparar…» in the header at 2.55:1 and
// the booklet button while the booklet is being made at 2.84:1, both in the grey above, which is
// why the refused ink is now the editor's own quiet register.
//
// So every button the editor draws is put into each state the platform has a word for — refused,
// busy, both, and each of those again under the pointer — and read back in Chromium: the label's
// own computed colour, and under it the whole
// stack of backgrounds the browser paints beneath that label, the button's own fill included, each
// layer faded by the `opacity` its element carries. Nothing here is written as a number: every
// colour is read off the page, so retuning a palette retunes this, and a pixel measured on a Mac
// is a pixel measured on CI.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { EditorPage } from '../src/editor/EditorPage.js'
import { contrastRatio, flatten, parseColor } from '../src/player/contrast.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
// The rulebook's own sheet belongs here too: the Rules tab draws the setup's controls out of it
// (#270), and the editor page loads it because `RulesPanel` reaches the book through `RuleDrawer`.
// Left out, those buttons stand unstyled here and are measured against a ground the product never
// paints — which reads as a failure that no stylesheet can fix.
const css = `${read('src/editor/editor.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}\n${read('src/rules/rules-open.css')}
${read('src/rules/rules.css')}`

const document_ = (html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// The two rooms the editor has buttons in, at the widths it decides between them at (L10). The
// desk is where «Spara» and «Uppdatera bordet» stand in the header; below it they leave the header
// for the end of the stage strip, which is a second surface writing the same pair of state rules
// and so a second place the same fault can be made.
const DESK = 1280
const PHONE = 390

// The states the platform has a word for, and which a stylesheet can therefore write a rule about.
// `aria-busy` draws nothing today — no sheet in the tool selects on it — and it is enumerated
// anyway: a busy button is the state #315 is about, and the day a rule is written for it this is
// already measuring it.
const STATES = ['refused', 'busy', 'refused and busy'] as const
type State = (typeof STATES)[number]

/** One run of text inside a button, with everything the browser paints under it. */
type Spot = {
  /** The words, so a failure says which label is unreadable and not merely which node. */
  text: string
  /** The label's own colour, its element's `opacity` already folded into the alpha. */
  ink: string
  /**
   * Every background painted under those words, outermost first, faded the same way — and once
   * per colour a pattern in that stack names, since a chequerboard is not one ground but two and
   * the label has to hold against both.
   */
  stacks: string[][]
  /** Anything in the stack painted with a picture that names no colour at all: a ground only
   *  pixels can answer for, the way the felt's are read in `painted.ts`. */
  unread: string[]
}

type Reading = { spots: Spot[] }

/** A button as the walk found it. */
type Found = { id: string; label: string; where: string; at: { x: number; y: number } }

// Tag every button the editor draws and hand back what it is called. Only buttons that own visible
// words: an icon is a graphic and carries 3:1 rather than 4.5:1, and is not this file's subject.
const enumerate = (page: Page): Promise<Found[]> =>
  page.evaluate(() => {
    const editor = document.querySelector('.byd-editor')
    if (!editor) throw new Error('no .byd-editor in this view')
    const found: Found[] = []
    for (const el of editor.querySelectorAll<HTMLButtonElement>('button')) {
      if (!el.checkVisibility()) continue
      if (!(el.textContent ?? '').trim()) continue
      const box = el.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) continue
      const id = `p${found.length}`
      el.setAttribute('data-byd-probe', id)
      // Where it stands, said in the class names the stylesheet writes its rules against, so a
      // failure names the rule to go and look at rather than a position in a list.
      const near = el.parentElement?.closest('[class*="byd-"]')
      const where = `${near?.className ?? el.parentElement?.tagName.toLowerCase() ?? '?'} > ${el.className || 'button'}`
      found.push({ id, label: (el.textContent ?? '').trim().slice(0, 40), where, at: { x: box.left + box.width / 2, y: box.top + box.height / 2 } })
    }
    return found
  })

// How each named button is drawn in each named state. The whole matrix is read in one pass and the
// states are put back afterwards, so nothing a measurement did is left standing for the next one.
const measure = (page: Page, ids: readonly string[], states: readonly (State | 'at rest')[]): Promise<Record<string, Record<string, Reading>>> =>
  page.evaluate(
    ({ ids, states }) => {
      // A computed colour, faded by the opacity carried over it, handed back in the one notation
      // the measuring module reads. Chromium does not answer in `rgb()` alone: a colour written
      // with a percentage alpha comes back as `color(srgb 0.105 0.113 0.137 / 0.92)`, in unit
      // floats rather than in bytes, and a reader that knew only `rgb()` would fall over on the
      // first panel rather than measure it.
      const faded = (colour: string, by: number): string => {
        const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(colour.trim())
        const parts = srgb
          ? [...srgb.slice(1, 4).map((v) => String(Math.round(Number(v) * 255))), srgb[4]]
          : /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+))?\s*\)/.exec(colour)?.slice(1)
        if (!parts) throw new Error(`not a colour the page handed back: ${colour}`)
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${(Number(parts[3] ?? 1) * by).toFixed(4)})`
      }

      // The words inside a button: every element that owns a text node of its own, the button
      // included. A button whose label is wrapped in a `<b>` of another colour is two runs of text
      // and both of them have to be readable.
      const runs = (el: Element): Element[] =>
        [el, ...el.querySelectorAll('*')].filter(
          (node) => node.checkVisibility() && [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== ''),
        )

      // Everything the browser paints under one run of text, and the ink over it. The walk is the
      // element's own ancestors, because that is what a background shows through; each layer is
      // faded by the `opacity` carried by its own element and by every element above it, which is
      // how a control dimmed as a whole reaches the eye.
      const spotOf = (node: Element): Spot => {
        const chain: Element[] = []
        for (let at: Element | null = node; at; at = at.parentElement) chain.push(at)
        chain.reverse()
        let stacks: string[][] = [[]]
        const unread: string[] = []
        let carried = 1
        let ink = 'rgba(0, 0, 0, 1)'
        for (const step of chain) {
          const style = getComputedStyle(step)
          const own = parseFloat(style.opacity)
          carried *= Number.isFinite(own) ? own : 1
          const plate = faded(style.backgroundColor, carried)
          let alternatives = [[plate]]
          if (style.backgroundImage !== 'none') {
            // A pattern is not a ground but a set of them, and that is the point: the zoom band
            // is 92 % opaque over the canvas room's chequerboard, so its words stand on two
            // colours at once and have to hold against the worse of them. The stops are read out
            // of the value the engine hands back, which is always in `rgb()` — a picture that
            // names no colour at all is a `url()`, and only pixels can say what is under that.
            const stops = [...style.backgroundImage.matchAll(/rgba?\([^)]*\)|color\(srgb[^)]*\)/gi)].map((one) => one[0])
            if (stops.length === 0 || /url\(/i.test(style.backgroundImage)) unread.push(`${step.tagName.toLowerCase()}.${step.className}: ${style.backgroundImage.slice(0, 40)}`)
            else alternatives = stops.map((stop) => [plate, faded(stop, carried)])
          }
          stacks = stacks.flatMap((stack) => alternatives.map((one) => [...stack, ...one]))
          // A label standing on more grounds than this could enumerate is a label nobody could
          // have chosen a colour for either, so it is said out loud rather than sampled.
          if (stacks.length > 256) throw new Error(`«${(node.textContent ?? '').trim().slice(0, 40)}» stands on more patterns than this can enumerate`)
          ink = faded(style.color, carried)
        }
        return { text: (node.textContent ?? '').trim().slice(0, 40), ink, stacks, unread }
      }

      const out: Record<string, Record<string, Reading>> = {}
      for (const id of ids) {
        const el = document.querySelector<HTMLButtonElement>(`[data-byd-probe="${id}"]`)
        if (!el) throw new Error(`the walk tagged ${id} and the page has no such button`)
        const was = { disabled: el.disabled, busy: el.getAttribute('aria-busy') }
        out[id] = {}
        for (const state of states) {
          el.disabled = state === 'refused' || state === 'refused and busy'
          if (state === 'busy' || state === 'refused and busy') el.setAttribute('aria-busy', 'true')
          else el.removeAttribute('aria-busy')
          out[id]![state] = { spots: runs(el).map(spotOf) }
        }
        el.disabled = was.disabled
        if (was.busy === null) el.removeAttribute('aria-busy')
        else el.setAttribute('aria-busy', was.busy)
      }
      return out
    },
    { ids: ids as string[], states: states as string[] },
  )

/** One measured pair, named so a failure says what was unreadable and where. */
type Pair = { what: string; ratio: number; grounded: boolean; unread: string[] }

// The label over its ground, as a ratio. The stack starts at the browser's own canvas so that a
// surface which paints nothing opaque under its words is measured against something rather than
// crashing — and `grounded` says whether it ever reached an opaque layer, because a stack that
// did not is a measurement against a canvas nobody can see and is asserted on separately.
function pairs(what: string, reading: Reading): Pair[] {
  return reading.spots.map((spot) => {
    const grounds = spot.stacks.map((stack) => flatten(['rgb(255, 255, 255)', ...stack]))
    return {
      what: `${what} — «${spot.text}»`,
      // The worst of the grounds the words stand on, since one of them is what somebody reads.
      ratio: Math.min(...grounds.map((ground) => contrastRatio(flatten([ground, spot.ink]), ground))),
      grounded: spot.stacks.every((stack) => stack.some((layer) => parseColor(layer)[3] === 1)),
      unread: spot.unread,
    }
  })
}

// Every button in a view, in every state that draws it differently from how it rests — at rest and
// again with the pointer on it, since a state rule and a hover rule are laid on the same control
// and the pair of them is what the reader gets.
async function readView(html: string, width: number): Promise<Pair[]> {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  try {
    await page.setContent(document_(html), { waitUntil: 'load' })
    const found = await enumerate(page)
    if (found.length === 0) throw new Error('no button with a label in this view')
    const ids = found.map((one) => one.id)
    const named = Object.fromEntries(found.map((one) => [one.id, one]))
    const out: Pair[] = []
    const add = (one: Found, state: string, reading: Reading) => out.push(...pairs(`${one.where} «${one.label}» ${state}`, reading))

    // Every state, and not only the states that changed something. A state that repaints nothing
    // is the *answer* here and not a reading to skip: scoping the grey off the filled action is
    // precisely what makes «Uppdatera bordet» draw the same refused as at rest, so dropping the
    // readings that match the resting one would drop the one button this file was written for.
    for (const [id, states] of Object.entries(await measure(page, ids, ['at rest', ...STATES])))
      for (const [state, reading] of Object.entries(states)) add(named[id]!, state, reading)

    // And the same matrix under the pointer. Hover cannot be asked for from inside the page, so
    // the mouse is moved onto each button in turn; a button something else is lying over is not
    // hovered by that move and says so rather than being measured in the wrong state.
    for (const one of found) {
      await page.mouse.move(one.at.x, one.at.y)
      const under = await page.evaluate((id) => document.querySelector(`[data-byd-probe="${id}"]:hover`) !== null, one.id)
      if (!under) continue
      const hovered = await measure(page, [one.id], ['at rest', ...STATES])
      for (const [state, reading] of Object.entries(hovered[one.id]!)) add(one, `${state}, under the pointer`, reading)
    }
    return out
  } finally {
    await page.close()
  }
}

// Every mode the editor can be showing, in the room being walked, named so that a walk which finds
// nothing fails instead of agreeing with itself.
const DESK_VIEWS = ['Bord', 'Kortvägg', 'Mall', 'Media', 'Regler', 'Symboler', 'Tabell'] as const
const PHONE_VIEWS = ['Bord', 'Kortvägg', 'Media', 'Regler', 'Symboler', 'Tabell'] as const

async function editorViews(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    const out: Record<string, string> = {}
    const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]')]
    for (let i = 0; i < tabs().length; i++) {
      const tab = tabs()[i]!
      fireEvent.click(tab)
      out[tab.textContent?.trim() ?? String(i)] = document.querySelector('.byd-editor')!.outerHTML
    }
    return out
  } finally {
    unmount()
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
  await run.projects.create(run.projectId, projectDoc())
}, 60_000)
afterEach(async () => {
  await run.stop()
}, 60_000)

describe.each([
  { room: 'at the desk', width: DESK, expected: DESK_VIEWS },
  { room: 'below the desk', width: PHONE, expected: PHONE_VIEWS },
])('every button the editor draws, $room', ({ width, expected }) => {
  it('carries its label at AA at rest and in every state that repaints it', async () => {
    const views = await editorViews(width)
    expect(Object.keys(views).sort()).toEqual([...expected].sort())
    const measured: Pair[] = []
    for (const html of Object.values(views)) measured.push(...(await readView(html, width)))

    // What the walk is expected to have walked, named rather than counted. A floor on the number
    // of pairs is the guard that does not guard: the two buttons this whole file is about could
    // both fall out of the walk — renamed, moved behind a door, drawn as something other than a
    // `<button>` — and three hundred readings of everything else would still clear it. So the
    // pair #315 is about has to be in the list, in the state it is about, or nothing below counts.
    const refused = measured.filter((one) => one.what.includes(' refused —')).map((one) => one.what)
    expect(refused.filter((one) => one.includes('«Uppdatera bordet»')).length).toBeGreaterThan(0)
    expect(refused.filter((one) => one.includes('«Spara»')).length).toBeGreaterThan(0)
    // A label measured against the browser's own canvas is a label nobody drew a ground under.
    expect(measured.filter((one) => !one.grounded).map((one) => one.what)).toEqual([])
    // And a ground painted with a picture is not a colour, so a stack of colours cannot stand for
    // it: such a button needs the pixels read, the way the felt's do in `painted.ts`.
    expect(measured.filter((one) => one.unread.length > 0).map((one) => `${one.what}: ${one.unread.join(', ')}`)).toEqual([])
    expect(measured.filter((one) => one.ratio < 4.5).map((one) => `${one.what}: ${one.ratio.toFixed(2)}:1`)).toEqual([])
  }, 300_000)
})
