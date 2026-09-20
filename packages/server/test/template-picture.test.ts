import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectDoc, liftDoc } from '../src/projects.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

// A picture the template carries by itself (#320) is a reference written into the image element,
// and a reference is worth nothing if the project loses it on the way out and in. So the document
// is taken through the schema and the lift it comes through on every read, and through the
// service's own create and read, and the reference is expected back exactly as it went.
const LOGO = '2'.repeat(64)

function project() {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: {
      faces: {
        ...template.faces,
        back: { base: [{ kind: 'image' as const, id: 'logo', x: 20, y: 30, w: 23, h: 23, bind: { literal: `asset:${LOGO}` }, fit: 'contain' as const, frame: { fill: 0.8 } }], variants: {} },
      },
    },
    rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }],
    icons: {},
    pictures: { [LOGO]: { name: 'logga.png', crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } } },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('a template’s own picture survives the project’s round trip (#320)', () => {
  it('reads back through the schema and the lift exactly as it was written', () => {
    const doc = project()
    const read = ProjectDoc.parse(liftDoc(JSON.parse(JSON.stringify(doc))))
    expect(read.template.faces['back']).toEqual(doc.template.faces['back'])
    expect(read.pictures).toEqual(doc.pictures)
  })

  describe('over the service', () => {
    let run: Running
    let cookie = ''
    beforeEach(async () => {
      run = await start()
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
      cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    })
    afterEach(async () => {
      await run.stop()
    })

    it('is created and read back with the reference intact', async () => {
      const doc = project()
      const created = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(doc) })
      expect(created.status).toBe(201)
      const { id } = (await created.json()) as { id: string }
      const read = (await (await fetch(`${run.http}/projects/${id}`, { headers: { cookie } })).json()) as ProjectDoc
      expect(read.template.faces['back']).toEqual(doc.template.faces['back'])
      expect(read.pictures).toEqual(doc.pictures)
    })
  })
})
