import { describe, expect, it } from 'vitest'
import { planImport } from '../src/plan.js'
import type { RuleDoc } from '../src/rules.js'

// Importing over a book that is already written (#131, third slice). The product owner rejected
// "import only from the empty state": writing in one's own editor and importing again and again is
// a way of working to support, not an accident to guard against. What that costs is this — a plan
// from (the book there is, the book the file would make) to what is kept, what is rewritten, what
// goes away and what is new, so that the surface is a rendering of a decided thing rather than a
// place where the decision is made.
const book = (...blocks: RuleDoc['blocks']): RuleDoc => ({ title: 'Skogens herrar', blocks })

describe('a file that says what the book already says (#131)', () => {
  it('changes nothing, and marks every block kept', () => {
    const there = book({ kind: 'heading', id: 'b1', level: 1, text: 'En tur' }, { kind: 'text', id: 'b2', text: 'Dra ett kort.' })
    const file = book({ kind: 'heading', id: 'b1', level: 1, text: 'En tur' }, { kind: 'text', id: 'b2', text: 'Dra ett kort.' })
    const plan = planImport(there, file)
    expect(plan.blocks.map((b) => b.mark)).toEqual(['kept', 'kept'])
    expect(plan.counts).toEqual({ kept: 2, changed: 0, going: 0, added: 0 })
  })
})

describe('what the existing book loses (#131)', () => {
  it('marks a section the file never mentions as going, where it stands', () => {
    const there = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'En tur' },
      { kind: 'text', id: 'b2', text: 'Dra ett kort.' },
      { kind: 'heading', id: 'b3', level: 1, text: 'Fusk och straff' },
      { kind: 'text', id: 'b4', text: 'Den som blir påkommen lägger tillbaka handen.' },
    )
    const file = book({ kind: 'heading', id: 'b1', level: 1, text: 'En tur' }, { kind: 'text', id: 'b2', text: 'Dra ett kort.' })
    const plan = planImport(there, file)
    // The hand-written section stands in the plan, struck where it stands, rather than being
    // absent from a book that is about to lose it.
    expect(plan.blocks.map((b) => [b.mark, textOf(b.block)])).toEqual([
      ['kept', 'En tur'],
      ['kept', 'Dra ett kort.'],
      ['going', 'Fusk och straff'],
      ['going', 'Den som blir påkommen lägger tillbaka handen.'],
    ])
    expect(plan.counts.going).toBe(2)
  })
})

describe('what the file brings (#131)', () => {
  it('marks a section the book has never had as new, where the file puts it', () => {
    const there = book({ kind: 'heading', id: 'b1', level: 1, text: 'En tur' })
    const file = book({ kind: 'heading', id: 'b1', level: 1, text: 'Två spelare' }, { kind: 'heading', id: 'b2', level: 1, text: 'En tur' })
    expect(planImport(there, file).blocks.map((b) => [b.mark, textOf(b.block)])).toEqual([
      ['added', 'Två spelare'],
      ['kept', 'En tur'],
    ])
  })

  it('marks only the paragraph the file rewrote, and leaves its neighbours alone', () => {
    const there = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'Översikt' },
      { kind: 'text', id: 'b2', text: 'Ett spel om att bluffa.' },
      { kind: 'text', id: 'b3', text: 'Två till fem spelare.' },
      { kind: 'text', id: 'b4', text: 'Den med mest guld vinner.' },
    )
    const file = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'Översikt' },
      { kind: 'text', id: 'b2', text: 'Ett spel om att bluffa.' },
      { kind: 'text', id: 'b3', text: 'Två till sex spelare.' },
      { kind: 'text', id: 'b4', text: 'Den med mest guld vinner.' },
    )
    const plan = planImport(there, file)
    expect(plan.blocks.map((b) => [b.mark, textOf(b.block)])).toEqual([
      ['kept', 'Översikt'],
      ['kept', 'Ett spel om att bluffa.'],
      ['changed', 'Två till sex spelare.'],
      ['kept', 'Den med mest guld vinner.'],
    ])
    expect(plan.counts).toEqual({ kept: 3, changed: 1, going: 0, added: 0 })
  })

  it('reads a paragraph put in at the top as one new paragraph and not as a rewritten section', () => {
    const paragraphs = (texts: string[]) => book({ kind: 'heading', id: 'h', level: 1, text: 'Översikt' }, ...texts.map((text, i) => ({ kind: 'text' as const, id: `b${i}`, text })))
    const plan = planImport(paragraphs(['Ett.', 'Två.', 'Tre.']), paragraphs(['Noll.', 'Ett.', 'Två.', 'Tre.']))
    expect(plan.blocks.map((b) => [b.mark, textOf(b.block)])).toEqual([
      ['kept', 'Översikt'],
      ['added', 'Noll.'],
      ['kept', 'Ett.'],
      ['kept', 'Två.'],
      ['kept', 'Tre.'],
    ])
  })
})

describe('the book the plan would leave behind (#131)', () => {
  it('is everything but what is going, with an id nothing else in it has', () => {
    const there = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'Uppställning' },
      { kind: 'setup', id: 'b2' },
      { kind: 'heading', id: 'b3', level: 1, text: 'Fusk och straff' },
      { kind: 'text', id: 'b4', text: 'Den som blir påkommen.' },
    )
    const file = book({ kind: 'heading', id: 'b1', level: 1, text: 'Uppställning' }, { kind: 'text', id: 'b2', text: 'Var och en får fem guld.' })
    const plan = planImport(there, file)
    expect(plan.doc.blocks.map((b) => [b.kind, textOf(b)])).toEqual([
      ['heading', 'Uppställning'],
      ['setup', ''],
      ['text', 'Var och en får fem guld.'],
    ])
    expect(new Set(plan.doc.blocks.map((b) => b.id)).size).toBe(plan.doc.blocks.length)
    // The blocks the reader is shown are numbered in the same one series as the book itself, so a
    // struck paragraph and the paragraph that replaces it can never claim the same anchor.
    expect(new Set(plan.blocks.map((b) => b.block.id)).size).toBe(plan.blocks.length)
    expect(plan.doc.title).toBe(there.title)
  })

  it('weighs what the book loses in the words it loses, so the band can say how much', () => {
    const there = book({ kind: 'heading', id: 'b1', level: 1, text: 'Fusk och straff' }, { kind: 'text', id: 'b2', text: 'Den som blir påkommen lägger tillbaka handen.' })
    const plan = planImport(there, book({ kind: 'heading', id: 'b1', level: 1, text: 'En tur' }))
    // Three words in the heading and seven in the paragraph.
    expect(plan.gone).toEqual({ sections: 1, words: 10 })
  })
})

// "Väldigt tydligt" means the reader is told which words, not how many. A number says that 150
// words are going; the struck text says which, and that it was the paragraph about cheating that
// never made it into the file.
describe('the sentences a rewritten paragraph loses and gains (#131)', () => {
  it('marks the one sentence the file rewrote and leaves the ones around it standing', () => {
    const there = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'Översikt' },
      { kind: 'text', id: 'b2', text: 'Ett spel om att bluffa. Två till fem spelare. Den med mest guld vinner.' },
    )
    const file = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'Översikt' },
      { kind: 'text', id: 'b2', text: 'Ett spel om att bluffa. Två till sex spelare. Den med mest guld vinner.' },
    )
    const rewritten = planImport(there, file).blocks[1]!
    expect(rewritten.mark).toBe('changed')
    expect(rewritten.runs).toEqual([
      { mark: 'kept', text: 'Ett spel om att bluffa.' },
      { mark: 'going', text: 'Två till fem spelare.' },
      { mark: 'added', text: 'Två till sex spelare.' },
      { mark: 'kept', text: 'Den med mest guld vinner.' },
    ])
  })

  it('leaves a block that came through untouched without runs at all, so an unchanged book has no marks', () => {
    const same = book({ kind: 'heading', id: 'b1', level: 1, text: 'Översikt' }, { kind: 'text', id: 'b2', text: 'Ett spel om att bluffa.' })
    expect(planImport(same, same).blocks.every((b) => b.runs === undefined)).toBe(true)
  })
})

// The column beside the book carries the same marks as the book itself, because the section that
// disappears may be the one below the fold.
describe('the contents column is marked too (#131)', () => {
  it('gives every section the heaviest mark anything in it carries', () => {
    const there = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'Översikt' },
      { kind: 'text', id: 'b2', text: 'Ett spel om att bluffa.' },
      { kind: 'heading', id: 'b3', level: 1, text: 'En tur' },
      { kind: 'text', id: 'b4', text: 'Dra ett kort.' },
      { kind: 'heading', id: 'b5', level: 1, text: 'Fusk och straff' },
      { kind: 'text', id: 'b6', text: 'Den som blir påkommen.' },
    )
    const file = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'Översikt' },
      { kind: 'text', id: 'b2', text: 'Ett spel om att bluffa.' },
      { kind: 'heading', id: 'b3', level: 1, text: 'En tur' },
      { kind: 'text', id: 'b4', text: 'Dra två kort.' },
      { kind: 'heading', id: 'b5', level: 1, text: 'Två spelare' },
      { kind: 'text', id: 'b6', text: 'Fyra kort läggs åt sidan.' },
    )
    expect(planImport(there, file).sections.map((s) => [s.mark, s.text])).toEqual([
      ['kept', 'Översikt'],
      ['changed', 'En tur'],
      ['added', 'Två spelare'],
      ['going', 'Fusk och straff'],
    ])
  })
})

// The one exception to "the file decides" (B5, decided 2026-09-17). The setup block is not text:
// it is the game's own zones, drawn out of the state, and no Markdown file has it in it. A file
// that never mentions it has nothing to say about it, so it can never be imported away. The prose
// around it follows the file like all other prose.
describe('the setup block can never be imported away (#131, B5)', () => {
  it('keeps it at the head of its section, and lets the prose around it follow the file', () => {
    const there = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'Uppställning' },
      { kind: 'setup', id: 'b2', caption: 'Så ställs bordet upp' },
      { kind: 'text', id: 'b3', text: 'Var och en får fem guld.' },
    )
    const file = book({ kind: 'heading', id: 'b1', level: 1, text: 'Uppställning' }, { kind: 'text', id: 'b2', text: 'Var och en får sex guld.' })
    const plan = planImport(there, file)
    expect(plan.blocks.map((b) => [b.mark, b.block.kind, textOf(b.block)])).toEqual([
      ['kept', 'heading', 'Uppställning'],
      ['kept', 'setup', 'Så ställs bordet upp'],
      ['changed', 'text', 'Var och en får sex guld.'],
    ])
  })

  it('keeps it even when the file has no such section at all, and never marks it going', () => {
    const there = book(
      { kind: 'heading', id: 'b1', level: 1, text: 'Uppställning' },
      { kind: 'setup', id: 'b2' },
      { kind: 'text', id: 'b3', text: 'Var och en får fem guld.' },
    )
    const file = book({ kind: 'heading', id: 'b1', level: 1, text: 'En tur' })
    const plan = planImport(there, file)
    // A file that cannot write the block cannot delete it. What it can decide — the heading over
    // it and the prose beside it — it decides.
    expect(plan.blocks.filter((b) => b.block.kind === 'setup').map((b) => b.mark)).toEqual(['kept'])
    expect(plan.blocks.some((b) => b.mark === 'going' && b.block.kind === 'setup')).toBe(false)
  })
})

const textOf = (block: RuleDoc['blocks'][number]): string =>
  block.kind === 'list' ? block.items.join(' ') : block.kind === 'setup' || block.kind === 'image' ? (block.caption ?? '') : block.text
