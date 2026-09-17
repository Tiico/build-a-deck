import { describe, expect, it } from 'vitest'
import { parseInline } from '../src/inline.js'
import { BOOKLET_MARGIN_MM, BOOKLET_PAGE_MM, RULE_COLUMN_MM, RULE_IMAGE_CEILING_MM, RULE_IMAGE_DPI, RuleDoc, imageBoxMm, renderLine, renderRules } from '../src/rules.js'

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

  // And the fifth kind went into that same declaration and not beside it (#173). The check is the
  // one that would actually fail if somebody wrote a second shape for a picture somewhere: the
  // schema refuses what the renderer could not draw, and accepts exactly what it does draw.
  it('validates the picture with the same schema, and refuses an address that points out of the game', () => {
    const src = `asset:${'a'.repeat(64)}`
    const good = RuleDoc.parse({ title: 'X', blocks: [{ kind: 'image', id: 'i1', src, alt: '', px: { w: 700, h: 500 } }] })
    expect(renderRules(good, names).blocks[0]).toMatchObject({ kind: 'image', src })
    // The rulebook is versioned with the cards (B4, B7), so a figure living anywhere but in the
    // game's own assets is refused on the way in rather than caught on the way out.
    for (const bad of ['https://example.invalid/bordet.png', 'bordet.png', 'asset:inte-en-hash', 'data:image/png;base64,AAAA'])
      expect(RuleDoc.safeParse({ title: 'X', blocks: [{ kind: 'image', id: 'i1', src: bad, alt: '', px: { w: 700, h: 500 } }] }).success).toBe(false)
    // And a picture with no size is a picture nothing can lay out.
    expect(RuleDoc.safeParse({ title: 'X', blocks: [{ kind: 'image', id: 'i1', src, alt: '' }] }).success).toBe(false)
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

// The rulebook's fifth kind (#173). It is added to the one declaration in `rules.ts` and nowhere
// else, so the schema that lets an image into a project is still the type the renderer reads.
describe('the rulebook has a picture (B7, #173)', () => {
  const src = `asset:${'a'.repeat(64)}`

  it('takes an image block through the very schema the renderer reads, and gives every surface one measurement', () => {
    const parsed = RuleDoc.parse({
      title: 'Skogens herrar',
      blocks: [{ kind: 'image', id: 'i1', src, alt: 'Dragbunten till vänster, spelytan i mitten.', px: { w: 2400, h: 1350 } }],
    })
    expect(renderRules(parsed, names).blocks).toEqual([
      { kind: 'image', id: 'i1', src, alt: 'Dragbunten till vänster, spelytan i mitten.', px: { w: 2400, h: 1350 }, mm: { w: 118, h: 66.375 }, fit: 'column' },
    ])
  })

  // The column is not a number written here either: it is A5's width less the booklet's own side
  // margins, which is the same arithmetic `booklet.ts` writes its `@page` rule from.
  it('binds the figure to the column, to the ceiling and to its own pixels, in that order', () => {
    expect(RULE_COLUMN_MM).toBe(BOOKLET_PAGE_MM.w - 2 * BOOKLET_MARGIN_MM.inline)
    expect(RULE_COLUMN_MM).toBe(118)
    // Wider than the column: it fills the column.
    expect(imageBoxMm({ w: 2400, h: 1350 })).toEqual({ w: 118, h: 66.375, fit: 'column' })
    // Taller than the ceiling: it narrows to fit and is never cropped. 118 × 177 becomes 80 × 120,
    // and the aspect the file was drawn in is the aspect it is printed in.
    const tall = imageBoxMm({ w: 1500, h: 2250 })
    expect(tall).toEqual({ w: 80, h: RULE_IMAGE_CEILING_MM, fit: 'height' })
    expect(tall.w / tall.h).toBeCloseTo(1500 / 2250, 10)
    // Smaller than the column at 300 DPI: it stands in its own size rather than being pulled out.
    const small = imageBoxMm({ w: 700, h: 500 })
    expect(small.fit).toBe('own')
    expect(small.w).toBeCloseTo((700 * 25.4) / RULE_IMAGE_DPI, 10)
    expect(small.h).toBeCloseTo((500 * 25.4) / RULE_IMAGE_DPI, 10)
  })

  // A picture with no alt text is taken in and marked decorative (B7, the product owner's decision
  // of 2026-09-17): `alt=""` is HTML's own word for it, so the renderer needs no second flag.
  it('carries an empty alt text through as the decorative mark it is, and keeps caption apart from alt', () => {
    const out = renderRules({ title: 'X', blocks: [{ kind: 'image', id: 'i1', src, alt: '', caption: 'Bordet vid start, sett från nord.', px: { w: 700, h: 500 } }] }, names)
    const [block] = out.blocks
    expect(block).toMatchObject({ kind: 'image', alt: '', caption: 'Bordet vid start, sett från nord.' })
    // The caption is text the reader meets, so a search finds it; the alt text is not.
    expect(out.text).toBe('Bordet vid start, sett från nord.')
  })
})
