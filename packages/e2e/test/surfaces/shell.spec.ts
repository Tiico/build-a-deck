import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { join as admit, logIn, makeProject, makeTable } from '../../support/api.js'
import { DESK, PHONE, SMALL_TV, TV, type Device } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'
import { svStatus } from '../../../web/src/i18n/sv.status.js'
import { enStatus } from '../../../web/src/i18n/en.status.js'
import { DEFAULT_TIMING } from '../../../web/src/status/connection.js'

// The page says what it is fetching before the app has arrived (#749, D5, L20).
//
// The speltest of 2026-10-02 opened every route on a slow mobile line and found a white page for
// five to seven seconds: the document arrived in half a second, and then nothing was painted until
// the blocking stylesheet — 105 kB brotli with the felt's face inside it — and the entry had both
// come down. A phone on a slow line showed a blank screen and a TV in the living room showed a
// white one, and nobody could tell a slow page from a dead one.
//
// The decision (beställaren, 2026-10-06) was variant B: the route's own D5 loading notice, written
// into `#root` in `index.html` so that React replaces it on its first rendering, in the route's
// words and the reader's language, saying it is taking longer after D5's four seconds and offering
// a reload after twenty. And the stylesheet leaves `<head>` for the end of `<body>`, because as long
// as it stood in the head it held every painting, the shell's included.
//
// What is measured is the built app served by the real server, on the speltest's line: CDP's
// network emulation at 400 ms latency and 400 kbit/s each way. Nothing is drawn by hand.
const OUT = process.env['BYD_E2E_WEB_DIST']
if (!OUT) throw new Error('the stack did not say where the built web app is (BYD_E2E_WEB_DIST); nothing here can be measured')
const index = readFileSync(join(OUT, 'index.html'), 'utf8')
const ENTRY = /<script type="module" crossorigin src="([^"]+)"/.exec(index)?.[1]
const SHEET = /<link rel="stylesheet" crossorigin href="([^"]+)"/.exec(index)?.[1]
if (!ENTRY || !SHEET) throw new Error('the built index.html has no entry script or no stylesheet to measure against')

// The speltest's line (#749).
const SLOW_LINE = { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 }

type Voice = 'app' | 'table' | 'phone' | 'editor'
type Lang = 'sv' | 'en'
const CATALOGUE: Record<Lang, Record<string, string>> = { sv: svStatus, en: enStatus }
// What the shell says, read off the catalogue the app says the same states from — so the two
// cannot drift apart, and a renamed key fails here instead of leaving the shell silent.
function words(lang: Lang, voice: Voice) {
  const w = CATALOGUE[lang]
  const own = (key: string, fallback: string) => w[voice === 'app' ? fallback : key] ?? w[fallback]!
  return {
    mark: w['status.loading.mark']!,
    heading: own(`status.loading.${voice}.heading`, 'status.loading.heading'),
    text: own(`status.loading.${voice}.text`, 'status.loading.text'),
    slowMark: w['status.slow.mark']!,
    slowHeading: own(`status.slow.${voice}.heading`, 'status.slow.heading'),
    slowText: own(`status.shell.slow.${voice}.text`, 'status.shell.slow.text'),
    reload: w['status.shell.reload']!,
    noscript: w['status.shell.noscript']!,
  }
}

// Every route by the voice its shell speaks in. The table's two modes and the observer are the
// table's (D5's voice for the room), the hand is the phone's, the editor its own, and everything
// else — the seat picker, the start page, the wizard, a room code typed as an address (#675) — says
// the app's «Hämtar…», because «Hämtar din hand…» is not true before there is a seat.
const VOICES: [string, Voice][] = [
  ['/table?mode=tv', 'table'],
  ['/table?mode=table', 'table'],
  ['/observe', 'table'],
  ['/play', 'phone'],
  ['/editor', 'editor'],
  ['/join', 'app'],
  ['/', 'app'],
  ['/new', 'app'],
  ['/login', 'app'],
  ['/K7MPQ2', 'app'],
]

type Screen = { context: BrowserContext; page: Page }
async function screen(browser: Browser, baseURL: string | undefined, device: Device, extra: Parameters<Browser['newContext']>[0] = {}): Promise<Screen> {
  const context = await browser.newContext({
    viewport: device.viewport,
    ...(device.hasTouch ? { hasTouch: true } : {}),
    ...(device.isMobile ? { isMobile: true } : {}),
    ...(baseURL ? { baseURL } : {}),
    locale: 'sv-SE',
    ...extra,
  })
  return { context, page: await context.newPage() }
}

async function slowLine(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', SLOW_LINE)
}

/** The entry never arrives: the shell is all there will be. */
const stallEntry = (page: Page) => page.route(`**${ENTRY}`, (r) => r.abort())

/** The entry is held on the wire until `release` is called. */
async function holdEntry(page: Page): Promise<() => void> {
  let release: () => void = () => undefined
  const held = new Promise<void>((r) => (release = r))
  await page.route(`**${ENTRY}`, async (r) => {
    await held
    await r.continue()
  })
  return release
}

/** What the shell shows: the parts that are actually painted, by what they say. */
const shellSays = (page: Page) =>
  page.evaluate(() => {
    const shell = document.getElementById('byd-shell')
    if (!shell) return null
    const seen = (el: Element | null) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 ? null : (el.textContent ?? '').trim()
    }
    return {
      lang: document.documentElement.lang,
      mark: seen(shell.querySelector('[data-k="m"]')),
      heading: seen(shell.querySelector('h1')),
      text: seen(shell.querySelector('[data-k="t"]')),
      reload: seen(shell.querySelector('button')),
    }
  })

// The contrast of every piece of text the shell paints, against the ground it actually stands on.
const shellContrast = (page: Page) =>
  page.evaluate(() => {
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
    const lum = ([r = 0, g = 0, b = 0]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ground = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) {
        const c = rgb(getComputedStyle(e).backgroundColor)
        if (c.length === 3 || (c[3] ?? 0) > 0.5) return c
      }
      return [255, 255, 255]
    }
    return [...document.querySelectorAll('#byd-shell, #byd-shell *')]
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim()) && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => {
        const a = lum(rgb(getComputedStyle(el).color))
        const b = lum(ground(el))
        return { text: (el.textContent ?? '').trim(), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
      })
  })

/**
 * The share of near-white pixels in each frame, decoded by a browser of its own: a frame is white
 * when at least half of it is (#749's measure, the one the prototype counted with).
 */
async function whiteShares(browser: Browser, frames: string[]): Promise<number[]> {
  const page = await browser.newPage()
  try {
    return await page.evaluate(async (all) => {
      const out: number[] = []
      for (const b64 of all) {
        const img = new Image()
        img.src = `data:image/jpeg;base64,${b64}`
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0)
        const d = g.getImageData(0, 0, c.width, c.height).data
        let white = 0
        let n = 0
        for (let i = 0; i < d.length; i += 16) {
          n++
          if (d[i]! > 235 && d[i + 1]! > 235 && d[i + 2]! > 235) white++
        }
        out.push(white / n)
      }
      return out
    }, frames)
  } finally {
    await page.close()
  }
}

/** The share of pixels that changed between two screenshots of the same viewport. */
async function changed(browser: Browser, a: Buffer, b: Buffer): Promise<number> {
  const page = await browser.newPage()
  try {
    return await page.evaluate(
      async ([x, y]) => {
        const pixels = async (b64: string) => {
          const img = new Image()
          img.src = `data:image/png;base64,${b64}`
          await img.decode()
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const g = c.getContext('2d')!
          g.drawImage(img, 0, 0)
          return g.getImageData(0, 0, c.width, c.height).data
        }
        const [p, q] = [await pixels(x), await pixels(y)]
        if (p.length !== q.length) return 1
        let n = 0
        let moved = 0
        for (let i = 0; i < p.length; i += 4) {
          n++
          if (Math.abs(p[i]! - q[i]!) + Math.abs(p[i + 1]! - q[i + 1]!) + Math.abs(p[i + 2]! - q[i + 2]!) > 48) moved++
        }
        return moved / n
      },
      [a.toString('base64'), b.toString('base64')] as const,
    )
  } finally {
    await page.close()
  }
}

/** Every frame the page paints from now on, with the time it was painted (ms since the epoch). */
async function screencast(page: Page, max: { width: number; height: number }) {
  const cdp = await page.context().newCDPSession(page)
  const frames: { at: number; data: string }[] = []
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ at: (f.metadata.timestamp ?? 0) * 1000, data: f.data })
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined)
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: max.width, maxHeight: max.height, everyNthFrame: 1 })
  return { frames, stop: () => cdp.send('Page.stopScreencast') }
}

test.describe('the page says what it is fetching before the app has arrived (#749)', () => {
  test('paints the route’s own words within a second and a half on a slow line, where it used to take five', async ({ browser, baseURL, request }) => {
    test.setTimeout(120_000)
    const table = await makeTable(request)
    const seat = await admit(request, table, { name: 'Ada', seat: 'A' })
    const routes: [string, Device, string, Voice][] = [
      ['tv', TV, table.tvUrl, 'table'],
      ['table', SMALL_TV, table.tableUrl, 'table'],
      ['play', PHONE, seat.playUrl, 'phone'],
      ['join', PHONE, `/join?code=${table.code}`, 'app'],
      ['editor', DESK, '/editor?project=nothing-yet', 'editor'],
      ['start', DESK, '/', 'app'],
    ]
    const seen: Record<string, { paint: number; heading: string | null | undefined }> = {}
    for (const [name, device, url, voice] of routes) {
      const { context, page } = await screen(browser, baseURL, device)
      try {
        await slowLine(page)
        await page.goto(url, { waitUntil: 'commit' })
        await page.waitForFunction(() => performance.getEntriesByType('paint').some((e) => e.name === 'first-paint'), undefined, { timeout: 20_000 })
        const paint = await page.evaluate(() => performance.getEntriesByType('paint').find((e) => e.name === 'first-paint')!.startTime)
        seen[name] = { paint: Math.round(paint), heading: (await shellSays(page))?.heading }
        expect.soft(seen[name]!.heading, name).toBe(words('sv', voice).heading)
      } finally {
        await context.close()
      }
    }
    // The document is down in about half a second on this line (one round trip plus a few
    // kilobytes); the first painting follows it rather than the sheet and the entry.
    test.info().annotations.push({ type: 'first-paint ms', description: JSON.stringify(seen) })
    expect(Object.entries(seen).filter(([, s]) => s.paint > 1_500), JSON.stringify(seen)).toEqual([])
  })

  test('says it in the route’s own words, in the reader’s language, at a contrast of 7:1', async ({ browser, baseURL }) => {
    for (const lang of ['sv', 'en'] as const) {
      const { context, page } = await screen(browser, baseURL, PHONE, { locale: lang === 'sv' ? 'sv-SE' : 'en-GB' })
      try {
        await stallEntry(page)
        for (const [path, voice] of VOICES) {
          await page.goto(path, { waitUntil: 'load' })
          const w = words(lang, voice)
          expect.soft(await shellSays(page), `${lang} ${path}`).toEqual({ lang, mark: w.mark, heading: w.heading, text: w.text, reload: null })
          const low = (await shellContrast(page)).filter((c) => c.ratio < 7)
          expect.soft(low, `${lang} ${path}`).toEqual([])
        }
      } finally {
        await context.close()
      }
    }
  })

  test('takes the language from the address, then the remembered choice, then the browser', async ({ browser, baseURL }) => {
    const cases: { locale: string; remembered?: Lang; address?: Lang; want: Lang }[] = [
      { locale: 'sv-SE', want: 'sv' },
      { locale: 'en-US', want: 'en' },
      { locale: 'sv-SE', address: 'en', want: 'en' },
      { locale: 'en-US', remembered: 'sv', want: 'sv' },
      { locale: 'en-US', remembered: 'sv', address: 'en', want: 'en' },
    ]
    for (const c of cases) {
      const { context, page } = await screen(browser, baseURL, PHONE, { locale: c.locale })
      try {
        if (c.remembered) await context.addInitScript((lang) => localStorage.setItem('byd.lang', lang), c.remembered)
        await stallEntry(page)
        await page.goto(`/play${c.address ? `?lang=${c.address}` : ''}`, { waitUntil: 'load' })
        expect.soft(await shellSays(page), JSON.stringify(c)).toMatchObject({ lang: c.want, heading: words(c.want, 'phone').heading })
      } finally {
        await context.close()
      }
    }
  })

  test('says it is taking longer at D5’s four seconds from the navigation, and offers a reload at twenty', async ({ browser, baseURL }) => {
    const { context, page } = await screen(browser, baseURL, TV)
    try {
      await page.clock.install()
      await stallEntry(page)
      await page.goto('/table?mode=tv', { waitUntil: 'load' })
      const w = words('sv', 'table')
      expect(await shellSays(page)).toMatchObject({ heading: w.heading, text: w.text, reload: null })
      await page.clock.runFor(DEFAULT_TIMING.slowAfterMs - 500)
      expect(await shellSays(page)).toMatchObject({ heading: w.heading, reload: null })
      await page.clock.runFor(1_000)
      expect(await shellSays(page)).toEqual({ lang: 'sv', mark: w.slowMark, heading: w.slowHeading, text: w.slowText, reload: null })
      await page.clock.runFor(20_000 - DEFAULT_TIMING.slowAfterMs - 1_000)
      expect(await shellSays(page)).toMatchObject({ heading: w.slowHeading, reload: null })
      await page.clock.runFor(1_000)
      expect(await shellSays(page)).toMatchObject({ heading: w.slowHeading, text: w.slowText, reload: w.reload })
      // It is a button that reloads the page: the one place a reload is the way out, because there
      // is nothing yet on the page to lose (D5).
      // A mark on this document, which a reloaded one does not carry.
      await page.evaluate(() => ((window as unknown as { before: boolean }).before = true))
      const again = page.waitForEvent('framenavigated')
      await page.getByRole('button', { name: w.reload }).click()
      await again
      await page.waitForLoadState('load')
      expect(page.url()).toMatch(/\/table\?mode=tv$/)
      expect(await page.evaluate(() => (window as unknown as { before?: boolean }).before)).toBeUndefined()
    } finally {
      await context.close()
    }
  })

  test('keeps the app on the shell’s clock: past four seconds it says it is slow, never that it is only starting', async ({ browser, baseURL, request }) => {
    test.setTimeout(90_000)
    const table = await makeTable(request)
    const seat = await admit(request, table, { name: 'Ada', seat: 'A' })
    // The hand waits for a table that never answers; the editor for its own chunk, which is
    // fetched only once the entry has drawn the editor's route (L20).
    const cases: [string, Device, Voice][] = [
      [seat.playUrl, PHONE, 'phone'],
      ['', DESK, 'editor'],
    ]
    for (const [address, device, voice] of cases) {
      const { context, page } = await screen(browser, baseURL, device)
      try {
        let url = address
        if (voice === 'editor') {
          await logIn(page.request)
          url = (await makeProject(page.request, { name: 'Skogens herrar' })).editorUrl
        }
        // Every heading the page shows, in order, as it shows them.
        await context.addInitScript(() => {
          const said: string[] = []
          ;(window as unknown as { said: string[] }).said = said
          new MutationObserver(() => {
            const h = document.querySelector('h1')?.textContent?.trim() ?? ''
            if (h && said.at(-1) !== h) said.push(h)
          }).observe(document, { subtree: true, childList: true, characterData: true })
        })
        await page.routeWebSocket('**/sessions/**', () => undefined)
        await page.route('**/assets/EditorPage-*.js', () => undefined)
        const release = await holdEntry(page)
        await page.goto(url, { waitUntil: 'commit' })
        await expect(page.locator('#byd-shell[data-slow]')).toBeAttached({ timeout: DEFAULT_TIMING.slowAfterMs + 5_000 })
        release()
        await expect(page.locator('[data-status-notice]')).toBeVisible()
        await expect(page.locator('#byd-shell')).toHaveCount(0)
        // A moment for anything that would start the wait over to show itself.
        await page.waitForTimeout(500)
        const w = words('sv', voice)
        expect(await page.evaluate(() => (window as unknown as { said: string[] }).said), voice).toEqual([w.heading, w.slowHeading])
        await expect(page.locator('[data-status-notice]')).toHaveAttribute('data-status-notice', 'slow')
      } finally {
        await context.close()
      }
    }
  })

  test('hands over to the app without changing the picture', async ({ browser, baseURL, request }) => {
    test.setTimeout(120_000)
    const table = await makeTable(request)
    const seat = await admit(request, table, { name: 'Ada', seat: 'A' })
    const routes: [string, Device, string][] = [
      ['play', PHONE, seat.playUrl],
      ['tv', TV, table.tvUrl],
      ['table', SMALL_TV, table.tableUrl],
      ['join', PHONE, `/join?code=${table.code}`],
      ['editor', DESK, ''],
    ]
    const moved: Record<string, number> = {}
    for (const [name, device, address] of routes) {
      const { context, page } = await screen(browser, baseURL, device, { colorScheme: 'dark', reducedMotion: 'reduce' })
      try {
        let url = address
        if (name === 'editor') {
          await logIn(page.request)
          url = (await makeProject(page.request, { name: 'Skogens herrar' })).editorUrl
        }
        // Whatever the app waits for next never answers, so its first frame is the one that stays.
        await page.routeWebSocket('**/sessions/**', () => undefined)
        await page.route('**/rooms/*', () => undefined)
        await page.route('**/projects/*', (r) => (r.request().resourceType() === 'fetch' ? undefined : r.continue()))
        const release = await holdEntry(page)
        // Not `load`: a module script held on the wire holds the load event with it.
        await page.goto(url, { waitUntil: 'commit' })
        await expect(page.locator('#byd-shell [data-k="h"]')).not.toBeEmpty()
        const before = await page.screenshot()
        release()
        await expect(page.locator('[data-status-notice]')).toBeVisible()
        await expect(page.locator('#byd-shell')).toHaveCount(0)
        moved[name] = await changed(browser, before, await page.screenshot())
      } finally {
        await context.close()
      }
    }
    // The prototype measured 0–2.2 %: the words change, the picture does not.
    test.info().annotations.push({ type: 'changed at handover', description: JSON.stringify(moved) })
    expect(Object.entries(moved).filter(([, share]) => share > 0.05), JSON.stringify(moved)).toEqual([])
  })

  test('without JavaScript, says the page needs it and does not pretend to load', async ({ browser, baseURL }) => {
    const { context, page } = await screen(browser, baseURL, PHONE, { javaScriptEnabled: false, colorScheme: 'light' })
    try {
      await page.goto('/play', { waitUntil: 'load' })
      // Both languages, since nothing has run to choose one. (Playwright's text engine reads past
      // whatever stands in a <noscript>, so the lines are found by where they stand.)
      const lines = page.locator('#byd-shell noscript p')
      await expect(lines).toHaveText([words('sv', 'phone').noscript, words('en', 'phone').noscript])
      for (const line of await lines.all()) await expect(line).toBeVisible()
      await expect(page.locator('#byd-shell h1')).toBeHidden()
      // And on the shell's own dark ground, not a white page.
      const [share] = await whiteShares(browser, [(await page.screenshot({ type: 'jpeg' })).toString('base64')])
      expect(share).toBeLessThan(0.05)
    } finally {
      await context.close()
    }
  })
})

test.describe('the stylesheet no longer holds the first painting, and still holds the app’s first frame (#749, L20, K20)', () => {
  test('stands at the end of the body, after #root, and not in the head', () => {
    const head = index.slice(0, index.indexOf('</head>'))
    expect(head).not.toContain('rel="stylesheet"')
    expect(index.indexOf(`href="${SHEET}"`)).toBeGreaterThan(index.indexOf('<div id="root">'))
  })

  test('paints the shell before the sheet has come, and draws the app’s first frame only once the felt’s face is in the document', async ({ browser, baseURL }) => {
    const { context, page } = await screen(browser, baseURL, TV)
    try {
      // What the document holds at the moment React first commits into #root — which is before
      // that frame is painted, since a mutation observer runs before the browser paints.
      await context.addInitScript(() => {
        const at: Record<string, unknown> = {}
        ;(window as unknown as { first: Record<string, unknown> }).first = at
        new MutationObserver((_, self) => {
          const root = document.getElementById('root')
          if (!root) return
          self.disconnect()
          new MutationObserver((__, me) => {
            if (![...root.children].some((c) => c.id !== 'byd-shell' && c.tagName !== 'SCRIPT')) return
            me.disconnect()
            at['t'] = performance.now()
            at['faces'] = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Roboto Condensed').length
            at['sheets'] = [...document.styleSheets].map((s) => s.href ?? '').filter((h) => h.includes('/assets/'))
          }).observe(root, { childList: true })
        }).observe(document, { childList: true, subtree: true })
      })
      // The sheet is held a second and a half on the wire; the entry is not.
      await page.route(`**${SHEET}`, async (r) => {
        await new Promise((ok) => setTimeout(ok, 1_500))
        await r.continue()
      })
      await page.goto('/table?mode=tv', { waitUntil: 'load' })
      await page.waitForFunction(() => (window as unknown as { first: Record<string, unknown> }).first['t'] !== undefined)
      const m = await page.evaluate((sheet) => ({
        first: (window as unknown as { first: { t: number; faces: number; sheets: string[] } }).first,
        paint: performance.getEntriesByType('paint').find((e) => e.name === 'first-paint')?.startTime ?? Infinity,
        sheetEnd: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).find((e) => e.name.endsWith(sheet))?.responseEnd ?? 0,
      }), SHEET)
      // The shell is painted while the sheet is still on its way…
      expect(m.paint).toBeLessThan(m.sheetEnd)
      // …and the app's first frame is drawn with the sheet in force and both of the felt's faces
      // declared, so the felt never lays itself out in a fallback's measurements (K20).
      expect(m.first.t).toBeGreaterThan(m.sheetEnd)
      expect(m.first.sheets.some((h) => h.endsWith(SHEET))).toBe(true)
      expect(m.first.faces).toBe(2)
    } finally {
      await context.close()
    }
  })

  test('adds less than two kilobytes of gzip to the document', () => {
    // The shell's three parts: its style, its language line in the head, and what stands in #root.
    const bare = index
      .replace(/<style id="byd-shell-style">[\s\S]*?<\/style>/, '')
      .replace(/<script id="byd-shell-lang">[\s\S]*?<\/script>/, '')
      .replace(/<div id="root">[\s\S]*?<\/div>(\s*<link rel="stylesheet")/, '<div id="root"></div>$1')
    expect(bare.length).toBeLessThan(index.length - 1_000)
    const added = gzipSync(index, { level: 9 }).length - gzipSync(bare, { level: 9 }).length
    // The prototype's B weighed 1 578 B; this is its alarm, with room for a word or two.
    test.info().annotations.push({ type: 'shell gzip bytes', description: String(added) })
    expect(added).toBeLessThan(2_000)
  })
})

test.describe('no white frame on the way in (#749)', () => {
  // Every frame from the moment the address changes until the destination has drawn itself and
  // stood a second, decoded and counted. A white frame is one at least half white: the browser's
  // empty canvas, or a page painted before anything that grounds it.
  async function whiteFramesOnTheWay(browser: Browser, page: Page, viewport: { width: number; height: number }, go: () => Promise<unknown>, arrived: () => Promise<unknown>) {
    const cast = await screencast(page, { width: Math.round(viewport.width / 2), height: Math.round(viewport.height / 2) })
    await page.waitForTimeout(300)
    const t0 = Date.now()
    await go()
    await arrived()
    await page.waitForTimeout(1_000)
    await cast.stop()
    const after = cast.frames.filter((f) => f.at >= t0)
    expect(after.length).toBeGreaterThan(0)
    const shares = await whiteShares(browser, after.map((f) => f.data))
    test.info().annotations.push({ type: 'frames on the way', description: `${after.length} frames, most white ${Math.round(Math.max(...shares) * 100)} %` })
    return after.map((f, i) => ({ at: Math.round(f.at - t0), share: Math.round(shares[i]! * 100) })).filter((f) => f.share >= 50)
  }

  test('from the start page to the editor', async ({ browser, baseURL }) => {
    test.setTimeout(90_000)
    const { context, page } = await screen(browser, baseURL, DESK, { colorScheme: 'light' })
    try {
      await logIn(page.request)
      const { editorUrl } = await makeProject(page.request, { name: 'Skogens herrar' })
      await page.goto('/', { waitUntil: 'load' })
      await expect(page.locator('[data-page="home"]')).toBeVisible()
      await slowLine(page)
      const white = await whiteFramesOnTheWay(
        browser,
        page,
        DESK.viewport,
        () => page.evaluate((to) => (location.href = to), editorUrl),
        () => expect(page.locator('[data-page="editor"]')).toBeVisible({ timeout: 45_000 }),
      )
      expect(white).toEqual([])
    } finally {
      await context.close()
    }
  })

  test('from the seat picker to the hand', async ({ browser, baseURL, request }) => {
    test.setTimeout(90_000)
    const table = await makeTable(request)
    const seat = await admit(request, table, { name: 'Ada', seat: 'A' })
    const { context, page } = await screen(browser, baseURL, PHONE, { colorScheme: 'light' })
    try {
      await page.goto(`/join?code=${table.code}`, { waitUntil: 'load' })
      await expect(page.locator('[data-page="join"]')).toBeVisible()
      await slowLine(page)
      const white = await whiteFramesOnTheWay(
        browser,
        page,
        PHONE.viewport,
        () => page.evaluate((to) => (location.href = to), seat.playUrl),
        () => expect(page.locator('[data-page="player"]')).toBeVisible({ timeout: 45_000 }),
      )
      expect(white).toEqual([])
    } finally {
      await context.close()
    }
  })

  test('into the felt’s own screen, where the felt used to arrive after a white page', async ({ browser, baseURL, request }) => {
    test.setTimeout(90_000)
    const table = await makeTable(request)
    const { context, page } = await screen(browser, baseURL, SMALL_TV, { colorScheme: 'light' })
    try {
      await page.goto(`/join?code=${table.code}`, { waitUntil: 'load' })
      await expect(page.locator('[data-page="join"]')).toBeVisible()
      await slowLine(page)
      const white = await whiteFramesOnTheWay(
        browser,
        page,
        SMALL_TV.viewport,
        () => page.evaluate((to) => (location.href = to), table.tableUrl),
        () => expect(page.locator('.byd-table-frame[data-mode="table"]')).toHaveCSS('visibility', 'visible', { timeout: 45_000 }),
      )
      expect(white).toEqual([])
    } finally {
      await context.close()
    }
  })
})
