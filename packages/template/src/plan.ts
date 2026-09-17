import type { RuleBlock, RuleDoc } from './rules.js'

// Importing over a book that is already written (#131). The product owner rejected "import only
// from the empty state": writing in one's own editor and importing again and again is a way of
// working to support, not an accident to guard against. What that costs is this — a plan from (the
// book there is, the book the file would make) to what is kept, what is rewritten, what goes away
// and what is new, so the surface is a rendering of a decided thing rather than the place where
// the decision is made. It is framework-free and tested through its own function for that reason.
export type RuleMark = 'kept' | 'changed' | 'going' | 'added'
// `was` is the block the file rewrote, kept beside the one that replaces it so the surface can say
// which words went and which came without having to work it out a second time.
export type RulePlanBlock = { block: RuleBlock; mark: RuleMark; was?: RuleBlock; runs?: RuleRun[] }
// A rewritten paragraph, sentence by sentence: what stood and stands, what went, and what came. A
// count says that a hundred and fifty words are going; this says which words they were.
export type RuleRun = { text: string; mark: 'kept' | 'going' | 'added' }
export type RulePlanSection = { id: string; text: string; mark: RuleMark }
// `doc` is the book as it would stand if the proposal were kept; `gone` is the weight of what it
// would not hold any more, which is the part of the report the second slice never had to say.
export type RulePlan = { blocks: RulePlanBlock[]; doc: RuleDoc; sections: RulePlanSection[]; counts: Record<RuleMark, number>; gone: { sections: number; words: number } }

export function planImport(there: RuleDoc, file: RuleDoc): RulePlan {
  const standing = sectionsOf(there)
  const coming = sectionsOf(file)
  const blocks: RulePlanBlock[] = []
  const all = (section: Section, mark: RuleMark) => {
    if (section.heading) blocks.push({ block: section.heading, mark })
    for (const block of section.setup) blocks.push({ block, mark: 'kept' })
    for (const block of section.body) blocks.push({ block, mark })
  }

  // Which standing section each incoming one is: the first one of that name that is not already
  // spoken for, so two sections of the same name are paired in the order they stand.
  const taken = new Set<number>()
  const matches = coming.map((section) => {
    const at = standing.findIndex((s, i) => !taken.has(i) && keyOf(s) === keyOf(section))
    if (at >= 0) taken.add(at)
    return at
  })

  // The file decides the order, and a section only the book has keeps the place it stood in
  // relative to the sections around it — struck where it stands, rather than swept to the end.
  let e = 0
  const goneUpTo = (limit: number) => {
    for (; e < limit; e++) {
      const section = standing[e]
      if (section && !taken.has(e)) all(section, 'going')
    }
  }
  coming.forEach((section, i) => {
    const at = matches[i] ?? -1
    const was = standing[at]
    if (!was) return all(section, 'added')
    goneUpTo(at)
    e = at + 1
    blocks.push(...merge(was, section))
  })
  goneUpTo(standing.length)

  // One series of ids over everything the reader is shown, so a struck paragraph and the paragraph
  // that replaces it can never claim the same anchor. The book takes the subset that survives, and
  // its ids are therefore not contiguous — which they never had to be.
  const numbered = blocks.map((planned, i) => ({ ...planned, block: { ...planned.block, id: `b${i + 1}` } }))
  const counts: Record<RuleMark, number> = { kept: 0, changed: 0, going: 0, added: 0 }
  for (const planned of numbered) counts[planned.mark]++
  const going = numbered.filter((planned) => planned.mark === 'going')
  return {
    blocks: numbered,
    doc: { title: there.title, blocks: numbered.filter((planned) => planned.mark !== 'going').map((planned) => planned.block) },
    sections: columnOf(numbered),
    counts,
    gone: {
      sections: going.filter((planned) => planned.block.kind === 'heading' && planned.block.level === 1).length,
      words: going.reduce((sum, planned) => sum + words(planned.block), 0),
    },
  }
}

// A section of the book, which is what a first-level heading opens (B7). What stands before the
// first of them is a section too — the one with no heading — because a file may open with a
// paragraph and the book has to hold it somewhere.
type Section = { heading: RuleBlock | null; body: RuleBlock[]; setup: RuleBlock[] }

function sectionsOf(doc: RuleDoc): Section[] {
  let current: Section = { heading: null, body: [], setup: [] }
  const sections: Section[] = [current]
  for (const block of doc.blocks) {
    if (block.kind === 'heading' && block.level === 1) {
      current = { heading: block, body: [], setup: [] }
      sections.push(current)
      // The setup block is held apart from the first moment and never reaches the comparison at
      // all (B5, decided 2026-09-17). It is not text but the game's own zones, drawn out of the
      // state, and no Markdown file has it in it — so a file that never mentions it has nothing to
      // say about it, and there is no code path by which it could be marked going.
    } else if (block.kind === 'setup') current.setup.push(block)
    else current.body.push(block)
  }
  // The section with no heading is only a section when something stands in it.
  const [first] = sections
  return first && first.body.length === 0 && first.setup.length === 0 ? sections.slice(1) : sections
}

// What makes two sections the same section across an import: the words of the heading, read
// without regard to the spaces around them or the case they were typed in. It is the only thing
// two books that were never the same document have in common — nothing carries an identity out of
// a Markdown file, which has no ids in it at all.
function keyOf(section: Section): string {
  const heading = section.heading
  return heading && heading.kind === 'heading' ? heading.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase() : ''
}

// Two sections of the same name, read against each other. The heading is one comparison and the
// body is another, because a heading retyped in another case is the same section by the rule above
// and still a rewritten line.
function merge(standing: Section, coming: Section): RulePlanBlock[] {
  const head = standing.heading && coming.heading ? [pair(standing.heading, coming.heading)] : []
  // The setup stands at the head of its section, under the heading the file decides, with the
  // prose the file decides beneath it.
  const setup = standing.setup.map((block): RulePlanBlock => ({ block, mark: 'kept' }))
  return [...head, ...setup, ...body(standing.body, coming.body)]
}

function pair(was: RuleBlock, block: RuleBlock): RulePlanBlock {
  if (same(was, block)) return { block, mark: 'kept' }
  const runs = was.kind === 'text' && block.kind === 'text' ? sentenceRuns(was.text, block.text) : undefined
  return { block, mark: 'changed', was, ...(runs ? { runs } : {}) }
}

// What a block is, for the purpose of recognising it again on the other side. A Markdown file
// carries no ids, so sameness is the content and nothing else.
const same = (a: RuleBlock, b: RuleBlock): boolean => shapeOf(a) === shapeOf(b)
const shapeOf = (block: RuleBlock): string => {
  switch (block.kind) {
    case 'heading':
      return `heading:${block.level}:${block.text}`
    case 'text':
      return `text:${block.text}`
    case 'list':
      return `list:${block.ordered === true}:${JSON.stringify(block.items)}`
    case 'setup':
      return `setup:${block.caption ?? ''}`
    // A picture is the bytes it points at and the words it says about itself (#173): the same
    // file with another alt text is another picture, because the alt text is what a reader gets.
    case 'image':
      return `image:${block.asset}:${block.alt}`
  }
}

// The bodies of two sections of the same name. Blocks that come through untouched are found first
// — the longest run of them, so a paragraph put in at the top is one new paragraph and not a
// rewritten section — and what lies between two of them is read pair by pair: a paragraph against
// the paragraph that replaced it, and a leftover on either side against nothing.
function body(standing: readonly RuleBlock[], coming: readonly RuleBlock[]): RulePlanBlock[] {
  const planned: RulePlanBlock[] = []
  let a = 0
  let b = 0
  const gap = (toA: number, toB: number) => {
    for (let i = 0; a + i < toA || b + i < toB; i++) {
      const before = a + i < toA ? standing[a + i] : undefined
      const after = b + i < toB ? coming[b + i] : undefined
      if (before && after && before.kind === after.kind) planned.push(pair(before, after))
      else {
        if (before) planned.push({ block: before, mark: 'going' })
        if (after) planned.push({ block: after, mark: 'added' })
      }
    }
    a = toA
    b = toB
  }
  for (const anchor of longest(standing.map(shapeOf), coming.map(shapeOf))) {
    gap(anchor.a, anchor.b)
    const held = coming[b]
    if (held) planned.push({ block: held, mark: 'kept' })
    a++
    b++
  }
  gap(standing.length, coming.length)
  return planned
}

// Where one sentence ends and the next begins: a full stop, a question or an exclamation followed
// by space, and a blank line. It is a rule of thumb and says so — an abbreviation with a stop in it
// ("t.ex.") splits a sentence in two, which costs a mark too many and never a mark too few.
const SENTENCE = /(?<=[.!?])\s+|\n{2,}/

const sentencesOf = (text: string): string[] =>
  text
    .split(SENTENCE)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)

// The sentences of a paragraph before and after, read against each other the same way the blocks
// of a section are: the longest run they have in common stands, and what lies between it is what
// went and what came, in that order — the reader meets what she is losing before what replaces it.
function sentenceRuns(was: string, now: string): RuleRun[] {
  const before = sentencesOf(was)
  const after = sentencesOf(now)
  const runs: RuleRun[] = []
  let a = 0
  let b = 0
  const between = (toA: number, toB: number) => {
    for (; a < toA; a++) {
      const text = before[a]
      if (text !== undefined) runs.push({ mark: 'going', text })
    }
    for (; b < toB; b++) {
      const text = after[b]
      if (text !== undefined) runs.push({ mark: 'added', text })
    }
  }
  for (const at of longest(before, after)) {
    between(at.a, at.b)
    const text = after[b]
    if (text !== undefined) runs.push({ mark: 'kept', text })
    a++
    b++
  }
  between(before.length, after.length)
  return runs
}

// The longest run two sequences have in common, in order. One function for both, because telling a
// rewritten paragraph from an inserted one is the same question at two scales: the blocks of a
// section, and the sentences of a paragraph.
function longest(left: readonly string[], right: readonly string[]): { a: number; b: number }[] {
  const stride = right.length + 1
  const len = new Int32Array((left.length + 1) * stride)
  const at = (i: number, j: number): number => len[i * stride + j] ?? 0
  for (let i = left.length - 1; i >= 0; i--)
    for (let j = right.length - 1; j >= 0; j--) len[i * stride + j] = left[i] === right[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
  const found: { a: number; b: number }[] = []
  for (let i = 0, j = 0; i < left.length && j < right.length; ) {
    if (left[i] === right[j]) found.push({ a: i++, b: j++ })
    else if (at(i + 1, j) >= at(i, j + 1)) i++
    else j++
  }
  return found
}

// The column beside the book, carrying the same marks the book does — the section that disappears
// may be the one below the fold, and the reader has to be able to see it from where she is. A
// section is as marked as the most marked thing in it: one rewritten paragraph makes it rewritten,
// and only a section where nothing at all happened is left alone.
function columnOf(blocks: readonly RulePlanBlock[]): RulePlanSection[] {
  const sections: RulePlanSection[] = []
  let within: RuleMark[] = []
  const settle = () => {
    const last = sections[sections.length - 1]
    if (!last || last.mark === 'going' || last.mark === 'added') return
    last.mark = within.every((mark) => mark === 'kept') ? 'kept' : 'changed'
  }
  for (const planned of blocks) {
    if (planned.block.kind === 'heading' && planned.block.level === 1) {
      settle()
      sections.push({ id: planned.block.id, text: planned.block.text, mark: planned.mark })
      within = [planned.mark]
    } else within.push(planned.mark)
  }
  settle()
  return sections
}

// What a block weighs, in the words a reader would have read. It is the whole of the answer to
// "how much am I losing", and a count of blocks is not that answer: one paragraph can be a page.
const words = (block: RuleBlock): number =>
  wordsOf(block)
    .split(/\s+/)
    .filter((word) => word.length > 0).length

// A picture weighs what it says: its alt text, which is what the reader would have been told.
// A decorative one weighs nothing, and that is the cost the decision of 2026-09-17 wrote down.
const wordsOf = (block: RuleBlock): string => {
  switch (block.kind) {
    case 'list':
      return block.items.join(' ')
    case 'setup':
      return block.caption ?? ''
    case 'image':
      return block.alt
    default:
      return block.text
  }
}
