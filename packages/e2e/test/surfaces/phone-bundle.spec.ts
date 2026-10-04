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
// What the split cannot reach on its own, stated rather than hidden. The issue's mark is a
// hundred kilobytes; splitting the routes took `/play` from 259 kB to 197 and `/join` to 161, and
// the rest of the way is not route code. It is three things every surface shares, measured when
// the split landed: React's DOM (~57 kB, the floor), the language catalogues — both languages and
// every surface's words, the editor's and the account pages' included (~42 kB of the phone's
// load) — and zod, which validates every frame the server sends (~30 kB). The last two are
// decisions about the i18n architecture and about validation on the wire, not about routes, and
// they are taken apart from this gate. So the line below is an alarm at what the split delivers,
// with room for the phone to grow a feature, and the mark is kept beside it so that it is lowered
// toward the mark rather than raised away from it.
const OUT = process.env['BYD_E2E_WEB_DIST']
if (!OUT) throw new Error('the stack did not say where the built web app is (BYD_E2E_WEB_DIST); nothing here can be measured')

// The mark #760 set is 100_000. This is what the route split holds the phone to until the shared
// part moves (see above).
const PHONE_JS_GZ = 210_000

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

  test('draws the seat picker on /join from its own chunks, under the same alarm', async ({ table, open }) => {
    const { page } = await open(PHONE, 'about:blank')
    const asked = scriptsAskedFor(page)
    await page.goto(`/join?code=${table.code}`)
    await expect(page.locator('[data-page="join"]')).toBeVisible()
    expect(asked).toContain(chunkOf('JoinPage'))
    expect(asked.filter((p) => NEVER_ON_A_PHONE.some((name) => p === chunkOf(name)))).toEqual([])
    const weight = asked.reduce((sum, p) => sum + gz(p), 0)
    expect(weight, asked.map((p) => `${p} ${gz(p)}`).join('\n')).toBeLessThan(PHONE_JS_GZ)
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
