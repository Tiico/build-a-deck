import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import type { Page } from '@playwright/test'
import { PHONE } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The phone fetches the phone, and not the whole app (#760, L20).
//
// Until #760 every surface but the editor rode in one entry script: 822 kB decoded, 211 kB on the
// wire, the same file on `/play`, `/join`, `/table` and `/observe`. A player's hand carried the
// wizard, the account pages, the felt's renderer and the observer — none of which it ever draws —
// and on a slow mobile line every one of those kilobytes is a moment longer of white page (#749).
//
// So each surface is fetched when its address is opened, and this is the gate that holds the
// phone to it. What is measured is the built app, served the way the box serves it, opened the
// way a player opens it: every script the page asks for before the hand is drawn, weighed as gzip
// of the very file on disk. Gzip rather than the wire's brotli because the issue's mark was set in
// gzip and a number that changes with the box's encoder is a number nobody can reason about.
//
// What the phone is held to, and why it is not the hundred kilobytes the issue first set. Two
// steps were taken: the routes were split (`/play` 259 → 199 kB) and then the catalogue, which
// travels per surface and per language (199 → 151 kB; `/join` 161 → 112). What is left is not the
// phone's to shed. React's DOM is ~57 kB and the floor; zod, which checks every frame the server
// sends, is ~30 kB and stays by the beställare's decision (2026-10-04, L20). So the mark is what
// was reached, and the line below is an alarm a little above it — room for the phone to grow a
// feature, not for it to take back what was taken out.
const OUT = process.env['BYD_E2E_WEB_DIST']
if (!OUT) throw new Error('the stack did not say where the built web app is (BYD_E2E_WEB_DIST); nothing here can be measured')

// Measured at 151 kB for `/play` and 112 kB for `/join` when the catalogue split landed (#760).
const PHONE_JS_GZ = 160_000
const JOIN_JS_GZ = 120_000

const assets = readdirSync(join(OUT, 'assets'))
const gz = (path: string): number => gzipSync(readFileSync(join(OUT, path.replace(/^\//, '')))).length

/** Every script the page asks for from here on, by path on the origin. */
const scriptsAskedFor = (page: Page): string[] => {
  const asked: string[] = []
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname
    if (path.endsWith('.js') && !asked.includes(path)) asked.push(path)
  })
  return asked
}

// The surfaces a phone never draws, by the chunk each one is fetched in. Read off the build so a
// renamed page fails here as missing rather than passing as absent.
const NEVER_ON_A_PHONE = ['TablePage', 'ObserverPage', 'OnlinePage', 'EditorPage', 'NewProjectPage', 'HomePage']
const chunkOf = (name: string): string => {
  const found = assets.filter((f) => f.startsWith(`${name}-`) && f.endsWith('.js'))
  if (found.length !== 1) throw new Error(`the build has ${found.length} chunks named ${name}, not one: ${JSON.stringify(found)}`)
  return `/assets/${found[0]}`
}

test.describe('the phone fetches the phone and not the whole app (#760)', () => {
  test('draws the hand on /play from its own chunks, and none of them is the felt', async ({ table, player }) => {
    const { page } = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    // The fixture opened the address already; open it again with the wire watched from the start.
    const asked = scriptsAskedFor(page)
    await page.reload()
    await expect(page.locator('[data-page="player"]')).toBeVisible()
    // Not vacuous: the page did go to the network for script, and for the hand's own chunk.
    expect(asked).toContain(chunkOf('PlayerPage'))
    expect(asked.filter((p) => NEVER_ON_A_PHONE.some((name) => p === chunkOf(name)))).toEqual([])
    const weight = asked.reduce((sum, p) => sum + gz(p), 0)
    expect(weight, asked.map((p) => `${p} ${gz(p)}`).join('\n')).toBeLessThan(PHONE_JS_GZ)
  })

  test('draws the seat picker on /join from its own chunks, under an alarm of its own', async ({ table, open }) => {
    const { page } = await open(PHONE, 'about:blank')
    const asked = scriptsAskedFor(page)
    await page.goto(`/join?code=${table.code}`)
    await expect(page.locator('[data-page="join"]')).toBeVisible()
    expect(asked).toContain(chunkOf('JoinPage'))
    expect(asked.filter((p) => NEVER_ON_A_PHONE.some((name) => p === chunkOf(name)))).toEqual([])
    const weight = asked.reduce((sum, p) => sum + gz(p), 0)
    expect(weight, asked.map((p) => `${p} ${gz(p)}`).join('\n')).toBeLessThan(JOIN_JS_GZ)
  })

  // Splitting the script must not buy its bytes back in time. A chunk the entry asks for once it
  // has arrived and run is a round trip after it — on a mobile line, longer than the kilobytes it
  // saved. So the document itself asks for the route's chunk beside the entry, and the proof is
  // to hold the entry back on the wire and watch the hand's chunk be asked for all the same.
  test('asks for the hand’s own chunk while the entry is still on its way', async ({ table, player }) => {
    const { page } = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const entry = /\/assets\/index-[^/]+\.js$/
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(entry, async (route) => {
      await held
      await route.continue()
    })
    const asked = scriptsAskedFor(page)
    const reloaded = page.reload()
    try {
      await expect.poll(() => asked.some((p) => entry.test(p))).toBe(true)
      await expect.poll(() => asked.includes(chunkOf('PlayerPage'))).toBe(true)
      // And the phone's words, in the reader's language, the same way (#760).
      await expect.poll(() => catalogues(asked).map((c) => c.split('.')[1])).toEqual(['play', 'status'])
    } finally {
      release()
    }
    await reloaded
    await expect(page.locator('[data-page="player"]')).toBeVisible()
  })

  // A chunk that does not arrive is a new way for a page to fail, and it must not fail as a white
  // page. It is said the way a phone says it cannot reach the table, and «Try again» fetches the
  // document anew — the only retry Chromium honours for a module it once failed to load.
  test('says so when the hand’s chunk does not arrive, and draws the hand when it does', async ({ table, player }) => {
    const { page } = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const hand = /\/assets\/PlayerPage-[^/]+\.js$/
    await page.route(hand, (route) => route.abort('internetdisconnected'))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'We cannot reach the table' })).toBeVisible()
    await page.unroute(hand)
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.locator('[data-page="player"]')).toBeVisible()
  })
})

// The words travel the way the script does (#760, the beställare's decision 2026-10-04). The
// catalogue is one file per surface and per language, and a page fetches its surface's words in
// the reader's language only: the phone carries neither the editor's six hundred messages nor the
// other language's version of its own. The chunk a catalogue is fetched in is named after the file
// it is written in — `en.play`, `sv.status` — and that name is what is read here.
const catalogues = (asked: string[]): string[] =>
  asked
    .map((p) => /\/assets\/((?:sv|en)\.[a-z]+)-[^/]+\.js$/.exec(p)?.[1])
    .filter((name): name is string => name !== undefined)
    .sort()

// What a page says when it is asked for a message it has not been given. Read off the console,
// because a missing message is drawn as its key and nothing else on the page fails.
const missingWords = (page: Page): string[] => {
  const said: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('i18n')) said.push(msg.text())
  })
  return said
}

test.describe('every surface speaks only its own words, in its reader’s language (#760)', () => {
  for (const lang of ['sv', 'en'] as const) {
    test(`the hand fetches the phone’s words in ${lang} and nothing else`, async ({ table, player }) => {
      const { page, admission } = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
      const asked = scriptsAskedFor(page)
      const missing = missingWords(page)
      await page.goto(`${admission.playUrl}&lang=${lang}`)
      await expect(page.locator('[data-page="player"]')).toBeVisible()
      expect(catalogues(asked)).toEqual([`${lang}.play`, `${lang}.status`])
      expect(missing).toEqual([])
    })
  }

  // And every other address, in both languages, finds every word it draws. A route that reached a
  // message its own catalogues do not hold would draw the key and say so on the console.
  const ADDRESSES = ['/', '/login', '/new', '/claim', '/invites/x', '/table', '/observe', '/online', '/play', '/join', '/editor', '/elsewhere']
  for (const lang of ['sv', 'en'] as const) {
    test(`finds every word it draws on every address in ${lang}`, async ({ open }) => {
      const { page } = await open(PHONE, 'about:blank')
      const missing = missingWords(page)
      for (const address of ADDRESSES) {
        await page.goto(`${address}?lang=${lang}`)
        await expect(page.locator('#root > *').first()).toBeVisible()
        await page.waitForLoadState('networkidle')
      }
      expect(missing).toEqual([])
    })
  }

  // A switch of language fetches the other catalogue, and the page stands in the old language
  // until it has arrived: never a blank frame, never a key, never half of each.
  test('switches language without a blank frame or a missing word', async ({ open }) => {
    const { page } = await open(PHONE, 'about:blank')
    const asked = scriptsAskedFor(page)
    const missing = missingWords(page)
    await page.goto('/login?lang=sv')
    const submit = page.locator('form button[type="submit"]')
    await expect(submit).toHaveText('Skicka inloggningslänk')
    expect(catalogues(asked).filter((c) => c.startsWith('en.'))).toEqual([])
    // Every frame from here on, written down: what the button says, or that the page is gone.
    await page.evaluate(() => {
      const seen: string[] = []
      ;(window as unknown as { seen: string[] }).seen = seen
      const look = () => {
        const root = document.getElementById('root')
        seen.push(root && root.childElementCount > 0 ? (document.querySelector('form button[type="submit"]')?.textContent ?? '(no button)') : '(blank)')
        requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    })
    // The catalogue is held back on the wire, so a wait drawn as anything would be seen.
    await page.route(/\/assets\/en\.[a-z]+-[^/]+\.js$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      await route.continue()
    })
    await page.getByLabel('Språk / Language').selectOption('en')
    await expect(submit).toHaveText('Send sign-in link')
    const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen)
    expect(new Set(seen)).toEqual(new Set(['Skicka inloggningslänk', 'Send sign-in link']))
    expect(catalogues(asked).filter((c) => c.startsWith('en.'))).toEqual(['en.account', 'en.status'])
    expect(missing).toEqual([])
  })
})
