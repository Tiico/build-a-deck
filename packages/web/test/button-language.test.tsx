// @vitest-environment jsdom
// One button language across the whole tool (#44, variant B). The role is carried by weight and
// form, not by hue: each surface keeps the accent it already owns, and the first action is the
// only *filled* thing in its view.
//
// That rule is worth nothing unless it is measured on what a browser actually paints. `/join`
// is the proof: `.byd-join-observe` declares a quiet outlined button and loses on specificity to
// `.byd-join form button` — (0,1,0) against (0,1,2) — so the whole declaration is dead code and
// `Titta på` is drawn exactly like `Sitt ner`. A test that checked the rule existed would have
// passed all along. So every surface below is mounted for real, laid over the stylesheet it
// ships, and asked in Chromium which elements came out wearing the primary fill.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { HomePage } from '../src/account/HomePage.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { JoinPage } from '../src/join/JoinPage.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { TablePage } from '../src/table/TablePage.js'
import { TableClient } from '../src/client.js'
import type { SetupDef } from '@byd/engine'
import { projectDoc } from './project-doc.js'
import { admit, asSeat, asTable, createSession, roomOf, seatSetup, startServer, twoSeatSetup, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { drawnAs, painted, type Ground, type Spot } from './painted.js'
import { contrastRatio, flatten } from '../src/player/contrast.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
const language = read('src/buttons.css')

const document_ = (css: string, html: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}\n${language}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

// What a view paints in the primary fill, read back from the engine rather than from the
// stylesheet. The fill itself is found with a probe: a bare span told to take
// `var(--byd-primary-bg)` on this very surface. That probe is the control case — if the surface
// binds no such token the probe comes back transparent and the measurement throws, so this can
// never quietly pass by matching nothing.
//
// A view can hold more than one surface: once the table has ended, the survey stands beside the
// room rather than inside it (UX-38, #83), so `root` names every root the view is spoken in, and
// each of them is probed and read on its own. Only the outermost count — a root inside a root is
// already being read, and reading it again would name its buttons twice.
const wearingThePrimary = (root: string) => (page: Page) =>
  page.evaluate((selector) => {
    const surfaces = [...document.querySelectorAll(selector)].filter((el) => el.parentElement?.closest(selector) === null)
    if (surfaces.length === 0) throw new Error(`no ${selector} in this view`)
    return surfaces.flatMap((surface) => {
      const probe = surface.appendChild(document.createElement('span'))
      probe.style.backgroundColor = 'var(--byd-primary-bg)'
      const fill = getComputedStyle(probe).backgroundColor
      probe.remove()
      if (fill === 'rgba(0, 0, 0, 0)') throw new Error(`${surface.className} binds no --byd-primary-bg`)
      return [...surface.querySelectorAll<HTMLElement>('button, a[href], label, [role="tab"], [role="option"]')]
        .filter((el) => el.checkVisibility())
        .filter((el) => getComputedStyle(el).backgroundColor === fill)
        .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40))
    })
  }, root)

// What is chosen, drawn as a fill. The tool had five different answers to "this one is on" and one
// of them reached into another surface's palette — the table filter's chip was `#7dd3a0`, the
// account's green, in the middle of the editor. B makes all of them one shape: a quiet pill with a
// 3 px bar under it, never a fill, so a thing that is on can never be read as the thing to press.
// Anything still painted in a colour of its own comes back here by name.
const CHOSEN = '[aria-pressed="true"], [aria-selected="true"], [aria-checked="true"]'
const chosenAndFilled = (root: string) => (page: Page) =>
  page.evaluate(
    ([selector, chosen]) => {
      const surface = document.querySelector(selector!)
      if (!surface) throw new Error(`no ${selector} in this view`)
      return [...surface.querySelectorAll<HTMLElement>(chosen!)]
        .filter((el) => el.checkVisibility() && /^(BUTTON|A|LABEL)$/.test(el.tagName))
        .filter((el) => !/,\s*0\)$/.test(getComputedStyle(el).backgroundColor))
        .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40))
    },
    [root, CHOSEN] as const,
  )

let run: Running
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true })
})
afterEach(async () => {
  await run.stop()
})

// The editor's project, with a column worth filtering on. The table only offers chips for a column
// whose values repeat, and the chip is the one place in the editor that was painted in another
// surface's green — so a fixture without one would leave that measurement matching nothing.
const worthFiltering = () => ({
  ...projectDoc(),
  rows: [
    { id: 'dragon', fields: { typ: 'varelse', title: 'Drake', body: 'Flygande.', antal: 2 } },
    { id: 'knight', fields: { typ: 'varelse', title: 'Riddare', body: 'Sköld 1.', antal: 1 } },
    { id: 'trap', fields: { typ: 'fälla', title: 'Grop', body: 'Dolt kort.', antal: 1 } },
    { id: 'wizard', fields: { typ: 'fälla', title: 'Trollkarl', body: 'Dra ett kort.', antal: 1 } },
  ],
})

async function inChromium<T>(css: string, width: number, views: Record<string, string>, read_: (page: Page) => Promise<T>): Promise<Record<string, T>> {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  try {
    const out: Record<string, T> = {}
    for (const [name, html] of Object.entries(views)) {
      await page.setContent(document_(css, html), { waitUntil: 'load' })
      out[name] = await read_(page)
    }
    return out
  } finally {
    await page.close()
  }
}

// The seat picker, with a seat picked and a name typed — the state the three buttons under it
// are all live in, which is the only state in which what they are drawn in can be compared.
async function joinViews(): Promise<Record<string, string>> {
  const session = await createSession(run, 's1', undefined, twoSeatSetup())
  const table = TableClient.connect(await asTable(run, session))
  await table.ready()
  history.replaceState(null, '', `/join?code=${roomOf(session).code}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<JoinPage />)
  await screen.findByRole('button', { name: /Sätt dig/ })
  // How the page opens. The next free seat is chosen for you (`chosen` falls back to `free[0]`),
  // but no name has been typed, so all three ways on are still refused — and this is the state
  // anybody arriving at a table sees first. Nothing measured it: the walk below picked a seat and
  // typed a name before it looked at anything.
  const out: Record<string, string> = { 'innan namnet är skrivet': container.innerHTML }
  fireEvent.click(screen.getByRole('button', { name: /Plats A/ }))
  fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Bo' } })
  out['sätt dig vid bordet'] = container.innerHTML
  unmount()
  table.close()
  return out
}

describe('the seat picker', () => {
  it('wears the primary fill on nothing but the action that seats you', async () => {
    const measured = await inChromium(read('src/join/join.css'), 390, await joinViews(), wearingThePrimary('.byd-join'))
    expect(measured).toEqual({ 'innan namnet är skrivet': [], 'sätt dig vid bordet': ['Sätt dig'] })
  }, 90_000)

  // Refused is a state of a role, not a role of its own, and the page opens in it. `.byd-join form
  // button:disabled` is (0,2,2) and beats the role at (0,2,0) on fill and ink but not on the line,
  // so the first action came out a grey pill inside a green ring — half of one shape and half of
  // another — and the two outlined ways on came out *filled* while refused and outlined once
  // allowed, which is the wrong way round in the only state a reader can compare them in.
  it('says "not yet" without half-changing the shape it says it in', async () => {
    const measured = await inChromium(read('src/join/join.css'), 390, await joinViews(), (page) =>
      page.evaluate(() => {
        const surface = document.querySelector('.byd-join')!
        const probe = surface.appendChild(document.createElement('span'))
        probe.style.cssText = 'color: var(--byd-secondary-line)'
        const line = getComputedStyle(probe).color
        probe.remove()
        const drawn = (el: Element) => {
          const style = getComputedStyle(el)
          return `${style.backgroundColor} inside ${style.borderTopWidth} of ${style.borderTopColor}`
        }
        const refused = [...surface.querySelectorAll<HTMLButtonElement>('form button')].filter((el) => el.disabled)
        const first = surface.querySelector('.byd-primary')!
        const both = getComputedStyle(first)
        return {
          refused: refused.length,
          // One colour, whatever colour the surface says "not yet" in: a line of its own round a
          // fill of another is the state applied to one half of the button.
          oneShape: both.backgroundColor === both.borderTopColor,
          ways: [...surface.querySelectorAll('.byd-secondary')].map(drawn),
          outlined: `rgba(0, 0, 0, 0) inside 1px of ${line}`,
        }
      }),
    )
    const opening = measured['innan namnet är skrivet']!
    expect(opening.refused).toBe(3)
    expect(opening.oneShape).toBe(true)
    expect(opening.ways).toEqual([opening.outlined, opening.outlined])
  }, 90_000)

  // There are two ways on from this page that are not the first one — playing on this screen, and
  // only watching — and one language means they look like each other. A dark pill beside an
  // outline is two answers to one question, which is the fault the whole issue is about, at one
  // remove.
  it('draws both ways on that are not the first one the same', async () => {
    const measured = await inChromium(read('src/join/join.css'), 390, await joinViews(), (page) =>
      page.$$eval('.byd-join-online, .byd-join-observe', (els) =>
        els.map((el) => {
          const drawn = getComputedStyle(el)
          return `${drawn.backgroundColor} inside ${drawn.borderTopWidth} of ${drawn.borderTopColor}, ${drawn.color}`
        }),
      ),
    )
    const [screenHere, watching] = measured['sätt dig vid bordet']!
    expect(screenHere).toBe(watching)
  }, 90_000)
})

// The way in, in both its shapes: the login card for whoever is not signed in, and the games for
// whoever is. The games are opened by pressing a card, so that view has no filled button at all —
// which is a statement about the page and not an omission, and is written out as one.
async function accountViews(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
  const card = render(<HomePage />)
  await screen.findByLabelText('E-post')
  out['inloggningskortet'] = `<div class="byd-account">${card.container.innerHTML}</div>`
  card.unmount()

  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com', next: '/' }) })
  await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
  const games = render(<HomePage />)
  await screen.findByText('Mina spel')
  await screen.findByRole('button', { name: /^Fler val/ })
  out['mina spel'] = `<div class="byd-account byd-account-wide">${games.container.innerHTML}</div>`
  games.unmount()
  return out
}

describe('the way in', () => {
  it('wears the primary fill on nothing but the action that signs you in', async () => {
    const measured = await inChromium(read('src/account/account.css'), 390, await accountViews(), wearingThePrimary('.byd-account'))
    expect(measured).toEqual({ inloggningskortet: ['Skicka inloggningslänk'], 'mina spel': [] })
  }, 90_000)
})

// The guided start, at the width it is worked at (L12). Every step the wizard has at that width,
// because the one action that finishes it has to be the only filled thing on each of them.
async function wizardViews(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', '/new')
  const { unmount } = render(<NewProjectPage />)
  try {
    await screen.findByText(/Ge spelet en flygande start/)
    const steps = () => [...document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Steg"] [role="tab"]')]
    if (steps().length === 0) return { 'hela sidan': document.querySelector('.byd-wizard')!.outerHTML }
    const out: Record<string, string> = {}
    for (let i = 0; i < steps().length; i++) {
      const step = steps()[i]!
      fireEvent.click(step)
      out[step.textContent?.trim() ?? String(i)] = document.querySelector('.byd-wizard')!.outerHTML
    }
    return out
  } finally {
    unmount()
  }
}

describe('the guided start', () => {
  it('wears the primary fill on nothing but the action that finishes it', async () => {
    const measured = await inChromium(read('src/wizard/wizard.css'), 1280, await wizardViews(1280), wearingThePrimary('.byd-wizard'))
    expect(measured).toEqual({ 'hela sidan': ['Skapa spelet och fortsätt i editorn →'] })
  }, 90_000)
})

// Every mode the editor can be showing at the desk, and the two doors inside them that have to be
// held open to be seen at all. Named here so that a walk which finds nothing fails instead of
// agreeing with itself.
const EDITOR_VIEWS = ['Bord', 'Kortvägg', 'Mall', 'Mall, ikonbiblioteket öppet', 'Regler', 'Symboler', 'Tabell', 'Tabell, ett nytt fält på väg', 'Tabell, filtrerad'] as const

// Whichever mode is open, the blue button that puts the work on the table is the only filled thing
// in the room.
async function editorViews(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  try {
    await screen.findByText('Skogens herrar')
    const out: Record<string, string> = {}
    const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Editorlägen"] [role="tab"]')]
    for (let i = 0; i < tabs().length; i++) {
      const tab = tabs()[i]!
      fireEvent.click(tab)
      out[tab.textContent?.trim() ?? String(i)] = document.querySelector('.byd-editor')!.outerHTML
      // The table's filter chips are only ever on when somebody has turned one on, so the walk
      // would otherwise never see the one place in the editor painted in the account's green. The
      // project below carries a column worth filtering on for exactly this reason, and a missing
      // chip is an error rather than a view quietly skipped.
      if (tab.textContent?.trim() === 'Tabell') {
        const chip = document.querySelector<HTMLElement>('.byd-data-chip')
        if (!chip) throw new Error('the table offers no filter chip, so nothing here measures one')
        fireEvent.click(chip)
        out['Tabell, filtrerad'] = document.querySelector('.byd-editor')!.outerHTML
        fireEvent.click(chip)
        // A column is made in a form that only exists while its door is held open, which is how
        // the same walk could reach every checkbox in the editor and still miss the three radios
        // inside this one (L11, #50). The door is held open here for the same reason.
        fireEvent.click(screen.getByRole('button', { name: 'Kolumner' }))
        if (!document.querySelector('.byd-newfield')) throw new Error('the table never opened the form that makes a column')
        out['Tabell, ett nytt fält på väg'] = document.querySelector('.byd-editor')!.outerHTML
        fireEvent.keyDown(document.querySelector('.byd-newfield')!, { key: 'Escape' })
      }
      // The symbol library is a door too: the rail's Ikon tool opens it, and until it is open
      // nothing in the walk has ever seen an option of it drawn.
      if (tab.textContent?.trim() === 'Mall') {
        fireEvent.click(screen.getByRole('button', { name: /Ikon$/ }))
        if (!document.querySelector('.byd-symbol-list [role="option"][aria-selected="true"]')) throw new Error('the rail never opened the symbol library')
        out['Mall, ikonbiblioteket öppet'] = document.querySelector('.byd-editor')!.outerHTML
        fireEvent.click(screen.getByRole('button', { name: /Ikon$/ }))
      }
    }
    return out
  } finally {
    unmount()
  }
}

// The phone. The survey is the screen where the seat is asked something and then moved on, so it
// is the one that has both a set of choices and a first action standing in the same view.
//
// The page is mounted at its route rather than the two components being wrapped in a hand-written
// `<div class="byd-player">`. A wrapper written here is a claim about what the route is called,
// and a claim is exactly the thing this file exists not to make: the same two overlays open on
// `/online` and `/observe` under class names of their own, and a hand-written `.byd-player` round
// them said they were fine there while a browser was drawing its own grey button.
async function playerViews(): Promise<Record<string, string>> {
  atWidth(390)
  const id = await createSession(run, 'phone', undefined, twoSeatSetup())
  const host = TableClient.connect(await asTable(run, id))
  await host.ready()
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/play?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<PlayerPage />)
  try {
    const out: Record<string, string> = {}
    // The way out is one of the three controls every seat has, and the sheet behind it is what
    // the page looks like while it is being asked (#31).
    fireEvent.click(await screen.findByRole('button', { name: /Ut…/ }))
    await screen.findByRole('button', { name: 'Lämna bordet' })
    out['vägen ut'] = container.innerHTML
    fireEvent.click(screen.getByRole('button', { name: 'Stanna kvar' }))

    // The survey stands beside the room, not in it (UX-38, #83), so the view is the whole mount.
    await host.send({ v: 'session.end' })
    await screen.findByRole('button', { name: 'Nästa' })
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    out['enkäten'] = container.innerHTML
    return out
  } finally {
    unmount()
    host.close()
  }
}

describe('the phone', () => {
  it('wears the primary fill on nothing but the action that moves the seat on', async () => {
    const css = `${read('src/player/player.css')}\n${read('src/table/keyboard.css')}\n${read('src/rules/rules.css')}`
    const measured = await inChromium(css, 390, await playerViews(), wearingThePrimary('.byd-player, .byd-survey'))
    // Leaving your seat and ending everyone's table are deliberately not a first action (#31).
    expect(measured).toEqual({ enkäten: ['Nästa'], 'vägen ut': [] })
  }, 90_000)
})

// The same overlays again, in the other two rooms they open in. `SessionOverlays` is mounted by
// `/online` as well as by the phone, and `/observe` mounts the survey on its own — and neither of
// those two routes is called `.byd-player`. A wrapper written by hand round the component measures
// a class name two of the three routes do not have, so both pages are mounted here for real, at
// the end of a session, which is the state that raises the survey.
//
// Every sheet each route ships with, the way its own suite loads them.
const ONLINE_CSS = ['src/table/table.css', 'src/table/texture.css', 'src/player/player.css', 'src/online/online.css', 'src/table/keyboard.css', 'src/status/status.css', 'src/a11y.css'].map(read).join('\n')

async function onlineView(): Promise<Record<string, string>> {
  atWidth(390)
  const id = await createSession(run, 'online', undefined, twoSeatSetup())
  const host = TableClient.connect(await asTable(run, id))
  await host.ready()
  const token = await admit(run, id, 'A', 'Ada')
  history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${token}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<OnlinePage />)
  // The whole mount: the survey stands beside the room once the table has ended (UX-38, #83).
  const room = () => container.innerHTML
  try {
    await waitFor(() => expect(document.querySelector('.byd-online')).toBeTruthy())
    const out: Record<string, string> = {}
    // Somebody else wants the table put back, which is the other overlay this route opens: a
    // question with one answer that is the first action and one that is not (B, C).
    const bo = TableClient.connect(await asSeat(run, id, 'B'))
    await bo.ready()
    await bo.send({ v: 'seat.claim', seat: 'B', name: 'Bo' }, { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    await bo.send({ v: 'rewind.propose', toSeq: 1 })
    await screen.findByRole('button', { name: 'Godkänn' })
    out['frågan om att spola tillbaka'] = room()
    fireEvent.click(screen.getByRole('button', { name: 'Neka' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Godkänn' })).toBeNull())
    bo.close()

    await host.send({ v: 'session.end' })
    await screen.findByRole('button', { name: 'Nästa' })
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    out['enkäten på storbilden'] = room()
    return out
  } finally {
    unmount()
    host.close()
  }
}

describe('the seat that plays on the table screen', () => {
  it('wears the primary fill on nothing but the action that moves the seat on', async () => {
    const measured = await inChromium(ONLINE_CSS, 390, await onlineView(), wearingThePrimary('.byd-online, .byd-survey'))
    expect(measured).toEqual({ 'frågan om att spola tillbaka': ['Godkänn'], 'enkäten på storbilden': ['Nästa'] })
  }, 90_000)
})

// The table screen itself (#67). The felt was not one of L13's rooms — nothing that drew a table
// bound the six tokens — so the first button ever laid on it, the one that keeps a counter's new
// value, would have fallen back to the browser's own grey: not a quiet button but no declaration
// at all. The ring's own buttons speak their own dialect in `table.css` and are measured here
// too, as the control: a room with a ring open and nothing else wears the primary on nothing.
const TABLE_CSS = ['src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css', 'src/rules/rules.css', 'src/status/status.css', 'src/a11y.css'].map(read).join('\n')

async function tableViews(): Promise<Record<string, string>> {
  atWidth(1280)
  const id = await createSession(run, 'felt', undefined, seatSetup())
  history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=table&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<TablePage />)
  try {
    const out: Record<string, string> = {}
    const chip = await screen.findByRole('button', { name: /^Liv, räknare i Räknare A/ })
    // The hand's door: a click that never became a drag opens the ring (K14).
    fireEvent.pointerDown(chip, { clientX: 640, clientY: 400, pointerId: 1, isPrimary: true, button: 0 })
    fireEvent.pointerUp(chip, { clientX: 640, clientY: 400, pointerId: 1, isPrimary: true, button: 0 })
    await screen.findByRole('button', { name: 'Sätt värde…' })
    out['ringen på en bricka'] = container.innerHTML
    fireEvent.keyDown(window, { key: 'Escape' })
    // The keyboard's door to the same sheet (K16).
    chip.focus()
    fireEvent.keyDown(chip, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: /^Sätt värde…/ }))
    await screen.findByRole('dialog', { name: 'Sätt värde för Liv' })
    out['sätt värde'] = container.innerHTML
    return out
  } finally {
    unmount()
  }
}

describe('the table screen', () => {
  it('wears the primary fill on nothing but the action that keeps the value said', async () => {
    const measured = await inChromium(TABLE_CSS, 1280, await tableViews(), wearingThePrimary('.byd-table'))
    expect(measured).toEqual({ 'ringen på en bricka': [], 'sätt värde': ['Sätt värdet'] })
  }, 90_000)
})

// ── The felt as a room of its own (L13, K9, #90) ──────────────────────────────────────────────
//
// Every measurement above asks which element wears which role. These ask the other question, the
// one the felt is the first surface to make hard: whether the colour a role is drawn in can be
// SEEN where that role lands. On the four earlier surfaces the ground is a flat token and
// `button-language-contrast.test.ts` reads it out of the stylesheet. The felt has no such token:
// the green is a `radial-gradient`, the dark beyond the rim is another, the wooden rim is a
// `linear-gradient`, a card face is `hsl(var(--hue) 40% 86%)`, and the ring's own plate is a disc
// laid over whichever of those it happened to open on. A walk up the ancestor chain finds
// `rgba(0, 0, 0, 0)` at every step and measures a colour nothing is wearing — so these read the
// ground out of the pixels the browser painted (`painted.ts`).
//
// And they measure in TABLE mode, which is the mode that tells the truth. The prototype's finding
// is that the felt in TV mode is `#151924`, a dark like any other dark, on which the language's
// shared `#6f7a90` line measures 4.06:1 and passes; on the green it is 1.60:1 and invisible. A
// gate measured only on the television therefore waves a wrong binding through.
//
// `unavailable` is the one gate that is not L13's. A disc that cannot be pressed is exempt from
// the contrast minimum in WCAG 1.4.3, and that exemption is the licence `opacity: 0.35` was
// taking. The felt does not take it. A ring is read at three metres (K9) and it is read *as a
// list*: a player who cannot make out the verb that is greyed cannot tell which verb is the one
// they are not being offered, and a ring with an unreadable hole in it is worse than one with a
// weak word in it. So an unavailable disc keeps a gate — 3:1, the number the language already
// uses for everything that must be *seen* rather than read word by word, rather than the 4.5:1 it
// would carry if it were available. The distance from 3:1 to the 14:1 the same word reads at when
// it can be pressed is what says it cannot be.
const GATE = { text: 4.5, line: 3, bar: 3, unavailable: 3 } as const

// A colour over a ground, as the eye gets it. A ground is three shades and not one — a gradient
// is not a colour — so what is reported is the weakest of the three: the felt's chalk passes at
// 5.97:1 in the middle of the green and the prototype caught it at 4.37:1 on the felt's lightest
// patch, and a reading that only ever looked at the middle would have called that fine.
const worstOn = (colour: string, ground: Ground) => Math.min(...ground.shades.map((shade) => contrastRatio(flatten([shade, colour]), shade)))
// A label stands on its button's own plate, and the plate stands on the ground: a translucent
// plate lets the ground through to the letter, so the two are composited in that order.
const worstOnPlate = (ink: string, plate: string, ground: Ground) =>
  Math.min(
    ...ground.shades.map((shade) => {
      const over = flatten([shade, plate])
      return contrastRatio(flatten([over, ink]), over)
    }),
  )
const reading = (what: string, ratio: number, gate: number) => `${what}: ${ratio.toFixed(2)}:1 mot ${gate}:1 ${ratio >= gate ? '✓' : '✗'}`
const failed = (line: string) => line.endsWith('✗')
// An edge may be made of more than one line — a pale one with a dark one laid just outside it —
// and the boundary is legible when the ground can see either. No single colour can hold 3:1
// against both a near-black surround and a pale card face, and the ring lands on both.
const bestLine = (lines: string[], ground: Ground) => (lines.length === 0 ? 0 : Math.max(...lines.map((line) => worstOn(line, ground))))

// Nothing in the product paints a button on the green today — the counter sheet's two stand on
// the sheet's own dark, which is why #67 could bind the felt to the account's green and nobody
// saw it. #90 is the question of the button that is coming, so the three roles are laid on the
// felt with a probe: three real buttons carrying nothing but the language's three class names,
// declaring no colour of their own, so what they wear is whatever the room binds. It is the same
// trick `wearingThePrimary` uses at the top of this file for the opposite purpose — a probe is
// how one asks a surface what it has bound.
//
// The reset below is an attribute and a type, (0,1,1); a room and a role are two classes, (0,2,0),
// and win. So a probe that came out drawn in the reset's own transparent would mean the room binds
// nothing, and every ratio under it would fail rather than quietly pass.
const PROBE = `
  [data-probe] { position: fixed; z-index: 8; display: flex; flex-direction: column; gap: 8px; width: 140px; }
  [data-probe] button { box-sizing: border-box; min-height: 44px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: inherit; font: 700 14px system-ui, sans-serif; }
`
const FELT_CSS = `${TABLE_CSS}\n${PROBE}`

// Everything that lies on the felt rather than being it. The ground is the felt where none of
// these is covering it; without the list the green would be sampled through a card.
const ON_THE_FELT = '.byd-card, .byd-pile, .byd-token, .byd-hand, .byd-seat-name, .byd-table-plate, .byd-radial, .byd-set-value, .byd-inspect, [data-probe]'
// And everything laid over the whole screen rather than over the felt: an open ring, an open
// sheet, a card held up, and this file's own probe.
const OVER_IT_ALL = '.byd-radial, .byd-set-value, .byd-inspect, [data-probe]'

// Every ground the felt can put under a button, in the mode named. A ring opens where the finger
// let go, so one disc lands on the felt's green, the next reaches the wooden rim, the next the
// dark beyond it — and a card's own ring opens, by definition, on a card. No single flat colour
// holds 3:1 against both the last two: a line pale enough to be seen on a near-black surround
// disappears on a pale card face, and the other way round.
// `face` names which card face is the pale ground. It is the first face-up card by default, and
// the *other* one where a ring has been opened on a card: the pad at the ring's centre is 92 px
// across and a card on a table screen is narrower than that, so a ring opened on a card covers
// the whole of it, and the ground has to be a face nothing is lying on.
const groundsOf = (mode: 'table' | 'tv', face = ".byd-card:not([data-face='back'])"): readonly Spot[] => [
  { what: 'filten', inside: '[data-table]', avoid: ON_THE_FELT },
  // The rim is the felt's parent minus the felt. On a television there is no rim: the felt is a
  // flat panel and `.byd-table-wood` loses its padding, so the strip would be empty and the
  // sampler would rightly refuse to call nothing a ground.
  ...(mode === 'table' ? [{ what: 'träramen', inside: '.byd-table-wood', outside: '[data-table]', inset: 0, avoid: ON_THE_FELT }] : []),
  { what: 'det mörka omlandet', inside: '.byd-table-frame', outside: '.byd-table-wood', inset: 0, avoid: ON_THE_FELT },
  { what: 'ett kortansikte', inside: face, avoid: OVER_IT_ALL },
]

// The ring's discs. They keep their plate — the prototype drew them as the language's outlined
// form and measured a disc over a card face at 1.22:1, so an opaque plate is what makes a disc
// legible anywhere on the felt — and the plate is a flat colour, so the honest reading of it is
// the declaration composited over the ground it was laid on. What the pixels are needed for is
// what is UNDER it, and what is beside the edge.
const theRingsDiscs = (mode: 'table' | 'tv') => async (page: Page): Promise<string[]> => {
  const grounds = await painted(page, groundsOf(mode))
  const drawn = await drawnAs(page, { skiva: '.byd-radial button:not(:disabled)' })
  const disc = drawn['skiva']!
  return Object.entries(grounds).flatMap(([what, ground]) => [
    reading(`skivans text på sin egen platta över ${what}`, worstOnPlate(disc.ink, disc.plate, ground), GATE.text),
    reading(`skivans kant mot ${what}`, bestLine(disc.lines, ground), GATE.line),
  ])
}

// A card's ring, put where a card's ring is. The ring opens where the finger let go, and the
// finger let go in jsdom, which has no layout — so the coordinates the mounted HTML carries mean
// nothing in the browser these pixels are read in. The ring is moved onto the card it belongs to
// (its `data-radial` is the card's own id), and the card is marked so the *other* face-up card is
// what the pale ground is read from.
//
// It also lays out the patch the centre pad covers of that card, as a box for the sampler to read
// the painted pixels out of: the pad is 92 px across and centred on the ring, so what is measured
// is the intersection of that circle's box with the card — minus the card's own name, which is
// written in the very ink this is about to measure, and a letter is not a ground.
const openTheRingOnACard = (page: Page) =>
  page.evaluate(() => {
    const ring = document.querySelector<HTMLElement>('.byd-radial')
    const id = ring?.getAttribute('data-radial')
    const card = id ? document.querySelector<HTMLElement>(`.byd-card[data-component="${id}"]`) : null
    if (!ring || !card) throw new Error('no ring on a card in this view, so nothing here measures one')
    card.setAttribute('data-ringed', '')
    const box = card.getBoundingClientRect()
    const [cx, cy] = [box.left + box.width / 2, box.top + box.height / 2]
    const was = ring.getBoundingClientRect()
    ring.style.transform = `translate(${cx - was.left}px, ${cy - was.top}px)`
    const PAD = 92
    const name = card.querySelector('span')?.getBoundingClientRect()
    const patch = {
      left: Math.max(cx - PAD / 2, box.left + 2),
      right: Math.min(cx + PAD / 2, box.right - 2),
      top: Math.max(cy - PAD / 2, box.top + 2, name ? name.bottom + 2 : 0),
      bottom: Math.min(cy + PAD / 2, box.bottom - 2),
    }
    const [w, h] = [patch.right - patch.left, patch.bottom - patch.top]
    if (w < 16 || h < 16) throw new Error(`the ring's centre covers ${Math.round(w)}×${Math.round(h)} px of the card; that is not a patch`)
    const probe = document.body.appendChild(document.createElement('i'))
    probe.setAttribute('data-pad', '')
    Object.assign(probe.style, { position: 'fixed', background: 'transparent', pointerEvents: 'none', left: `${patch.left}px`, top: `${patch.top}px`, width: `${w}px`, height: `${h}px` })
    // The probe paints nothing — it is a rectangle to read pixels out of — but it is only that
    // rectangle if it landed where it was put, and a transformed ancestor is enough to move a
    // fixed box somewhere else entirely.
    const got = probe.getBoundingClientRect()
    if (Math.abs(got.left - patch.left) > 1 || Math.abs(got.top - patch.top) > 1) throw new Error(`the patch was put at ${Math.round(patch.left)},${Math.round(patch.top)} and landed at ${Math.round(got.left)},${Math.round(got.top)}`)
    return { bredd: Math.round(w), höjd: Math.round(h) }
  })

// The two things only a card's ring has: a verb that is not available — `Avslöja`, on a card that
// is already face up — and a centre with no hub under it, lying on the card the ring is about.
const theCardsRing = (mode: 'table' | 'tv') => async (page: Page): Promise<string[]> => {
  const patch = await openTheRingOnACard(page)
  const CENTRE = 'kortet under ringens mitt'
  const grounds = await painted(page, [
    ...groundsOf(mode, ".byd-card:not([data-face='back']):not([data-ringed])"),
    { what: CENTRE, inside: '[data-pad]', inset: 0.05 },
  ])
  const drawn = await drawnAs(page, { 'otillgänglig skiva': '.byd-radial button:disabled', kortets: '.byd-card[data-ringed] span' })
  const off = drawn['otillgänglig skiva']!
  const centre = grounds[CENTRE]!
  return [
    ...Object.entries(grounds)
      .filter(([what]) => what !== CENTRE)
      .flatMap(([what, ground]) => [
        reading(`den otillgängliga skivans text på sin egen platta över ${what}`, worstOnPlate(off.ink, off.plate, ground), GATE.unavailable),
        reading(`den otillgängliga skivans kant mot ${what}`, bestLine(off.lines, ground), GATE.unavailable),
      ]),
    reading(`kortets eget bläck genom ringens mitt (${patch.bredd}×${patch.höjd} px, ${centre.points} punkter)`, worstOn(drawn['kortets']!.ink, centre), GATE.text),
  ]
}

const layTheRolesOnTheFelt = (page: Page) =>
  page.evaluate(() => {
    const felt = document.querySelector('[data-table]')
    const room = document.querySelector('.byd-table')
    if (!felt || !room) throw new Error('no felt in this view, so nothing here measures the green')
    const box = felt.getBoundingClientRect()
    const probe = document.createElement('div')
    probe.setAttribute('data-probe', 'roller')
    probe.style.left = `${box.left + box.width / 2 - 70}px`
    probe.style.top = `${box.top + box.height / 2 - 70}px`
    probe.innerHTML = `
      <button type="button" class="byd-primary">Dela ut</button>
      <button type="button" class="byd-secondary">Blanda</button>
      <button type="button" class="byd-choice" aria-pressed="true">Visa värden</button>`
    room.appendChild(probe)
  })

// The three roles, read where they land. The first action's label sits on the first action's own
// fill, so that pair travels with the button; its line is the fill's own colour, which is what
// says where the button ends and is therefore read against the ground. The other two are drawn on
// nothing at all, so their ink, their line and their bar are all read against the ground.
async function rolesOnTheFelt(page: Page): Promise<string[]> {
  await layTheRolesOnTheFelt(page)
  const ground = await painted(page, [{ what: 'filten', inside: '[data-table]', avoid: ON_THE_FELT }])
  const drawn = await drawnAs(page, { primar: '[data-probe] .byd-primary', sekundar: '[data-probe] .byd-secondary', valt: '[data-probe] .byd-choice' })
  const felt = ground['filten']!
  const [primar, sekundar, valt] = [drawn['primar']!, drawn['sekundar']!, drawn['valt']!]
  return [
    reading('första handlingens bläck på sin egen fyllning', worstOnPlate(primar.ink, primar.plate, felt), GATE.text),
    reading('första handlingens fyllning och linje mot filten', bestLine([primar.plate, ...primar.lines], felt), GATE.line),
    reading('andra handlingens bläck mot filten', worstOn(sekundar.ink, felt), GATE.text),
    reading('andra handlingens linje mot filten', bestLine(sekundar.lines, felt), GATE.line),
    reading('valt-bläcket mot filten', worstOn(valt.ink, felt), GATE.text),
    reading('valt-stapeln mot filten', worstOn(valt.bar ?? 'rgba(0, 0, 0, 0)', felt), GATE.bar),
  ]
}

// A table with one card lying face up on the felt. Every card in the standard fixture starts in
// the draw pile with its back showing, and a back is a dark blue stripe — but a card's own ring
// opens *on a card*, by definition, and a face is the palest thing the felt ever carries
// (`hsl(<hue> 40% 86%)`). Without one on the table the ring would only ever be measured where it
// is easy.
//
// `cards: 2` lays a second one out at the other end of the felt, for the view where a ring is
// opened on a card: the ring covers the card it opened on, so the pale ground has to be read off
// a face nothing is lying on. The two are far enough apart that no disc of the one reaches the
// other — and if they were not, the sampler would refuse to call what is left a ground.
function feltSetup(cards: 1 | 2 = 1): SetupDef {
  const base = seatSetup()
  const [first, second, ...rest] = base.components
  const onTheFelt = (c: SetupDef['components'][number], x: number, y: number): SetupDef['components'][number] => ({ ...c, zone: 'table', face: 'front', x, y })
  // The second lies well inside the green, because the ring that opens on it has to open on a
  // card that is actually on the felt; the first keeps the place it has had since this suite was
  // written, out past the rim, where it is nothing but a pale face to measure against.
  return { ...base, components: cards === 1 ? [onTheFelt(first!, -160, -40), second!, ...rest] : [onTheFelt(first!, -160, -40), onTheFelt(second!, 450, 120), ...rest] }
}

// The felt with a ring open on a chip, in the mode named. `mode=table` is the one the gates are
// read in; the television is measured beside it because the decision turns on the two disagreeing.
async function feltView(mode: 'table' | 'tv', width = 1280): Promise<Record<string, string>> {
  atWidth(width)
  const id = await createSession(run, `felt-${mode}-${width}`, undefined, feltSetup())
  history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=${mode}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<TablePage />)
  try {
    const chip = await screen.findByRole('button', { name: /^Liv, räknare i Räknare A/ })
    fireEvent.pointerDown(chip, { clientX: 640, clientY: 420, pointerId: 1, isPrimary: true, button: 0 })
    fireEvent.pointerUp(chip, { clientX: 640, clientY: 420, pointerId: 1, isPrimary: true, button: 0 })
    await screen.findByRole('button', { name: 'Sätt värde…' })
    return { [mode === 'table' ? 'bordsläge' : 'tv-läge']: container.innerHTML }
  } finally {
    unmount()
  }
}

// The felt with a ring open on a card, in the mode named. This is the ring's normal case — a
// card's ring opens *on a card* — and it is the only view that has the two things a chip's ring
// hides: a verb that is not available (`Avslöja`, on a card that is already face up, the one
// entry of the four whose `run` is null) and a centre with no hub in it, lying on the card the
// player is choosing a verb for.
async function feltCardView(mode: 'table' | 'tv', width = 1280): Promise<Record<string, string>> {
  atWidth(width)
  const id = await createSession(run, `felt-card-${mode}-${width}`, undefined, feltSetup(2))
  history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=${mode}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<TablePage />)
  try {
    const cards = await waitFor(() => {
      const found = [...container.querySelectorAll<HTMLElement>(".byd-card[data-face='front']")]
      if (found.length < 2) throw new Error(`${found.length} face-up cards on the felt, so the ring has no card of its own`)
      return found
    })
    const card = cards[1]!
    fireEvent.pointerDown(card, { clientX: 640, clientY: 420, pointerId: 1, isPrimary: true, button: 0 })
    fireEvent.pointerUp(card, { clientX: 640, clientY: 420, pointerId: 1, isPrimary: true, button: 0 })
    const reveal = await screen.findByRole('button', { name: 'Avslöja' })
    // The disabled disc is the subject, so a view that came back with it live would be measuring
    // the wrong button and passing.
    if (!(reveal as HTMLButtonElement).disabled) throw new Error('`Avslöja` is live on a card that is already face up, so this view has no unavailable disc')
    return { [mode === 'table' ? 'bordsläge' : 'tv-läge']: container.innerHTML }
  } finally {
    unmount()
  }
}

// Which colours the felt hands its three roles, asked of the felt and not of a hex written down
// here. Two things on the felt already carry the answer: the chip — a counter's disc, read at
// three metres (K9) — wears the amber and its ink, and a pile's count is written in the chalk.
// All four are flat declarations, so a computed style is the honest reading for them; nothing
// about them is a gradient.
const whatTheFeltAlreadyCarries = async (page: Page) => {
  await layTheRolesOnTheFelt(page)
  const drawn = await drawnAs(page, {
    bricka: '.byd-token',
    'högens antal': '.byd-pile-count',
    primar: '[data-probe] .byd-primary',
    sekundar: '[data-probe] .byd-secondary',
    valt: '[data-probe] .byd-choice',
  })
  const [bricka, antal, primar, sekundar, valt] = [drawn['bricka']!, drawn['högens antal']!, drawn['primar']!, drawn['sekundar']!, drawn['valt']!]
  return {
    brickans: `${bricka.plate} / ${bricka.ink}`,
    kritan: antal.ink,
    'första handlingen': `${primar.plate} / ${primar.ink}`,
    // Everything the three roles are drawn in, once each. The felt is allowed two colours and the
    // near-black that rides on the amber; a fourth means a role reached outside the room.
    paletten: [...new Set([primar.plate, primar.ink, ...sekundar.lines, sekundar.ink, valt.ink, valt.bar ?? ''])].sort(),
  }
}

describe('the felt', () => {
  // #67 bound `.byd-table` because it needed one button — the one that keeps a counter's new
  // value — and bound it to the account's green. Six tokens, byte-identical to the phone's. That
  // is not an accent the felt owns; it is the room next door's, borrowed by whoever happened to
  // need it first, which is exactly what #90 was opened to stop. The felt's own accent is the
  // chip's amber, and this asks the page rather than a stylesheet whether it is.
  it('draws its first action in the accent the felt already carries', async () => {
    const measured = await inChromium(FELT_CSS, 1280, await feltView('table'), whatTheFeltAlreadyCarries)
    const felt = measured['bordsläge']!
    expect(felt['första handlingen']).toBe(felt.brickans)
  }, 90_000)

  it('lays its first action on the green in something the green can carry', async () => {
    const measured = await inChromium(FELT_CSS, 1280, await feltView('table'), rolesOnTheFelt)
    const first = measured['bordsläge']!.filter((line) => line.startsWith('första handlingen'))
    expect(first).toHaveLength(2)
    expect(first.filter(failed), first.join('\n')).toEqual([])
  }, 90_000)

  // The language's shared `#6f7a90` is a line drawn for a dark room, and it holds there: 3.86:1
  // on the counter sheet's own dark. On the green it measures 1.64:1 — the same order of number
  // L13 itself called invisible when it described the editor's `#3b414e` and the wizard's
  // `#cbcabe`, both 1.48:1. It goes unnoticed today for exactly one reason: the only second
  // action the felt has, `Avbryt`, stands *inside* the sheet and never on the felt. The first
  // button drawn on the green gives it away.
  it('draws a second action on the green in a line the green can show', async () => {
    const measured = await inChromium(FELT_CSS, 1280, await feltView('table'), rolesOnTheFelt)
    const second = measured['bordsläge']!.filter((line) => line.startsWith('andra handlingen'))
    expect(second).toHaveLength(2)
    expect(second.filter(failed), second.join('\n')).toEqual([])
  }, 90_000)

  // And the third role with them. `Valt` is never a fill — it is a quiet pill with a 3 px bar
  // under it — so the only two colours it has to find are the bar and the word above it, and on
  // this felt both already exist. A room that said its three roles in four colours would be
  // reaching outside itself for one of them, which is the whole fault #67 fell into.
  it('says all three roles in the two colours the felt already owns', async () => {
    const measured = await inChromium(FELT_CSS, 1280, await feltView('table'), whatTheFeltAlreadyCarries)
    const felt = measured['bordsläge']!
    const [amber, ink] = felt.brickans.split(' / ')
    expect(felt.paletten).toEqual([amber!, felt.kritan, ink!].sort())
  }, 90_000)

  // The deviation the prototype found on the way: `table.css` drew the ring's discs with the edge
  // `#3b4358`, which across the whole sweep failed 3:1 against every ground it ever landed on —
  // 72 cases out of 72, between 1.01 and 2.72:1 — so the line that says where a disc ends said
  // nothing anywhere. The text on the disc was never the problem: white on a near-black plate is
  // 17:1 wherever it stands, which is exactly why an opaque plate is what the discs keep.
  it('gives the ring an edge that can be seen on every ground it opens over', async () => {
    const measured = await inChromium(FELT_CSS, 1280, await feltView('table'), theRingsDiscs('table'))
    const ring = measured['bordsläge']!
    expect(ring).toHaveLength(2 * groundsOf('table').length)
    expect(ring.filter(failed), ring.join('\n')).toEqual([])
  }, 90_000)

  // The hub is the middle of the ring, and it was the one part of it that lay flat. Every disc
  // stands off the felt on the same two lines — the near-black that says where it ends and the
  // shadow that lifts it — and `.byd-radial-hub` carried neither, so the thing the ring is *about*
  // read as a hole punched in the felt rather than as its centre. It is not a control and must not
  // become one: it keeps `pointer-events: none` and takes nothing but the lift and the edge.
  it('lifts the ring\'s hub the way it lifts the discs around it', async () => {
    const measured = await inChromium(FELT_CSS, 1280, await feltView('table'), (page) =>
      page.evaluate(() => {
        const lift = (selector: string) => {
          const el = document.querySelector<HTMLElement>(selector)
          if (!el) throw new Error(`no ${selector} in this view`)
          const style = getComputedStyle(el)
          return { shadow: style.boxShadow, presses: style.pointerEvents }
        }
        return { skivan: lift('.byd-radial button:not(:disabled)'), navet: lift('.byd-radial-hub') }
      }),
    )
    const ring = measured['bordsläge']!
    // The same lift, read off the page rather than off a hex written here: whatever a disc is
    // given, the hub in the middle of them is given too.
    expect(ring.navet.shadow).toBe(ring.skivan.shadow)
    // And it is a lift and not nothing: two lines, the second of them blurred off the felt.
    expect(ring.skivan.shadow.split(/,(?![^(]*\))/)).toHaveLength(2)
    expect(/[1-9]\d*px\s+[1-9]\d*px/.test(ring.skivan.shadow)).toBe(true)
    // What it does not take is the affordance: a finger slides over the hub on its way to a verb.
    expect({ skivan: ring.skivan.presses, navet: ring.navet.presses }).toEqual({ skivan: 'auto', navet: 'none' })
  }, 90_000)

  // A verb that is not available was drawn with `opacity: 0.35`, and opacity fades a whole
  // element: the plate, the ink and both lines of the edge together. Over a pale card face — and
  // a card's ring opens on a card — that turns the disc into a muddy smear with no boundary at
  // all, so the one thing it was supposed to say, that this verb is *there* and not to be had,
  // is the one thing it stops saying. What is unavailable about it has to be said by dimming the
  // ink and the fill deliberately, not by rubbing the whole disc out.
  it('keeps a disc that is not available a disc, on every ground it lands on', async () => {
    const measured = await inChromium(FELT_CSS, 1280, await feltCardView('table'), theCardsRing('table'))
    const off = measured['bordsläge']!.filter((line) => line.startsWith('den otillgängliga'))
    expect(off).toHaveLength(2 * groundsOf('table').length)
    expect(off.filter(failed), off.join('\n')).toEqual([])
  }, 90_000)

  // And what the ring has in its middle. A chip's ring puts the hub there, because the felt
  // cannot say what a chip is (#67) — but a card's ring has no hub, and `.byd-radial::before`
  // laid a translucent grey disc over the card anyway. The card a ring was opened on is the one
  // thing that must stay readable while its verbs are being chosen: whatever is drawn at the
  // ring's centre has to let it through.
  it('lets the card under a ring read through the middle of it', async () => {
    const measured = await inChromium(FELT_CSS, 1280, await feltCardView('table'), theCardsRing('table'))
    const centre = measured['bordsläge']!.filter((line) => line.startsWith('kortets eget bläck'))
    expect(centre).toHaveLength(1)
    expect(centre.filter(failed), centre.join('\n')).toEqual([])
  }, 90_000)
})

// The whole thing at once: both modes, both screens, every role and every disc against every
// ground each of them lands on.
//
// The two modes are the point of the sweep and not decoration. On a television the felt is
// `#151924`, a dark like any other dark, and the language's shared `#6f7a90` measures 4.06:1 on
// it and passes; on the green the same line is 1.60:1. So a binding measured only in TV mode goes
// through and is still wrong, and this is the shape of gate that would have caught #67's.
//
// The screens change how much dark the felt stands in and how much of a television the flat panel
// fills — the felt itself keeps the size the renderer gave it, which is what makes the two modes
// comparable at all.
const SWEEP = [
  { what: 'bordsläge på 1280', mode: 'table', width: 1280 },
  { what: 'bordsläge på 1920', mode: 'table', width: 1920 },
  { what: 'tv-läge på 1920', mode: 'tv', width: 1920 },
  { what: 'tv-läge på 3840', mode: 'tv', width: 3840 },
] as const

describe('the felt, swept', () => {
  it('holds its gates on every ground, in both modes and on both screens', async () => {
    const measured: Record<string, string[]> = {}
    for (const { what, mode, width } of SWEEP) {
      const view = await feltView(mode, width)
      const roles = await inChromium(FELT_CSS, width, view, rolesOnTheFelt)
      const ring = await inChromium(FELT_CSS, width, view, theRingsDiscs(mode))
      const onACard = await inChromium(FELT_CSS, width, await feltCardView(mode, width), theCardsRing(mode))
      measured[what] = [...Object.values(roles).flat(), ...Object.values(ring).flat(), ...Object.values(onACard).flat()]
    }
    // Where the sweep went and how much it read, before what it read. Six readings for the three
    // roles wherever they stand, two for a disc on each ground the mode has, two more for a disc
    // that is not available on each of them, and one for the card under the ring's own centre —
    // and a ground the sampler could not find would have thrown rather than quietly shortened
    // this list.
    const counted = Object.fromEntries(Object.entries(measured).map(([what, lines]) => [what, lines.length]))
    expect(counted).toEqual({ 'bordsläge på 1280': 23, 'bordsläge på 1920': 23, 'tv-läge på 1920': 19, 'tv-läge på 3840': 19 })
    const all = Object.entries(measured).flatMap(([what, lines]) => lines.map((line) => `${what} · ${line}`))
    expect(all.filter(failed), all.join('\n')).toEqual([])
  }, 300_000)
})

const OBSERVER_CSS = ['src/table/table.css', 'src/table/texture.css', 'src/player/player.css', 'src/status/status.css', 'src/a11y.css'].map(read).join('\n')

async function observerView(): Promise<Record<string, string>> {
  atWidth(390)
  const id = await createSession(run, 'observe')
  const ada = TableClient.connect(await asSeat(run, id, 'A'))
  await ada.ready()
  await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
  history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<ObserverPage />)
  try {
    await screen.findByText(/Du är observatör/)
    await ada.send({ v: 'session.end' })
    await screen.findByRole('button', { name: 'Nästa' })
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    // The whole mount: the survey stands beside the room once the table has ended (UX-38, #83).
    return { 'enkäten hos den som tittar på': container.innerHTML }
  } finally {
    unmount()
    ada.close()
  }
}

describe('the one who only watches', () => {
  it('wears the primary fill on nothing but the action that moves her on', async () => {
    const measured = await inChromium(OBSERVER_CSS, 390, await observerView(), wearingThePrimary('.byd-observer, .byd-survey'))
    expect(measured).toEqual({ 'enkäten hos den som tittar på': ['Nästa'] })
  }, 90_000)
})

describe('the editor', () => {
  // Filled and outlined are the same object at two weights, so they have to be the same size. An
  // outline is drawn *outside* the shape it wraps, so a secondary that gains a line and a primary
  // that has none come out two pixels apart, and a row of buttons then sits on two rhythms. The
  // primary therefore carries a line of its own, in its own fill, where nobody can see it but the
  // layout. Spara and Uppdatera bordet stand side by side in the header at one size, so they are
  // the pair where that can be read off the page rather than argued about.
  it('costs an outline nothing in height beside the filled action', async () => {
    await run.projects.create(run.projectId, worthFiltering())
    const views = await editorViews(1280)
    const measured = await inChromium(read('src/editor/editor.css'), 1280, { Mall: views['Mall']! }, (page) =>
      page.$$eval('.byd-editor > header > .byd-secondary, .byd-editor > header > .byd-primary', (els) => els.map((el) => `${el.textContent?.trim().slice(0, 10)}: ${el.getBoundingClientRect().height}`)),
    )
    const [outlined, filled] = measured['Mall']!
    expect(outlined).toMatch(/^Spara: /)
    expect(filled).toMatch(/^Uppdatera /)
    expect(outlined?.replace(/^[^:]+/, '')).toBe(filled?.replace(/^[^:]+/, ''))
  }, 120_000)

  it('wears the primary fill on nothing but the action that puts the work on the table', async () => {
    await run.projects.create(run.projectId, worthFiltering())
    const views = await editorViews(1280)
    // What the walk is expected to have walked. The expectation used to be built out of the
    // measurement — `Object.fromEntries(Object.keys(views)...)` — and `{}` equals `{}`, so an
    // `editorViews` that found no mode tabs at all would have returned nothing and passed
    // brilliantly. A walk has to say where it went before it says what it saw.
    expect(Object.keys(views).sort()).toEqual(EDITOR_VIEWS)
    const measured = await inChromium(read('src/editor/editor.css'), 1280, views, wearingThePrimary('.byd-editor'))
    // The caret is not a second action: it is the same button's other half, and a split control
    // drawn in two colours would read as two things to press rather than one with a menu.
    expect(measured).toEqual(Object.fromEntries(EDITOR_VIEWS.map((name) => [name, ['Uppdatera bordet', 'Fler vägar till bordet']])))
  }, 120_000)
})

// The second finding the audit wrote down (UX-13): beside the card in the editor's template stood
// two buttons filled at the weight of a first action, where neither was the page's. One of them
// has since moved to the wizard and been dealt with; this is the other. What a second action looks
// like is read off the surface's own token through a probe rather than written down as a hex, so
// the fact stays true when the line the language draws with changes.
describe('the buttons that stand beside the card in the template', () => {
  it('draws the way to a typeface as an outline and not as a second first action', async () => {
    await run.projects.create(run.projectId, worthFiltering())
    const views = await editorViews(1280)
    const measured = await inChromium(read('src/editor/editor.css'), 1280, { Mall: views['Mall']! }, (page) =>
      page.evaluate(() => {
        const editor = document.querySelector('.byd-editor')!
        const probe = editor.appendChild(document.createElement('span'))
        probe.style.cssText = 'color: var(--byd-secondary-line)'
        const line = getComputedStyle(probe).color
        probe.remove()
        const upload = [...editor.querySelectorAll<HTMLElement>('button, label')].find((el) => el.textContent?.trim().startsWith('Ladda upp typsnitt'))
        if (!upload) throw new Error('no way to a typeface in the template')
        const drawn = getComputedStyle(upload)
        return { drawn: `${drawn.backgroundColor} inside ${drawn.borderTopWidth} of ${drawn.borderTopColor}`, outlined: `rgba(0, 0, 0, 0) inside 1px of ${line}` }
      }),
    )
    expect(measured['Mall']!.drawn).toBe(measured['Mall']!.outlined)
  }, 120_000)
})

// The other half of the language, walked the same way. Every room the language is spoken in, every
// view each of them has at its review width, and the one question: is anything that is merely *chosen* still painted in
// a fill? The seat picker is the one place where the answer is yes and stays yes — a seat's colour
// is its identity and not a role (L11, K9, #20), and that palette is not this issue's to move.
describe('what the whole tool draws as chosen', () => {
  it('paints none of it in a fill of its own, bar the seats that are a palette', async () => {
    await run.projects.create(run.projectId, worthFiltering())
    const walked = {
      'inloggningskortet, mina spel': [read('src/account/account.css'), 390, '.byd-account', await accountViews()],
      'sätt dig vid bordet': [read('src/join/join.css'), 390, '.byd-join', await joinViews()],
      'guidad start': [read('src/wizard/wizard.css'), 1280, '.byd-wizard', await wizardViews(1280)],
      'editorn': [read('src/editor/editor.css'), 1280, '.byd-editor', await editorViews(1280)],
      'telefonen': [`${read('src/player/player.css')}\n${read('src/table/keyboard.css')}\n${read('src/rules/rules.css')}`, 390, '.byd-player', await playerViews()],
      'storbilden': [ONLINE_CSS, 390, '.byd-online', await onlineView()],
      'den som tittar på': [OBSERVER_CSS, 390, '.byd-observer', await observerView()],
    } as const
    const filled: Record<string, string[]> = {}
    const walkedThrough: Record<string, string[]> = {}
    for (const [surface, [css, width, root, views]] of Object.entries(walked)) {
      const measured = await inChromium(css, width, views, chosenAndFilled(root))
      walkedThrough[surface] = Object.keys(measured).sort()
      filled[surface] = Object.entries(measured).flatMap(([view, names]) => names.map((name) => `${view}: ${name}`))
    }
    // Where the walk went, before what it saw. Four of the five expectations below are `[]`, and an
    // empty list is what "nothing was drawn wrong here" and "nothing was looked at here" both come
    // back as — so the views are named, and a surface that quietly stops mounting fails rather than
    // agreeing.
    expect(walkedThrough).toEqual({
      'inloggningskortet, mina spel': ['inloggningskortet', 'mina spel'],
      'sätt dig vid bordet': ['innan namnet är skrivet', 'sätt dig vid bordet'],
      'guidad start': ['hela sidan'],
      'editorn': [...EDITOR_VIEWS],
      'telefonen': ['enkäten', 'vägen ut'],
      'storbilden': ['enkäten på storbilden', 'frågan om att spola tillbaka'],
      'den som tittar på': ['enkäten hos den som tittar på'],
    })
    expect(filled).toEqual({
      'inloggningskortet, mina spel': [],
      'sätt dig vid bordet': ['innan namnet är skrivet: Plats A, ledig', 'sätt dig vid bordet: Plats A, ledig'],
      'guidad start': [],
      'editorn': [],
      'telefonen': [],
      'storbilden': [],
      'den som tittar på': [],
    })
  }, 180_000)
})

// A role has to out-rank the surface rule it lands inside, on every surface and not just on the
// one where the fault happened to be noticed. `.byd-join-observe` was (0,1,0) against
// `.byd-join form button` at (0,1,2) and lost silently — background, border, ink and size, all
// four taken over, with the declaration still sitting there looking like it did something.
//
// So each surface is given the worst case its own stylesheet can make: a second action standing
// inside a form, beside a plain button that nothing has claimed. The plain one is the control. If
// the two come out drawn the same, the role lost, and the test says which surface it lost on.
const ROOTS = [
  { what: 'the account', root: 'byd-account', css: 'src/account/account.css' },
  { what: 'the seat picker', root: 'byd-join', css: 'src/join/join.css' },
  { what: 'the wizard', root: 'byd-wizard', css: 'src/wizard/wizard.css' },
  { what: 'the editor', root: 'byd-editor', css: 'src/editor/editor.css' },
  { what: 'the phone', root: 'byd-player', css: 'src/player/player.css' },
] as const

describe.each(ROOTS)('a second action inside a form on $what', ({ root, css }) => {
  const both = { 'en sekundär i ett formulär': `<div class="${root}"><form><button class="byd-secondary">Andra vägen</button><button>Vad som helst</button></form></div>` }
  const drawing = (selector: string) => (page: Page) =>
    page.evaluate((where) => {
      const form = document.querySelector(where.split(' form ')[0]!)!.querySelector('form')!
      const probe = form.appendChild(document.createElement('span'))
      probe.style.cssText = 'color: var(--byd-secondary-line)'
      const line = getComputedStyle(probe).color
      probe.remove()
      const drawn = [...form.querySelectorAll<HTMLElement>('button')].map((el) => {
        const style = getComputedStyle(el)
        return `${style.backgroundColor} inside ${style.borderTopWidth} of ${style.borderTopColor}`
      })
      return { drawn, outlined: `rgba(0, 0, 0, 0) inside 1px of ${line}` }
    }, selector)

  it('is drawn by the role and not by the surface', async () => {
    const measured = await inChromium(read(css), 1280, both, drawing(`.${root} form button`))
    const { drawn, outlined } = measured['en sekundär i ett formulär']!
    const [secondary, plain] = drawn
    // The line is read off the surface's own token rather than written down, so this stays true
    // when the colour changes; what it must never be is the transparent line the surface's own
    // rule would hand it, which is exactly what losing the cascade looks like.
    expect(secondary).toBe(outlined)
    expect(secondary).not.toBe(plain)
  }, 90_000)

  // A pointer is a state of a button, not a different button, and it is a state the surfaces have
  // rules about. The wizard's `button:hover` is (0,2,1) and a role is (0,2,0), so the moment
  // `Skapa spelet och fortsätt i editorn` was pointed at, the paper took the line back and drew a
  // grey ring round a nearly black pill: `rgb(30,38,32)` at rest, `rgb(141,145,138)` under the
  // mouse. Criterion 2 says the role wins over the surface's own `form button` rule; a criterion
  // that is only ever measured at rest is only half measured.
  const pair = { 'en primär och en sekundär i ett formulär': `<div class="${root}"><form><button class="byd-primary">Första vägen</button><button class="byd-secondary">Andra vägen</button></form></div>` }
  it('is still drawn by the role under a pointer', async () => {
    const measured = await inChromium(read(css), 1280, pair, async (page) => {
      const named = await page.evaluate((where) => {
        const surface = document.querySelector(where)!
        const probe = surface.appendChild(document.createElement('span'))
        const colourOf = (token: string) => {
          probe.style.cssText = `color: var(${token})`
          return getComputedStyle(probe).color
        }
        const out = { primary: colourOf('--byd-primary-bg'), secondary: colourOf('--byd-secondary-line') }
        probe.remove()
        return out
      }, `.${root}`)
      const pointedAt = async (role: string) => {
        await page.hover(`.${root} .${role}`)
        return page.$eval(`.${root} .${role}`, (el) => getComputedStyle(el).borderTopColor)
      }
      return { primary: await pointedAt('byd-primary'), secondary: await pointedAt('byd-secondary'), named }
    })
    const { primary, secondary, named } = measured['en primär och en sekundär i ett formulär']!
    expect(primary).toBe(named.primary)
    expect(secondary).toBe(named.secondary)
  }, 90_000)
})

// A surface without the shared sheet under it is not the surface that ships. Every suite that
// builds a document out of one of the five stylesheets has to lay `buttons.css` over it too, or
// it goes on measuring a page nobody sees — borders, weights and hit areas the language has since
// changed.
//
// The felt joined the list when it became a room (L13, #90). Until then it was the one surface
// the language was not spoken on, so a suite could lay the felt into a document without the
// language under it and be measuring a page nobody sees — which is how the felt's own buttons
// came to be decided in passing in the first place.
//
// What a suite *loads* is a path; how it spells the loading is its own business. This guard used
// to look for the literal `read('src/<surface>.css')`, which is one of the two ways this directory
// loads a stylesheet, and so it never saw the four suites that reach the same sheets through
// `[...].map(read)`. Two of those four are the ones that measure `/online` and `/observe` — the
// exact routes the language had never reached — so the guard was blindest precisely where it was
// needed. A path is matched now, on both sides of the question.
const SURFACES = ['account/account', 'join/join', 'wizard/wizard', 'editor/editor', 'player/player', 'table/table'] as const
const loads = (source: string, sheet: string) => source.includes(`src/${sheet}.css`)
const mounting = readdirSync(import.meta.dirname)
  .filter((name) => /\.tsx?$/.test(name) && name !== 'button-language.test.tsx')
  .map((name) => ({ name, source: readFileSync(join(import.meta.dirname, name), 'utf8') }))
  // Only the suites that put one into a document. A suite that opens a stylesheet to read a token
  // out of its text has no page for the language to be laid over.
  .filter(({ source }) => source.includes('setContent(') && SURFACES.some((surface) => loads(source, surface)))

describe('every suite that measures a surface', () => {
  // Named rather than counted. A guard whose subject is found by a regular expression can lose
  // its subject to a rename and go on passing over an empty list, which is what the count below
  // it was there to prevent and did not: it said "more than five" while four were missing.
  it('finds every suite that lays a surface into a document, by name', () => {
    expect(mounting.map((s) => s.name).sort()).toEqual([
      'account-viewport.test.tsx',
      'canvas-band.test.tsx',
      'canvas-pan.test.tsx',
      'counter-ink.test.tsx',
      'counter-touch.test.tsx',
      'counter-zone.test.tsx',
      'data-table-cell-rail.test.tsx',
      'data-table-csv-pair.test.tsx',
      'data-table-drag.test.tsx',
      'data-table-layout.test.tsx',
      'data-table-sideways.test.tsx',
      'data-table-widths.test.tsx',
      'editor-chrome-order.test.ts',
      'editor-crown.test.tsx',
      'editor-css.test.ts',
      'editor-spacing.test.tsx',
      'editor-tables-layout.test.tsx',
      'editor-viewport.test.tsx',
      'editor-window.test.tsx',
      'felt-hands.test.tsx',
      'felt-names.test.tsx',
      'join-layout.test.tsx',
      'observer-viewport.test.tsx',
      'online-column.test.tsx',
      'online-felt.test.tsx',
      'online-layout.test.tsx',
      'online-viewport.test.tsx',
      'player-viewport.test.tsx',
      'reduced-motion.test.ts',
      'status-css.test.ts',
      'table-grab.test.ts',
      'table-layout.test.tsx',
      'template-canvas-image.test.tsx',
      'template-canvas-layout.test.tsx',
      'template-canvas-motif.test.tsx',
      'template-crown.test.tsx',
      'texture-layout.test.tsx',
      'wizard-viewport.test.tsx',
    ])
  }, 60_000)

  it.each(mounting.map((s) => s.name))('lays the shared button language over %s', (name) => {
    expect(loads(mounting.find((s) => s.name === name)!.source, 'buttons')).toBe(true)
  }, 60_000)
})
