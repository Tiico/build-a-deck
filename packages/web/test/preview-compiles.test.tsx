// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckWall } from '../src/editor/DeckWall.js'
import { revealThemeSection, ThemePanel } from '../src/editor/ThemePanel.js'
import { SetupEditor } from '../src/editor/SetupEditor.js'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import type { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc, template } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Counting the one thing that costs: `compile` is the renderer (E2), and every card on the wall
// goes through it. What a card is compiled from has to be held by identity, because that is how
// React holds it — a fresh object every render is a fresh compile of every card in the deck, and
// the whole wall is rebuilt when the eye is changed or a card is clicked.
//
// The fitting is the other thing that costs (#661): every text on a card is shrunk half a point at
// a time against the real DOM, and each step is a layout. Which card was fitted is kept too, so a
// test can say that the one card that changed was fitted again and no other.
const spy = vi.hoisted(() => ({ compiles: 0, fitted: [] as string[] }))
vi.mock('@byd/template', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@byd/template')>()
  return {
    ...actual,
    compile: (input: Parameters<typeof actual.compile>[0]) => {
      spy.compiles++
      return actual.compile(input)
    },
    fitInDocument: (root: ParentNode) => {
      spy.fitted.push((root as Element).closest?.('.byd-preview')?.id ?? '')
      return actual.fitInDocument(root)
    },
  }
})

beforeEach(() => {
  spy.compiles = 0
  spy.fitted = []
})

// The project's icons are resolved for the preview (E1) — `asset:<hash>` is a reference the store
// understands and a browser does not — so this is the wall as the editor actually mounts it.
// The face is rebuilt rather than pushed to: `projectDoc` hands out the one template the module
// holds, so appending to it would leave the next test in this file with two marks on the card.
const withIcon = () => {
  const doc = projectDoc()
  const front = doc.template.faces['front']!
  return {
    ...doc,
    icons: { svärd: `asset:${'c'.repeat(64)}` },
    template: {
      ...doc.template,
      faces: { ...doc.template.faces, front: { ...front, base: [...front.base, { kind: 'icons' as const, id: 'mark', x: 50, y: 76, w: 8, h: 8, bind: { literal: 'svärd' }, iconMm: 8, gapMm: 0 }] } },
    },
  }
}

describe('a card is not compiled again for nothing', () => {
  it('leaves every card on the wall alone when the eye is changed', () => {
    const doc = withIcon()
    render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} assetBase="http://api.local" />)

    // The control: the spy is real, and the wall did compile each of the three cards to draw it.
    expect(spy.compiles).toBe(doc.rows.length)

    // Nothing a card is compiled from has changed — the eye is a filter over the whole wall — so
    // nothing should be compiled again. A card recompiled under the pointer cannot be clicked.
    // The eyes moved into a named box in the wall's crown (#128), so the box is opened first —
    // and opening it must not compile anything either.
    fireEvent.click(screen.getByRole('button', { name: /^Ögon/ }))
    spy.compiles = 0
    fireEvent.click(screen.getByRole('button', { name: 'Deuteranopi' }))
    expect(spy.compiles).toBe(0)

    // And the other half of the same fact: a change to the deck is compiled, so the memo is a
    // memo and not a wall that has stopped listening.
    doc.rows[0]!.fields['title'] = 'Drakhona'
    render(<DeckWall doc={{ ...doc, rows: [...doc.rows] }} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} assetBase="http://api.local" />)
    expect(spy.compiles).toBe(doc.rows.length)
  })
})

// Speltema's icons draw the cards that say the symbol in hand, and the library beside them has a
// search box (L57). A keystroke in it must not be a keystroke that compiles those cards.
//
// The rows are given the symbol in so many words since #178. `withIcon` binds it as a literal on
// the template — every card shows it, no row says it — and the tab lists the cards that *say* a
// symbol, by the same walk the set beside the library counts with. So a deck that only paints its
// symbols has nothing to compile here, and a test about compiling needs cards to compile.
describe('a card is not compiled again for a keystroke in the search box', () => {
  it('leaves the deck below the library alone while a symbol is searched for', () => {
    const base = withIcon()
    const doc = { ...base, rows: base.rows.map((r) => ({ ...r, fields: { ...r.fields, body: `${String(r.fields['body'] ?? '')} {svärd}` } })) }
    localStorage.clear()
    revealThemeSection('icons')
    render(<ThemePanel doc={doc} client={{ mayEdit: true } as unknown as ProjectClient} assetBase="http://api.local" />)
    fireEvent.click(screen.getByRole('button', { name: /Ur biblioteket/ }))

    // The control: the spy is real, and the panel did compile each of the three cards to draw it.
    expect(spy.compiles).toBe(doc.rows.length)

    spy.compiles = 0
    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: 'svär' } })
    expect(spy.compiles).toBe(0)
  })
})

// One card rather than forty, but the card under the pointer: the canvas re-renders for anything
// the designer touches, and the card must not be rebuilt underneath what is being dragged (#18).
describe('the card on the canvas is not compiled again for nothing', () => {
  it('leaves the card alone when the guide grid is turned on', () => {
    render(
      <TemplateCanvas
        doc={withIcon()}
        assetBase="http://api.local"
        onReplaceFace={() => undefined}
        face="front"
        row="dragon"
        selectedElement="title"
        onSelectElement={() => undefined}
        onPatch={() => undefined} onCallOff={() => undefined}
        onRemove={() => undefined}
        onAdd={() => undefined}
        onPlaceIcon={() => undefined}
        onReorder={() => undefined}
        onLock={() => undefined}
        onRename={() => undefined}
        onSelectFace={() => undefined}
        group={null}
        onSelectGroup={() => undefined}
        onGroupColumn={() => undefined}
        onAddField={() => undefined}
        onReset={() => undefined}
      />,
    )
    // The control: the spy is real, and the canvas did compile its one card to draw it.
    expect(spy.compiles).toBe(1)

    spy.compiles = 0
    fireEvent.click(screen.getByLabelText(/rutnät/i))
    expect(spy.compiles).toBe(0)
  })
})

// The felt in the Bord tab draws the deck's back on every face-down pile, and the felt is the
// one surface in the editor that re-renders continuously: a zone is moved by dragging it, and
// every pointer move is a new document. A back recompiled under the pointer is a pile that
// flickers while the zone beside it is being placed.
describe('the deck’s back on the felt is not compiled again for nothing', () => {
  it('leaves it alone while a zone is dragged, and compiles it when the back changes', () => {
    const doc = withIcon()
    const client = { mayEdit: true, recipe: { players: 2, mine: false, discard: true, market: false, counters: [] } } as unknown as ProjectClient
    const { rerender } = render(<SetupEditor doc={doc} client={client} assetBase="http://api.local" />)
    // The control: the draw pile lies face down, so the back was compiled once to draw it.
    expect(spy.compiles).toBe(1)

    // A zone moved is a new document with the same deck in it: nothing the back is compiled from
    // has changed.
    spy.compiles = 0
    const moved = { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === 'draw' ? { ...z, geometry: { ...z.geometry, x: z.geometry.x + 5 } } : z)) } }
    rerender(<SetupEditor doc={moved} client={client} assetBase="http://api.local" />)
    expect(spy.compiles).toBe(0)

    // And the other half of the same fact: a back that changes is drawn again.
    // From the fixture's own factory: `withIcon` rebuilds the front, which narrows the type of
    // what it hands back to the one face it wrote.
    const back = template().faces['back']!
    const repainted = { ...moved, template: { ...moved.template, faces: { ...moved.template.faces, back: { ...back, base: [{ ...back.base[0]!, fill: '#6d2230' }] } } } }
    rerender(<SetupEditor doc={repainted} client={client} assetBase="http://api.local" />)
    expect(spy.compiles).toBe(1)
  })
})

// The wall re-renders for things that are not about any one card: the band at the top of the view
// changes at every band scrolled past, and the parent re-renders the wall whenever it likes. A card
// whose content and size are what they were is fitted already, and fitting it again is a layout
// per text per half point for every card in the deck (#661).
describe('a card on the wall is not fitted again for nothing (#661)', () => {
  // Three types, so the wall is grouped into bands with a jump column to move between them.
  const banded = () => {
    const doc = projectDoc()
    doc.rows = ['Event', 'Location', 'Trap'].flatMap((typ) =>
      Array.from({ length: 3 }, (_, i) => ({ id: `${typ}-${i}`, fields: { typ, title: `${typ} ${i}`, body: '', antal: 1 } })),
    )
    doc.template.faces['front']!.variantBy = 'typ'
    return doc
  }

  it('leaves every card alone when the band at the top of the view changes', () => {
    localStorage.clear()
    const doc = banded()
    render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />)
    // The control: the spy is real, and every card on the wall was fitted to draw it.
    expect(new Set(spy.fitted).size).toBe(doc.rows.length)

    spy.fitted = []
    const toc = document.querySelector('nav[aria-label="Grupper i leken"]') as HTMLElement
    fireEvent.click(toc.querySelector('[data-jump="Trap"]')!)
    // The wall did re-render: the jump column now says the reader stands in another band.
    expect(toc.querySelector('[data-jump="Trap"]')!.getAttribute('aria-current')).toBe('true')
    expect(spy.fitted).toEqual([])
  })

  it('fits the card whose content changed, and only it, and the wall hears what that card now says', () => {
    localStorage.clear()
    const doc = banded()
    const wall = (d: typeof doc) => <DeckWall doc={d} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />
    const { rerender } = render(wall(doc))
    const badge = () => document.querySelector('[data-card-ref="Location-1"] [data-warnings]')
    // The control: the card says nothing wrong before it is edited.
    expect(badge()).toBeNull()

    // One card is given a symbol the deck does not have: the rest of the deck is the same rows.
    spy.fitted = []
    const edited = { ...doc, rows: doc.rows.map((r) => (r.id === 'Location-1' ? { ...r, fields: { ...r.fields, body: 'Har {magi}.' } } : r)) }
    spy.compiles = 0
    rerender(wall(edited))
    // An edit is a new document that shares everything it did not change (`applyEdit`), so the
    // other cards are the same rows over the same fonts and icons: nothing to compile or fit.
    expect(spy.compiles).toBe(1)
    expect(spy.fitted).toEqual(['wall-Location-1'])
    // And what the fitting found reaches the wall through the callback the latest render handed
    // down, not one held from the first: the card wears its badge.
    expect(badge()!.textContent).toBe('1')
  })

  it('fits the card again when its face changes size, though no row did', () => {
    localStorage.clear()
    const doc = banded()
    const wall = (d: typeof doc) => <DeckWall doc={d} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />
    const { rerender } = render(wall(doc))

    spy.fitted = []
    const front = doc.template.faces['front']!
    const taller = { ...doc, template: { ...doc.template, faces: { ...doc.template.faces, front: { ...front, base: front.base.map((e) => (e.id === 'title' && e.kind === 'text' ? { ...e, h: e.h + 4 } : e)) } } } }
    rerender(wall(taller))
    expect(new Set(spy.fitted).size).toBe(doc.rows.length)
  })
})
