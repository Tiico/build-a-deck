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

describe('the card draws the template’s own picture (#320)', () => {
  it('shows the fixed picture from the place the deck’s pictures are served, through the one compiler', () => {
    canvas()
    expect(drawn('logo')?.getAttribute('src')).toBe(`${BASE}/assets/${LOGO}`)
  })
})
