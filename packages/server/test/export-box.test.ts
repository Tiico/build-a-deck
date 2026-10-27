import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { strFromU8, unzipSync, zipSync } from 'fflate'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'
import { ProjectExport, readmeOf } from '../src/export.js'

// Spelets låda i exporten (G5, #1418, L91): lådans ytor, mått, lås och luft följer med. Dokumentets
// `box` står i varje version, manifestets `print.box` säger lådan som den mäts och vilken PDF som är
// vilken yta, och ytorna ligger som tryck-PDF:er med utfall under `tryck/lada/`, ritade av samma
// renderare som korten (E2). Importen tar tillbaka lådan, och rundturen ger samma `spel.json`.

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

// Designerns framsida: en röd kartong och spelets namn. Resten av ytorna är neutrala.
const FRONT = {
  base: [
    { kind: 'shape', id: 'ground', x: 0, y: 0, w: 67, h: 92, shape: 'rect', fill: '#7a2e1f' },
    { kind: 'text', id: 'title', x: 4, y: 30, w: 59, h: 20, bind: { literal: 'Skogens herrar' }, font: { family: 'sans-serif', sizePt: 16, weight: 700, align: 'center' }, color: '#f3ecdc' },
  ],
  variants: {},
}
const BOX = { type: { id: 'box.tuck', version: 1 }, clearance: { around: 2 }, locked: { depth: 20 }, faces: { front: FRONT } }

function game(box?: unknown) {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template,
    rows: [
      { id: 'dragon', fields: { title: 'Drake', antal: 2 } },
      { id: 'knight', fields: { title: 'Riddare', antal: 1 } },
    ],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
    ...(box ? { box } : {}),
  }
}

const FACES = ['front', 'back', 'left', 'right', 'lid', 'bottom'] as const
const PT_PER_MM = 72 / 25.4
// The page a PDF was drawn on, in millimetres, off its MediaBox.
function pageMm(pdf: Uint8Array): { w: number; h: number } | null {
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(Buffer.from(pdf).toString('latin1'))
  return box ? { w: Math.round((Number(box[1]) / PT_PER_MM) * 10) / 10, h: Math.round((Number(box[2]) / PT_PER_MM) * 10) / 10 } : null
}

describe('lådan i exporten (G5, #1418)', () => {
  let owner: ReturnType<typeof as>
  let cookie = ''
  beforeEach(async () => {
    cookie = await login('ada@example.com')
    owner = as(cookie)
    await owner('POST', '/projects', { id: 'p1', ...game() })
    await owner('PUT', '/projects/p1', { rev: 1, ...game(BOX) })
  })
  const exported = async (id: string) => {
    await owner('POST', `/projects/${id}/export`)
    await run.renderAll()
    const res = await owner('GET', `/projects/${id}/export?lang=sv`)
    expect(res.status).toBe(200)
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    return { files, manifest: ProjectExport.parse(JSON.parse(strFromU8(files['spel.json']!))) }
  }

  it('bär lådans mått, lås, luft och ytor i manifestet, och varje yta som en PDF med utfall', async () => {
    const { files, manifest } = await exported('p1')
    // Dokumentets låda står i versionen som den sparades: designerns svar och hennes yta.
    expect(manifest.versions.at(-1)!.doc.box).toEqual(BOX)
    // Lådan som den mäts: bredden och höjden följer leken med 2 mm luft, och djupet är låst.
    expect(manifest.print.box).toMatchObject({
      type: { id: 'box.tuck', version: 1 },
      size: { width: 67, height: 92, depth: 20 },
      locked: { width: false, height: false, depth: true },
      clearance: { around: 2, depth: 2 },
    })
    // Nätet arket är vikt ur, i millimeter.
    expect(manifest.print.box!.net.width).toBeGreaterThan(2 * 67)
    // En PDF per yta, där designerns yta är ritad och resten neutrala.
    expect(Object.keys(manifest.print.box!.faces).sort()).toEqual([...FACES].sort())
    for (const face of FACES) {
      const entry = manifest.print.box!.faces[face]!
      expect(entry).toEqual({ file: `tryck/lada/${face}.pdf`, drawn: face === 'front' })
      const pdf = files[entry.file]
      expect({ face, pdf: pdf !== undefined && strFromU8(pdf.slice(0, 5)) }).toEqual({ face, pdf: '%PDF-' })
    }
    // Ytan ritas i sitt eget mått med lådans utfall, 3 mm på varje kant: framsidan 67 × 92 mm och
    // sidan djupet gånger höjden.
    // Chromium lays a page out on whole pixels, so a page is its measure within a tenth of a millimetre.
    for (const [face, w, h] of [['front', 73, 98], ['left', 26, 98], ['lid', 73, 26]] as const) {
      const page = pageMm(files[`tryck/lada/${face}.pdf`]!)
      expect({ face, w: Math.abs((page?.w ?? 0) - w) <= 0.15, h: Math.abs((page?.h ?? 0) - h) <= 0.15 }).toEqual({ face, w: true, h: true })
    }
  }, 90_000)

  it('ger en låda som spelet aldrig rört som den neutrala, och följer leken', async () => {
    await owner('POST', '/projects', { id: 'p2', ...game() })
    const { files, manifest } = await exported('p2')
    expect(manifest.versions.at(-1)!.doc).not.toHaveProperty('box')
    expect(manifest.print.box).toMatchObject({ size: { width: 65, height: 90, depth: 3 }, locked: { width: false, height: false, depth: false }, clearance: { around: 1, depth: 2 } })
    for (const face of FACES) expect(manifest.print.box!.faces[face]).toEqual({ file: `tryck/lada/${face}.pdf`, drawn: false })
    expect(files['tryck/lada/front.pdf']).toBeDefined()
  }, 90_000)

  it('tas tillbaka av importen, och rundturen ger samma låda och samma spel.json', async () => {
    const first = await exported('p1')
    const res = await fetch(`${run.http}/projects/import`, { method: 'POST', headers: { 'content-type': 'application/zip', cookie }, body: Buffer.from(zipSync(first.files)) })
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: string }
    expect((await run.projects.load(id))?.box).toEqual(BOX)
    const again = await exported(id)
    expect(again.manifest.print.box).toEqual(first.manifest.print.box)
    const same = (m: ProjectExport) => ({ ...m, exportedAt: '', project: { id: '', name: '' }, versions: m.versions.map(({ atSeq: _, doc, ...v }) => ({ ...v, doc: { ...doc, name: '' } })) })
    expect(same(again.manifest)).toEqual(same(first.manifest))
    for (const face of FACES) expect(again.files[`tryck/lada/${face}.pdf`]).toBeDefined()
  }, 120_000)
})

describe('LASMIG förklarar lådan (#1418)', () => {
  const manifest = (box: boolean): ProjectExport =>
    ProjectExport.parse({
      format: 'byd-export',
      formatVersion: 1,
      exportedAt: '2026-10-27T10:00:00.000Z',
      project: { id: 'p1', name: 'Skogens herrar' },
      current: { rev: 2 },
      versions: [{ rev: 2, at: '2026-10-27T10:00:00.000Z', doc: game() }],
      assets: [],
      print: {
        rev: 2,
        cards: [],
        credits: [],
        warnings: [],
        errors: [],
        failed: [],
        ...(box
          ? {
              box: {
                type: { id: 'box.tuck', version: 1 },
                size: { width: 65, height: 90, depth: 34.5 },
                locked: { width: false, height: false, depth: true },
                clearance: { around: 1, depth: 2 },
                net: { width: 322, height: 159 },
                faces: Object.fromEntries(FACES.map((f) => [f, { file: `tryck/lada/${f}.pdf`, drawn: f === 'front' }])),
              },
            }
          : {}),
      },
    })

  it('säger var ytorna ligger, lådans mått och att tryckfilerna till tryckeriet kommer med partnern', () => {
    const sv = readmeOf('sv', manifest(true))
    expect(sv).toMatch(/`tryck\/lada\/`/)
    expect(sv).toMatch(/65 × 90 × 34,5 mm/)
    expect(sv).toMatch(/`print\.box`/)
    expect(sv).toMatch(/1 av 6 ytor är ritad/)
    expect(sv).toMatch(/djupet är låst/)
    expect(sv).toMatch(/när en tryckpartner är vald/)
    const en = readmeOf('en', manifest(true))
    expect(en).toMatch(/`tryck\/lada\/`/)
    expect(en).toMatch(/65 × 90 × 34\.5 mm/)
    expect(en).toMatch(/1 of 6 faces is drawn/)
    expect(en).toMatch(/the depth is locked/)
    expect(en).toMatch(/once a print partner is chosen/)
  })

  it('nämner ingen låda i en export gjord före lådan', () => {
    expect(readmeOf('sv', manifest(false))).not.toMatch(/lada/)
  })
})
