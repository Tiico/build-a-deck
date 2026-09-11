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
import { TableClient } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { admit, asSeat, asTable, createSession, roomOf, startServer, twoSeatSetup, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

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
const wearingThePrimary = (root: string) => (page: Page) =>
  page.evaluate((selector) => {
    const surface = document.querySelector(selector)
    if (!surface) throw new Error(`no ${selector} in this view`)
    const probe = surface.appendChild(document.createElement('span'))
    probe.style.backgroundColor = 'var(--byd-primary-bg)'
    const fill = getComputedStyle(probe).backgroundColor
    probe.remove()
    if (fill === 'rgba(0, 0, 0, 0)') throw new Error(`${selector} binds no --byd-primary-bg`)
    return [...surface.querySelectorAll<HTMLElement>('button, a[href], label, [role="tab"], [role="option"]')]
      .filter((el) => el.checkVisibility())
      .filter((el) => getComputedStyle(el).backgroundColor === fill)
      .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40))
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
  fireEvent.click(screen.getByRole('button', { name: /Plats A/ }))
  fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Bo' } })
  const html = container.innerHTML
  unmount()
  table.close()
  return { 'sätt dig vid bordet': html }
}

describe('the seat picker', () => {
  it('wears the primary fill on nothing but the action that seats you', async () => {
    const measured = await inChromium(read('src/join/join.css'), 390, await joinViews(), wearingThePrimary('.byd-join'))
    expect(measured).toEqual({ 'sätt dig vid bordet': ['Sätt dig'] })
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
  await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'p1', ...projectDoc() }) })
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

// Every mode the editor can be showing at the desk. Whichever one is open, the blue button that
// puts the work on the table is the only filled thing in the room.
async function editorViews(width: number): Promise<Record<string, string>> {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
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
  const { unmount } = render(<PlayerPage />)
  try {
    const out: Record<string, string> = {}
    // The way out is one of the three controls every seat has, and the sheet behind it is what
    // the page looks like while it is being asked (#31).
    fireEvent.click(await screen.findByRole('button', { name: /Ut…/ }))
    await screen.findByRole('button', { name: 'Lämna bordet' })
    out['vägen ut'] = document.querySelector('.byd-player')!.outerHTML
    fireEvent.click(screen.getByRole('button', { name: 'Stanna kvar' }))

    await host.send({ v: 'session.end' })
    await screen.findByRole('button', { name: 'Nästa' })
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    out['enkäten'] = document.querySelector('.byd-player')!.outerHTML
    return out
  } finally {
    unmount()
    host.close()
  }
}

describe('the phone', () => {
  it('wears the primary fill on nothing but the action that moves the seat on', async () => {
    const css = `${read('src/player/player.css')}\n${read('src/table/keyboard.css')}\n${read('src/rules/rules.css')}`
    const measured = await inChromium(css, 390, await playerViews(), wearingThePrimary('.byd-player'))
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
  const { unmount } = render(<OnlinePage />)
  const room = () => document.querySelector('.byd-online')!.outerHTML
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
    const measured = await inChromium(ONLINE_CSS, 390, await onlineView(), wearingThePrimary('.byd-online'))
    expect(measured).toEqual({ 'frågan om att spola tillbaka': ['Godkänn'], 'enkäten på storbilden': ['Nästa'] })
  }, 90_000)
})

const OBSERVER_CSS = ['src/table/table.css', 'src/table/texture.css', 'src/player/player.css', 'src/status/status.css', 'src/a11y.css'].map(read).join('\n')

async function observerView(): Promise<Record<string, string>> {
  atWidth(390)
  const id = await createSession(run, 'observe')
  const ada = TableClient.connect(await asSeat(run, id, 'A'))
  await ada.ready()
  await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
  history.replaceState(null, '', `/observe?session=${id}&name=Eva&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
  const { unmount } = render(<ObserverPage />)
  try {
    await screen.findByText(/Du är observatör/)
    await ada.send({ v: 'session.end' })
    await screen.findByRole('button', { name: 'Nästa' })
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    return { 'enkäten hos den som tittar på': document.querySelector('.byd-observer')!.outerHTML }
  } finally {
    unmount()
    ada.close()
  }
}

describe('the one who only watches', () => {
  it('wears the primary fill on nothing but the action that moves her on', async () => {
    const measured = await inChromium(OBSERVER_CSS, 390, await observerView(), wearingThePrimary('.byd-observer'))
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
    await run.projects.create('p1', worthFiltering())
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
    await run.projects.create('p1', worthFiltering())
    const views = await editorViews(1280)
    const measured = await inChromium(read('src/editor/editor.css'), 1280, views, wearingThePrimary('.byd-editor'))
    // The caret is not a second action: it is the same button's other half, and a split control
    // drawn in two colours would read as two things to press rather than one with a menu.
    expect(measured).toEqual(Object.fromEntries(Object.keys(views).map((name) => [name, ['Uppdatera bordet', 'Fler vägar till bordet']])))
  }, 120_000)
})

// The second finding the audit wrote down (UX-13): beside the card in the editor's template stood
// two buttons filled at the weight of a first action, where neither was the page's. One of them
// has since moved to the wizard and been dealt with; this is the other. What a second action looks
// like is read off the surface's own token through a probe rather than written down as a hex, so
// the fact stays true when the line the language draws with changes.
describe('the buttons that stand beside the card in the template', () => {
  it('draws the way to a typeface as an outline and not as a second first action', async () => {
    await run.projects.create('p1', worthFiltering())
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

// The other half of the language, walked the same way. Five surfaces, every view each of them has
// at its review width, and the one question: is anything that is merely *chosen* still painted in
// a fill? The seat picker is the one place where the answer is yes and stays yes — a seat's colour
// is its identity and not a role (L11, K9, #20), and that palette is not this issue's to move.
describe('what the whole tool draws as chosen', () => {
  it('paints none of it in a fill of its own, bar the seats that are a palette', async () => {
    await run.projects.create('p1', worthFiltering())
    const walked = {
      'inloggningskortet, mina spel': [read('src/account/account.css'), 390, '.byd-account', await accountViews()],
      'sätt dig vid bordet': [read('src/join/join.css'), 390, '.byd-join', await joinViews()],
      'guidad start': [read('src/wizard/wizard.css'), 1280, '.byd-wizard', await wizardViews(1280)],
      'editorn': [read('src/editor/editor.css'), 1280, '.byd-editor', await editorViews(1280)],
      'telefonen': [`${read('src/player/player.css')}\n${read('src/table/keyboard.css')}\n${read('src/rules/rules.css')}`, 390, '.byd-player', await playerViews()],
    } as const
    const filled: Record<string, string[]> = {}
    for (const [surface, [css, width, root, views]] of Object.entries(walked)) {
      const measured = await inChromium(css, width, views, chosenAndFilled(root))
      filled[surface] = Object.entries(measured).flatMap(([view, names]) => names.map((name) => `${view}: ${name}`))
    }
    expect(filled).toEqual({
      'inloggningskortet, mina spel': [],
      'sätt dig vid bordet': ['sätt dig vid bordet: Plats A, ledig'],
      'guidad start': [],
      'editorn': [],
      'telefonen': [],
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
})

// A surface without the shared sheet under it is not the surface that ships. Every suite that
// builds a document out of one of the five stylesheets has to lay `buttons.css` over it too, or
// it goes on measuring a page nobody sees — borders, weights and hit areas the language has since
// changed. This is the guard that stops the next such suite from being written without it.
const SURFACES = ['account/account', 'join/join', 'wizard/wizard', 'editor/editor', 'player/player'] as const
const mounting = readdirSync(import.meta.dirname)
  .filter((name) => /\.tsx?$/.test(name) && name !== 'button-language.test.tsx')
  .map((name) => ({ name, source: readFileSync(join(import.meta.dirname, name), 'utf8') }))
  .filter(({ source }) => SURFACES.some((surface) => source.includes(`read('src/${surface}.css')`)))

describe('every suite that measures a surface', () => {
  it('finds surfaces at all, so this guard cannot pass by matching nothing', () => {
    expect(mounting.length).toBeGreaterThan(5)
  })

  it.each(mounting.map((s) => s.name))('lays the shared button language over %s', (name) => {
    expect(mounting.find((s) => s.name === name)!.source).toContain("read('src/buttons.css')")
  })
})
