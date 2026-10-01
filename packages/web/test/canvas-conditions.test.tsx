// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

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
  it('says its condition and on how many cards it holds in the layer list, and lists what is in it', async () => {
    const user = userEvent.setup()
    open(null)
    const row = document.querySelector('[data-layer="if-drake"]') as HTMLElement
    expect(row.textContent).toContain('om title = Drake · 1 kort')
    await user.click(within(row).getByRole('button', { name: 'Visa vad som ingår i if-drake' }))
    expect(screen.getByRole('list', { name: 'I if-drake' }).textContent).toContain('badge')
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
    expect(frame.textContent).toContain('om title = Drake')
    expect(frame.hasAttribute('data-off')).toBe(true)
  })

  // Called by its condition while it has no name of its own — and a rename left as it was is no
  // rename: the field holds the layer's real name, not the words standing in for it.
  it('is called by its condition until it is named, and a rename left alone changes nothing', async () => {
    const user = userEvent.setup()
    const { onRename } = open(null)
    const pick = document.querySelector('[data-layer="if-drake"] .byd-layer-pick') as HTMLElement
    expect(pick.textContent).toContain('om title = Drake · 1 kort')
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
  })
})
