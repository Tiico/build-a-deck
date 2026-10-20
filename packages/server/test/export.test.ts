import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'
import { ProjectExport, assetHashesOf, exportDisposition, printFileOf } from '../src/export.js'

// Full export of a game (G5, #527): the designer's data, whole, in a documented format they can
// open without the tool — the document with its every version, every asset as a file, and the
// print-ready PDFs — because a game is two to four years of work and the tool must never be the
// only place it lives.

let run: Running
beforeEach(async () => {
  run = await start()
})
afterEach(async () => {
  await run.stop()
})

const login = async (email: string): Promise<string> => {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}
const as = (cookie: string) => (method: string, path: string, body?: unknown) =>
  fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })

// Two small pictures, different bytes, so they are two assets.
const PNG_A = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const PNG_B = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 4, 5, 6])
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function game(icon: string, sizePt = 14) {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: {
      faces: {
        ...template.faces,
        front: { ...template.faces['front']!, base: template.faces['front']!.base.map((el) => (el.kind === 'text' ? { ...el, font: { ...el.font, sizePt } } : el)) },
      },
    },
    rows: [
      { id: 'dragon', fields: { title: 'Drake', antal: 2 } },
      { id: 'knight', fields: { title: 'Riddare', antal: 1 } },
    ],
    icons: { sol: `asset:${icon}` },
    rules: { title: 'Skogens herrar', blocks: [{ kind: 'text', id: 't1', text: 'Dra ett kort.' }] },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('exporting a whole game (G5, #527)', () => {
  let owner: ReturnType<typeof as>
  let a = ''
  let b = ''
  beforeEach(async () => {
    const cookie = await login('ada@example.com')
    owner = as(cookie)
    const up = async (bytes: Uint8Array) => ((await (await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: Buffer.from(bytes) })).json()) as { hash: string }).hash
    a = await up(PNG_A)
    b = await up(PNG_B)
    // Version 1 uses the first picture, version 2 the second, and a label names version 1.
    await owner('POST', '/projects', { id: 'p1', ...game(a) })
    await owner('PUT', '/projects/p1', { rev: 1, ...game(b) })
    await owner('PUT', '/projects/p1/versions/1/label', { label: 'Första utkastet' })
  })

  it('waits for the print files, and then hands over a zip the format documents', async () => {
    const started = await owner('POST', '/projects/p1/export')
    expect(started.status).toBe(202)
    expect(await started.json()).toMatchObject({ rev: 2, done: 0 })
    // Not ready while the renderer has not run.
    const early = await owner('GET', '/projects/p1/export')
    expect(early.status).toBe(202)
    const progress = (await early.json()) as { total: number; done: number }
    expect(progress.total).toBeGreaterThan(0)

    await run.renderAll()
    const res = await owner('GET', '/projects/p1/export?lang=sv')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="Skogens herrar v2\.zip"/)
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))

    // The manifest, valid against the schema that documents it, which travels in the zip too.
    const manifest = ProjectExport.parse(JSON.parse(strFromU8(files['spel.json']!)))
    expect(JSON.parse(strFromU8(files['schema.json']!))).toMatchObject({ type: 'object' })
    expect(strFromU8(files['LASMIG.md']!)).toMatch(/spel\.json/)
    // Every name in the zip is ASCII: an unzip that does not read the UTF-8 flag — the one macOS
    // ships in its Terminal — would otherwise write «LÄSMIG.md» as «L+?SMIG.md».
    expect(Object.keys(files).filter((f) => !/^[\x20-\x7e]+$/.test(f))).toEqual([])
    expect(manifest).toMatchObject({ format: 'byd-export', formatVersion: 1, project: { id: 'p1', name: 'Skogens herrar' }, current: { rev: 2 } })

    // The whole history, each version as it stood, with its name.
    expect(manifest.versions.map((v) => [v.rev, v.label ?? null])).toEqual([
      [1, 'Första utkastet'],
      [2, null],
    ])
    expect((manifest.versions[0]!.doc as { icons: Record<string, string> }).icons['sol']).toBe(`asset:${a}`)

    // Every asset any version uses, as a real file whose bytes are its hash.
    expect(manifest.assets.map((x) => x.hash).sort()).toEqual([a, b].sort())
    for (const asset of manifest.assets) {
      const bytes = files[asset.file]
      expect({ file: asset.file, hash: bytes && sha(bytes) }).toEqual({ file: asset.file, hash: asset.hash })
      expect(asset.file).toBe(`assets/${asset.hash}.png`)
    }

    // The print-ready files of the current version: every face of every card, and the rulebook.
    expect(manifest.print.errors).toEqual([])
    expect(manifest.print.cards.map((c) => c.cardRef).sort()).toEqual(['dragon', 'knight'])
    for (const card of manifest.print.cards)
      for (const file of Object.values(card.faces)) expect({ file, there: files[file] !== undefined }).toEqual({ file, there: true })
    const pdfs = Object.keys(files).filter((f) => f.startsWith('tryck/'))
    expect(pdfs).toContain(manifest.print.rulebook!)
    expect(pdfs.length).toBeGreaterThan(2)
  }, 90_000)

  it('gives two cards whose ids fold to the same name a print file each', async () => {
    const twins = { ...game(b), rows: [{ id: '龍', fields: { title: 'Drake', antal: 1 } }, { id: '鳳', fields: { title: 'Fenix', antal: 1 } }] }
    await owner('POST', '/projects', { id: 'p2', ...twins })
    await owner('POST', '/projects/p2/export')
    await run.renderAll()
    const files = unzipSync(new Uint8Array(await (await owner('GET', '/projects/p2/export')).arrayBuffer()))
    const manifest = ProjectExport.parse(JSON.parse(strFromU8(files['spel.json']!)))
    const named = manifest.print.cards.flatMap((c) => Object.values(c.faces))
    expect(new Set(named).size).toBe(named.length)
    for (const file of named) expect({ file, there: files[file] !== undefined }).toEqual({ file, there: true })
  }, 90_000)

  it('exports a game the print checks stop, without its print files and with why', async () => {
    await owner('PUT', '/projects/p1', { rev: 2, ...game(b, 4) })
    const started = await owner('POST', '/projects/p1/export')
    expect(started.status).toBe(202)
    await run.renderAll()
    const res = await owner('GET', '/projects/p1/export')
    expect(res.status).toBe(200)
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    const manifest = ProjectExport.parse(JSON.parse(strFromU8(files['spel.json']!)))
    expect(manifest.print.cards).toEqual([])
    expect(manifest.print.errors.map((e) => e.code)).toContain('text-too-small')
    // The data is the designer's whether or not it can go to a printer (G5).
    expect(manifest.versions).toHaveLength(3)
    expect(Object.keys(files).filter((f) => f.startsWith('tryck/') && f !== manifest.print.rulebook)).toEqual([])
  }, 90_000)

  it('is the owner’s and the co-editors’, and nobody else’s', async () => {
    const share = async (email: string, role: string) => {
      await owner('POST', '/projects/p1/invites', { email, role })
      const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
      const cookie = await login(email)
      await fetch(`${run.http}/invites/${link}`, { method: 'POST', headers: { cookie } })
      return as(cookie)
    }
    const editor = await share('bo@example.com', 'editor')
    const tester = await share('cilla@example.com', 'tester')
    const viewer = await share('dan@example.com', 'viewer')
    const stranger = as(await login('eva@example.com'))
    for (const [who, call, status] of [
      ['editor', editor, 202],
      ['tester', tester, 403],
      ['viewer', viewer, 403],
      ['stranger', stranger, 403],
      ['nobody', as(''), 401],
    ] as const) {
      expect({ who, post: (await call('POST', '/projects/p1/export')).status, get: (await call('GET', '/projects/p1/export')).status }).toEqual({ who, post: status, get: status })
    }
  })
})

describe('what the export collects and what it names things (#527)', () => {
  const h = (n: number) => String(n).repeat(64).slice(0, 64)
  it('finds an asset wherever a document can hold one, and a picture by its own entry', () => {
    const doc = {
      rows: [{ id: 'r', fields: { art: `asset:${h(1)}`, title: 'asset:not-a-hash' } }],
      icons: { sol: `asset:${h(2)}`, måne: 'https://example.test/m.svg' },
      template: { faces: { front: { base: [{ kind: 'image', bind: { literal: `asset:${h(3)}` } }] } } },
      fonts: { Garamond: { stack: 'serif', asset: `asset:${h(4)}` } },
      rules: { title: 'R', blocks: [{ kind: 'image', asset: `asset:${h(5)}` }] },
      pictures: { [h(6)]: { name: 'Skog' } },
    }
    expect(assetHashesOf(doc)).toEqual([1, 2, 3, 4, 5, 6].map(h))
  })

  it('names a print file after the card whatever the card is called, and a download after the game', () => {
    expect(printFileOf('drake', 'front')).toBe('tryck/drake-front.pdf')
    expect(printFileOf('Häxan / den svarta', 'back')).toBe('tryck/Haxan_den_svarta-back.pdf')
    expect(printFileOf('龍', 'front')).toBe('tryck/_-front.pdf')
    expect(printFileOf('鳳', 'front', 2)).toBe('tryck/_-2-front.pdf')
    // The version by the word people read, «v3», never the id «rev-3» (#703).
    expect(exportDisposition('Skogens härskare', 3)).toBe(`attachment; filename="Skogens h_rskare v3.zip"; filename*=UTF-8''${encodeURIComponent('Skogens härskare v3.zip')}`)
  })
})

// Bringing an export back (G5, #528): a new game, owned by whoever brings it, with the document,
// its every version and every asset it had — never written over one that is there.
describe('importing an export (G5, #528)', () => {
  let cookie = ''
  let owner: ReturnType<typeof as>
  let zip = new Uint8Array()
  beforeEach(async () => {
    cookie = await login('ada@example.com')
    owner = as(cookie)
    const up = async (bytes: Uint8Array) => ((await (await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: Buffer.from(bytes) })).json()) as { hash: string }).hash
    const a = await up(PNG_A)
    const b = await up(PNG_B)
    await owner('POST', '/projects', { id: 'p1', ...game(a) })
    await owner('PUT', '/projects/p1', { rev: 1, ...game(b) })
    await owner('PUT', '/projects/p1/versions/1/label', { label: 'Första utkastet' })
    await owner('POST', '/projects/p1/export')
    await run.renderAll()
    zip = new Uint8Array(await (await owner('GET', '/projects/p1/export')).arrayBuffer())
  }, 90_000)
  const bring = (bytes: Uint8Array, who = cookie) => fetch(`${run.http}/projects/import`, { method: 'POST', headers: { 'content-type': 'application/zip', cookie: who }, body: Buffer.from(bytes) })
  const manifestOf = (bytes: Uint8Array) => ProjectExport.parse(JSON.parse(strFromU8(unzipSync(bytes)['spel.json']!)))
  const edited = (change: (files: Record<string, Uint8Array>) => void) => {
    const files = unzipSync(zip)
    change(files)
    return zipSync(files)
  }

  it('makes a new game of it that exports as the same game', async () => {
    const res = await bring(zip)
    expect(res.status).toBe(201)
    const { id, rev } = (await res.json()) as { id: string; rev: number }
    expect(id).not.toBe('p1')
    expect(rev).toBe(2)
    expect((await run.projects.load(id))?.owner).toBe((await run.projects.load('p1'))?.owner)

    await owner('POST', `/projects/${id}/export`)
    await run.renderAll()
    const again = manifestOf(new Uint8Array(await (await owner('GET', `/projects/${id}/export`)).arrayBuffer()))
    const before = manifestOf(zip)
    // Ada has the original too, so the copy says it is one (#529); nothing else differs.
    expect(again.project.name).toBe('Skogens herrar (importerad)')
    const same = (m: ProjectExport) => ({ ...m, exportedAt: '', project: { id: '', name: '' }, versions: m.versions.map(({ atSeq: _, doc, ...v }) => ({ ...v, doc: { ...doc, name: '' } })) })
    expect(same(again)).toEqual(same(before))
  }, 90_000)

  it('refuses a zip whose picture is not what its name says, and leaves nothing behind', async () => {
    const [asset] = manifestOf(zip).assets
    const res = await bring(edited((files) => (files[asset!.file] = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9]))))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ problems: [{ code: 'asset-hash', values: { hash: asset!.hash, file: asset!.file } }] })
    expect(await run.projects.list((await run.projects.load('p1'))!.owner!)).toHaveLength(1)
  }, 90_000)

  it('refuses what is not an export, a newer format, and a document that points at a picture it does not carry', async () => {
    // Every refusal is a code and what it is about, so the tool can say it in the reader's words.
    const refused = async (res: Response) => ({ status: res.status, codes: ((await res.json()) as { problems: { code: string }[] }).problems.map((p) => p.code) })
    expect(await refused(await bring(strToU8('not a zip')))).toEqual({ status: 422, codes: ['not-zip'] })
    expect(await refused(await bring(edited((files) => delete files['spel.json'])))).toEqual({ status: 422, codes: ['no-manifest'] })
    const newer = await bring(edited((files) => (files['spel.json'] = strToU8(JSON.stringify({ ...manifestOf(zip), formatVersion: 2 })))))
    expect(newer.status).toBe(422)
    expect(await newer.json()).toMatchObject({ problems: [{ code: 'newer-format', values: { version: 2 } }] })
    const ghost = 'f'.repeat(64)
    const lost = await bring(
      edited((files) => {
        const m = manifestOf(zip)
        const last = m.versions.at(-1)!
        files['spel.json'] = strToU8(JSON.stringify({ ...m, versions: [...m.versions.slice(0, -1), { ...last, doc: { ...last.doc, icons: { ...last.doc.icons, måne: `asset:${ghost}` } } }] }))
      }),
    )
    expect(lost.status).toBe(422)
    expect(await lost.json()).toMatchObject({ problems: [{ code: 'asset-unknown', values: { hash: ghost } }] })
    expect(await run.projects.list((await run.projects.load('p1'))!.owner!)).toHaveLength(1)
  }, 90_000)

  // A copy is named as a copy only where there is something to tell it apart from (#529), and in the
  // language it was brought in in (A4): what the tool writes into a game is the designer's.
  it('keeps the name when nothing is called the same, and says «imported» in English', async () => {
    const bo = await login('bo@example.com')
    const theirs = await fetch(`${run.http}/projects/import`, { method: 'POST', headers: { 'content-type': 'application/zip', cookie: bo }, body: Buffer.from(zip) })
    expect((await run.projects.load(((await theirs.json()) as { id: string }).id))?.name).toBe('Skogens herrar')
    const english = await fetch(`${run.http}/projects/import?lang=en`, { method: 'POST', headers: { 'content-type': 'application/zip', cookie }, body: Buffer.from(zip) })
    expect((await run.projects.load(((await english.json()) as { id: string }).id))?.name).toBe('Skogens herrar (imported)')
  }, 90_000)

  // A game can point at a picture the server never had — a reference written by hand, an asset lost
  // before it — and it is still the designer's game. The export says which are missing rather than
  // leaving them out in silence, and the import takes what the export says was already missing.
  it('exports a picture the game points at but the server does not have as missing, and takes it back', async () => {
    const ghost = 'e'.repeat(64)
    const [asset] = manifestOf(zip).assets
    await owner('PUT', '/projects/p1', { rev: 2, ...game(asset!.hash), icons: { sol: `asset:${asset!.hash}`, måne: `asset:${ghost}` } })
    await owner('POST', '/projects/p1/export')
    await run.renderAll()
    const again = new Uint8Array(await (await owner('GET', '/projects/p1/export')).arrayBuffer())
    expect(manifestOf(again).absent).toEqual([ghost])
    expect(manifestOf(again).assets.map((a) => a.hash)).not.toContain(ghost)
    expect((await bring(again)).status).toBe(201)
  }, 90_000)

  it('is for someone logged in', async () => {
    expect((await bring(zip, '')).status).toBe(401)
  }, 90_000)
})
