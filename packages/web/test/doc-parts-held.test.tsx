// @vitest-environment jsdom
// The fonts and icons a card is drawn with are read out of two parts of the document, and an edit
// is a new document that shares every part it did not touch (`applyEdit`). Held by the whole
// document, they were worked out again at every keystroke in a cell — and a fresh object handed to
// a card is a fresh compile and a fresh fitting of it (#661, #667). Held by the parts they are read
// from, an edit that touches neither works out nothing.
//
// What is counted is the working out itself: `previewFonts` and `previewIcons` build a fresh
// object every call, so a call is exactly a new object handed down.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { applyEdit } from '@byd/server/doc'
import type { ProjectDoc } from '@byd/server'
import { revealThemeSection, ThemePanel } from '../src/editor/ThemePanel.js'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { MediaPanel } from '../src/editor/MediaPanel.js'
import { DataTable } from '../src/editor/DataTable.js'
import PlaytestWorkspace from '../src/editor/prototype/PlaytestWorkspace.js'
import type { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const spy = vi.hoisted(() => ({ fonts: 0, icons: 0 }))
vi.mock('../src/editor/fonts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/editor/fonts.js')>()
  return {
    ...actual,
    previewFonts: (...args: Parameters<typeof actual.previewFonts>) => {
      spy.fonts++
      return actual.previewFonts(...args)
    },
  }
})
vi.mock('../src/editor/assets.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/editor/assets.js')>()
  return {
    ...actual,
    previewIcons: (...args: Parameters<typeof actual.previewIcons>) => {
      spy.icons++
      return actual.previewIcons(...args)
    },
  }
})

beforeEach(() => {
  spy.fonts = 0
  spy.icons = 0
  localStorage.clear()
})

const BASE = 'http://api.local'
const SKOG = '1'.repeat(64)

// A deck with a symbol every card says and a picture two cards are drawn from, so each surface has
// something of both to draw.
function deck(): ProjectDoc {
  const doc = projectDoc()
  const front = doc.template.faces['front']!
  return {
    ...doc,
    icons: { svärd: `asset:${'c'.repeat(64)}` },
    pictures: { [SKOG]: { name: 'skog.png' } },
    template: {
      ...doc.template,
      faces: { ...doc.template.faces, front: { ...front, base: [...front.base, { kind: 'image' as const, id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } }] } },
    },
    rows: doc.rows.map((r, i) => ({ ...r, fields: { ...r.fields, body: `${String(r.fields['body'] ?? '')} {svärd}`, ...(i < 2 ? { art: `asset:${SKOG}` } : {}) } })),
  }
}

// A cell typed into: a new document with the same template, fonts and icons in it.
const typed = (doc: ProjectDoc) => applyEdit(doc, { v: 'setCell', cardRef: doc.rows[0]!.id, field: 'title', value: 'Drakhona' })
// And the other half of the same fact: a symbol replaced is a new set of icons, worked out again.
const resymbolled = (doc: ProjectDoc) => ({ ...doc, icons: { ...doc.icons, sköld: `asset:${'d'.repeat(64)}` } })

const noop = () => undefined
const surfaces: Record<string, { draw: (doc: ProjectDoc) => ReactElement; before?: () => void; after?: () => void; fonts: boolean }> = {
  ThemePanel: {
    draw: (doc) => <ThemePanel doc={doc} client={{ mayEdit: true } as unknown as ProjectClient} assetBase={BASE} />,
    // The cards that say a symbol are drawn while the icons are open.
    before: () => revealThemeSection('icons'),
    fonts: true,
  },
  TemplateCanvas: {
    draw: (doc) => (
      <TemplateCanvas
        doc={doc}
        assetBase={BASE}
        onReplaceFace={noop}
        face="front"
        row="dragon"
        selectedElement="title"
        onSelectElement={noop}
        onPatch={noop}
        onCallOff={noop}
        onRemove={noop}
        onAdd={noop}
        onPlaceIcon={noop}
        onReorder={noop}
        onLock={noop}
        onRename={noop}
        onSelectFace={noop}
        group={null}
        onSelectGroup={noop}
        onGroupColumn={noop}
        onAddField={noop}
        onReset={noop}
      />
    ),
    fonts: true,
  },
  MediaPanel: {
    draw: (doc) => <MediaPanel doc={doc} assetBase={BASE} onCrop={noop} />,
    // The card beside the crop window is the one that is drawn with them.
    after: () => fireEvent.click(screen.getByRole('button', { name: 'skog.png' })),
    fonts: true,
  },
  DataTable: {
    draw: (doc) => <DataTable doc={doc} assetBase={BASE} selectedRow={null} onSelectRow={noop} onCell={noop} onAddRow={noop} onRemoveRow={noop} onReplaceRows={noop} onAddField={noop} onRemoveField={noop} onMoveField={noop} />,
    fonts: false,
  },
  PlaytestWorkspace: {
    draw: (doc) => <PlaytestWorkspace doc={doc} revision={1} http={BASE} />,
    fonts: true,
  },
}

describe('fonts and icons are held by the parts of the document they are read from (#667)', () => {
  for (const [name, surface] of Object.entries(surfaces)) {
    it(`${name} works out nothing again when a cell is typed into`, () => {
      const doc = deck()
      surface.before?.()
      const { rerender } = render(surface.draw(doc))
      surface.after?.()
      // The control: the spies are real, and the surface did work them out to draw.
      expect(spy.icons).toBeGreaterThan(0)
      if (surface.fonts) expect(spy.fonts).toBeGreaterThan(0)

      spy.fonts = 0
      spy.icons = 0
      const edited = typed(doc)
      rerender(surface.draw(edited))
      expect({ fonts: spy.fonts, icons: spy.icons }).toEqual({ fonts: 0, icons: 0 })

      // And a memo, not a surface that has stopped listening: new icons are worked out.
      rerender(surface.draw(resymbolled(edited)))
      expect(spy.icons).toBeGreaterThan(0)
    })
  }
})
