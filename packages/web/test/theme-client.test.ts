// Att välja ett färdigt tema (L57, #632), genom klienten och mot en riktig server: familjerna
// hämtas ur katalogen och blir projektets egna filer (#420), och hela bytet är en redigering — en
// version och ett steg tillbaka (B4).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { THEMES } from '../src/editor/themes.js'
import { deckIssues } from '../src/editor/checks.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { watchFontNet, type FontNet } from './font-net.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
let net: FontNet
let opened: ProjectClient[] = []
const openClient = async (): Promise<ProjectClient> => {
  const created = await run.projects.create(run.projectId, projectDoc())
  const client = await ProjectClient.open({ http: run.http, id: created.id })
  opened.push(client)
  return client
}
beforeEach(async () => {
  run = await startServer()
  net = watchFontNet()
})
afterEach(async () => {
  net.undo()
  for (const client of opened) client.close()
  opened = []
  await run.stop()
})

const skogssaga = THEMES.find((th) => th.id === 'skogssaga')!
const ren = THEMES.find((th) => th.id === 'ren')!

describe('choosing a ready-made theme (L57, #632)', () => {
  it('brings both families in out of the catalog as the project’s own files, and the check has nothing to say about type', async () => {
    const client = await openClient()
    await client.useTheme(skogssaga)

    expect(net.asked.filter((url) => url.startsWith('https://fonts.googleapis.com/'))).toEqual([
      'https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&display=swap',
      'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400..800&display=swap',
    ])
    // The family the cards were set in goes with the switch; the one no text stood in is the
    // designer's own and stays.
    expect(Object.keys(client.doc.fonts ?? {}).sort()).toEqual(['Cinzel', 'EB Garamond', 'system-ui'])
    expect(client.doc.fonts?.['Cinzel']).toEqual({ stack: '"Cinzel", serif', asset: expect.stringMatching(/^asset:[0-9a-f]{64}$/), licence: { licence: 'OFL 1.1', by: 'Natanael Gama' }, source: 'catalog' })
    expect(deckIssues(client.doc).filter((issue) => issue.code === 'unpinned-font')).toEqual([])

    // The bytes are on the service and not a promise about Google.
    for (const family of ['Cinzel', 'EB Garamond']) expect((await fetch(`${run.http}/assets/${client.doc.fonts?.[family]?.asset?.slice('asset:'.length)}`)).ok).toBe(true)
  })

  it('gives a game with no icons the starter set, each a project asset with its licence', async () => {
    const client = await openClient()
    await client.useTheme(skogssaga)
    expect(Object.keys(client.doc.icons)).toEqual(['mynt', 'sköld', 'svärd', 'hjärta', 'kristall', 'dra'])
    expect(client.doc.credits?.['mynt']).toEqual({ licence: 'CC0-1.0', by: 'build-your-deck', source: 'mynt' })
    for (const url of Object.values(client.doc.icons)) expect((await fetch(`${run.http}/assets/${url.slice('asset:'.length)}`)).ok).toBe(true)
  })

  it('is one step back, and one version', async () => {
    const client = await openClient()
    const before = client.doc
    await client.useTheme(skogssaga)
    expect(client.doc.theme).toEqual({ from: 'skogssaga' })
    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    expect((await client.versions()).map((v) => v.rev)).toEqual([2, 1])
    expect((await run.projects.load(run.projectId))?.theme).toEqual({ from: 'skogssaga' })

    expect(client.undo()).toBe('undo.what.theme')
    expect(client.doc).toEqual(before)
    expect(client.canUndo).toBe(false)
  })

  it('asks the catalog for nothing the game already carries — choosing the theme again is free', async () => {
    const client = await openClient()
    await client.useTheme(ren)
    net.asked.length = 0
    await client.useTheme(ren)
    expect(net.asked).toEqual([])
  })

  it('leaves the game as it was, and says so, when the catalog does not answer', async () => {
    const client = await openClient()
    const before = client.doc
    net.undo()
    const real = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.startsWith('https://fonts.')) return new Response('', { status: 503 })
      return real(input as RequestInfo, init)
    }) as typeof fetch
    try {
      await expect(client.useTheme(skogssaga)).rejects.toThrow(/katalog/i)
    } finally {
      globalThis.fetch = real
    }
    expect(client.doc).toEqual(before)
    expect(client.canUndo).toBe(false)
  })

  // The edit goes before the bytes (#310), so bytes that never arrive take the whole theme back
  // with them: a game set in a family whose file is nowhere is the very fault #420 was about.
  it('takes the whole theme back when a file never reaches the service', async () => {
    const client = await openClient()
    const before = client.doc
    const real = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      if (init?.method === 'POST' && new URL(url).pathname === '/assets') return new Response('', { status: 500 })
      return real(input as RequestInfo, init)
    }) as typeof fetch
    try {
      await expect(client.useTheme(skogssaga)).rejects.toThrow()
    } finally {
      globalThis.fetch = real
    }
    expect(client.doc).toEqual(before)
    expect(client.canUndo).toBe(false)
  })
})
