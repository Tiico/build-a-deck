// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { layerGrid } from './layers.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'

// A layer drawn on some cards only (#478, beslut 2026-09-27, variant A: the condition as a folder).
// An `if-*` layer gave an empty panel under an empty «Layout» head, no frame on the card, no word
// about its condition — and Delete said «ritas på 3 kort» for a layer drawn on one. The row now
// says the condition and on how many cards it holds, and lists what is in it; the card draws a
// dashed frame around it with the condition on a tab; the panel edits the condition and shows a
// card it holds on; and the question before it goes counts the cards it is really drawn on.
const BADGE: Element = {
  kind: 'if',
  id: 'if-drake',
  when: { field: 'title', equals: 'Drake' },
  children: [{ kind: 'shape', id: 'badge', shape: 'circle', x: 50, y: 5, w: 8, h: 8, fill: '#8b2e2e' }],
}

function open(selected: string | null = 'if-drake', row = 'knight') {
  const doc: ProjectDoc = projectDoc()
  doc.template.faces['front']!.base.push(BADGE)
  const onPatch = vi.fn()
  const onPickRow = vi.fn()
  const onRename = vi.fn()
  render(
    <TemplateCanvas
      doc={doc}
      face="front"
      row={row}
      onPickRow={onPickRow}
      selectedElement={selected}
      onSelectElement={vi.fn()}
      onPatch={onPatch}
      onCallOff={vi.fn()}
      onReplaceFace={vi.fn()}
      onRemove={vi.fn()}
      onAdd={vi.fn()}
      onPlaceIcon={vi.fn()}
      onReorder={vi.fn()}
      onLock={vi.fn()}
      onRename={onRename}
      onSelectFace={vi.fn()}
      group={null}
      onSelectGroup={vi.fn()}
      onGroupColumn={vi.fn()}
      onAddField={vi.fn()}
      onReset={vi.fn()}
    />,
  )
  return { onPatch, onPickRow, onRename }
}

describe('a layer drawn on some cards only (#478)', () => {
  it('says its condition and on how many cards it holds in the layer list, and lists what is in it once chosen', () => {
    open(null)
    const row = document.querySelector('[data-layer="if-drake"]') as HTMLElement
    expect(row.textContent).toContain('om Titel = Drake · 1 kort')
    // Choosing the layer is what opens it (#699, variant D): the folder's own button is gone from
    // the row, and its 44 px went to the name.
    expect(within(row).getAllByRole('button').map((b) => b.className)).toEqual(['byd-layer-lock', 'byd-layer-pick'])
    expect(screen.queryByRole('list', { name: 'I om Titel = Drake' })).toBeNull()
    cleanup()
    open('if-drake')
    expect(within(layerGrid()).getByRole('list', { name: 'I om Titel = Drake' }).textContent).toContain('badge')
  })

  it('edits its condition in the panel, and shows a card it holds on', async () => {
    const user = userEvent.setup()
    const { onPatch, onPickRow } = open()
    const panel = within(document.querySelector('.byd-canvas-props') as HTMLElement)
    expect(panel.getByText('Syns på 1 av 3 kort')).toBeTruthy()
    await user.selectOptions(panel.getByLabelText('Kolumnen villkoret frågar'), 'body')
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual({ when: { field: 'body', equals: 'Drake' } })
    await user.click(panel.getByRole('button', { name: 'Visa ett kort där det syns' }))
    expect(onPickRow).toHaveBeenLastCalledWith('dragon')
  })

  it('draws a dashed frame round it on the card, with the condition on a tab, faded where it does not hold', () => {
    open(null, 'knight')
    const frame = document.querySelector('[data-condition="if-drake"]') as HTMLElement
    expect(frame).toBeTruthy()
    expect(frame.textContent).toContain('om Titel = Drake')
    expect(frame.hasAttribute('data-off')).toBe(true)
  })

  // Called by its condition while it has no name of its own — and a rename left as it was is no
  // rename: the field holds the layer's real name, not the words standing in for it.
  it('is called by its condition until it is named, and a rename left alone changes nothing', async () => {
    const user = userEvent.setup()
    const { onRename } = open(null)
    const pick = document.querySelector('[data-layer="if-drake"] .byd-layer-pick') as HTMLElement
    expect(pick.textContent).toContain('om Titel = Drake · 1 kort')
    pick.focus()
    await user.keyboard('{F2}{Enter}')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('counts the cards it is drawn on before it goes', async () => {
    const user = userEvent.setup()
    open()
    const row = document.querySelector('[data-layer="if-drake"] .byd-layer-pick') as HTMLElement
    row.focus()
    await user.keyboard('{Delete}')
    expect(screen.getByRole('alertdialog').textContent).toMatch(/1 kort/)
    // By the layer's one name (#699), not its id.
    expect(screen.getByRole('alertdialog').textContent).toMatch(/^Ta bort om Titel = Drake från framsida\?/)
  })
})

// Variant D (#699, beställarens val 2026-10-20): a condition layer has one name, written the same
// in the layer list, on the canvas tab and in the properties heading — «om Titel = Drake». Before,
// the same layer was «…e · 1 kort» in the list, «om Titel = Drake» on the card and «IF-DRAKE» over
// its properties.
describe('one name for a condition layer (#699)', () => {
  it('is said the same in the list, on the canvas tab and in the properties heading', () => {
    open('if-drake')
    const row = document.querySelector('[data-layer="if-drake"] .byd-layer-name') as HTMLElement
    const tab = document.querySelector('[data-condition="if-drake"] .byd-condition-tab') as HTMLElement
    expect(row.textContent).toBe('om Titel = Drake · 1 kort')
    expect(tab.textContent).toBe('om Titel = Drake')
    expect(screen.getByRole('heading', { name: 'Egenskaper · om Titel = Drake' })).toBeTruthy()
  })

  // The grid is untouched (L15): the arrow walks from one condition to the next, and what is heard
  // there is the condition and its count, with a pause where the eye sees a dot.
  it('is heard by its condition and its count, and the arrow walks to the next condition', async () => {
    const user = userEvent.setup()
    const doc: ProjectDoc = projectDoc()
    const knight: Element = { kind: 'if', id: 'if-riddare', when: { field: 'title', equals: 'Riddare' }, children: [{ kind: 'shape', id: 'shield', shape: 'rect', x: 5, y: 5, w: 8, h: 8, fill: '#335577' }] }
    doc.template.faces['front']!.base.push(knight, BADGE)
    render(<TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="if-drake" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onReplaceFace={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} />)
    const drake = document.querySelector('[data-layer="if-drake"] .byd-layer-pick') as HTMLElement
    expect(drake.getAttribute('aria-label')).toBe('om Titel = Drake, 1 kort')
    drake.focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(document.querySelector('[data-layer="if-riddare"] .byd-layer-pick'))
    expect(document.activeElement?.getAttribute('aria-label')).toBe('om Titel = Riddare, 1 kort')
  })

  it('heads the properties of a named layer with its name, not its id', () => {
    const doc: ProjectDoc = projectDoc()
    const title = doc.template.faces['front']!.base.find((el) => el.id === 'title')!
    title.name = 'Rubriken'
    render(<TemplateCanvas doc={doc} face="front" row="dragon" selectedElement="title" onSelectElement={vi.fn()} onPatch={vi.fn()} onCallOff={vi.fn()} onReplaceFace={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onPlaceIcon={vi.fn()} onReorder={vi.fn()} onLock={vi.fn()} onRename={vi.fn()} onSelectFace={vi.fn()} group={null} onSelectGroup={vi.fn()} onGroupColumn={vi.fn()} onAddField={vi.fn()} onReset={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Egenskaper · Rubriken' })).toBeTruthy()
  })
})
