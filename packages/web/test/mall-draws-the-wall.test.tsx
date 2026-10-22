// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { DeckWall } from '../src/editor/DeckWall.js'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'

// Kortväggen and Mall draw the same card from the same game (E2): a symbol written `{namn|roll}`
// — which is what the AI writes when it gives a card a meaning — is painted in the game's colour
// on the wall, and Mall drew it uncoloured, so the two disagreed until the page was left.
const SWORD = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'
const doc = () => ({
  ...projectDoc(),
  icons: { svard: SWORD },
  palette: { fara: '#8f2d20' },
  rows: [{ id: 'dragon', fields: { title: 'Drake', body: 'Skada {svard|fara} 2.', antal: 1 } }],
})

// What the symbol is painted in, or that it is not painted at all.
const paintOf = (root: Element) => {
  const symbol = root.querySelector('[aria-label="svard"], img[alt="svard"]')
  expect(symbol, 'the symbol is drawn').not.toBeNull()
  return (symbol as HTMLElement).style.background || 'unpainted'
}

const canvasProps = (): TemplateCanvasProps => ({
  doc: doc(),
  face: 'front',
  onSelectFace: vi.fn(),
  onReplaceFace: vi.fn(),
  group: null,
  onSelectGroup: vi.fn(),
  onGroupColumn: vi.fn(),
  onAddField: vi.fn(),
  onReset: vi.fn(),
  row: 'dragon',
  onPickRow: vi.fn(),
  selectedElement: null,
  onSelectElement: vi.fn(),
  onPatch: vi.fn(),
  onCallOff: vi.fn(),
  onRemove: vi.fn(),
  onAdd: vi.fn(),
  onPlaceIcon: vi.fn(),
  onReorder: vi.fn(),
  onLock: vi.fn(),
  onRename: vi.fn(),
})

describe('Mall draws the card the wall draws', () => {
  it('paints a symbol’s meaning in the game’s colour on both', () => {
    const wall = render(<DeckWall doc={doc()} face="front" selectedRow="dragon" onSelectRow={() => undefined} onSelectElement={() => undefined} />)
    const onWall = paintOf(wall.container)
    wall.unmount()

    const mall = render(<TemplateCanvas {...canvasProps()} />)
    const inMall = paintOf(mall.container.querySelector('.byd-canvas-stage')!)

    expect(onWall).toMatch(/143, 45, 32|#8f2d20/i)
    expect(inMall).toBe(onWall)
  })
})
