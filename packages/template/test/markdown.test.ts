import { describe, expect, it } from 'vitest'
import { imagesIn, importRules } from '../src/markdown.js'

const asset = `asset:${'a'.repeat(64)}`

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

  it('takes a picture in as a block of its own, pointing into the project’s own assets (#173)', () => {
    const { doc, notes, problems } = importRules('![Bordet från ovan](bordet.png)\n\nEfter.', 'Skogens herrar', { 'bordet.png': { asset } })
    expect(doc.blocks).toEqual([
      { kind: 'image', id: 'b1', asset, alt: 'Bordet från ovan' },
      { kind: 'text', id: 'b2', text: 'Efter.' },
    ])
    expect(notes).toContainEqual({ of: 'image', n: 1 })
    expect(problems).toEqual([])
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

  it('reads a whole file the way the report reads it: kept first, then changed, then said less than it could', () => {
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
    const { doc, notes } = importRules(file, 'Skogens herrar', { 'bordet.png': { asset } })
    expect(doc.blocks.map((b) => `${b.kind}${b.kind === 'heading' ? b.level : ''}`)).toEqual([
      'text',
      'heading2',
      'image',
      'heading2',
      'list',
      'text',
      'heading2',
      'text',
      'text',
    ])
    // The report is one list in one order, and the order is the argument it makes: what became a
    // block, what changed shape on the way — the file's own title at its head (#191) — and what
    // came in saying less about itself than it could have.
    expect(notes).toEqual([
      { of: 'heading', n: 3 },
      { of: 'text', n: 4 },
      { of: 'list', n: 1 },
      { of: 'image', n: 1 },
      { of: 'title', n: 1 },
      { of: 'folded', n: 1 },
      { of: 'code', n: 1 },
      { of: 'link', n: 1 },
    ])
  })
})

// The picture in the book (#173, decided 2026-09-17). The import stops saying "not yet" and takes
// the picture in — into the project's own assets, the road a card's own image already takes.
describe('a picture the file brings with it (#173)', () => {
  it('lists the addresses the file points at, so the pictures can be fetched before the book is made', () => {
    expect(imagesIn('![Bordet](bilder/bordet.png)\n\n![](kast.jpg "Kasthögen")\n\n![Bordet igen](bilder/bordet.png)')).toEqual(['bilder/bordet.png', 'kast.jpg'])
  })

  it('takes a picture without alt text in anyway, and marks it decorative (decided 2026-09-17)', () => {
    const { doc, notes } = importRules('![](bordet.png)', 'Skogens herrar', { 'bordet.png': { asset } })
    // `alt=""` is the markup for a picture a screen reader should skip. In a rulebook that is
    // almost never true, which is why the report counts them.
    expect(doc.blocks).toEqual([{ kind: 'image', id: 'b1', asset, alt: '' }])
    expect(notes).toContainEqual({ of: 'image', n: 1 })
    expect(notes).toContainEqual({ of: 'decorative', n: 1 })
  })

  it('keeps a picture that cannot be taken in standing in the report, with the reason, and makes the book without it', () => {
    const { doc, problems, notes } = importRules('![Bordet](bordet.png)\n\n![Kasthögen](kast.tiff)\n\n![Igen](kast.tiff)\n\nEfter.', 'Skogens herrar', {
      'bordet.png': { why: 'too-big' },
    })
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'Efter.' }])
    // Nothing disappears silently (#131): a file that was never handed over is as much a reason
    // as a file that was too big, and one picture is one line however often the file names it.
    expect(problems).toEqual([
      { file: 'bordet.png', why: 'too-big' },
      { file: 'kast.tiff', why: 'missing' },
    ])
    expect(notes.find((note) => note.of === 'image')).toBeUndefined()
  })

  it('puts a picture written inside a paragraph after the paragraph it was written in', () => {
    const { doc } = importRules('Så här ligger bordet: ![Bordet](bordet.png) och inget annat.', 'Skogens herrar', { 'bordet.png': { asset } })
    expect(doc.blocks).toEqual([
      { kind: 'text', id: 'b1', text: 'Så här ligger bordet: och inget annat.' },
      { kind: 'image', id: 'b2', asset, alt: 'Bordet' },
    ])
  })

  it('reads the address the file wrote, title and angle brackets and all', () => {
    const { doc } = importRules('![Bordet](<bordet.png> "Bordet från ovan")', 'Skogens herrar', { 'bordet.png': { asset } })
    expect(doc.blocks).toEqual([{ kind: 'image', id: 'b1', asset, alt: 'Bordet' }])
  })
})

// Where the two decisions of the day meet (#173 × #191). A file written outside the app opens
// with the name of the game and has pictures in it, so from the first real import on, both roads
// are travelled by the same file — and neither side had a file that travelled both.
describe('a file that opens with its own title and brings pictures (#173, #191)', () => {
  it('drops the title, takes the pictures, and says both in one report in one order', () => {
    const file = ['# Skogens herrar', '', 'Ett spel om skogen.', '', '![](bordet.png)', '', '# En tur', '', '![Kasthögen](kast.png)'].join('\n')
    const { doc, notes, problems } = importRules(file, 'Vargens år', { 'bordet.png': { asset }, 'kast.png': { asset } })
    // The book is called what the project is called (#191), and the pictures stand where they
    // were written, as blocks of their own (#173).
    expect(doc).toEqual({
      title: 'Vargens år',
      blocks: [
        { kind: 'text', id: 'b1', text: 'Ett spel om skogen.' },
        { kind: 'image', id: 'b2', asset, alt: '' },
        { kind: 'heading', id: 'b3', level: 1, text: 'En tur' },
        { kind: 'image', id: 'b4', asset, alt: 'Kasthögen' },
      ],
    })
    // One list in one order, with both of the day's decisions in it: what became a block, the
    // pictures among them, then what changed shape with the file's own title at its head, and
    // last what came in saying less about itself than it could have.
    expect(notes).toEqual([
      { of: 'heading', n: 1 },
      { of: 'text', n: 1 },
      { of: 'image', n: 2 },
      { of: 'title', n: 1 },
      { of: 'decorative', n: 1 },
    ])
    expect(problems).toEqual([])
  })

  it('reads a picture on the first line as content, so the heading under it is a section and no title', () => {
    // "The first line" is the first line that says something, and a picture says something. A
    // file that leads with its table shot has written content above its heading (#191).
    const { doc, notes } = importRules('![Bordet](bordet.png)\n\n# Skogens herrar\n\nEtt spel om skogen.', 'Skogens herrar', { 'bordet.png': { asset } })
    expect(doc.blocks).toEqual([
      { kind: 'image', id: 'b1', asset, alt: 'Bordet' },
      { kind: 'heading', id: 'b2', level: 1, text: 'Skogens herrar' },
      { kind: 'text', id: 'b3', text: 'Ett spel om skogen.' },
    ])
    expect(notes).not.toContainEqual(expect.objectContaining({ of: 'title' }))
  })

  it('still names the picture it could not take in when the same file also lost its title', () => {
    const { doc, notes, problems } = importRules('# Skogens herrar\n\n![Bordet](bordet.png)\n\nEfter.', 'Vargens år', { 'bordet.png': { why: 'too-big' } })
    expect(doc.blocks).toEqual([{ kind: 'text', id: 'b1', text: 'Efter.' }])
    expect(problems).toEqual([{ file: 'bordet.png', why: 'too-big' }])
    expect(notes).toContainEqual({ of: 'title', n: 1 })
  })
})
