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
      // The table's filter chips are only ever on when somebody has turned one on, so the walk
      // would otherwise never see the one place in the editor painted in the account's green.
      if (tab.textContent?.trim() === 'Tabell') {
        const chip = document.querySelector<HTMLElement>('.byd-data-chip')
        if (chip) {
          fireEvent.click(chip)
          out['Tabell, filtrerad'] = document.querySelector('.byd-editor')!.outerHTML
          fireEvent.click(chip)
        }
      }
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

// The second finding the audit wrote down (UX-13): beside the card in the editor's template stood
// two buttons filled at the weight of a first action, where neither was the page's. One of them
// has since moved to the wizard and been dealt with; this is the other. What a second action looks
// like is read off the surface's own token through a probe rather than written down as a hex, so
// the fact stays true when the line the language draws with changes.
describe('the buttons that stand beside the card in the template', () => {
  it('draws the way to a typeface as an outline and not as a second first action', async () => {
    await run.projects.create('p1', projectDoc())
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
    await run.projects.create('p1', projectDoc())
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
