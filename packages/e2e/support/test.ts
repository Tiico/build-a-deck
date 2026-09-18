import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { join, makeTable, type Admission, type Game, type Table } from './api.js'
import { DESK, type Device } from './devices.js'
import { watchWire, type Wire } from './frames.js'
import { Host } from './host.js'
import { breakableLine, type Line } from './line.js'

/** One screen in a journey: its own browser, its own page, and the wire underneath it. */
export type Client = { page: Page; wire: Wire; context: BrowserContext; line: Line }

export type Fixtures = {
  /** A table of its own for this test, created before the test body runs. */
  table: Table
  /** A different table than the default, for a test that needs a particular one. */
  tableOf: (game: Game) => Promise<Table>
  /**
   * A screen, opened at an address.
   *
   * Every client gets a context of its own and never a tab in someone else's. That is not
   * tidiness: a context is the storage boundary, so two telephones sharing one would share the
   * login cookie and any storage the surfaces keep — and a suite about several people at one
   * table would quietly be a suite about one person with several windows.
   */
  open: (device: Device, url: string) => Promise<Client>
  /** Somebody at the table: admitted through the room code, with their phone already open. */
  player: (table: Table, who: { name: string; seat?: string; device?: Device }) => Promise<Client & { admission: Admission }>
  /**
   * The table's own connection, for arranging the game a journey starts from. Closed with the
   * test, so a socket left open never holds a table loaded past the run that made it.
   */
  host: (table: Table) => Promise<Host>
}

export const test = base.extend<Fixtures>({
  table: async ({ request }, use) => {
    await use(await makeTable(request))
  },

  tableOf: async ({ request }, use) => {
    await use((game: Game) => makeTable(request, game))
  },

  open: async ({ browser, baseURL }, use) => {
    const opened: BrowserContext[] = []
    await use(async (device, url) => {
      const context = await newContext(browser, device, baseURL)
      opened.push(context)
      const page = await context.newPage()
      // The wire is watched, and made breakable, before the address is opened — never after. A
      // socket the listener missed the opening of is a socket whose first frames (the snapshot,
      // which is where a leak would be) were never seen at all, and one opened before the route
      // is in place is not proxied and cannot be cut.
      const wire = watchWire(page)
      const line = await breakableLine(page)
      await page.goto(url)
      return { page, wire, context, line }
    })
    for (const context of opened) await context.close()
  },

  player: async ({ browser, baseURL, request }, use) => {
    const opened: BrowserContext[] = []
    await use(async (table, who) => {
      const admission = await join(request, table, { name: who.name, ...(who.seat !== undefined ? { seat: who.seat } : {}) })
      const context = await newContext(browser, who.device ?? DESK, baseURL)
      opened.push(context)
      const page = await context.newPage()
      const wire = watchWire(page)
      const line = await breakableLine(page)
      await page.goto(admission.playUrl)
      return { page, wire, context, line, admission }
    })
    for (const context of opened) await context.close()
  },

  host: async ({ baseURL }, use) => {
    const opened: Host[] = []
    await use(async (table) => {
      const host = await Host.open(baseURL ?? '', table)
      opened.push(host)
      return host
    })
    for (const host of opened) host.close()
  },
})

const newContext = (browser: Browser, device: Device, baseURL: string | undefined): Promise<BrowserContext> =>
  browser.newContext({
    viewport: device.viewport,
    ...(device.hasTouch ? { hasTouch: true } : {}),
    ...(device.isMobile ? { isMobile: true } : {}),
    ...(baseURL ? { baseURL } : {}),
  })

export { expect } from '@playwright/test'
