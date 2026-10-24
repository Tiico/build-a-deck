import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { STANDARD_TYPES } from '@byd/engine'
import { createFakeProvider, MULTI_STEP_INCHES, type PreparedOrder, type PrintProvider } from '@byd/print'
import type { Template } from '@byd/template'
import { printProvidersOf } from '../src/print-providers.js'
import { start, twoSeatSetup, type Running } from './fixture.js'

// The print package as the designer takes it home (#1208, beslut B 2026-10-23): one zip, in the form
// Testtryckeriet asks for, with the order as a manifest, a readme, a file per side of each card and
// the rulebook. A version the physical checks stop (E5) has no card files, by the same rule as the
// export (G5), and the manifest and the readme say why.

// A background reaching `reach` mm past the trim on every side, under a title.
const templateReaching = (reach: number): Template => ({
  faces: {
    front: {
      base: [
        { kind: 'shape', id: 'paper', x: -reach, y: -reach, w: 63 + 2 * reach, h: 88 + 2 * reach, shape: 'rect', fill: '#c0392b' },
        { kind: 'text', id: 'title', x: 6, y: 6, w: 51, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14, weight: 700 }, color: '#ffffff' },
      ],
      variants: {},
    },
    back: { base: [{ kind: 'shape', id: 'bg', x: -reach, y: -reach, w: 63 + 2 * reach, h: 88 + 2 * reach, shape: 'rect', fill: '#2f4068' }], variants: {} },
  },
})

const game = (reach: number) => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: templateReaching(reach),
    rows: [
      { id: 'drake', fields: { title: 'Drake', antal: 2 } },
      { id: 'troll', fields: { title: 'Troll', antal: 1 } },
    ],
    icons: {},
    rules: { title: 'Skogens herrar', blocks: [{ kind: 'text', id: 't1', text: 'Dra ett kort.' }] },
    setup: { zones, seats, floor, deckZone: 'draw', dice: [{ faces: 6, count: 2, zone: 'table' }] },
  }
}

type Summary = {
  provider: { id: string }
  quote?: { basis: string; duties: unknown; unitPrice: { amountMinor: number; currency: string }; shipping: { amountMinor: number } }
  requirements: { kind: string; bleedMm?: number }[]
  order: PreparedOrder
  files: { name: string }[]
  errors: unknown[]
}

describe('the print package to download', () => {
  let run: Running
  let cookie = ''
  const open = async (printProviders: PrintProvider[]) => {
    run = await start({ printProviders })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }
  beforeEach(async () => {
    await open([...printProvidersOf(STANDARD_TYPES), createFakeProvider(MULTI_STEP_INCHES)])
  })
  afterEach(async () => {
    await run.stop()
  })
  const call = (method: string, path: string, body?: unknown) => fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
  // Asked again until every file is drawn, as the page does.
  const zipOf = async (path: string) => {
    for (;;) {
      const res = await call('GET', path)
      if (res.status !== 202) return res
      await run.renderAll()
    }
  }

  // F2: the page asks for the package an order to Sweden would be routed to, not for a provider by
  // name, so what it shows is what the routing would choose.
  it('routes the package to the provider an order to the address would go to, and quotes it', async () => {
    await call('POST', '/projects', { id: 'p1', ...game(4) })
    const pkg = (await (await call('GET', '/projects/p1/print-package?to=SE')).json()) as Summary
    expect(pkg.provider.id).toBe('testtryckeriet')
    expect(pkg.requirements.find((r) => r.kind === 'printed')?.bleedMm).toBe(3)
    expect(pkg.requirements.some((r) => r.kind === 'stock')).toBe(true)
    // Inside the EU, so no duty; and made up, which the page stamps.
    expect(pkg.quote?.basis).toBe('fictional')
    expect(pkg.quote?.duties).toEqual({ amountMinor: 0, currency: 'SEK' })
    expect(pkg.quote?.unitPrice.currency).toBe('SEK')
    expect(pkg.order.hardware.map((h) => h.count)).toEqual([2])
    // Asked of a provider by name, there is no address to quote for.
    const named = (await (await call('GET', '/projects/p1/print-package?provider=testtryckeriet')).json()) as Summary
    expect(named.quote).toBeUndefined()
    expect((await call('GET', '/projects/p1/print-package?to=sverige')).status).toBe(400)
  })

  it('says «no EU print» rather than sending an EU address to a printer outside it', async () => {
    await run.stop()
    await open([createFakeProvider(MULTI_STEP_INCHES)])
    await call('POST', '/projects', { id: 'p1', ...game(4) })
    const res = await call('GET', '/projects/p1/print-package?to=SE')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'no-eu-print' })
  })

  it('hands over one zip with the manifest, a readme, a file per side and the rulebook', async () => {
    await call('POST', '/projects', { id: 'p1', ...game(4) })
    const waiting = await call('GET', '/projects/p1/print-package/zip?provider=testtryckeriet')
    expect(waiting.status).toBe(202)
    expect(await waiting.json()).toMatchObject({ total: 4, done: 0, failed: 0 })
    const res = await zipOf('/projects/p1/print-package/zip?provider=testtryckeriet&lang=sv')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain(`filename*=UTF-8''${encodeURIComponent('Skogens herrar v1 tryckpaket.zip')}`)
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual(['LASMIG.md', 'manifest.json', 'tryck/drake-back.pdf', 'tryck/drake-front.pdf', 'tryck/regelhafte.pdf', 'tryck/troll-front.pdf'])
    for (const name of Object.keys(files).filter((f) => f.endsWith('.pdf'))) expect(strFromU8(files[name]!.subarray(0, 5)), name).toBe('%PDF-')
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as Record<string, unknown> & { order: PreparedOrder; files: string[] }
    expect(manifest).toMatchObject({ format: 'byd-print-package', formatVersion: 1, project: { id: 'p1', name: 'Skogens herrar' }, rev: 1, provider: { id: 'testtryckeriet' }, rulebook: 'tryck/regelhafte.pdf', errors: [] })
    expect(manifest.files).toEqual(['tryck/drake-front.pdf', 'tryck/drake-back.pdf', 'tryck/troll-front.pdf'])
    expect(manifest.order.cards.map((c) => c.cardRef)).toEqual(['drake', 'drake', 'troll'])
    expect(manifest.order.hardware).toEqual([{ type: { id: 'die.d6', version: 1 }, sku: 'd6', count: 2 }])
    const readme = strFromU8(files['LASMIG.md']!)
    expect(readme).toContain('Ingen beställning')
    expect(readme).toContain('`tryck/regelhafte.pdf`')
    expect(readme).not.toContain('utelämnade')
  }, 120_000)

  it('leaves the card files out of a version the print checks stop, and says why', async () => {
    // A background that stops 2 mm past the trim falls short of the 3 mm bleed.
    await call('POST', '/projects', { id: 'p1', ...game(2) })
    const summary = (await (await call('GET', '/projects/p1/print-package?to=SE')).json()) as Summary
    expect(summary.files).toEqual([])
    expect(summary.errors.length).toBeGreaterThan(0)
    const res = await zipOf('/projects/p1/print-package/zip?provider=testtryckeriet&lang=sv')
    expect(res.status).toBe(200)
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual(['LASMIG.md', 'manifest.json', 'tryck/regelhafte.pdf'])
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as { files: string[]; errors: { code: string; cardRef: string; face: string }[]; order: PreparedOrder }
    expect(manifest.files).toEqual([])
    expect(manifest.errors.map((e) => e.code)).toContain('short-of-bleed')
    expect(manifest.errors[0]).toMatchObject({ cardRef: 'drake' })
    // What would have been sent still stands in the order, so the reader can see what is held back.
    expect(manifest.order.files.length).toBe(3)
    expect(strFromU8(files['LASMIG.md']!)).toMatch(/utelämnade: tryckkontrollen hittade \d+ fel/)
  }, 120_000)

  it('speaks the reader\'s language in the readme and the name, and keeps the file names', async () => {
    await call('POST', '/projects', { id: 'p1', ...game(4) })
    const res = await zipOf('/projects/p1/print-package/zip?provider=testtryckeriet&lang=en')
    expect(res.headers.get('content-disposition')).toContain(`filename*=UTF-8''${encodeURIComponent('Skogens herrar v1 print package.zip')}`)
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    expect(strFromU8(files['LASMIG.md']!)).toContain('No order')
    expect(Object.keys(files)).toContain('tryck/regelhafte.pdf')
  }, 120_000)
})
