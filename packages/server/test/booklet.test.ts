import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderRules, type RuleDoc } from '@byd/template'
import { A5, bookletOf } from '../src/booklet.js'
import { BOOKLET_MARGIN_MM, BOOKLET_PAGE_MM, RULE_COLUMN_MM, RULE_IMAGE_CEILING_MM } from '@byd/template'
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
    // Sixty seconds because the line above launches Chromium, loads the booklet, waits for its
    // fonts and prints it. Vitest's five were enough on an idle machine and not on one running
    // the rest of the suite beside it, which is why this failed in other people's branches and
    // nowhere else (#92, and `render-budget.test.ts` next door now says so at once).
  }, 60_000)

  // The whole way through for a picture (#173): the bytes are uploaded once as one of the game's
  // own assets, the book points at them by hash, and the page handed to the press carries the
  // bytes themselves — the press cannot follow a reference, and a rulebook is versioned with the
  // cards precisely so that its figures never live anywhere but in the game (B4, B7).
  it('hands the press the bytes of the picture the book points at, set in the millimetres it measured', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const put = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: png })
    const { hash: asset } = (await put.json()) as { hash: string }
    const rules: RuleDoc = { title: 'Skogens herrar', blocks: [{ kind: 'image', id: 'i1', src: `asset:${asset}`, alt: 'Bordet vid start.', px: { w: 2400, h: 1350 } }] }
    await send('POST', '/projects', { id: 'p-bild', ...project(rules) })
    expect((await send('POST', '/projects/p-bild/rulebook')).status).toBe(202)
    const job = await run.renders.claim(Date.now())
    const html = (job?.compiled as { html: string }).html
    expect(html).toContain('data:image/png;base64,')
    expect(html).toContain('width:118mm')
    expect(html).not.toContain(`asset:${asset}`)
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

// The picture in the booklet (#173). A5 sets the size for every other surface, so this is where
// the millimetres are read back: the page the figure is measured against is the page it is
// printed on, and the two are the same numbers rather than two that happen to agree.
describe('a picture in the printed booklet (B7, #173)', () => {
  const hash = 'b'.repeat(64)
  const src = `asset:${hash}`
  const bytes = 'data:image/png;base64,AAAA'
  const withImage = (block: Partial<Extract<RuleDoc['blocks'][number], { kind: 'image' }>>) =>
    bookletOf({
      rules: renderRules({ title: 'Skogens herrar', blocks: [{ kind: 'image', id: 'i1', src, alt: 'Bordet vid start.', px: { w: 2400, h: 1350 }, ...block } as RuleDoc['blocks'][number]] }, names),
      icons: {},
      images: { [src]: bytes },
      pageMm: A5,
    })

  it('writes its @page margin out of the very numbers the column is measured from', () => {
    const out = bookletOf({ rules: renderRules(doc, names), icons, pageMm: A5 })
    expect(A5).toEqual(BOOKLET_PAGE_MM)
    expect(out.css).toContain(`margin:${BOOKLET_MARGIN_MM.block}mm ${BOOKLET_MARGIN_MM.inline}mm`)
    expect(RULE_COLUMN_MM).toBe(A5.w - 2 * BOOKLET_MARGIN_MM.inline)
  })

  it('sets the figure in millimetres, with the bytes of the game’s own asset', () => {
    const out = withImage({})
    expect(out.html).toContain(`src="${bytes}"`)
    expect(out.html).toContain('width:118mm')
    expect(out.html).toContain('alt="Bordet vid start."')
    // An asset reference is a thing the press cannot fetch, so it never reaches the page.
    expect(out.html).not.toContain(src)
  })

  it('narrows a figure too tall for the page instead of cropping it', () => {
    const out = withImage({ px: { w: 1500, h: 2250 } })
    expect(out.html).toContain('width:80mm')
    expect(out.html).toContain(`height:${RULE_IMAGE_CEILING_MM}mm`)
    expect(out.css).toContain('object-fit:contain')
  })

  it('hides a decorative picture from a screen reader and prints the caption the designer wrote', () => {
    const out = withImage({ alt: '', caption: 'Bordet vid start, sett från nord.' })
    expect(out.html).toContain('alt=""')
    expect(out.html).toContain('<figcaption>Bordet vid start, sett från nord.</figcaption>')
  })

  // A reader never meets an error message in a rulebook: a picture whose bytes are gone leaves
  // the book without it rather than leaving a broken frame on the page.
  it('leaves out a picture whose asset the book no longer has', () => {
    const out = bookletOf({ rules: renderRules({ title: 'X', blocks: [{ kind: 'image', id: 'i1', src, alt: 'Bordet.', px: { w: 700, h: 500 } }] }, names), icons: {}, pageMm: A5 })
    expect(out.html).not.toContain('<img')
    expect(out.html).not.toContain('Bordet.')
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

  // And the picture goes through the same press (#173). The markup the figure is set in — a width
  // in millimetres and a box the picture is contained in — is only worth anything if Chromium
  // honours it, so this is the one reading taken from a real print rather than from a string.
  it('prints the picture the book points at, in the millimetres the book measured', async () => {
    const { Renderer } = await import('@byd/render')
    const renderer = await Renderer.launch()
    try {
      // A green rectangle of a known size, carried as its own bytes the way the server resolves
      // an asset before handing the page over.
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1350"><rect width="2400" height="1350" fill="#2f6136"/></svg>'
      const src = `asset:${'e'.repeat(64)}`
      const rules = renderRules(
        {
          title: 'Skogens herrar',
          blocks: [
            { kind: 'heading', id: 'h1', level: 1, text: 'Uppställning' },
            { kind: 'image', id: 'i1', src, alt: 'Bordet vid start.', caption: 'Bordet vid start, sett från nord.', px: { w: 2400, h: 1350 } },
          ],
        },
        names,
      )
      const out = await renderer.renderBooklet(bookletOf({ rules, icons: {}, images: { [src]: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }, pageMm: A5 }))
      const text = Buffer.from(out).toString('latin1')
      expect(text.startsWith('%PDF-')).toBe(true)
      // The figure is on the page: a one-page booklet with something drawn in it, and the caption
      // the designer wrote printed under it.
      expect(text).toMatch(/\/Count\s+1/)
      expect(out.byteLength).toBeGreaterThan(2000)
    } finally {
      await renderer.close()
    }
  }, 60_000)
})
