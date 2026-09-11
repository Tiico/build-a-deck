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
import { fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { HomePage } from '../src/account/HomePage.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { JoinPage } from '../src/join/JoinPage.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { Survey } from '../src/player/Survey.js'
import { ExitSheet } from '../src/player/SessionSheets.js'
import { TableClient } from '../src/client.js'
import { projectDoc } from './project-doc.js'
import { asTable, createSession, roomOf, startServer, twoSeatSetup, type Running } from './fixture.js'
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

  // Filled and outlined are the same object at two weights, so they have to be the same size. An
  // outline is drawn *outside* the shape, so a secondary that gains a line and a primary that has
  // none come out two pixels apart and the column sits on two rhythms. The primary therefore
  // carries a line of its own, in its own fill, where nobody can see it but the layout.
  it('costs an outline nothing in height beside the filled action', async () => {
    const measured = await inChromium(
      read('src/join/join.css'),
      390,
      await joinViews(),
      (page) => page.$$eval('.byd-join form button:not(.byd-join-online)', (els) => els.map((el) => `${el.textContent?.trim().slice(0, 10)}: ${el.getBoundingClientRect().height}`)),
    )
    const [filled, outlined] = measured['sätt dig vid bordet']!
    expect(filled?.replace(/^[^:]+/, '')).toBe(outlined?.replace(/^[^:]+/, ''))
    expect(measured['sätt dig vid bordet']).toHaveLength(2)
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
    }
    return out
  } finally {
    unmount()
  }
}

// The phone. The survey is the screen where the seat is asked something and then moved on, so it
// is the one that has both a set of choices and a first action standing in the same view.
async function playerViews(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const survey = render(
    <div className="byd-player">
      <Survey who="Ada" version="v1" onSubmit={async () => undefined} />
    </div>,
  )
  fireEvent.click(screen.getByRole('button', { name: '4' }))
  out['enkäten'] = survey.container.innerHTML
  survey.unmount()

  const exit = render(
    <div className="byd-player">
      <ExitSheet onLeave={() => undefined} onEnd={() => undefined} onClose={() => undefined} />
    </div>,
  )
  out['vägen ut'] = exit.container.innerHTML
  exit.unmount()
  return out
}

describe('the phone', () => {
  it('wears the primary fill on nothing but the action that moves the seat on', async () => {
    const css = `${read('src/player/player.css')}\n${read('src/table/keyboard.css')}\n${read('src/rules/rules.css')}`
    const measured = await inChromium(css, 390, await playerViews(), wearingThePrimary('.byd-player'))
    // Leaving your seat and ending everyone's table are deliberately not a first action (#31).
    expect(measured).toEqual({ enkäten: ['Nästa'], 'vägen ut': [] })
  }, 90_000)
})

describe('the editor', () => {
  it('wears the primary fill on nothing but the action that puts the work on the table', async () => {
    await run.projects.create('p1', projectDoc())
    const views = await editorViews(1280)
    const measured = await inChromium(read('src/editor/editor.css'), 1280, views, wearingThePrimary('.byd-editor'))
    // The caret is not a second action: it is the same button's other half, and a split control
    // drawn in two colours would read as two things to press rather than one with a menu.
    expect(measured).toEqual(Object.fromEntries(Object.keys(views).map((name) => [name, ['Uppdatera bordet', 'Fler vägar till bordet']])))
  }, 120_000)
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
