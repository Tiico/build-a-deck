import { withQuery } from '../../support/api.js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import type { Page, Request } from '@playwright/test'
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
// steps were taken: the routes were split (`/play` 259 → 197 kB) and then the catalogue, which
// travels per surface and per language. By the time the catalogue split landed the phone had grown
// back to 209 kB, and the split took it to 157 (`/join` 168 → 115). What is left is not the
// phone's to shed. React's DOM is ~57 kB and the floor; zod, which checks every frame the server
// sends, is ~30 kB and stays by the beställare's decision (2026-10-04, L20). So the mark is what
// was reached, and the line below is an alarm a little above it — room for the phone to grow a
// feature, not for it to take back what was taken out.
const OUT = process.env['BYD_E2E_WEB_DIST']
if (!OUT) throw new Error('the stack did not say where the built web app is (BYD_E2E_WEB_DIST); nothing here can be measured')

// Measured at 156.7 kB for `/play` and 115.4 kB for `/join` when the catalogue split landed (#760,
// 2026-10-17); the alarm stands about 5 % above.
//
// Raised to 167 kB by the beställare's decision (#1141, 2026-10-23). The room above the mark was
// spent the way it was left for: features the phone draws. Dice on the phone (#1163) and the turn
// row (K30), each under the line on its own branch, met on main at 165.8 kB. What the turn costs
// on the phone, about 0.9 kB, is its schema on the wire, its words, the tab's title and the row.
//
// Left where it stands by #1304, which took the phone back under it instead. The hand stood 18 bytes
// under the line on CI when the issue was taken, and 15 kB of that was code a phone never runs: the
// project document and the rulebook's parser, reached for two felt sizes and one unit, and zod's
// JSON Schema writer (`vite.config.ts`, `phone-reach.test.ts`). Measured on a Mac after it, 148.6
// kB before the hand is drawn, and 2.9 kB of help box after. What is above the mark is again room
// for features the phone draws (the display name's welcome #1254, the beta terms #1272).
const PHONE_JS_GZ = 167_000
const JOIN_JS_GZ = 122_000

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

// What is weighed is what the page asked for *before* the surface stood in the document (#1304).
// Until then the sum was taken at whatever moment the assertion ran, so a part the page fetches on
// purpose once it has painted — the help box's inside, which L32 and #346 send after the first
// painting so it is there before anyone presses — was counted or not by a race with the browser's
// idle time: 2.9 kB either side of the line. Now the page writes down when the surface first stood
// in the document, the wire is let go quiet, and each script is weighed by when it was asked for.
// A script asked for before the surface was drawn is the surface's, whether or not it was needed.
const DRAWN_AT = '__bydDrawnAt'
const watchDrawn = async (page: Page, selector: string): Promise<void> => {
  await page.addInitScript(
    ({ selector, key }) => {
      const store = window as unknown as Record<string, number>
      const look = () => {
        if (store[key] !== undefined || !document.querySelector(selector)) return false
        store[key] = Date.now()
        return true
      }
      new MutationObserver((_, watch) => look() && watch.disconnect()).observe(document, { childList: true, subtree: true })
    },
    { selector, key: DRAWN_AT },
  )
}
type Weighed = { before: string[]; after: string[] }
const scriptsBeforeDrawn = (page: Page): (() => Promise<Weighed>) => {
  const asked = new Map<string, Request>()
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname
    if (path.endsWith('.js') && !asked.has(path)) asked.set(path, r)
  })
  return async () => {
    await page.waitForLoadState('networkidle')
    const drawn = await page.evaluate((key) => (window as unknown as Record<string, number | undefined>)[key], DRAWN_AT)
    if (drawn === undefined) throw new Error('the page never wrote down when the surface was drawn; nothing here can be weighed')
    const before: string[] = []
    const after: string[] = []
    for (const [path, r] of asked) {
      const at = r.timing().startTime
      if (!(at > 0)) throw new Error(`${path} has no start time to weigh it by (${at})`)
      ;(at <= drawn ? before : after).push(path)
    }
    return { before, after }
  }
}
const weightOf = (paths: string[]): number => paths.reduce((sum, p) => sum + gz(p), 0)
const account = ({ before, after }: Weighed): string =>
  [...before.map((p) => `${p} ${gz(p)}`), ...after.map((p) => `${p} ${gz(p)} (after the first frame, not weighed)`)].join('\n')

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
    await watchDrawn(page, '[data-page="player"]')
    const asked = scriptsBeforeDrawn(page)
    await page.reload()
    await expect(page.locator('[data-page="player"]')).toBeVisible()
    const weighed = await asked()
    // Not vacuous: the page did go to the network for script, and for the hand's own chunk; and the
    // help box's inside, which comes once the hand has painted, is told apart from it.
    expect(weighed.before).toContain(chunkOf('PlayerPage'))
    expect(weighed.after).toContain(chunkOf('HelpBox'))
    expect([...weighed.before, ...weighed.after].filter((p) => NEVER_ON_A_PHONE.some((name) => p === chunkOf(name)))).toEqual([])
    expect(weightOf(weighed.before), account(weighed)).toBeLessThan(PHONE_JS_GZ)
  })

  test('draws the seat picker on /join from its own chunks, under an alarm of its own', async ({ table, open }) => {
    const { page } = await open(PHONE, 'about:blank')
    await watchDrawn(page, '[data-page="join"]')
    const asked = scriptsBeforeDrawn(page)
    await page.goto(`/join?code=${table.code}`)
    await expect(page.locator('[data-page="join"]')).toBeVisible()
    const weighed = await asked()
    expect(weighed.before).toContain(chunkOf('JoinPage'))
    expect([...weighed.before, ...weighed.after].filter((p) => NEVER_ON_A_PHONE.some((name) => p === chunkOf(name)))).toEqual([])
    expect(weightOf(weighed.before), account(weighed)).toBeLessThan(JOIN_JS_GZ)
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

  // The room's own address (#675) is the address the television says, so it is the one a phone
  // most often opens cold: the picker's chunk is asked for beside the entry there too.
  test('asks for the picker’s chunk at /KOD while the entry is still on its way', async ({ table, open }) => {
    const { page } = await open(PHONE, 'about:blank')
    const entry = /\/assets\/index-[^/]+\.js$/
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(entry, async (route) => {
      await held
      await route.continue()
    })
    const asked = scriptsAskedFor(page)
    const opened = page.goto(`/${table.code}`)
    try {
      await expect.poll(() => asked.some((p) => entry.test(p))).toBe(true)
      await expect.poll(() => asked.includes(chunkOf('JoinPage'))).toBe(true)
    } finally {
      release()
    }
    await opened
    await expect(page.locator('[data-page="join"]')).toBeVisible()
    expect(asked.filter((p) => NEVER_ON_A_PHONE.some((name) => p === chunkOf(name)))).toEqual([])
  })

  // A chunk that does not arrive is a new way for a page to fail, and it must not fail as a white
  // page. It is said the way a phone says it cannot reach the table, and «Try again» fetches the
  // document anew — the only retry Chromium honours for a module it once failed to load.
  test('says so when the hand’s chunk does not arrive, and draws the hand when it does', async ({ table, player }) => {
    const { page } = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const hand = /\/assets\/PlayerPage-[^/]+\.js$/
    await page.route(hand, (route) => route.abort('internetdisconnected'))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'No contact with the table' })).toBeVisible()
    await page.unroute(hand)
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.locator('[data-page="player"]')).toBeVisible()
  })

  // The words that failure is said in travel apart too (#760). A line that brings neither the hand
  // nor the shell's words has nothing to say it in, and must not say it in keys: the shell that has
  // stood there since the document arrived stands on, and it says the wait itself.
  test('leaves the shell standing when neither the hand’s chunk nor its words arrive', async ({ table, player }) => {
    const { page } = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    await page.route(/\/assets\/(?:PlayerPage|(?:sv|en)\.status)-[^/]+\.js$/, (route) => route.abort('internetdisconnected'))
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#byd-shell')).toBeVisible()
    await expect(page.locator('#byd-shell h1')).not.toHaveText(/status\./)
    await expect(page.getByText(/status\.[a-z]/)).toHaveCount(0)
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
      await page.goto(withQuery(admission.playUrl, `lang=${lang}`))
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
