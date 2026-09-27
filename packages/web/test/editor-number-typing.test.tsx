// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { Element, ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { openAllSections } from './sections.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The panel folds (#478); this file is about the controls in it, so every section stands open.
beforeEach(openAllSections)

// A number typed into a field (#478): every keystroke used to be written to the template, so
// `12.5` wrote 0, 1, 12 and 12.5 — four versions on the wire — an emptied Bredd wrote 0 mm and
// the heading vanished, and Storlek took 0 although its floor is 1. The digits are a draft until
// the field is left or Enter is pressed; then exactly one valid number is written, held to the
// field's own floor and ceiling, and an empty field writes nothing and shows what it had.

function open(over: Partial<Element> = {}, id = 'frame') {
  const doc: ProjectDoc = projectDoc()
  const front = doc.template.faces['front']!
  doc.template.faces['front'] = { ...front, base: front.base.map((e) => (e.id === id ? ({ ...e, ...over } as Element) : e)) }
  const onPatch = vi.fn()
  render(
    <TemplateCanvas
      doc={doc}
      face="front"
      row="dragon"
      selectedElement={id}
      onSelectElement={vi.fn()}
      onPatch={onPatch}
      onCallOff={vi.fn()}
      onReplaceFace={vi.fn()}
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
  return { onPatch }
}

const field = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement

describe('a number typed into the panel (#478)', () => {
  it('writes 12.5 once, when the field is left, and none of the digits on the way', async () => {
    const user = userEvent.setup()
    const { onPatch } = open()
    const x = field('X (mm)')
    await user.clear(x)
    await user.type(x, '12.5')
    expect(onPatch).not.toHaveBeenCalled()
    await user.tab()
    expect(onPatch.mock.calls.map((call) => call[1])).toEqual([{ x: 12.5 }])
  })

  it('writes it on Enter too, and takes it back on Escape without writing anything', async () => {
    const user = userEvent.setup()
    const { onPatch } = open()
    const y = field('Y (mm)')
    const before = y.value
    await user.clear(y)
    await user.type(y, '7{Enter}')
    expect(onPatch.mock.calls.map((call) => call[1])).toEqual([{ y: 7 }])
    onPatch.mockClear()
    await user.clear(y)
    await user.type(y, '30{Escape}')
    expect(onPatch).not.toHaveBeenCalled()
    expect(y.value).toBe(before)
  })

  it('writes nothing for an emptied field, and shows what it had again', async () => {
    const user = userEvent.setup()
    const { onPatch } = open()
    const w = field('Bredd (mm)')
    const had = w.value
    await user.clear(w)
    await user.tab()
    expect(onPatch).not.toHaveBeenCalled()
    expect(w.value).toBe(had)
  })

  it('holds a typed number to the field s floor: 0 in Storlek is 1', async () => {
    const user = userEvent.setup()
    const { onPatch } = open({}, 'title')
    const size = field('Storlek (pt)')
    await user.clear(size)
    await user.type(size, '0')
    await user.tab()
    expect(onPatch.mock.calls.length).toBe(1)
    expect(onPatch.mock.calls[0]?.[1]).toMatchObject({ font: { sizePt: 1 } })
  })

  it('never lets a box be typed down to nothing', async () => {
    const user = userEvent.setup()
    const { onPatch } = open()
    const w = field('Bredd (mm)')
    await user.clear(w)
    await user.type(w, '0')
    await user.tab()
    expect(onPatch.mock.calls.map((call) => call[1])).toEqual([{ w: 0.5 }])
  })
})

// The reading itself, which the table's `antal` and the counters are to share (#478, #479, #483).
describe('what a finished draft writes (#478)', () => {
  it('reads a decimal comma, holds to the bounds, and writes nothing for no number', async () => {
    const { settled } = await import('../src/editor/number-draft.js')
    expect(settled('12,5')).toBe(12.5)
    expect(settled(' 7 ')).toBe(7)
    expect(settled('0', { min: 1 })).toBe(1)
    expect(settled('400', { max: 360 })).toBe(360)
    expect(settled('')).toBeNull()
    expect(settled('-')).toBeNull()
    expect(settled('abc')).toBeNull()
  })
})
