// @vitest-environment jsdom
// Where the reader is in the book, carried from one box to the other (#227).
//
// The one thing that cannot be carried is a number. The book is 584 px wide in the editor and
// 380 px wide in the table's drawer, so the same section stands at a different height in the two
// of them: «Skogens väsen» was measured at `scrollTop` 2 600 in the book and 2 387 in the drawer,
// and «Vintern kommer» 156 px apart. A reading is therefore which block is topmost in view and
// how far into it the reader has come — which is also the only thing there is to say out loud.
import { describe, expect, it } from 'vitest'
import type { RenderedBlock } from '@byd/template'
import { readTo, readingIn, sectionOf } from '../src/rules/reading.js'

// jsdom lays nothing out, so the two boxes are given the geometry the browser measured. The area
// has a top of its own — never zero — so that a reading taken against the wrong origin shows up.
const VIEW_TOP = 40
const rect = (top: number, height: number): DOMRect =>
  ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

type Laid = { id: string; top: number; height: number }

function area(blocks: readonly Laid[]): HTMLElement {
  const box = document.createElement('div')
  box.getBoundingClientRect = () => rect(VIEW_TOP, 600)
  for (const b of blocks) {
    const el = document.createElement('div')
    el.dataset.block = b.id
    el.getBoundingClientRect = () => rect(VIEW_TOP + b.top - box.scrollTop, b.height)
    box.append(el)
  }
  document.body.append(box)
  return box
}

// The two books, at the heights they were measured at in Chromium at 1440 × 900.
const BOOK: Laid[] = [
  { id: 'h1', top: 0, height: 40 },
  { id: 't1', top: 40, height: 2560 },
  { id: 'h2', top: 2600, height: 40 },
  { id: 't2', top: 2640, height: 900 },
]
const DRAWER: Laid[] = [
  { id: 'h1', top: 0, height: 34 },
  { id: 't1', top: 34, height: 2353 },
  { id: 'h2', top: 2387, height: 34 },
  { id: 't2', top: 2421, height: 1400 },
]

describe('carrying the reader’s place between the book and the drawer (#227)', () => {
  it('reads the topmost block in view, and how far into it the reader has come', () => {
    const book = area(BOOK)
    book.scrollTop = 2600
    expect(readingIn(book)).toEqual({ block: 'h2', into: 0 })
    // Half way into the last section, which begins at 2 640 and is 900 px tall.
    book.scrollTop = 3090
    expect(readingIn(book)).toEqual({ block: 't2', into: 0.5 })
  })

  it('puts the same section at the top of a box of a different size, which a number could not', () => {
    const book = area(BOOK)
    const drawer = area(DRAWER)
    book.scrollTop = 2600
    readTo(drawer, readingIn(book))
    // 213 px is exactly what carrying the number would have cost.
    expect(drawer.scrollTop).toBe(2387)
    expect(book.scrollTop - drawer.scrollTop).toBe(213)
  })

  it('carries how far into a block the reader had come, as a share of that block and not as pixels', () => {
    const book = area(BOOK)
    const drawer = area(DRAWER)
    // Half way into the last section, which is 900 px in the book and 1 400 px in the drawer.
    book.scrollTop = 2640 + 450
    expect(readingIn(book)).toEqual({ block: 't2', into: 0.5 })
    readTo(drawer, readingIn(book))
    expect(drawer.scrollTop).toBe(2421 + 700)
  })

  it('has no reading to give for an area holding no book at all, which is what an open answer is', () => {
    expect(readingIn(area([]))).toBeNull()
  })

  it('leaves a box alone when the block the reader was in is not in it', () => {
    const drawer = area(DRAWER)
    drawer.scrollTop = 500
    readTo(drawer, { block: 'nowhere', into: 0 })
    readTo(drawer, null)
    expect(drawer.scrollTop).toBe(500)
  })
})

describe('the section a block stands in', () => {
  const blocks: RenderedBlock[] = [
    { kind: 'heading', id: 'h1', level: 1, children: [{ type: 'text', text: 'Så spelar ni' }] },
    { kind: 'text', id: 't1', paragraphs: [{ children: [{ type: 'text', text: 'Dra ett kort.' }] }] },
    { kind: 'heading', id: 'h2', level: 1, children: [{ type: 'text', text: 'Skogens väsen' }] },
    { kind: 'heading', id: 'h3', level: 2, children: [{ type: 'text', text: 'Vintern kommer' }] },
    { kind: 'text', id: 't2', paragraphs: [{ children: [{ type: 'text', text: 'Snön faller.' }] }] },
  ]

  // A heading stopped being letters and became children (#272), so the section a reader is told
  // she is in has to be read the same way the heading itself is read: a reference stands for the
  // name it has. "Samma avsnitt: [[zon:hand]]" would be saying the markup out loud.
  it('says a reference in the heading by the name it stands for', () => {
    const withRef: RenderedBlock[] = [
      {
        kind: 'heading',
        id: 'h1',
        level: 1,
        children: [
          { type: 'text', text: 'Korten i ' },
          { type: 'ref', of: 'zone', id: 'hand', name: 'Handen' },
        ],
      },
      { kind: 'text', id: 't1', paragraphs: [{ children: [{ type: 'text', text: 'Dra ett kort.' }] }] },
    ]
    expect(sectionOf(withRef, 'Skogens herrar', 't1')).toBe('Korten i Handen')
  })

  it('is the section the reader is in, and a subheading answers with the section above it', () => {
    expect(sectionOf(blocks, 'Skogens herrar', 't1')).toBe('Så spelar ni')
    expect(sectionOf(blocks, 'Skogens herrar', 'h2')).toBe('Skogens väsen')
    expect(sectionOf(blocks, 'Skogens herrar', 't2')).toBe('Skogens väsen')
  })

  it('is the book itself for anything standing before the first section', () => {
    expect(sectionOf(blocks.slice(1), 'Skogens herrar', 't1')).toBe('Skogens herrar')
  })
})
