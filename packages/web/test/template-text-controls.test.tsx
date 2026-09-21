// @vitest-environment jsdom
// The template's text controls (#219, L41): a nine-point pad among the text fields, and the two
// spacings behind «Finjustering». What is checked here is what the designer can do — one tab stop
// for the pad, the arrows inside it, and a door that says whether it is open — not how the panel
// is put together.
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

function canvas(over: Partial<TemplateCanvasProps> = {}) {
  const props: TemplateCanvasProps = {
    doc: projectDoc(),
    face: 'front',
    onSelectFace: vi.fn(),
    onReplaceFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
    row: 'dragon',
    selectedElement: 'body',
    onSelectElement: vi.fn(),
    onPatch: vi.fn(),
    onCallOff: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onPlaceIcon: vi.fn(),
    onReorder: vi.fn(),
    onLock: vi.fn(),
    onRename: vi.fn(),
    onFontFile: async () => 'Typsnitt',
    onFontLicence: vi.fn(),
    onRemoveFont: vi.fn(),
    onCatalogFont: vi.fn(async () => undefined),
    ...over,
  }
  render(<TemplateCanvas {...props} />)
  return props
}

const pad = () => screen.getByRole('radiogroup', { name: 'Placering i rutan' })

describe('the nine-point pad (#219, L41)', () => {
  it('answers both directions at once, in one press', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas()

    await user.click(within(pad()).getByRole('radio', { name: 'centrerat, mitten' }))

    expect(onPatch).toHaveBeenCalledWith('body', { font: { family: 'sans-serif', sizePt: 9, align: 'center' }, valign: 'middle' }, undefined)
  })
})

describe('the pad is one tab stop with the arrows inside it (#219, L41)', () => {
  it('leaves exactly one square in the tab order, and it is the chosen one', () => {
    canvas()
    const squares = within(pad()).getAllByRole('radio')
    expect(squares).toHaveLength(9)
    const stops = squares.filter((square) => square.getAttribute('tabindex') === '0')
    expect(stops).toHaveLength(1)
    // `body` says nothing about either direction, so the square standing open is the top left.
    expect(stops[0]!.getAttribute('aria-label')).toBe('vänster, topp')
    expect(stops[0]!.getAttribute('aria-checked')).toBe('true')
  })

  it('walks the grid with the arrows and takes the choice along', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas()
    within(pad()).getByRole('radio', { name: 'vänster, topp' }).focus()

    await user.keyboard('{ArrowRight}')
    expect(onPatch).toHaveBeenLastCalledWith('body', expect.objectContaining({ valign: 'top', font: expect.objectContaining({ align: 'center' }) }), undefined)

    within(pad()).getByRole('radio', { name: 'vänster, topp' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(onPatch).toHaveBeenLastCalledWith('body', expect.objectContaining({ valign: 'middle', font: expect.objectContaining({ align: 'left' }) }), undefined)
  })

  it('does not step off the pad, nor sideways into the next row', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas()
    within(pad()).getByRole('radio', { name: 'vänster, topp' }).focus()

    await user.keyboard('{ArrowUp}{ArrowLeft}')
    expect(onPatch).not.toHaveBeenCalled()
  })
})

describe('the «Finjustering» door (#219, L41)', () => {
  const door = () => screen.getByRole('button', { name: 'Finjustering' })

  it('says whether it is open, and keeps the two spacings behind it', async () => {
    const user = userEvent.setup()
    canvas()
    expect(door().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('Radavstånd')).toBeNull()

    await user.click(door())

    expect(door().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Radavstånd')).toBeTruthy()
    expect(screen.getByLabelText('Teckenavstånd')).toBeTruthy()
  })

  it('writes the chosen line height and letter spacing on to the element’s font', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas()
    await user.click(door())

    await user.selectOptions(screen.getByLabelText('Radavstånd'), screen.getByRole('option', { name: 'luftigt (1,5)' }))
    expect(onPatch).toHaveBeenLastCalledWith('body', { font: { family: 'sans-serif', sizePt: 9, lineHeight: 1.5 } }, undefined)

    await user.selectOptions(screen.getByLabelText('Teckenavstånd'), screen.getByRole('option', { name: 'spärrat' }))
    expect(onPatch).toHaveBeenLastCalledWith('body', { font: { family: 'sans-serif', sizePt: 9, letterSpacing: 0.04 } }, undefined)
  })
})
