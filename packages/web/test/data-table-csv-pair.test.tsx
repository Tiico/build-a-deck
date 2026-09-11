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

// What a game of this name is handed over as.
const named = (name: string, lang: Lang = 'sv') => {
  const view = tableIn(lang, { ...projectDoc(), name })
  const file = exportLink().download
  view.unmount()
  return file
}
const bytes = (s: string) => new TextEncoder().encode(s).length

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
// The gap the row itself sets between what it holds — the widest the two frames may stand apart
// and still be one pair.
const GAP = 9
type Box = { x: number; y: number; w: number; h: number; ink: number; wordH: number }

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
      .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel"><div class="byd-table-wrap">${tools}</div></div></main></div></div>`)
    await page.setContent(shell, { waitUntil: 'load' })
    return await page.evaluate(() => {
      // The word itself, not the frame around it: a text node measured on its own, so a frame
      // that is tall enough but leaves its word at the top is caught rather than hidden.
      const word = (el: Element) => {
        const text = [...el.childNodes].find((n): n is Text => n.nodeType === 3 && n.textContent!.trim() !== '')!
        const range = document.createRange()
        range.selectNode(text)
        return range.getBoundingClientRect()
      }
      const of = (el: Element): Box => {
        const frame = el.getBoundingClientRect()
        const ink = word(el)
        return {
          x: Math.round(frame.x),
          y: Math.round(frame.y),
          w: Math.round(frame.width),
          h: Math.round(frame.height),
          ink: Math.round(ink.y + ink.height / 2),
          wordH: Math.round(ink.height),
        }
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

  it('exports a game whose name is not written in Latin letters under that name', () => {
    // The content language is unbounded (A4), so a game called 森の王 is a game called 森の王 all
    // the way out to the file it hands over. A filter that only knew a–z left a Japanese designer
    // with the tool's stand-in every single time — their game's name dropped whole and the tool's
    // own word put in its place, which is the one thing the boundary says never happens.
    expect(named('森の王')).toBe('森の王-kort.csv')
    expect(named('Кощей')).toBe('кощей-kort.csv')
    expect(named('Ελληνικά', 'en')).toBe('ελληνικά-cards.csv')

    // Folding the name is still folding: what a path could be built out of is gone, so nothing
    // the designer types reaches out of the directory the reader saves into.
    expect(named('../../etc/passwd')).toBe('etc-passwd-kort.csv')
    expect(named('.hidden')).toBe('hidden-kort.csv')

    // And a name that leaves nothing to build a file name out of still falls back to the tool's
    // own stand-in, which is the tool's word and follows the reader.
    expect(named('🂡 · 🂢')).toBe('spel-kort.csv')
    expect(named('🂡 · 🂢', 'en')).toBe('game-cards.csv')
  })

  it('cuts a name too long for a file name to hold, counting the bytes and not the letters', () => {
    // A file name is 255 bytes on APFS and on ext4, and the whole of it — the tool's word about
    // the file and the extension included — has to fit inside that.
    const latin = named('kortspelet-om-skogen-'.repeat(20))
    expect(bytes(latin)).toBeLessThanOrEqual(255)
    expect(latin.startsWith('kortspelet-om-skogen-')).toBe(true)
    expect(latin.endsWith('-kort.csv')).toBe(true)

    // Now that any script may be in the name, the limit has to be counted where the file system
    // counts it: a name that spends three bytes a letter reaches 255 in eighty-five letters, not
    // in two hundred and fifty-five. And the cut falls between letters, never through one.
    const japanese = named('森の王'.repeat(100))
    expect(bytes(japanese)).toBeLessThanOrEqual(255)
    expect(japanese.startsWith('森の王')).toBe(true)
    expect(japanese).not.toContain('\uFFFD')
    expect(japanese.endsWith('-kort.csv')).toBe(true)
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
    // on two kinds of control that are announced differently. What each one is has to be pinned
    // as firmly as what it is called: the chooser is a file input, which a screen reader offers a
    // file to, and it is not the row's link — the row has exactly one of those, and handing a
    // file over is what it does.
    const chooser = screen.getByLabelText('Importera CSV…')
    expect(chooser.tagName).toBe('INPUT')
    expect(chooser.getAttribute('type')).toBe('file')
    expect(screen.getAllByRole('link')).toEqual([exportLink()])
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

  // Telling the two apart by their words only works if they are drawn as one pair to begin with,
  // and a pair is two frames the eye takes in at once: side by side, on one line. The file input
  // lies invisible across its own label, so the label is stretched to a thumb's height
  // (UX-KONTROLLER: träffytor) while the word inside it was left sitting at the top — the import
  // read a line higher than the export standing beside it. The table is the editor's, and the
  // editor is a desk tool (L12), so the widths are the desk's: 1280 and 1024 where the designer
  // works, and 768 under them, where the row is narrowest of the three it must still survive.
  it.each([1280, 1024, 768])('stands the two frames side by side with their words on one line at %ipx', async (width) => {
    const { import: left, export: right } = await pair(width)

    // Nothing stands between them: the only thing separating the two frames is the row's own gap,
    // so whatever else the row carries is not carried through the middle of the pair.
    expect(right.y).toBe(left.y)
    expect(right.x - (left.x + left.w)).toBeLessThanOrEqual(GAP)
    expect(right.x).toBeGreaterThan(left.x)

    // Both frames are a thumb's height and so stand taller than the words they hold — which is
    // what pushed the words apart to begin with, and what leaves the centring below something
    // real to say rather than something the box grants for free.
    expect(left.h).toBeGreaterThanOrEqual(44)
    expect(right.h).toBeGreaterThanOrEqual(44)
    expect(left.h).toBeGreaterThan(left.wordH)
    expect(right.h).toBeGreaterThan(right.wordH)

    // Each word sits in the middle of its own frame, and so the two read as one row.
    expect(Math.abs(left.ink - (left.y + left.h / 2))).toBeLessThanOrEqual(1)
    expect(Math.abs(right.ink - (right.y + right.h / 2))).toBeLessThanOrEqual(1)
  }, 60_000)
})
