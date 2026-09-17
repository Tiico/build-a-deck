// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, fireEvent, render } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { DeckWall } from '../src/editor/DeckWall.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// A wall of 308 cards printed into a failure message is a megabyte nobody reads and a minute
// nobody has: what a query could not find is the whole of what this suite needs to be told.
configure({ getElementError: (message) => new Error(message ?? 'element not found') })

// The wall remembers whether it groups and whether its jump column is folded, for the browser and
// not for the deck. Every test here opens a browser that has never been told anything, so that
// what it is looking at is the wall as it is designed and not what the test before it asked for.
beforeEach(() => localStorage.clear())

// The deck the issue was measured on (#179): 308 cards in eight types, in the proportions the
// prototype used. A wall this size is the whole point — eleven screens of the same thing is not a
// problem three cards can show.
const SPREAD: readonly (readonly [string, number])[] = [
  ['Playcard', 132],
  ['Character', 44],
  ['Shopcard', 40],
  ['Event', 36],
  ['Location', 20],
  ['Effect', 16],
  ['Trap+', 12],
  ['Trap-', 8],
]

function bigDeck(): ProjectDoc {
  const doc = projectDoc()
  doc.rows = SPREAD.flatMap(([typ, n]) =>
    Array.from({ length: n }, (_, i) => ({ id: `${typ}-${i}`, fields: { typ, title: `${typ} ${i}`, body: '', antal: 1 } })),
  )
  doc.template.faces['front']!.variantBy = 'typ'
  return doc
}

const wall = (doc: ProjectDoc) =>
  render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />)

describe('the wall is grouped by the column the template already groups by (#179)', () => {
  it('gives 308 cards in eight types eight bands, each saying its name and its count', () => {
    wall(bigDeck())
    const bands = [...document.querySelectorAll('[data-band]')]
    expect(bands.map((b) => b.getAttribute('data-band'))).toEqual(SPREAD.map(([typ]) => typ))
    for (const [typ, n] of SPREAD) {
      const head = document.querySelector(`[data-band="${typ}"] [data-band-head]`) as HTMLElement
      expect(head.textContent).toContain(typ)
      expect(head.textContent).toContain(`${n} kort`)
    }
    // Nothing is hidden and nothing is folded away: the whole deck is still on the wall (L8).
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(308)
    expect(document.querySelector('[data-band="Playcard"] [data-band-head] h3')!.textContent).toBe('Playcard')
  })
})

describe('the card that answers nothing (#179)', () => {
  it('lands in a band named after the missing answer, and is on the wall like every other card', () => {
    const doc = bigDeck()
    doc.rows.push({ id: 'lost', fields: { title: 'Namnlös', body: '', antal: 1 } })
    doc.rows.push({ id: 'blank', fields: { typ: '', title: 'Tom', body: '', antal: 1 } })
    wall(doc)
    // Keyed by being no value at all, never by the words it is called: a deck is free to hold a
    // card whose type is literally `Utan typ`, and that card is a group of its own.
    const loose = document.querySelector('[data-band=""]') as HTMLElement
    expect(loose.querySelector('[data-band-head]')!.textContent).toContain('Utan typ')
    expect(loose.querySelector('[data-band-head]')!.textContent).toContain('2 kort')
    expect([...loose.querySelectorAll('[data-card-ref]')].map((c) => c.getAttribute('data-card-ref'))).toEqual(['lost', 'blank'])
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(310)
    // It stands last: it is the answer that is missing, not one of the answers the deck gives.
    expect([...document.querySelectorAll('[data-band]')].at(-1)).toBe(loose)
  })

  it('is not the same band as a group whose value happens to read like its name', () => {
    const doc = bigDeck()
    doc.rows.push({ id: 'trickster', fields: { typ: 'Utan typ', title: 'Lurendrejaren', body: '', antal: 1 } })
    doc.rows.push({ id: 'lost', fields: { title: 'Namnlös', body: '', antal: 1 } })
    wall(doc)
    expect(document.querySelectorAll('[data-band-head]')).toHaveLength(10)
    const real = document.querySelector('[data-band="Utan typ"]') as HTMLElement
    const loose = document.querySelector('[data-band=""]') as HTMLElement
    expect(real).not.toBe(loose)
    expect([...real.querySelectorAll('[data-card-ref]')].map((c) => c.getAttribute('data-card-ref'))).toEqual(['trickster'])
    expect([...loose.querySelectorAll('[data-card-ref]')].map((c) => c.getAttribute('data-card-ref'))).toEqual(['lost'])
  })
})

describe('the deck’s table of contents (#179)', () => {
  it('lists every band with its count, in the wall’s own order', () => {
    wall(bigDeck())
    const toc = document.querySelector('nav[aria-label="Grupper i leken"]') as HTMLElement
    const entries = [...toc.querySelectorAll('[data-jump]')]
    expect(entries.map((e) => e.getAttribute('data-jump'))).toEqual(SPREAD.map(([typ]) => typ))
    for (const [i, [typ, n]] of SPREAD.entries()) {
      expect(entries[i]!.textContent).toContain(typ)
      expect(entries[i]!.textContent).toContain(String(n))
    }
    // The band at the top of the view is the one the reader is standing in, and the column says so.
    expect(entries[0]!.getAttribute('aria-current')).toBe('true')
    expect(entries[1]!.getAttribute('aria-current')).toBe('false')
  })

  it('moves the focus to the band’s first card, not only the scroll position', () => {
    wall(bigDeck())
    const toc = document.querySelector('nav[aria-label="Grupper i leken"]') as HTMLElement
    fireEvent.click(toc.querySelector('[data-jump="Location"]')!)
    expect(document.activeElement).toBe(document.querySelector('[data-band="Location"] [data-card-ref]'))
    expect(document.activeElement!.getAttribute('data-card-ref')).toBe('Location-0')
  })
})

describe('the crown’s search (#179)', () => {
  const search = () => document.querySelector('input[type="search"]') as HTMLInputElement

  it('is the search the data tab already has, and says how many of how many are left', () => {
    wall(bigDeck())
    expect(search().getAttribute('aria-label')).toBe('Sök i alla fält')
    fireEvent.change(search(), { target: { value: 'Trap+' } })
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(12)
    expect(document.querySelector('.byd-crown-foot')!.textContent).toContain('12 av 308 kort')
    // The wall narrows and so does its table of contents: a band with nothing left to show is a
    // line that jumps nowhere.
    expect([...document.querySelectorAll('[data-band]')].map((b) => b.getAttribute('data-band'))).toEqual(['Trap+'])
    expect([...document.querySelectorAll('[data-jump]')].map((e) => e.getAttribute('data-jump'))).toEqual(['Trap+'])
    // Taking the question back gives the whole deck back; nothing was removed, only hidden.
    fireEvent.change(search(), { target: { value: '' } })
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(308)
    expect(document.querySelector('.byd-crown-foot')!.textContent).toContain('308 kort')
  })
})

describe('the grouping is the crown’s to change (#179)', () => {
  const box = (name: RegExp) => [...document.querySelectorAll('.byd-crown-box')].find((b) => name.test(b.textContent ?? '')) as HTMLElement
  const choice = (name: string) =>
    [...document.querySelectorAll('.byd-crown-drawer button')].find((b) => b.textContent === name) as HTMLElement

  it('says which column it groups by, and can be turned off altogether', () => {
    wall(bigDeck())
    expect(box(/^Grupperad efter/).textContent).toContain('typ')
    fireEvent.click(box(/^Grupperad efter/))
    fireEvent.click(choice('Ingen gruppering'))
    // One wall again, and no table of contents to a deck that has no groups.
    expect(document.querySelectorAll('[data-band]')).toHaveLength(0)
    expect(document.querySelector('nav[aria-label="Grupper i leken"]')).toBeNull()
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(308)
    expect(box(/^Grupperad efter/).textContent).toContain('Ingen gruppering')
  })

  it('groups by another column when asked, without touching the density', () => {
    const doc = bigDeck()
    for (const [i, row] of doc.rows.entries()) row.fields['sällsynthet'] = i % 2 === 0 ? 'Guld' : 'Silver'
    wall(doc)
    fireEvent.click(box(/^Grupperad efter/))
    fireEvent.click(choice('sällsynthet'))
    expect([...document.querySelectorAll('[data-band]')].map((b) => b.getAttribute('data-band'))).toEqual(['Guld', 'Silver'])
    expect(document.querySelector('[data-band="Guld"] [data-band-head]')!.textContent).toContain('154 kort')
    // The density ladder is a separate remembered choice and the regrouping left it alone.
    expect(document.querySelector('.byd-crown-foot')!.textContent).toContain('150 px')
  })
})

describe('the jump column folds to a strip (#179)', () => {
  const fold = () => document.querySelector('.byd-crown-fold') as HTMLButtonElement
  const open = () => document.querySelector('nav[aria-label="Grupper i leken"]')
  const rail = () => document.querySelector('nav[aria-label="Grupper i leken, hopfälld"]') as HTMLElement

  it('is a real disclosure in the crown, and the deck meets it unfolded', () => {
    wall(bigDeck())
    expect(fold().tagName).toBe('BUTTON')
    expect(fold().getAttribute('aria-expanded')).toBe('true')
    expect(fold().textContent).toContain('Fäll ihop hoppspalten')
    expect(open()).not.toBeNull()
    expect(rail()).toBeNull()
    // It says what it controls, so a reader who arrives at it on a keyboard is told what moved.
    expect(fold().getAttribute('aria-controls')).toBe(open()!.id)

    fireEvent.click(fold())
    expect(fold().getAttribute('aria-expanded')).toBe('false')
    expect(fold().textContent).toContain('Fäll ut hoppspalten')
    expect(open()).toBeNull()
    expect(rail()).not.toBeNull()
  })

  it('keeps every group, its count and the answer to where — in tiles that are real buttons', () => {
    wall(bigDeck())
    fireEvent.click(fold())
    const tiles = [...rail().querySelectorAll('[data-tile]')] as HTMLElement[]
    expect(tiles.map((tile) => tile.getAttribute('data-tile'))).toEqual(SPREAD.map(([typ]) => typ))
    expect(tiles.every((tile) => tile.tagName === 'BUTTON')).toBe(true)
    // The name drops out of the tile and into its readable name; the count stays written.
    expect(tiles[0]!.getAttribute('aria-label')).toBe('Playcard, 132 kort')
    expect(tiles[0]!.textContent).toBe('132')
    // "Where am I" survives the fold on three channels, and this is the one a reader is told
    // about: colour alone cannot carry it when two groups share a head colour.
    expect(tiles[0]!.getAttribute('aria-current')).toBe('true')
    expect(tiles[1]!.getAttribute('aria-current')).toBe('false')
  })

  it('jumps the way the open column jumps: to the band’s first card', () => {
    wall(bigDeck())
    fireEvent.click(fold())
    fireEvent.click(rail().querySelector('[data-tile="Effect"]')!)
    expect(document.activeElement!.getAttribute('data-card-ref')).toBe('Effect-0')
    expect(rail().querySelector('[data-tile="Effect"]')!.getAttribute('aria-current')).toBe('true')
  })

  it('is remembered, so only the reader who folded it meets the strip next time', () => {
    const first = wall(bigDeck())
    fireEvent.click(fold())
    first.unmount()
    wall(bigDeck())
    expect(fold().getAttribute('aria-expanded')).toBe('false')
    expect(rail()).not.toBeNull()
  })
})

// The head the prototype's cards wear, as the template actually says it (L16): one shape whose
// fill follows the grouping column. `Trap+` and `Trap-` share a colour on purpose — it is the
// reason "where am I" can never hang on colour alone.
const HEADS: Record<string, string> = {
  Playcard: '#6b4a2e',
  Character: '#6b2d5c',
  Shopcard: '#7a5c00',
  Event: '#2f4a6b',
  Location: '#2f6136',
  Effect: '#8f2d20',
  'Trap+': '#3b3a86',
  'Trap-': '#3b3a86',
}

function paintedDeck(): ProjectDoc {
  const doc = bigDeck()
  doc.template.faces['front']!.base.unshift(
    { kind: 'shape', id: 'paper', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#f3ecdc' },
    { kind: 'shape', id: 'head', x: 4, y: 4, w: 55, h: 12, shape: 'rect', fill: { field: 'typ', map: HEADS, else: '#3a3f4c' } },
  )
  return doc
}

describe('the strip is a cross-section of the deck (#179)', () => {
  const tiles = () => [...document.querySelectorAll('[data-tile]')] as HTMLElement[]

  it('wears the cards’ own head colours, and two groups that share one still say where the reader is', () => {
    wall(paintedDeck())
    fireEvent.click(document.querySelector('.byd-crown-fold')!)
    for (const tile of tiles()) {
      expect(tile.style.getPropertyValue('--byd-band-paint')).toBe(HEADS[tile.getAttribute('data-tile')!])
    }
    // The paper is the same on every card and says nothing about which group a card is in, so it
    // is not what the strip is painted from.
    expect(tiles()[0]!.style.getPropertyValue('--byd-band-paint')).not.toBe('#f3ecdc')
    // Two groups, one colour: only the mark tells them apart, which is why there is a mark.
    const traps = tiles().filter((tile) => tile.getAttribute('data-tile')!.startsWith('Trap'))
    expect(traps[0]!.style.getPropertyValue('--byd-band-paint')).toBe(traps[1]!.style.getPropertyValue('--byd-band-paint'))
    expect(traps.map((tile) => tile.getAttribute('aria-current'))).toEqual(['false', 'false'])
  })

  it('gives a tile the share of the strip its group has of the deck, in the deck’s own order', () => {
    wall(paintedDeck())
    fireEvent.click(document.querySelector('.byd-crown-fold')!)
    const shares = tiles().map((tile) => Number(tile.style.flexGrow))
    // Larger groups read as larger, and the tail keeps a share of its own: `--tap` floors the
    // height in CSS, so nothing here may be zero.
    expect(shares).toEqual([...shares].sort((a, b) => b - a))
    expect(Math.min(...shares)).toBeGreaterThan(0)
    expect(shares[0]! / shares[7]!).toBeGreaterThan(4)
  })
})

describe('the jump column under a keyboard (L12)', () => {
  const entries = (selector: string) => [...document.querySelectorAll(selector)] as HTMLElement[]

  it('is one tab stop the arrows move inside', () => {
    wall(bigDeck())
    expect(entries('[data-jump]').map((e) => e.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1, -1])
    entries('[data-jump]')[0]!.focus()
    fireEvent.keyDown(entries('[data-jump]')[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(entries('[data-jump]')[1]!)
    fireEvent.keyDown(entries('[data-jump]')[1]!, { key: 'End' })
    expect(document.activeElement).toBe(entries('[data-jump]')[7]!)
  })

  it('is the same one tab stop folded, and the fold keeps the reader’s place in it', () => {
    wall(bigDeck())
    fireEvent.click(document.querySelector('.byd-crown-fold')!)
    expect(entries('[data-tile]').map((e) => e.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1, -1])
    entries('[data-tile]')[0]!.focus()
    fireEvent.keyDown(entries('[data-tile]')[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(entries('[data-tile]')[1]!)
    // Unfolding is the same list in another shape: the keyboard does not start over from the top.
    fireEvent.click(document.querySelector('.byd-crown-fold')!)
    expect(entries('[data-jump]').map((e) => e.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1, -1, -1])
  })
})

// What the crown could already do, asked of a wall that now stands in bands. The bands are a new
// shape for the same deck, so none of this may have moved — and a physical remark in particular
// has to keep pointing at its own card wherever that card now stands.
describe('the crown’s older tools over a grouped wall (E5, #128)', () => {
  const box = (name: RegExp) => [...document.querySelectorAll('.byd-crown-box')].find((b) => name.test(b.textContent ?? '')) as HTMLElement
  const deck = () => document.querySelector('[data-wall]') as HTMLElement

  it('keeps the eyes, the guides, the density ladder and the report working', () => {
    const doc = bigDeck()
    // A text too small for the press, on every card in the deck (E5).
    doc.template.faces['front']!.base.push({
      kind: 'text',
      id: 'flavour',
      x: 6,
      y: 70,
      w: 51,
      h: 10,
      bind: { field: 'title' },
      font: { family: 'system-ui', sizePt: 5 },
      color: '#111111',
    })
    wall(doc)

    expect(deck().getAttribute('data-eye')).toBe('normal')
    fireEvent.click(box(/^Ögon/))
    fireEvent.click([...document.querySelectorAll('.byd-crown-drawer button')].find((b) => b.textContent === 'Deuteranopi')!)
    expect(deck().getAttribute('data-eye')).toBe('deuteranopia')

    fireEvent.click(box(/^Guider/))
    fireEvent.click(document.querySelector('.byd-crown-drawer input[type="checkbox"]')!)
    expect(deck().getAttribute('data-trim')).toBe('true')

    // The ladder still steps, and the foot still says where on it the wall is standing.
    expect(document.querySelector('.byd-crown-foot')!.textContent).toContain('150 px')
    fireEvent.click(document.querySelector('[aria-label="Fler kort per rad"]')!)
    expect(document.querySelector('.byd-crown-foot')!.textContent).toContain('130 px')
    expect(deck().style.getPropertyValue('--byd-wall-card')).toBe('130px')
  })

  it('still points a physical remark at its own card, wherever the bands put it', () => {
    const doc = bigDeck()
    doc.template.faces['front']!.base.push({
      kind: 'text',
      id: 'flavour',
      x: 6,
      y: 70,
      w: 51,
      h: 10,
      bind: { field: 'title' },
      font: { family: 'system-ui', sizePt: 5 },
      color: '#111111',
    })
    wall(doc)
    fireEvent.click(box(/^Fysisk kontroll/))
    const remark = [...document.querySelectorAll('.byd-wall-checks li > button')][0]!
    fireEvent.click(remark)
    // Every card the fault touches, marked where it now stands — inside its own band.
    expect(document.querySelectorAll('[data-card-ref][data-marked]')).toHaveLength(308)
    expect(document.querySelectorAll('[data-band="Location"] [data-card-ref][data-marked]')).toHaveLength(20)
  })
})

describe('the mark follows the deck as it rolls past (#179)', () => {
  // jsdom lays nothing out, so the bands are given tops of their own: what is under test is the
  // wiring between the deck's scrolling and the mark, and the arithmetic itself is
  // `editor-bands.test.ts`'s. A real browser's answer would be a measurement of a font.
  const withTops = (tops: Record<string, number>, run: () => void) => {
    const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        return tops[this.getAttribute('data-band') ?? ''] ?? 0
      },
    })
    try {
      run()
    } finally {
      if (own) Object.defineProperty(HTMLElement.prototype, 'offsetTop', own)
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)['offsetTop']
    }
  }

  it('marks the band standing at the top of the view, in both shapes of the column', () => {
    withTops({ Playcard: 0, Character: 4000, Shopcard: 5400, Event: 6200, Location: 7000, Effect: 7400, 'Trap+': 7700, 'Trap-': 7900 }, () => {
      wall(bigDeck())
      const deck = document.querySelector('.byd-wall-deck') as HTMLElement
      const current = () => document.querySelector('[data-jump][aria-current="true"]')!.getAttribute('data-jump')
      expect(current()).toBe('Playcard')
      deck.scrollTop = 5500
      fireEvent.scroll(deck)
      expect(current()).toBe('Shopcard')
      deck.scrollTop = 7900
      fireEvent.scroll(deck)
      expect(current()).toBe('Trap-')
      // Folding keeps the answer, in a tile instead of a row.
      fireEvent.click(document.querySelector('.byd-crown-fold')!)
      expect(document.querySelector('[data-tile][aria-current="true"]')!.getAttribute('data-tile')).toBe('Trap-')
    })
  })
})
