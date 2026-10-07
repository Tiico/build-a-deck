// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { openAllSections } from './sections.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The panel folds (#478); this file is about the controls in it, so every section stands open.
beforeEach(openAllSections)

// A ready-made back laid over a back that has layers (#478, L9, #143): it replaced every layer
// without a word, where removing one layer asks. It now asks the same question, in the same strip,
// and a back with nothing on it is simply laid down.

function open(back: Element[] | null = null) {
  const doc: ProjectDoc = projectDoc()
  if (back) doc.template.faces['back'] = { base: back, variants: {} }
  const onReplaceFace = vi.fn()
  render(
    <TemplateCanvas
      doc={doc}
      face="back"
      row="dragon"
      selectedElement={null}
      onSelectElement={vi.fn()}
      onPatch={vi.fn()}
      onCallOff={vi.fn()}
      onReplaceFace={onReplaceFace}
      onRemove={vi.fn()}
      onAdd={vi.fn()}
      onPlaceIcon={vi.fn()}
      onReorder={vi.fn()}
      onLock={vi.fn()}
      onRename={vi.fn()}
      onSelectFace={vi.fn()}
      group={null}
      onSelectGroup={vi.fn()}
      onGroupColumn={vi.fn()}
      onAddField={vi.fn()}
      onReset={vi.fn()}
    />,
  )
  return { onReplaceFace }
}

const gallery = () => within(screen.getByRole('group', { name: 'Färdiga baksidor' }))

describe('a ready-made back over the one there is (#478)', () => {
  it('asks before it replaces the layers the back has, and keeps them on the safe answer', async () => {
    const user = userEvent.setup()
    const { onReplaceFace } = open()
    // Folded under the back's own layers (#736), so the gallery is opened first.
    await user.click(gallery().getByRole('button', { name: /^Färdiga baksidor/ }))
    const diamonds = gallery().getByRole('button', { name: /Romber/ })
    await user.click(diamonds)
    expect(onReplaceFace).not.toHaveBeenCalled()
    const question = screen.getByRole('alertdialog')
    expect(question.textContent).toContain('Romber')
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Avbryt' }))
    await user.keyboard('{Escape}')
    expect(onReplaceFace).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(diamonds)

    await user.click(diamonds)
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Ja, byt baksida' }))
    expect(onReplaceFace).toHaveBeenCalledTimes(1)
  })

  it('lays a back down at once over a back with nothing on it', async () => {
    const user = userEvent.setup()
    const { onReplaceFace } = open([])
    await user.click(gallery().getByRole('button', { name: /Romber/ }))
    expect(onReplaceFace).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

// Folded under the back's layers while the back has some, open while it has none (#736, beslut A
// 2026-10-06). Open above the layers it took 506 px of the column and hid every one of them.
describe('the ready-made backs folded under the back (#736)', () => {
  const head = () => gallery().getByRole('button', { name: /^Färdiga baksidor/ })

  it('stands folded under the layers of a back that has some, and opens on one press', async () => {
    const user = userEvent.setup()
    open()
    expect(head().getAttribute('aria-expanded')).toBe('false')
    expect(head().textContent).toMatch(/^Färdiga baksidor \(\d+\)$/)
    expect(gallery().queryByRole('button', { name: /Romber/ })).toBeNull()
    // Under the layers, not over them.
    const layers = screen.getByRole('grid')
    expect(layers.compareDocumentPosition(head()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(head())
    expect(head().getAttribute('aria-expanded')).toBe('true')
    expect(gallery().getByRole('button', { name: /Romber/ })).toBeTruthy()
  })

  it('stands open on a back with nothing on it, and folds with the hand on its head once a back is laid down', async () => {
    const user = userEvent.setup()
    // The canvas as the editor holds it: laying a back down gives the back its layers.
    function Editing() {
      const [doc, setDoc] = useState<ProjectDoc>(() => {
        const d = projectDoc()
        d.template.faces['back'] = { base: [], variants: {} }
        return d
      })
      return (
        <TemplateCanvas
          doc={doc}
          face="back"
          row="dragon"
          selectedElement={null}
          onSelectElement={vi.fn()}
          onPatch={vi.fn()}
          onCallOff={vi.fn()}
          onReplaceFace={(base) => setDoc((d) => ({ ...d, template: { ...d.template, faces: { ...d.template.faces, back: { base, variants: {} } } } }))}
          onRemove={vi.fn()}
          onAdd={vi.fn()}
          onPlaceIcon={vi.fn()}
          onReorder={vi.fn()}
          onLock={vi.fn()}
          onRename={vi.fn()}
          onSelectFace={vi.fn()}
          group={null}
          onSelectGroup={vi.fn()}
          onGroupColumn={vi.fn()}
          onAddField={vi.fn()}
          onReset={vi.fn()}
        />
      )
    }
    render(<Editing />)
    expect(head().getAttribute('aria-expanded')).toBe('true')
    await user.click(gallery().getByRole('button', { name: /Romber/ }))
    expect(head().getAttribute('aria-expanded')).toBe('false')
    // The button that was pressed is gone with the list; the hand is on the head and not on <body>.
    expect(document.activeElement).toBe(head())
  })
})
