// @vitest-environment jsdom
// What a new picture or row of icons is bound to the moment the tool places it (#700). The deck's
// first column is a guess that suits a text box and nothing else: a picture bound to «typ» drew
// the browser's broken-image glyph with src «Playcard», and a row of icons bound to it wrote
// «{Playcard}» in the warning red. A new layer reads a column that already holds what it draws,
// and otherwise draws nothing until the designer says what it should.
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useState } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { Element } from '@byd/template'
import { TemplateCanvas, type TemplateCanvasProps } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const BASE = 'http://api.local'

// The deck from the play test: every card has a «typ», and nothing on the template is a picture
// or a row of icons yet.
function deck(): ProjectDoc {
  const doc = projectDoc()
  for (const row of doc.rows) row.fields['typ'] = 'Playcard'
  doc.pictures = { [SKOG]: { name: 'skog' } }
  return doc
}

// The canvas with the document held the way the editor holds it, so a placed element is drawn
// on the card by the one compiler and its panel opens beside it.
function Desk({ start, onAdd }: { start: ProjectDoc; onAdd(el: Element): void }) {
  const [doc, setDoc] = useState(start)
  const [selected, setSelected] = useState<string | null>(null)
  const props: TemplateCanvasProps = {
    doc,
    assetBase: BASE,
    face: 'front',
    onSelectFace: vi.fn(),
    onReplaceFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
    row: 'dragon',
    selectedElement: selected,
    onSelectElement: setSelected,
    onPatch: vi.fn(),
    onCallOff: vi.fn(),
    onRemove: vi.fn(),
    onAdd: (el) => {
      onAdd(el)
      setDoc((d) => {
        const next = structuredClone(d)
        next.template.faces['front']!.base.push(el)
        return next
      })
    },
    onPlaceIcon: vi.fn(),
    onReorder: vi.fn(),
    onLock: vi.fn(),
    onRename: vi.fn(),
  }
  return <TemplateCanvas {...props} />
}

async function place(doc: ProjectDoc, tool: string): Promise<Element> {
  const user = userEvent.setup()
  const onAdd = vi.fn()
  render(<Desk start={doc} onAdd={onAdd} />)
  await user.click(within(screen.getByRole('toolbar', { name: /verktyg/i })).getByRole('button', { name: tool }))
  expect(onAdd).toHaveBeenCalledTimes(1)
  return onAdd.mock.calls[0]![0] as Element
}

const onCard = (id: string) => document.querySelector(`#canvas [data-element="${id}"]`)

describe('a new picture layer (#700)', () => {
  it('in a game without a picture column is a fixed picture with nothing chosen, and the card draws no image for it', async () => {
    const el = await place(deck(), 'Bild')
    expect(el).toMatchObject({ kind: 'image', id: 'image-1', bind: { literal: '' } })
    expect(onCard('image-1')).not.toBeNull()
    expect(onCard('image-1')!.querySelector('img')).toBeNull()
  })

  it('opens the game’s pictures at once when it is a fixed picture, since choosing one is the next thing to do', async () => {
    await place(deck(), 'Bild')
    const pictures = screen.getByRole('dialog', { name: 'Bilder i spelet' })
    expect(within(pictures).getByText('Bildelementet image-1 (framsida)')).toBeTruthy()
    expect(within(pictures).getByRole('button', { name: 'skog' })).toBeTruthy()
  })

  it('in a game with a picture column reads that column, not the deck’s first one', async () => {
    const doc = deck()
    doc.template.faces['back']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'bild' } })
    for (const row of doc.rows) row.fields['bild'] = `asset:${SKOG}`
    const el = await place(doc, 'Bild')
    expect(el).toMatchObject({ kind: 'image', bind: { field: 'bild' } })
    expect(onCard('image-1')!.querySelector('img')?.getAttribute('src')).toBe(`${BASE}/assets/${SKOG}`)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('a new row of icons (#700)', () => {
  it('in a game without an icon column reads no column, and the card writes no raw {…}', async () => {
    const el = await place(deck(), 'Ikonrad')
    expect(el).toMatchObject({ kind: 'icons', id: 'icons-1', bind: { literal: '' } })
    expect(onCard('icons-1')).not.toBeNull()
    expect(onCard('icons-1')!.textContent).not.toMatch(/\{.*\}/)
    expect(onCard('icons-1')!.querySelector('.byd-icon-missing')).toBeNull()
  })

  it('in a game with a column of icon names reads that column', async () => {
    const doc = deck()
    doc.template.faces['back']!.base.push({ kind: 'icons', id: 'marks', x: 5, y: 72, w: 40, h: 6, bind: { field: 'tecken' }, iconMm: 5 })
    doc.icons = { svärd: 'http://icons.local/svard.svg' }
    for (const row of doc.rows) row.fields['tecken'] = 'svärd'
    const el = await place(doc, 'Ikonrad')
    expect(el).toMatchObject({ kind: 'icons', bind: { field: 'tecken' } })
    expect(onCard('icons-1')!.querySelector('img.byd-icon')?.getAttribute('alt')).toBe('svärd')
  })
})
