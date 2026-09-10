// @vitest-environment jsdom
// The two CSV controls above the table (#36). They stand next to each other and are framed the
// same, but one opens a file picker and pauses while the other hands over a file at once — so
// what each of them does has to be readable before it is pressed, and audible to someone who
// only hears them. The words about the file are the tool's own and follow the reader (A4); the
// game's name inside the filename is the game's and is left exactly as the designer wrote it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import type { ProjectDoc } from '@byd/server'
import { Language, type Lang } from '../src/i18n/index.js'
import { DataTable } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'

const nothing = () => undefined

function tableIn(lang: Lang, doc: ProjectDoc = projectDoc()) {
  return render(
    <Language lang={lang}>
      <DataTable
        doc={doc}
        selectedRow={null}
        onSelectRow={nothing}
        onCell={nothing}
        onAddRow={nothing}
        onRemoveRow={nothing}
        onReplaceRows={nothing}
        onAddField={nothing}
        onRemoveField={nothing}
      />
    </Language>,
  )
}

// The one control a pointer can follow to a file, whatever it happens to be called.
const exportLink = () => screen.getAllByRole('link').find((a): a is HTMLAnchorElement => a.hasAttribute('download'))!
const importField = () => document.querySelector<HTMLInputElement>('.byd-data-tools input[type="file"]')!

// What a screen reader reads out after a control's own name: the elements it points at, in the
// order it points at them.
const describedAs = (el: Element) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')

const before = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

// jsdom lays nothing out, so where the two controls' words actually sit is measured in a real
// engine against the stylesheet the editor ships, the way the head of the table is (#32).
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
type Box = { y: number; h: number; ink: number }

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// Each of the two frames, and where the middle of the word inside it falls.
async function pair(width: number): Promise<{ import: Box; export: Box }> {
  const { container, unmount } = tableIn('sv')
  const tools = container.querySelector('.byd-data-tools')!.outerHTML
  unmount()
  const page = await browser.newPage({ viewport: { width, height: 400 } })
  try {
    const shell = read('index.html')
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${read('src/editor/editor.css')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel"><div class="byd-table-wrap">${tools}</div></div></main></div></div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    return await page.evaluate(() => {
      // The word itself, not the frame around it: a text node measured on its own, so a frame
      // that is tall enough but leaves its word at the top is caught rather than hidden.
      const word = (el: Element) => {
        const text = [...el.childNodes].find((n): n is Text => n.nodeType === 3 && n.textContent!.trim() !== '')!
        const range = document.createRange()
        range.selectNode(text)
        const r = range.getBoundingClientRect()
        return r.y + r.height / 2
      }
      const of = (el: Element): Box => {
        const r = el.getBoundingClientRect()
        return { y: Math.round(r.y), h: Math.round(r.height), ink: Math.round(word(el)) }
      }
      return {
        import: of(document.querySelector('.byd-data-tools label')!),
        export: of(document.querySelector('.byd-data-tools a[download]')!),
      }
    })
  } finally {
    await page.close()
  }
}

describe('the CSV pair above the table (#36)', () => {
  it('names the file it hands over in the reader\'s language, and leaves the game\'s own name in it alone', () => {
    const { unmount } = tableIn('sv')
    expect(exportLink().download).toBe('skogens-herrar-kort.csv')
    unmount()

    const other = tableIn('en')
    expect(exportLink().download).toBe('skogens-herrar-cards.csv')
    other.unmount()

    // A game whose name leaves nothing a filename can carry gets the tool's own stand-in, and
    // that word is the tool's, so it follows the reader too.
    const unnamed = { ...projectDoc(), name: '🂡' }
    const third = tableIn('sv', unnamed)
    expect(exportLink().download).toBe('spel-kort.csv')
    third.unmount()
    tableIn('en', unnamed)
    expect(exportLink().download).toBe('game-cards.csv')
  })

  it('shows which one stops to ask for a file and which one hands one over, before either is pressed', () => {
    const { unmount } = tableIn('sv')
    // The one that stops to ask wears the ellipsis every chooser carries, on the label — which
    // is what the eye sees and what the pointer hits.
    expect(importField().closest('label')!.textContent).toBe('Importera CSV…')
    // The one that hands a file over says so in words, and not only in the role it happens to
    // have; nothing about the frame says which is which.
    expect(exportLink().textContent).toContain('Ladda ner CSV')
    // So a reader who only hears them gets two names that differ in more than a first syllable,
    // on two kinds of control that are announced differently.
    expect(screen.getByLabelText('Importera CSV…').getAttribute('type')).toBe('file')
    expect(screen.getByRole('link', { name: 'Ladda ner CSV' })).toBe(exportLink())
    unmount()

    tableIn('en')
    expect(importField().closest('label')!.textContent).toBe('Import CSV…')
    expect(screen.getByRole('link', { name: 'Download CSV' })).toBe(exportLink())
  })

  it('says that an import replaces the cards where import is, and not where export is', () => {
    tableIn('sv')
    const note = screen.getByText('Import ersätter korten i tabellen. Spara när resultatet ser rätt ut.')

    // In reading order the warning follows the control it warns about and stands before the one
    // it says nothing about.
    expect(before(importField(), note)).toBe(true)
    expect(before(note, exportLink())).toBe(true)

    // And a reader who hears the controls rather than sees them gets the warning attached to
    // import, where it belongs, rather than left to stand next to whatever it happens to touch.
    expect(describedAs(importField())).toBe('Import ersätter korten i tabellen. Spara när resultatet ser rätt ut.')
    expect(describedAs(exportLink())).toBe('')
  })

  // Telling the two apart by their words only works if they are drawn as one pair to begin with.
  // The file input lies invisible across its own label, so the label is stretched to a thumb's
  // height (UX-KONTROLLER: träffytor) while the word inside it was left sitting at the top — the
  // import read a line higher than the export standing beside it.
  it.each([1280, 390])('sets the words in the two frames on the same line at %ipx', async (width) => {
    const { import: left, export: right } = await pair(width)

    // Both frames are a thumb's height, which is what pushed the words apart in the first place.
    expect(left.h).toBeGreaterThanOrEqual(44)
    expect(right.h).toBeGreaterThanOrEqual(44)

    // Each word sits in the middle of its own frame, and so the two read as one row.
    expect(Math.abs(left.ink - (left.y + left.h / 2))).toBeLessThanOrEqual(1)
    expect(Math.abs(right.ink - (right.y + right.h / 2))).toBeLessThanOrEqual(1)
  }, 60_000)
})
