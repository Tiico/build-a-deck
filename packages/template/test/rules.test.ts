import { describe, expect, it } from 'vitest'
import { parseInline } from '../src/inline.js'
import { RuleDoc, renderLine, renderRules } from '../src/rules.js'

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
