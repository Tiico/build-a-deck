// @vitest-environment jsdom
// Every symbol sample stands on the card's paper, never on the editor's dark panel (L34, #302).
//
// The symbol is drawn in the card's ink, and against the panel «utan betydelse» vanished
// altogether — the sample was invisible in the first draft of the prototype. Whether it is
// visible now is a question about rendered colours, which jsdom does not have, so the markup is
// laid into real Chromium against the stylesheets that ship and the colours are read back. What
// is measured is the ratio between the ink and what it stands on, in the picker at the brace and
// in the palette on the symbol tab, at the desk the editor is reviewed at.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { contrastRatio } from '@byd/template'
import { DataTable } from '../src/editor/DataTable.js'
import { SymbolPanel } from '../src/editor/SymbolPanel.js'
import type { ProjectClient } from '../src/editor/ProjectClient.js'
import { symbolName, type GameSymbol } from '../src/editor/symbols.js'
import { projectDoc } from './project-doc.js'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const DESK = { w: 1440, h: 900 }
const PALETTE = { fara: '#8f2d20', vinst: '#2f6136' }

// The picker with a symbol chosen and the meanings drawn as copies of it, as the cell leaves it.
function pickerMarkup(): string {
  const doc = { ...projectDoc(), palette: PALETTE }
  const { container, unmount } = render(
    <DataTable doc={doc} selectedRow={null} onSelectRow={() => undefined} onCell={() => undefined} onAddRow={() => undefined} onRemoveRow={() => undefined} onReplaceRows={() => undefined} onAddField={() => undefined} onRemoveField={() => undefined} onMoveField={() => undefined} onSymbol={vi.fn(async (s: GameSymbol) => symbolName(s))} />,
  )
  try {
    // `title` and not `body`: a body column is a writing surface (L39, #324) and has no value
    // setter. What is laid into Chromium is the picker's markup, which is the same box either
    // way — `data-table-body.test.tsx` is where that sameness is asserted.
    const cell = within(screen.getAllByRole('row')[1]!).getByLabelText('dragon title') as HTMLInputElement
    fireEvent.change(cell, { target: { value: 'Skada {sk', selectionStart: 9 } })
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Symboler' })).getAllByRole('option')[0]!)
    return container.innerHTML
  } finally {
    unmount()
  }
}

// The palette with a symbol to demonstrate the meanings with.
function paletteMarkup(): string {
  const doc = {
    ...projectDoc(),
    palette: PALETTE,
    icons: { svärd: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1c1c1c"><path d="M4 20l3-1 10-10 2-6-6 2L3 15l-1 3z"/></svg>')}` },
    rows: [{ id: 'dragon', fields: { title: 'Drake', body: 'Skada {svärd|fara} 2.', antal: 1 } }],
  }
  const client = { setRole: vi.fn(), renameRole: vi.fn(), removeRole: vi.fn(), useSymbol: vi.fn() } as unknown as ProjectClient
  const { container, unmount } = render(<SymbolPanel doc={doc} client={client} assetBase="http://test.local" />)
  try {
    return container.innerHTML
  } finally {
    unmount()
  }
}

const shellOf = (html: string) =>
  read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel">${html}</div></main></div></div>`)

// What Chromium says about every sample on the page: the paper it stands on, the ink the symbol is
// drawn in, what the panel behind the sample is, and whether the sample has any size at all. The
// ink of a painted copy is the colour behind its mask; the ink of the plain picture is the fill
// written in the file, which is the only colour an `<img>` has.
type Seen = { paper: string; ink: string; behind: string; w: number; h: number; option: number }
const READ = `(() => {
  const hex = (rgb) => {
    const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(rgb)
    return m ? '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('') : rgb
  }
  return [...document.querySelectorAll('.byd-symbol-sample')].map((sample) => {
    const r = sample.getBoundingClientRect()
    const painted = sample.querySelector('.byd-ink')
    const img = sample.querySelector('img')
    const fill = img ? /fill=%22(%23[0-9a-fA-F]{6})%22|fill="(#[0-9a-fA-F]{6})"/.exec(decodeURIComponent(img.getAttribute('src') || '')) : null
    const option = sample.closest('[role="option"], li, p')
    return {
      paper: hex(getComputedStyle(sample).backgroundColor),
      ink: painted ? hex(getComputedStyle(painted).backgroundColor) : fill ? (fill[1] || fill[2]).replace('%23', '#') : 'none',
      behind: option ? hex(getComputedStyle(option).backgroundColor) : 'none',
      w: r.width, h: r.height,
      option: option ? option.getBoundingClientRect().height : 0,
    }
  })
})()`

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

async function seen(html: string, look?: (page: Page) => Promise<void>): Promise<Seen[]> {
  const page = await browser.newPage({ viewport: { width: DESK.w, height: DESK.h } })
  try {
    await page.setContent(shellOf(html), { waitUntil: 'load' })
    await look?.(page)
    return (await page.evaluate(READ)) as Seen[]
  } finally {
    await page.close()
  }
}

// A symbol is a graphic and wants 3:1 against its ground (E5), and that is the whole of the claim:
// the sample on the paper must clear what the card's own check asks of the card.
const LEGIBLE = 3

describe.each([
  ['the picker at the brace', pickerMarkup, 3],
  ['the palette on the symbol tab', paletteMarkup, 3],
] as const)('every sample in %s, at 1440×900', (_, markup, atLeast) => {
  it('stands on the card’s paper and is drawn legibly on it, ink and meanings alike', async () => {
    const samples = await seen(markup())
    // Found at all: the ink one and one per meaning, at the least.
    expect(samples.length).toBeGreaterThanOrEqual(atLeast)
    for (const s of samples) {
      expect(s.w, 'a sample with no size is no sample').toBeGreaterThan(0)
      expect(s.h).toBeGreaterThan(0)
      // The paper is not the panel: what the sample stands on is the card's ground and not the
      // dark surface around the row it is in.
      expect(s.paper).not.toBe(s.behind)
      // And the ink reads on it — the plain picture in the card's ink as much as a painted copy.
      expect(s.ink).not.toBe('none')
      expect(contrastRatio(s.ink, s.paper), `${s.ink} on ${s.paper}`).toBeGreaterThanOrEqual(LEGIBLE)
    }
  }, 60_000)
})

describe('the meanings offered in the picker', () => {
  it('are targets a hand can hit', async () => {
    const samples = await seen(pickerMarkup())
    // Every sample here sits in an option, and every option is at least the editor's tap floor.
    for (const s of samples) expect(s.option).toBeGreaterThanOrEqual(44)
  }, 60_000)
})
