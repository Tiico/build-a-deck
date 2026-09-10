// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckWall } from '../src/editor/DeckWall.js'
import { SymbolPanel } from '../src/editor/SymbolPanel.js'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import type { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'

// Counting the one thing that costs: `compile` is the renderer (E2), and every card on the wall
// goes through it. What a card is compiled from has to be held by identity, because that is how
// React holds it — a fresh object every render is a fresh compile of every card in the deck, and
// the whole wall is rebuilt when the eye is changed or a card is clicked.
const spy = vi.hoisted(() => ({ compiles: 0 }))
vi.mock('@byd/template', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@byd/template')>()
  return {
    ...actual,
    compile: (input: Parameters<typeof actual.compile>[0]) => {
      spy.compiles++
      return actual.compile(input)
    },
  }
})

beforeEach(() => {
  spy.compiles = 0
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

// The Symboler tab draws the whole deck under the library, and the library has a search box. A
// keystroke in it must not be a keystroke that compiles the deck.
describe('a card is not compiled again for a keystroke in the search box', () => {
  it('leaves the deck below the library alone while a symbol is searched for', () => {
    const doc = withIcon()
    render(<SymbolPanel doc={doc} client={{} as ProjectClient} assetBase="http://api.local" />)

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
        face="front"
        row="dragon"
        selectedElement="title"
        onSelectElement={() => undefined}
        onPatch={() => undefined}
        onRemove={() => undefined}
        onAdd={() => undefined}
        onPlaceIcon={() => undefined}
        onReorder={() => undefined}
        onSelectFace={() => undefined}
        group={null}
        onSelectGroup={() => undefined}
        onGroupColumn={() => undefined}
        onAddField={() => undefined}
        onReset={() => undefined}
        onFontFile={async () => 'Typsnitt'}
        onFontLicence={() => undefined}
        onRemoveFont={() => undefined}
      />,
    )
    // The control: the spy is real, and the canvas did compile its one card to draw it.
    expect(spy.compiles).toBe(1)

    spy.compiles = 0
    fireEvent.click(screen.getByLabelText(/rutnät/i))
    expect(spy.compiles).toBe(0)
  })
})
