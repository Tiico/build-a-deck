import { describe, expect, it } from 'vitest'
import { parseInline } from '../src/inline.js'
import { BOOKLET_MARGIN_MM, BOOKLET_PAGE_MM, RULE_IMAGE_FRAME, RuleDoc, imageBoxMm, renderLine, renderRules } from '../src/rules.js'

const names = { zones: { discard: 'Kasthög', draw: 'Draghög' }, cards: { drake: 'Drake' } }

describe('references in rule text (B7): what a rule calls a thing follows what it is called', () => {
  it('reads a reference only where references are asked for, so card text keeps its four constructions (L2)', () => {
    const text = 'Lägg kortet i [[zon:discard]].'
    expect(parseInline(text)).toEqual([{ type: 'paragraph', children: [{ type: 'text', text: 'Lägg kortet i [[zon:discard]].' }] }])
    expect(parseInline(text, { refs: true })).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Lägg kortet i ' },
          { type: 'ref', of: 'zone', id: 'discard' },
          { type: 'text', text: '.' },
        ],
      },
    ])
    // Emphasis and icons still work beside a reference.
    expect(parseInline('**Dra** ett {2} ur [[zon:draw]]', { refs: true })[0]?.children.map((c) => c.type)).toEqual(['bold', 'text', 'icon', 'text', 'ref'])
    // A reference to nothing in particular is left as the text it is.
    expect(parseInline('[[zon:]] och [[hittepå:x]]', { refs: true })[0]?.children).toEqual([{ type: 'text', text: '[[zon:]] och [[hittepå:x]]' }])
  })
})

describe('the rulebook (B7): a versioned document that knows the game it belongs to', () => {
  const doc: RuleDoc = {
    title: 'Skogens herrar',
    blocks: [
      { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
      { kind: 'text', id: 't1', text: 'Dra ett kort ur [[zon:draw]].\n\nLägg det i [[zon:discard]] eller spela [[kort:drake]].' },
      { kind: 'list', id: 'l1', ordered: true, items: ['Dra ett kort.', 'Spela ett kort.', 'Lägg i [[zon:discard]].'] },
      { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp' },
    ],
  }

  it('renders the blocks with every reference standing for what the thing is called now', () => {
    const out = renderRules(doc, names)
    expect(out.warnings).toEqual([])
    expect(out.blocks[0]).toEqual({ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' })
    const paragraphs = out.blocks[1]
    expect(paragraphs?.kind === 'text' && paragraphs.paragraphs).toHaveLength(2)
    expect(out.text).toContain('Dra ett kort ur Draghög.')
    expect(out.text).toContain('Lägg det i Kasthög eller spela Drake.')
    expect(out.text).toContain('3. Lägg i Kasthög.')
    // The setup picture is the zones themselves (B5), not a drawing kept beside them.
    expect(out.blocks[3]).toMatchObject({ kind: 'setup', caption: 'Så ställs bordet upp' })
  })

  it('follows a rename without the rules being touched', () => {
    const renamed = renderRules(doc, { zones: { ...names.zones, discard: 'Påsen' }, cards: names.cards })
    expect(renamed.text).toContain('Lägg det i Påsen')
    expect(renamed.warnings).toEqual([])
  })

  it('says plainly when a rule names something the game no longer has, rather than showing nothing', () => {
    const out = renderRules({ ...doc, blocks: [{ kind: 'text', id: 't1', text: 'Lägg i [[zon:soptunna]] och spela [[kort:troll]].' }] }, names)
    expect(out.warnings).toEqual([
      { block: 't1', of: 'zone', id: 'soptunna' },
      { block: 't1', of: 'card', id: 'troll' },
    ])
    expect(out.text).toContain('[[zon:soptunna]]')
  })
})

describe('the rulebook has one declaration (#183): the schema that validates is the type the renderer reads', () => {
  it('takes a block that carries an `ask` through the schema and into the render, without the question reaching the reader', () => {
    const parsed = RuleDoc.parse({
      title: 'Skogens herrar',
      blocks: [{ kind: 'text', id: 't1', text: 'Dra ett kort ur [[zon:draw]].', ask: 'Hur många kort dras?' }],
    })
    const out = renderRules(parsed, names)
    expect(out.text).toBe('Dra ett kort ur Draghög.')
    expect(JSON.stringify(out)).not.toContain('Hur många kort dras?')
  })
})

// A rewritten paragraph is drawn sentence by sentence (#131), so one sentence at a time has to go
// through the same inline reading as the whole book: emphasis stays emphasis and a reference still
// stands for the name the thing has right now.
describe('one line of the book on its own (#131)', () => {
  it('reads emphasis and references out of a single sentence', () => {
    expect(renderLine('Dra ett **kort** ur [[zon:draw]].', { zones: { draw: 'Draghög' }, cards: {} })).toEqual([
      { type: 'text', text: 'Dra ett ' },
      { type: 'bold', children: [{ type: 'text', text: 'kort' }] },
      { type: 'text', text: ' ur ' },
      { type: 'ref', of: 'zone', id: 'draw', name: 'Draghög' },
      { type: 'text', text: '.' },
    ])
  })
})

// The picture in the book (#173, decided 2026-09-17). It is the fifth kind of block, and it is a
// protocol change: the schema is the single source of both the type and the validation, so a
// picture that could not be validated cannot be typed either.
describe('a picture in the rulebook (#173)', () => {
  const hash = 'a'.repeat(64)

  it('takes a picture that lives in the project’s own assets, with the alt text it was written with', () => {
    const parsed = RuleDoc.parse({
      title: 'Skogens herrar',
      blocks: [{ kind: 'image', id: 'i1', asset: `asset:${hash}`, alt: 'Bordet från ovan', px: { w: 1400, h: 800 } }],
    })
    expect(parsed.blocks[0]).toEqual({ kind: 'image', id: 'i1', asset: `asset:${hash}`, alt: 'Bordet från ovan', px: { w: 1400, h: 800 } })
    // A picture whose own pixels are unknown is a picture the press would have to guess the size
    // of, so there is no such block to guess about.
    expect(RuleDoc.safeParse({ title: 'X', blocks: [{ kind: 'image', id: 'i1', asset: `asset:${hash}`, alt: '' }] }).success).toBe(false)
  })

  it('renders the picture for all three surfaces, and lets its alt text be read as part of the book', () => {
    const out = renderRules(
      {
        title: 'Skogens herrar',
        blocks: [
          { kind: 'image', id: 'i1', asset: `asset:${hash}`, alt: 'Bordet från ovan', px: { w: 1400, h: 800 } },
          { kind: 'image', id: 'i2', asset: `asset:${'b'.repeat(64)}`, alt: '', px: { w: 700, h: 400 } },
        ],
      },
      names,
    )
    expect(out.blocks).toMatchObject([
      { kind: 'image', id: 'i1', asset: `asset:${hash}`, alt: 'Bordet från ovan' },
      { kind: 'image', id: 'i2', asset: `asset:${'b'.repeat(64)}`, alt: '' },
    ])
    // What is said about the picture is part of the book's text; a decorative one says nothing.
    expect(out.text).toBe('Bordet från ovan')
  })

  // Alt text and caption are two fields because they are written for two readers (decided
  // 2026-09-17). They go bad by swapping places — alt describes the picture for whoever cannot see
  // it, a caption comments on it for whoever can — and the caption is printed and costs type area
  // while the alt text is neither. Decisively: were alt the caption, a decorative picture would be
  // indistinguishable from one that merely has no caption, and the counting of pictures without
  // alt text collapses with it.
  it('keeps the caption apart from the alt text, and lets the caption be read as part of the book', () => {
    const parsed = RuleDoc.parse({
      title: 'Skogens herrar',
      blocks: [{ kind: 'image', id: 'i1', asset: `asset:${hash}`, alt: 'Bordet från ovan', caption: 'Bordet vid tre spelare', px: { w: 1400, h: 800 } }],
    })
    expect(parsed.blocks[0]).toMatchObject({ caption: 'Bordet vid tre spelare', alt: 'Bordet från ovan' })
    // A picture with no caption at all is what an imported book has, and it is not the same thing
    // as a picture whose caption is the empty string; the field is simply not there.
    expect(RuleDoc.parse({ title: 'X', blocks: [{ kind: 'image', id: 'i1', asset: `asset:${hash}`, alt: '', px: { w: 700, h: 400 } }] }).blocks[0]).not.toHaveProperty('caption')
    // The caption is the reader's text, so it is in the book a search reads; a decorative picture
    // with a caption still says the caption.
    const out = renderRules(
      {
        title: 'Skogens herrar',
        blocks: [
          { kind: 'image', id: 'i1', asset: `asset:${hash}`, alt: 'Bordet från ovan', caption: 'Bordet vid tre spelare', px: { w: 1400, h: 800 } },
          { kind: 'image', id: 'i2', asset: `asset:${'b'.repeat(64)}`, alt: '', caption: 'Kasthögen', px: { w: 700, h: 400 } },
        ],
      },
      names,
    )
    expect(out.blocks[0]).toMatchObject({ kind: 'image', caption: 'Bordet vid tre spelare' })
    expect(out.text).toBe('Bordet från ovan\nBordet vid tre spelare\nKasthögen')
  })

  it('takes its size from A5, which is the narrowest of the three surfaces the book is read on', () => {
    // The column is not a number written a second time: it is the booklet's own page less the
    // booklet's own margins, so the page a figure is measured against is the page it prints on.
    // The identity is what is asserted; 118 is only what the identity happens to come to today.
    expect(RULE_IMAGE_FRAME.wMm).toBe(BOOKLET_PAGE_MM.w - 2 * BOOKLET_MARGIN_MM.inline)
    expect(RULE_IMAGE_FRAME.wMm).toBe(118)
    // And the ceiling is two thirds of the type area (decided 2026-09-17): a figure *and its
    // caption* then always share a page with text instead of becoming a lone picture page the
    // reader turns past. Half the column's height — 91 mm — was offered and declined.
    expect(RULE_IMAGE_FRAME.hMm).toBe(120)
    expect(RULE_IMAGE_FRAME.hMm / (BOOKLET_PAGE_MM.h - 2 * BOOKLET_MARGIN_MM.block)).toBeCloseTo(2 / 3, 1)
    // And the same frame said in the book's own type, which is what a screen can use: the table
    // and the phone draw the same picture in the same box, whatever their pixels happen to be.
    const mmPerEm = (10.5 * 25.4) / 72
    expect(RULE_IMAGE_FRAME.wEm).toBeCloseTo(RULE_IMAGE_FRAME.wMm / mmPerEm, 1)
    expect(RULE_IMAGE_FRAME.hEm).toBeCloseTo(RULE_IMAGE_FRAME.hMm / mmPerEm, 1)
  })

  // A picture is never enlarged past its own pixels at the resolution the press asks for (the
  // approved prototype). A small sketch pulled out to the full column is printed at half the
  // resolution and is porridge in the hand, while on a screen it would look well right up to
  // delivery — so a picture smaller than the column stands in its own size.
  it('never enlarges a picture past its own pixels at 300 DPI, and narrows a tall one rather than cropping it', () => {
    // 700 px is 59 mm at 300 DPI, and 59 mm is what it gets.
    const sketch = imageBoxMm({ w: 700, h: 500 })
    expect(sketch.fit).toBe('own')
    expect(sketch.w).toBeCloseTo((700 * 25.4) / 300, 6)
    // A picture with pixels to spare fills the column and no more.
    expect(imageBoxMm({ w: 4000, h: 2000 })).toMatchObject({ w: RULE_IMAGE_FRAME.wMm, fit: 'column' })
    // A picture too tall for the ceiling narrows to fit. That it is not cropped is asserted as the
    // proportions it keeps, rather than claimed: the box is the whole picture, smaller.
    const tall = imageBoxMm({ w: 2000, h: 3000 })
    expect(tall.fit).toBe('height')
    expect(tall.h).toBeCloseTo(RULE_IMAGE_FRAME.hMm, 6)
    for (const px of [
      { w: 9000, h: 9000 },
      { w: 10, h: 4000 },
      { w: 4000, h: 10 },
      { w: 700, h: 500 },
      { w: 2000, h: 3000 },
    ]) {
      const box = imageBoxMm(px)
      expect(box.w).toBeLessThanOrEqual(RULE_IMAGE_FRAME.wMm)
      expect(box.h).toBeLessThanOrEqual(RULE_IMAGE_FRAME.hMm)
      expect(box.w / box.h).toBeCloseTo(px.w / px.h, 6)
    }
  })

  it('measures the picture once, in the book, so all three surfaces scale the same millimetres', () => {
    const box = imageBoxMm({ w: 700, h: 500 })
    const out = renderRules({ title: 'X', blocks: [{ kind: 'image', id: 'i1', asset: `asset:${hash}`, alt: '', px: { w: 700, h: 500 } }] }, names)
    expect(out.blocks[0]).toMatchObject({ kind: 'image', px: { w: 700, h: 500 }, mm: { w: box.w, h: box.h }, fit: 'own' })
  })

  it('refuses an address that points out of the project, because the book travels with the cards (B4)', () => {
    const outside = (asset: string) => RuleDoc.safeParse({ title: 'X', blocks: [{ kind: 'image', id: 'i1', asset, alt: '', px: { w: 700, h: 400 } }] }).success
    expect(outside('https://example.com/bordet.png')).toBe(false)
    expect(outside('bordet.png')).toBe(false)
    expect(outside('data:image/png;base64,AAAA')).toBe(false)
    expect(outside('asset:../../etc/passwd')).toBe(false)
    expect(outside(`asset:${hash}`)).toBe(true)
  })
})
