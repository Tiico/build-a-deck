import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderRules, type RuleDoc } from '@byd/template'
import { A5, bookletOf } from '../src/booklet.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

const names = { zones: { draw: 'Draghög', discard: 'Kasthög', 'hand:A': 'Hand' }, cards: { drake: 'Drake' } }
const doc: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Dra ur [[zon:draw]] och spela **[[kort:drake]]** för {2}.' },
    { kind: 'list', id: 'l1', ordered: true, items: ['Dra ett kort.', 'Lägg i [[zon:discard]].'] },
    { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp' },
  ],
}
const icons = { '2': 'data:image/svg+xml;utf8,<svg/>' }

describe('the rulebook as a booklet for print (B7)', () => {
  it('lays the rules out as pages of a given size, with the game on the front', () => {
    const out = bookletOf({ rules: renderRules(doc, names), icons, pageMm: { w: 148, h: 210 } })
    expect(out.css).toContain('@page')
    expect(out.css).toContain('148mm 210mm')
    // A booklet is a document, not a card: nothing here pretends to be one.
    expect(out.html).not.toContain('data-card')
    expect(out.html).toContain('data-booklet')
    expect(out.html).toContain('Skogens herrar')
  })

  it('writes what the reader sees: names for references, the pip, and emphasis', () => {
    const out = bookletOf({ rules: renderRules(doc, names), icons, pageMm: { w: 148, h: 210 } })
    expect(out.html).toContain('Draghög')
    expect(out.html).toContain('<strong>Drake</strong>')
    expect(out.html).not.toContain('[[zon:draw]]')
    // A name the icon set has is drawn as that icon; a bare number the set does not name is a
    // pip, exactly as on a card (L2).
    expect(out.html).toContain('<img class="byd-icon"')
    const bare = bookletOf({ rules: renderRules(doc, names), icons: {}, pageMm: { w: 148, h: 210 } })
    expect(bare.html).toContain('<span class="byd-pip">2</span>')
    expect(out.html).toContain('<ol')
    expect(out.html).toContain('Lägg i Kasthög.')
  })

  it('draws the setup from the zones the game actually has (B5)', () => {
    const out = bookletOf({ rules: renderRules(doc, names), icons, pageMm: { w: 148, h: 210 }, zones: ['Draghög', 'Kasthög', 'Hand'] })
    expect(out.html).toContain('Så ställs bordet upp')
    expect(out.html).toContain('data-zone')
    expect(out.html).toContain('Kasthög')
  })

  it('escapes what a designer wrote, so a rulebook can never carry markup into the renderer', () => {
    const nasty = renderRules({ title: '<script>x</script>', blocks: [{ kind: 'text', id: 't', text: 'a < b & c > d' }] }, names)
    const out = bookletOf({ rules: nasty, icons, pageMm: { w: 148, h: 210 } })
    expect(out.html).not.toContain('<script>')
    expect(out.html).toContain('&lt;script&gt;')
    expect(out.html).toContain('a &lt; b &amp; c &gt; d')
  })

  it('says which credits the printer is handed, so licences travel with the booklet (E4)', () => {
    const out = bookletOf({
      rules: renderRules(doc, names),
      icons,
      pageMm: { w: 148, h: 210 },
      credits: [{ name: 'sköld', licence: 'CC0-1.0', by: 'build-your-deck' }],
    })
    expect(out.html).toContain('CC0-1.0')
    expect(out.html).toContain('build-your-deck')
  })
})

describe('the booklet in the language the game is made in (A4)', () => {
  it('prints the one heading the tool contributes in the language the order was placed in', () => {
    const credits = [{ name: 'sköld', licence: 'CC0-1.0', by: 'build-your-deck' }]
    const swedish = bookletOf({ rules: renderRules(doc, names), icons, pageMm: A5, credits })
    expect(swedish.html).toContain('Symboler och licenser')
    const english = bookletOf({ rules: renderRules(doc, names), icons, pageMm: A5, credits, lang: 'en' })
    expect(english.html).toContain('Symbols and licences')
    // Everything else in a booklet is the designer's own words and is never translated.
    expect(english.html).toContain('Skogens herrar')
    expect(english.html).toContain('Draghög')
  })
})

describe('ordering the booklet (B7)', () => {
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
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })

  const project = (rules?: RuleDoc) => {
    const { zones, seats, floor } = twoSeatSetup()
    return { name: 'Skogens herrar', template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, ...(rules ? { rules } : {}), setup: { zones, seats, floor, deckZone: 'draw' } }
  }

  it('queues one rendering of the rules as they stand, and the same rules twice cost one', async () => {
    await send('POST', '/projects', { id: 'p1', ...project(doc) })
    const asked = await send('POST', '/projects/p1/rulebook')
    expect(asked.status).toBe(202)
    const { hash } = (await asked.json()) as { hash: string }
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect((await run.renders.status(hash))?.state).toBe('queued')

    const again = await send('POST', '/projects/p1/rulebook')
    expect(((await again.json()) as { hash: string }).hash).toBe(hash)

    // The rendered booklet is fetched where every other rendering is.
    await run.renderAll()
    const got = await fetch(`${run.http}/faces/${hash}`)
    expect(got.status).toBe(200)
  })

  it('refuses when the game has no rulebook, rather than printing an empty one', async () => {
    await send('POST', '/projects', { id: 'p2', ...project() })
    const asked = await send('POST', '/projects/p2/rulebook')
    expect(asked.status).toBe(404)
  })

  it('is the game\'s to order: a stranger gets nothing', async () => {
    await send('POST', '/projects', { id: 'p1', ...project(doc) })
    expect((await fetch(`${run.http}/projects/p1/rulebook`, { method: 'POST' })).status).toBe(401)
  })
})

describe('the booklet through the real renderer (B7)', () => {
  it('comes out as a PDF of several pages when the rules are long', async () => {
    const { Renderer } = await import('@byd/render')
    const renderer = await Renderer.launch()
    try {
      const rules = renderRules(
        {
          title: 'Skogens herrar',
          blocks: [
            { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
            { kind: 'text', id: 't1', text: `Dra ett kort ur [[zon:draw]].\n\n${'Lägg det sedan i kasthögen. '.repeat(140)}` },
            { kind: 'setup', id: 's1', caption: 'Bordet' },
          ],
        },
        names,
      )
      const out = await renderer.renderBooklet(bookletOf({ rules, icons: {}, pageMm: A5, zones: ['Draghög', 'Kasthög'] }))
      const text = Buffer.from(out).toString('latin1')
      expect(text.startsWith('%PDF-')).toBe(true)
      // Long rules run onto more pages: a booklet is a document, not one card-sized page.
      expect(text).toMatch(/\/Count\s+[2-9]/)
    } finally {
      await renderer.close()
    }
  }, 60_000)
})
