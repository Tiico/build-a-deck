import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@byd/template'
import { bandAtTop, tileColours } from '../src/editor/bands.js'

// Where the reader is standing is arithmetic over the bands' tops and nothing else, so it can be
// reasoned about without a layout — which is the only way it can be tested at all, since jsdom
// lays nothing out and a browser's answer would be a measurement of a font.
describe('the band at the top of the view (#179)', () => {
  const tops = [
    { key: 'Playcard', top: 0 },
    { key: 'Character', top: 4000 },
    { key: 'Shopcard', top: 5400 },
    { key: '', top: 6200 },
  ]

  it('is the first band before anything has been scrolled', () => {
    expect(bandAtTop(tops, 0)).toBe('Playcard')
  })

  it('is the last band that has begun above the fold, and never one still well below it', () => {
    expect(bandAtTop(tops, 3900)).toBe('Playcard')
    expect(bandAtTop(tops, 4000)).toBe('Character')
    expect(bandAtTop(tops, 5300)).toBe('Character')
    expect(bandAtTop(tops, 6200)).toBe('')
    expect(bandAtTop(tops, 99999)).toBe('')
  })

  it('counts a band as reached a hair before its top, so a jump cannot land just short of it', () => {
    // A jump writes a scroll position and reads the mark back off it; a browser that lands half a
    // pixel high would otherwise leave the mark on the band above the one it jumped to.
    expect(bandAtTop(tops, 3999.5)).toBe('Character')
  })

  // The bands at the end of the deck never reach the top of the view: there is nothing under the
  // last one to scroll up past it, so the wall runs out of room with them still halfway down the
  // screen. Read on tops alone the mark would stop somewhere in the middle of the deck and stay
  // there — a jump to the last band would leave the mark on a band the reader has already gone
  // past, which is exactly what #179 asks the table of contents not to do. So the room the wall
  // has left is part of the question: when it is spent, the reader is at the end of the deck, and
  // the band at the end of the deck is the last one.
  it('marks the last band once the wall has no room left, though its top never reaches the fold', () => {
    // 6 200 px down a wall that can only be scrolled 5 800: the loose band can never stand at the
    // top, and neither can the one before it.
    expect(bandAtTop(tops, 5800, 5800)).toBe('')
    expect(bandAtTop(tops, 5799, 5800)).toBe('Shopcard')
  })

  // More than one band can be stranded past the end — on a real deck the last two were — and once
  // the wall is at its end they are all on screen together with no scroll position left to tell
  // them apart. So the reader's own answer wins: a jump into the tail stays marked where she
  // jumped, and only a reader who has no answer of her own is given the last band.
  it('keeps a mark the reader set herself on a band the scroll can no longer reach', () => {
    // A wall with 5 000 px of room strands the last two bands: Shopcard at 5 400 and the loose one
    // at 6 200 are both past everything it can scroll, and at the end they are on screen together.
    expect(bandAtTop(tops, 5000, 5000, 'Shopcard')).toBe('Shopcard')
    expect(bandAtTop(tops, 5000, 5000, '')).toBe('')
    // A band the scroll *can* reach is no answer at the end: she scrolled to the bottom rather than
    // jumping into the tail, so what she is looking at is the end of the deck.
    expect(bandAtTop(tops, 5000, 5000, 'Character')).toBe('')
    expect(bandAtTop(tops, 5000, 5000, null)).toBe('')
    // And short of the end the reader's own mark counts for nothing; the tops answer as they always do.
    expect(bandAtTop(tops, 4100, 5000, 'Shopcard')).toBe('Character')
  })

  // A wall that does not scroll reports no room, and so does a layout that has measured nothing
  // yet. Neither is a reader at the end of the deck, and reading them as one would put the mark on
  // the last band of a wall the reader is looking at the top of.
  it('does not read a wall with no room at all as a wall at its end', () => {
    expect(bandAtTop(tops, 0, 0)).toBe('Playcard')
    expect(bandAtTop(tops, 5500, 0)).toBe('Shopcard')
  })

  it('has no answer only when there is no band to give', () => {
    expect(bandAtTop([], 0)).toBeNull()
  })
})

// The count written on a tile is the tool's own text on a colour the designer chose, which is the
// case L11 already settled once for the seats: the ink follows the ground, and where no ink reads
// the ground gives way. Nothing in the editor ships text under 4.5:1 (E5), and the strip is the
// one place in it where the background is the game's and not the tool's.
describe('what a tile in the strip is written in (#179, L11)', () => {
  const ratio = (a: string, b: string) => contrastRatio(a, b)

  it('writes in white on a dark head colour and in dark ink on a light one', () => {
    expect(tileColours('#6b4a2e').ink).toBe('#ffffff')
    expect(tileColours('#2f4a6b').ink).toBe('#ffffff')
    expect(tileColours('#ffe08a').ink).toBe('#0d0f14')
    expect(tileColours('#e0a458').ink).toBe('#0d0f14')
  })

  it('gives the ground way until the count reads on it, whatever colour the deck chose', () => {
    for (const paint of ['#6b4a2e', '#2f4a6b', '#ffe08a', '#808080', '#7a7f45', '#3b3a86']) {
      const { ground, quiet, ink } = tileColours(paint)
      expect({ paint, lit: ratio(ink, ground) >= 4.5 }).toEqual({ paint, lit: true })
      expect({ paint, quiet: ratio(ink, quiet) >= 4.5 }).toEqual({ paint, quiet: true })
      // The tile the reader is standing in is the brighter of the two — that is one of the three
      // channels the fold has to survive on — so the two grounds are never the same colour.
      expect({ paint, apart: ground !== quiet }).toEqual({ paint, apart: true })
    }
  })

  it('leaves a colour it cannot read alone rather than guessing at it', () => {
    expect(tileColours('var(--something)').ground).toBe('var(--something)')
  })
})
