// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

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
      onFontFile={async () => 'Typsnitt'}
      onFontLicence={vi.fn()}
      onRemoveFont={vi.fn()} onCatalogFont={vi.fn(async () => undefined)}
    />,
  )
  return { onReplaceFace }
}

const gallery = () => within(screen.getByRole('group', { name: 'Färdiga baksidor' }))

describe('a ready-made back over the one there is (#478)', () => {
  it('asks before it replaces the layers the back has, and keeps them on the safe answer', async () => {
    const user = userEvent.setup()
    const { onReplaceFace } = open()
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
