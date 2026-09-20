import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BOOKLET_MARGIN_MM, BOOKLET_PAGE_MM, RULE_IMAGE_FRAME, imageBoxMm, renderRules, type RuleDoc } from '@byd/template'
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

  // A heading is read inline like a paragraph (#272), so what is printed above a section is the
  // name the thing has and never the letters the reference was written with. The heading is
  // escaped through the same span the paragraph is, so nothing it holds reaches the renderer as
  // markup either.
  it('prints a heading’s reference as the name it stands for', () => {
    const headed = renderRules({ ...doc, blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Ur [[zon:draw]] och **<b>**' }] }, names)
    const out = bookletOf({ rules: headed, icons, pageMm: A5 })
    expect(out.html).toContain('<h2>Ur Draghög och <strong>&lt;b&gt;</strong></h2>')
    expect(out.html).not.toContain('[[zon:draw]]')
  })

  // Den levande siffran hör bordet till (#226, beslutad 2026-09-20). Pressen är per definition
  // utan bord: häftet trycks en gång och läses långt senare, och ett tal ur ett spel som pågick
  // när knappen trycktes hade varit en lögn i handen. Så taggen faller tillbaka på vad den står
  // för — namnet — precis som i boken när inget bord är igång. Det håller av sig självt, därför
  // att häftet inte har någon projektion att fråga; det här är vad som säger till om någon ger
  // det en.
  it('prints a tagged zone as the name and never as a number', () => {
    const out = bookletOf({ rules: renderRules(doc, names), icons, pageMm: A5 })
    expect(out.html).toContain('Dra ur Draghög och spela')
    expect(out.html).not.toContain('byd-rules-tally')
  })

  // The zones come off the block, out of the one arrangement the document is read into (#270),
  // so the press cannot be handed a different table from the one the editor and the players see.
  it('draws the setup from the zones the game actually has (B5)', () => {
    const arrangement = { common: [{ id: 'draw', name: 'Draghög' }, { id: 'discard', name: 'Kasthög' }], seats: [{ id: 'A', zones: [{ id: 'hand:A', name: 'Hand' }] }] }
    const out = bookletOf({ rules: renderRules(doc, names, arrangement), icons, pageMm: { w: 148, h: 210 } })
    expect(out.html).toContain('Så ställs bordet upp')
    expect(out.html).toContain('data-zone')
    expect(out.html).toContain('Kasthög')
    // What stands on the table, then each seat's own — the arrangement's own order.
    expect([...out.html.matchAll(/<span data-zone>([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['Draghög', 'Kasthög', 'Hand'])
  })

  // A setup a print order was placed for before the zones travelled with the block prints an
  // empty frame rather than somebody else's table: the figure says what the document says.
  it('prints the setup empty when the book was rendered with no game behind it', () => {
    const out = bookletOf({ rules: renderRules(doc, names), icons, pageMm: { w: 148, h: 210 } })
    expect(out.html).toContain('Så ställs bordet upp')
    expect(out.html).not.toContain('data-zone')
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

// The picture in the printed booklet (#173, decided 2026-09-17). A5 is the narrowest of the three
// surfaces the book is read on, so A5 is what sets the size of every picture in it.
describe('a picture in the booklet (#173)', () => {
  const bordet = `asset:${'a'.repeat(64)}`
  const png = 'data:image/png;base64,AAAA'
  const withPicture = (alt: string, px = { w: 4000, h: 2000 }, caption?: string): RuleDoc => ({
    title: 'Skogens herrar',
    blocks: [{ kind: 'image', id: 'i1', asset: bordet, alt, ...(caption === undefined ? {} : { caption }), px }],
  })

  // The page a figure is measured against is the page it is printed on: the booklet writes its own
  // `@page` out of the same two constants the measurement reads, so neither can drift from the
  // other by somebody editing one of them (#173).
  it('writes the page and its margins out of the same numbers the figure is measured against', () => {
    const out = bookletOf({ rules: renderRules(withPicture(''), names), icons, pageMm: A5, images: { [bordet]: png } })
    expect(A5).toEqual(BOOKLET_PAGE_MM)
    expect(out.css).toContain(`@page{size:${BOOKLET_PAGE_MM.w}mm ${BOOKLET_PAGE_MM.h}mm;margin:${BOOKLET_MARGIN_MM.block}mm ${BOOKLET_MARGIN_MM.inline}mm}`)
  })

  // The caption is the designer's own line and is part of the book: printed, and paid for in type
  // area. The alt text is neither (decided 2026-09-17), and the two never swap places.
  it('prints the caption beside the picture, and never the alt text', () => {
    const out = bookletOf({ rules: renderRules(withPicture('Bordet från ovan', { w: 4000, h: 2000 }, 'Bordet vid tre spelare'), names), icons, pageMm: A5, images: { [bordet]: png } })
    expect(out.html).toContain('<figcaption>Bordet vid tre spelare</figcaption>')
    expect(out.html).toContain('alt="Bordet från ovan"')
    // A picture nobody has written a caption for prints no empty line where one would have been.
    const bare = bookletOf({ rules: renderRules(withPicture('Bordet från ovan'), names), icons, pageMm: A5, images: { [bordet]: png } })
    expect(bare.html).not.toContain('figcaption')
  })

  // A picture is never enlarged past its own pixels at 300 DPI, and one too tall for the ceiling
  // narrows rather than being cropped (the approved prototype).
  it('prints each picture at its own measured size, and never larger than its own pixels', () => {
    const small = imageBoxMm({ w: 700, h: 500 })
    const out = bookletOf({ rules: renderRules(withPicture('', { w: 700, h: 500 }), names), icons, pageMm: A5, images: { [bordet]: png } })
    // 59 mm and not the column's 118: a 700 px sketch pulled out to the column prints at 150 DPI.
    expect(small.w).toBeLessThan(RULE_IMAGE_FRAME.wMm)
    expect(out.html).toContain(`width:${Math.round(small.w * 10) / 10}mm`)
    // A tall picture comes to rest against the ceiling, and keeps its own proportions doing it:
    // what is asserted is the ratio, because "never cropped" is a claim and a ratio is a fact.
    const tall = imageBoxMm({ w: 2000, h: 3000 })
    expect(tall.h).toBe(RULE_IMAGE_FRAME.hMm)
    expect(tall.w / tall.h).toBeCloseTo(2000 / 3000, 6)
    const high = bookletOf({ rules: renderRules(withPicture('', { w: 2000, h: 3000 }), names), icons, pageMm: A5, images: { [bordet]: png } })
    expect(high.html).toContain(`width:${Math.round(tall.w * 10) / 10}mm`)
  })

  it('prints the picture inside the A5 frame, saying what it was written to say', () => {
    const out = bookletOf({ rules: renderRules(withPicture('Bordet från ovan'), names), icons, pageMm: A5, images: { [bordet]: png } })
    expect(out.html).toContain(`<img src="${png}" alt="Bordet från ovan"`)
    expect(out.css).toContain(`max-width:${RULE_IMAGE_FRAME.wMm}mm`)
    expect(out.css).toContain(`max-height:${RULE_IMAGE_FRAME.hMm}mm`)
    expect(RULE_IMAGE_FRAME.hMm).toBe(120)
  })

  it('prints a picture with no alt text as decorative, which is what `alt=""` means', () => {
    const out = bookletOf({ rules: renderRules(withPicture(''), names), icons, pageMm: A5, images: { [bordet]: png } })
    expect(out.html).toContain(`<img src="${png}" alt=""`)
  })

  it('leaves out a picture whose bytes are gone, rather than printing an empty frame', () => {
    const out = bookletOf({ rules: renderRules(withPicture('Bordet från ovan'), names), icons, pageMm: A5, images: {} })
    expect(out.html).not.toContain('<img')
    expect(out.html).toContain('data-booklet')
  })

  it('never lets the reference reach the renderer as an address', () => {
    const out = bookletOf({ rules: renderRules(withPicture('"><script>x</script>'), names), icons, pageMm: A5, images: { [bordet]: png } })
    expect(out.html).not.toContain('<script>')
    expect(out.html).toContain('&quot;&gt;&lt;script&gt;')
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

  // The picture takes the same road as a card's own image (E1, #173): it is one of the project's
  // assets, and the booklet is handed the bytes the way it is handed the icons — so the worker
  // still needs nothing but the page it is given.
  it('hands the printer the bytes of a picture the book holds, and never an address', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    const put = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: png })
    const { hash: asset } = (await put.json()) as { hash: string }
    const rules: RuleDoc = { title: 'Skogens herrar', blocks: [{ kind: 'image', id: 'i1', asset: `asset:${asset}`, alt: 'Bordet från ovan', px: { w: 1400, h: 800 } }] }
    await send('POST', '/projects', { id: 'p3', ...project(rules) })
    expect((await send('POST', '/projects/p3/rulebook')).status).toBe(202)

    const job = await run.renders.claim(Date.now())
    expect(job?.compiled.html).toContain('data:image/png;base64,')
    expect(job?.compiled.html).toContain('alt="Bordet från ovan"')
    expect(job?.compiled.html).not.toContain(`asset:${asset}`)
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
        { common: [{ id: 'draw', name: 'Draghög' }, { id: 'discard', name: 'Kasthög' }], seats: [] },
      )
      const out = await renderer.renderBooklet(bookletOf({ rules, icons: {}, pageMm: A5 }))
      const text = Buffer.from(out).toString('latin1')
      expect(text.startsWith('%PDF-')).toBe(true)
      // Long rules run onto more pages: a booklet is a document, not one card-sized page.
      expect(text).toMatch(/\/Count\s+[2-9]/)
    } finally {
      await renderer.close()
    }
  }, 60_000)
})
