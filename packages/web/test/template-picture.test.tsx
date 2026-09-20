// @vitest-environment jsdom
// A picture the template carries by itself (#320): a background, a frame or a logo that is the
// same on every card, bound straight into the image element instead of through a column every
// row repeats. It is chosen from the game's pictures — the same window Data opens (#296) — or
// uploaded from there, and either way it lives in Media and nowhere else.
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { layerShown } from './layers.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const LOGO = '2'.repeat(64)
const BASE = 'http://api.local'

// A deck with a picture column on the front and a fixed picture on the back.
function deck(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.template.faces['back']!.base.push({ kind: 'image', id: 'logo', x: 20, y: 30, w: 23, h: 23, bind: { literal: `asset:${LOGO}` } })
  doc.rows[0]!.fields['art'] = `asset:${SKOG}`
  doc.pictures = { [SKOG]: { name: 'skog' }, [LOGO]: { name: 'logga' } }
  return doc
}

function canvas(over: Partial<TemplateCanvasProps> = {}) {
  const props: TemplateCanvasProps = {
    doc: deck(),
    assetBase: BASE,
    face: 'back',
    onSelectFace: vi.fn(),
    onReplaceFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
    row: 'dragon',
    selectedElement: 'logo',
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
    ...over,
  }
  render(<TemplateCanvas {...props} />)
  return props
}

const drawn = (id: string) => document.querySelector(`#canvas [data-element="${id}"] img.byd-art`)

describe('the layer list names the picture the element carries (#320)', () => {
  it('says the picture’s name after the layer’s, never the raw reference, and nothing for an empty frame', () => {
    const doc = deck()
    doc.template.faces['back']!.base.push({ kind: 'image', id: 'blank', x: 0, y: 0, w: 10, h: 10, bind: { literal: '' } })
    canvas({ doc })
    expect(layerShown('logo')).toBe('logga')
    expect(layerShown('blank')).toBeNull()
  })
})

describe('the card draws the template’s own picture (#320)', () => {
  it('shows the fixed picture from the place the deck’s pictures are served, through the one compiler', () => {
    canvas()
    expect(drawn('logo')?.getAttribute('src')).toBe(`${BASE}/assets/${LOGO}`)
  })
})

const source = () => screen.getByRole('radiogroup', { name: 'Bildkälla' })
const byColumn = () => within(source()).getByRole('radio', { name: 'Från kolumn' }) as HTMLInputElement
const fixed = () => within(source()).getByRole('radio', { name: 'Fast bild' }) as HTMLInputElement
const dialog = () => screen.getByRole('dialog', { name: 'Bilder i spelet' })

describe('an image element is either from a column or a fixed picture (#320)', () => {
  it('says which it is in the panel, and shows the fixed picture by name with a way to change it', () => {
    canvas()
    expect(fixed().checked).toBe(true)
    expect(byColumn().checked).toBe(false)
    // A fixed picture has no field, so the field picker is not offered — the switch is the way.
    expect(screen.queryByLabelText('Fält')).toBeNull()
    const shown = document.querySelector('.byd-props-picture') as HTMLElement
    expect(within(shown).getByText('logga')).toBeTruthy()
    expect(shown.querySelector('img')?.getAttribute('src')).toBe(`${BASE}/assets/${LOGO}`)
    expect(within(shown).getByRole('button', { name: 'Välj bild…' })).toBeTruthy()
  })

  it('opens the game’s pictures on «Fast bild», says which element it is for, and binds the chosen picture in one patch', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas({ face: 'front', selectedElement: 'art' })
    expect(byColumn().checked).toBe(true)
    expect((screen.getByLabelText('Fält') as HTMLSelectElement).value).toBe('art')

    await user.click(fixed())

    expect(within(dialog()).getByText('Bildelementet art (framsida)')).toBeTruthy()
    // Nothing has been written: the switch only opens the question.
    expect(onPatch).not.toHaveBeenCalled()
    await user.click(within(dialog()).getByRole('button', { name: 'logga' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Använd bilden' }))

    expect(vi.mocked(onPatch).mock.calls.map((call) => call.slice(0, 2))).toEqual([['art', { bind: { literal: `asset:${LOGO}` } }]])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves the element on its column when the window is closed without a choice', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas({ face: 'front', selectedElement: 'art' })
    await user.click(fixed())
    await user.click(within(dialog()).getByRole('button', { name: 'Avbryt' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onPatch).not.toHaveBeenCalled()
    expect(byColumn().checked).toBe(true)
    expect(document.activeElement).toBe(fixed())
  })

  it('goes back to a column on «Från kolumn», to the first column the template draws as a picture', async () => {
    const user = userEvent.setup()
    const { onPatch } = canvas()
    await user.click(byColumn())
    expect(vi.mocked(onPatch).mock.calls.map((call) => call.slice(0, 2))).toEqual([['logo', { bind: { field: 'art' } }]])
  })

  it('offers the upload in the window when the editor can take one, by the same path Media takes', async () => {
    const user = userEvent.setup()
    const onAddPicture = vi.fn(async () => LOGO)
    canvas({ face: 'front', selectedElement: 'art', onAddPicture })
    await user.click(fixed())
    expect(within(dialog()).getByLabelText('Ladda upp')).toBeTruthy()
  })
})
