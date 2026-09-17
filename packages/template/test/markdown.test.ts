import { describe, expect, it } from 'vitest'
import { importRules } from '../src/markdown.js'

// The import (#131): a Markdown file a designer wrote somewhere else, read into the four kinds of
// block the book has. The map is the product owner's, and the rule behind it is that nothing
// disappears silently — what cannot become a block becomes plain text, and what is genuinely
// dropped is counted so the report can say so before the book is made.
describe('the import from Markdown (#131)', () => {
  it('makes a first-level heading a section of the book', () => {
    // The heading stands below the file's own title, which is where a section of the book begins:
    // the first line is the file's title and becomes nothing (#191).
    expect(importRules('# Skogens herrar\n\n# Så spelar ni', 'Skogens herrar').doc).toEqual({
      title: 'Skogens herrar',
      blocks: [{ kind: 'heading', id: 'b1', level: 1, text: 'Så spelar ni' }],
    })
  })

  // The file's own title (#191). A book has one title and it is the project's name; a file that
  // opens with its own would give the book two, one above the other.
  it('lets a title on the very first line become nothing, and says in the report that it did', () => {
    const { doc, notes } = importRules('# Skogens herrar\n\nEtt spel om skogen.', 'Vargens år')
    expect(doc).toEqual({
      title: 'Vargens år',
      blocks: [{ kind: 'text', id: 'b1', text: 'Ett spel om skogen.' }],
    })
    expect(notes).toContainEqual({ of: 'title', n: 1 })
  })

  it('reads the title as the first line even when the file opens with a blank line or two', () => {
    // A blank line above the title is nothing a reader can see, and an editor that leaves one is
    // not making a different file. The rule follows the first line that says something (#191).
    const { doc, notes } = importRules('\n\n# Skogens herrar\n\nEtt spel om skogen.', 'Vargens år')
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'Ett spel om skogen.' }])
    expect(notes).toContainEqual({ of: 'title', n: 1 })
  })

  it('leaves a first line that is a subheading alone: only the first level is a title (#191)', () => {
    const { doc, notes } = importRules('## En tur\n\nDra ett kort.', 'Skogens herrar')
    expect(doc.blocks).toEqual([
      { kind: 'heading', id: 'b1', level: 2, text: 'En tur' },
      { kind: 'text', id: 'b2', text: 'Dra ett kort.' },
    ])
    expect(notes).not.toContainEqual(expect.objectContaining({ of: 'title' }))
  })

  it('leaves a file that opens with prose exactly as it is, and says nothing about a title (#191)', () => {
    const { doc, notes } = importRules('Ett spel om skogen.\n\n# En tur', 'Skogens herrar')
    expect(doc.blocks).toEqual([
      { kind: 'text', id: 'b1', text: 'Ett spel om skogen.' },
      { kind: 'heading', id: 'b2', level: 1, text: 'En tur' },
    ])
    expect(notes).toEqual([
      { of: 'heading', n: 1 },
      { of: 'text', n: 1 },
    ])
  })

  it('makes a paragraph a text block, keeping the emphasis the file wrote', () => {
    expect(importRules('# Skogens herrar\n\n# Så spelar ni\n\nDra ett **kort** ur *draghögen*.', 'Skogens herrar').doc.blocks).toEqual([
      { kind: 'heading', id: 'b1', level: 1, text: 'Så spelar ni' },
      { kind: 'text', id: 'b2', text: 'Dra ett **kort** ur *draghögen*.' },
    ])
  })

  it('folds a heading deeper than two up to a subheading, because the book has two levels', () => {
    const { doc, notes } = importRules('## En tur\n\n#### Att passa', 'Skogens herrar')
    expect(doc.blocks).toEqual([
      { kind: 'heading', id: 'b1', level: 2, text: 'En tur' },
      { kind: 'heading', id: 'b2', level: 2, text: 'Att passa' },
    ])
    // And the folding is said out loud rather than done quietly.
    expect(notes).toContainEqual({ of: 'folded', n: 1 })
  })

  it('makes a bulleted list a list, and a numbered one a numbered list', () => {
    const { doc } = importRules('- Dra ett kort.\n* Spela ett kort.\n\n1. Först.\n2. Sedan.', 'Skogens herrar')
    expect(doc.blocks).toEqual([
      { kind: 'list', id: 'b1', items: ['Dra ett kort.', 'Spela ett kort.'] },
      { kind: 'list', id: 'b2', ordered: true, items: ['Först.', 'Sedan.'] },
    ])
  })

  it('keeps a quote as text and drops only its marker', () => {
    const { doc, notes } = importRules('> Den som passar\n> tar ett guld.', 'Skogens herrar')
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'Den som passar\ntar ett guld.' }])
    expect(notes).toContainEqual({ of: 'quote', n: 1 })
  })

  it('drops a horizontal rule, which is the one thing that is only paper', () => {
    const { doc, notes } = importRules('Före.\n\n---\n\nEfter.', 'Skogens herrar')
    expect(doc.blocks).toEqual([
      { kind: 'text', id: 'b1', text: 'Före.' },
      { kind: 'text', id: 'b2', text: 'Efter.' },
    ])
    expect(notes).toContainEqual({ of: 'break', n: 1 })
  })

  it('makes a table text with one line per row, and leaves the ruled line out', () => {
    const { doc, notes } = importRules('| Kort | Antal |\n| --- | --- |\n| Drake | 2 |', 'Skogens herrar')
    // A line of the book is a paragraph of its own: a single newline inside a text block is read
    // as a wrap, so rows written that way would run together into one line.
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'Kort | Antal\n\nDrake | 2' }])
    expect(notes).toContainEqual({ of: 'table', n: 1 })
  })

  it('keeps a fenced code block as text, word for word and line for line', () => {
    const { doc, notes } = importRules('```\ndraghög tom\n  -> blanda kasthögen\n```', 'Skogens herrar')
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'draghög tom\n\n  -> blanda kasthögen' }])
    expect(notes).toContainEqual({ of: 'code', n: 1 })
  })

  it('keeps a link’s own words and drops the address, which nobody at a table can follow', () => {
    const { doc, notes } = importRules('Se [reglerna på webben](https://example.com) för [[zon:draw]].', 'Skogens herrar')
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'Se reglerna på webben för [[zon:draw]].' }])
    expect(notes).toContainEqual({ of: 'link', n: 1 })
  })

  it('reads an address that holds brackets of its own, and leaves nothing of it standing', () => {
    const { doc } = importRules('En [länk](javascript:alert(1)) till ingenting.', 'Skogens herrar')
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'En länk till ingenting.' }])
  })

  it('leaves an image out without calling it dropped: the book cannot hold one yet (#173)', () => {
    const { doc, notes } = importRules('![Bordet från ovan](bordet.png)\n\nEfter.', 'Skogens herrar')
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'Efter.' }])
    expect(notes).toContainEqual({ of: 'image', n: 1 })
  })

  it('counts the references it recognises, which are what a book written by hand already writes', () => {
    const { doc, notes } = importRules('Lägg i [[zon:discard]] och spela [[kort:drake]].', 'Skogens herrar')
    // They are kept exactly as written: the renderer is what turns them into the name the thing
    // has right now (B7), and the import has no business deciding that here.
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'Lägg i [[zon:discard]] och spela [[kort:drake]].' }])
    expect(notes).toContainEqual({ of: 'ref', n: 2 })
  })

  it('has no answer for raw HTML, so it becomes the plain text it reads as', () => {
    // A file a designer picks is untrusted input. Nothing here produces markup: what the map does
    // not recognise becomes text, and text is text all the way to the page.
    const { doc } = importRules('<script>alert(1)</script>\n\n<b onclick="x">fet</b>', 'Skogens herrar')
    expect(doc.blocks).toEqual([
      { kind: 'text', id: 'b1', text: '<script>alert(1)</script>' },
      { kind: 'text', id: 'b2', text: '<b onclick="x">fet</b>' },
    ])
  })

  it('reads a whole file the way the report reads it: kept first, then changed, then not yet', () => {
    const file = [
      '# Skogens herrar',
      '',
      'Ett spel om **skogen**.',
      '',
      '## Uppställning',
      '',
      '![Bordet från ovan](bordet.png)',
      '',
      '## En tur',
      '',
      '1. Dra ett kort ur **draghögen**.',
      '2. Spela ett kort, eller passa.',
      '',
      'Se [reglerna på webben](https://example.com/regler) för varianter.',
      '',
      '### Att passa',
      '',
      'Den som passar tar ett guld.',
      '',
      '```',
      'draghög tom -> blanda kasthögen',
      '```',
    ].join('\n')
    const { doc, notes } = importRules(file, 'Skogens herrar')
    expect(doc.blocks.map((b) => `${b.kind}${b.kind === 'heading' ? b.level : ''}`)).toEqual([
      'text',
      'heading2',
      'heading2',
      'list',
      'text',
      'heading2',
      'text',
      'text',
    ])
    // The report is one list in one order, and the order is the argument it makes: what became a
    // block, what changed shape on the way, and what the book cannot hold yet.
    expect(notes).toEqual([
      { of: 'heading', n: 3 },
      { of: 'text', n: 4 },
      { of: 'list', n: 1 },
      { of: 'title', n: 1 },
      { of: 'folded', n: 1 },
      { of: 'code', n: 1 },
      { of: 'link', n: 1 },
      { of: 'image', n: 1 },
    ])
  })
})
