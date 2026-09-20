// @vitest-environment jsdom
// The rulebook's two modes (#227, approved 2026-09-19: A's toggle, A's column, C's felt). One
// switch in the rules tab's own header turns the reading area from the book the designer writes
// in into the drawer the players are handed — the same drawer, drawn by the table's own code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await run.stop()
})

const rules: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Dra ett kort ur [[zon:draw]] och lägg det i [[zon:discard]].' },
    { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp' },
    { kind: 'heading', id: 'h2', level: 1, text: 'Skogens väsen' },
    { kind: 'text', id: 't2', text: 'Väsendet vaknar när [[kort:dragon]] läggs ut.' },
    { kind: 'heading', id: 'h3', level: 2, text: 'Vintern kommer' },
    { kind: 'text', id: 't3', text: 'Snön faller och [[zon:discard]] fryser fast.' },
  ],
}

const toggle = () => within(document.querySelector('.byd-rules-bar') as HTMLElement).getByRole('group', { name: 'Läge' })
const press = (mode: string) => fireEvent.click(within(toggle()).getByRole('button', { name: mode }))
// Det presenterade läget är bordets egen lucka, och luckan hämtas med sin stilmall sedan #346 —
// den står alltså inte i DOM:en i samma bildruta som trycket. Väntan ligger i växlingen och inte
// i påståendena, så att varje prov mäter exakt det det mätte förut, och den ligger i *varje*
// växling och inte bara i den första: annars vore proven gröna bara i den ordning de råkar köras
// i, eftersom modulen är hämtad efter det första trycket i filen.
const pressPresented = async () => {
  press('Som på bordet')
  await waitFor(() => expect(document.querySelector('.byd-rules-panel')).not.toBeNull())
}
const lucka = () => document.querySelector('.byd-rules-panel') as HTMLElement
const reading = () => document.querySelector('.byd-rules-reading') as HTMLElement
const drawerBody = () => document.querySelector('.byd-rules-body') as HTMLElement
const said = () => (document.querySelector('.byd-rules [role="status"][aria-live="polite"]') as HTMLElement | null)?.textContent

// jsdom lays nothing out, so the two areas are given a layout: the same book at the two heights a
// browser would give it. The numbers are the point — the same section stands 226 px apart in the
// two boxes, so a `scrollTop` carried over would land in the wrong section and say so here.
const VIEW = 40
const rect = (top: number, height: number): DOMRect =>
  ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
type Laid = Record<string, { top: number; height: number }>
const BOOK: Laid = {
  h1: { top: 0, height: 40 },
  t1: { top: 40, height: 560 },
  s1: { top: 600, height: 200 },
  h2: { top: 800, height: 40 },
  t2: { top: 840, height: 400 },
  h3: { top: 1240, height: 30 },
  t3: { top: 1270, height: 300 },
}
const DRAWER: Laid = {
  h1: { top: 0, height: 34 },
  t1: { top: 34, height: 500 },
  s1: { top: 534, height: 40 },
  h2: { top: 574, height: 34 },
  t2: { top: 608, height: 520 },
  h3: { top: 1128, height: 26 },
  t3: { top: 1154, height: 420 },
}

function layOut(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element): DOMRect {
    if (this.classList.contains('byd-rules-reading') || this.classList.contains('byd-rules-body')) return rect(VIEW, 600)
    const id = (this as HTMLElement).dataset?.['block']
    if (id !== undefined) {
      const inDrawer = this.closest('.byd-rules-body') !== null
      const box = (inDrawer ? DRAWER : BOOK)[id]
      const area = this.closest(inDrawer ? '.byd-rules-body' : '.byd-rules-reading') as HTMLElement | null
      if (box) return rect(VIEW + box.top - (area?.scrollTop ?? 0), box.height)
    }
    return rect(0, 0)
  })
}

async function openRules(withRules = true): Promise<void> {
  await run.projects.create(run.projectId, withRules ? { ...projectDoc(), rules } : projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
}

const bar = () => document.querySelector('.byd-rules-bar') as HTMLElement

describe('the switch in the rules tab’s own header (#227)', () => {
  it('stands first in the header, directly after REGELBOKEN, with the two modes and the editable one on', async () => {
    await openRules()
    const toggle = within(bar()).getByRole('group', { name: 'Läge' })
    // Directly after the heading: the switch is the header's first control and not one more pill
    // among the ways in at its tail.
    expect(bar().querySelector('h2')!.nextElementSibling).toBe(toggle)
    const modes = within(toggle).getAllByRole('button')
    expect(modes.map((b) => b.textContent)).toEqual(['Redigerbar', 'Som på bordet'])
    expect(modes.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
  })

  // The claim the whole slice rests on: the presented book is the table's book. It used to be
  // proved by the one place the two renderers differed — the editor drew the setup as the game's
  // own zones (B5) and the table drew its caption and nothing else. That difference is gone:
  // since #270 both draw the zones, out of one component, which is what the difference was a
  // symptom of. So the box is what changes here, and the book in it is measured as the same book.
  it('swaps the reading area for the table’s own drawer, drawn by the table’s own code', async () => {
    await openRules()
    const zonesOf = (el: HTMLElement) => [...el.querySelectorAll('[data-setup-zone]')].map((z) => z.textContent)
    fireEvent.click(within(document.querySelector('[data-rulebook]') as HTMLElement).getByRole('button', { name: 'Visa uppställningen' }))
    const inTheEditor = zonesOf(document.querySelector('[data-rulebook]') as HTMLElement)
    expect(inTheEditor.length).toBeGreaterThan(1)

    await pressPresented()
    expect(document.querySelector('[data-rulebook]')).toBeNull()
    const book = within(lucka()).getByRole('article')
    expect(book.className).toContain('byd-rules-page')
    // The words are the same words, with every reference standing for what the thing is called.
    expect([...book.querySelectorAll('[data-ref]')].map((r) => r.textContent)).toEqual(['Draghög', 'Kasthög', 'Drake', 'Kasthög'])
    // The table's own headings: a section is an `h3` there and an `h2` in the editor's book.
    expect(within(book).getByRole('heading', { name: 'Skogens väsen' }).tagName).toBe('H3')
    // And the setup: the same caption, folded the same way, and the very same zones once it is
    // opened (#270). A second code path for the book's words would say so right here.
    expect(within(book).getByText('Så ställs bordet upp')).toBeTruthy()
    expect(book.querySelectorAll('[data-setup-zone]')).toHaveLength(0)
    fireEvent.click(within(book).getByRole('button', { name: 'Visa uppställningen' }))
    expect(zonesOf(book)).toEqual(inTheEditor)

    press('Redigerbar')
    expect(document.querySelector('[data-rulebook]')).not.toBeNull()
  })

  it('leaves the column the book is found in standing in both modes', async () => {
    await openRules()
    const rows = () => [...document.querySelectorAll('.byd-rules-toc a')].map((a) => a.textContent)
    const before = rows()
    expect(before.length).toBeGreaterThan(1)
    await pressPresented()
    expect(document.querySelector('.byd-rules-toc')).not.toBeNull()
    expect(rows()).toEqual(before)
  })

  // A designer who works on the keyboard is a desktop user and not an exception (L12). Both modes
  // are ordinary buttons, so both keys a button promises work and the focus stays on the switch
  // rather than being thrown into whichever spread has just been drawn.
  it('is reached and changed with the keyboard, and keeps the focus where the hand left it', async () => {
    const user = userEvent.setup()
    await openRules()
    const [editable, presented] = within(toggle()).getAllByRole('button') as [HTMLElement, HTMLElement]
    editable.focus()
    await user.tab()
    expect(document.activeElement).toBe(presented)
    await user.keyboard('{Enter}')
    // Samma väntan som `pressPresented` gör, men här är trycket en tangent (#346).
    await waitFor(() => expect(document.querySelector('.byd-rules-panel')).not.toBeNull())
    expect(document.activeElement).toBe(within(toggle()).getByRole('button', { name: 'Som på bordet' }))

    await user.tab({ shift: true })
    await user.keyboard(' ')
    expect(document.querySelector('[data-rulebook]')).not.toBeNull()
  })
})

describe('the reader’s place over the switch (#227)', () => {
  it('opens the other mode at the same section, at a height of that box’s own and never the one carried', async () => {
    await openRules()
    layOut()
    // Reading «Skogens väsen», which stands at 800 in the book and at 574 in the drawer.
    reading().scrollTop = BOOK['h2']!.top

    await pressPresented()
    expect(drawerBody().scrollTop).toBe(DRAWER['h2']!.top)
    // The proof that it is not a number that travelled: the two heights are 226 px apart.
    expect(BOOK['h2']!.top - DRAWER['h2']!.top).toBe(226)

    press('Redigerbar')
    expect(reading().scrollTop).toBe(BOOK['h2']!.top)
  })

  it('says the mode and the section it kept, politely and without stealing the focus', async () => {
    await openRules()
    layOut()
    const live = document.querySelector('.byd-rules [role="status"][aria-live="polite"]')
    expect(live, 'the live region has to stand there before it has anything to say').not.toBeNull()

    reading().scrollTop = BOOK['h2']!.top
    await pressPresented()
    expect(said()).toBe('Som på bordet. Samma avsnitt: Skogens väsen.')
    press('Redigerbar')
    expect(said()).toBe('Redigerbar. Samma avsnitt: Skogens väsen.')
  })

  // The question box is the table's own and is not switched off here: turning it off would be a
  // second code path built to take something away. What it costs is that a list of answers has no
  // block in it, and therefore no section to carry back — so the last one read is carried instead.
  it('answers a question in the presented mode, and leaves it at the last section read and never at nothing', async () => {
    await openRules()
    layOut()
    reading().scrollTop = BOOK['h2']!.top
    await pressPresented()

    fireEvent.change(within(lucka()).getByLabelText('Vad undrar du?'), { target: { value: 'väsendet' } })
    const hits = within(lucka()).getAllByRole('listitem')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.textContent).toContain('Väsendet vaknar')
    expect(lucka().querySelectorAll('[data-block]')).toHaveLength(0)

    press('Redigerbar')
    expect(said()).toBe('Redigerbar. Samma avsnitt: Skogens väsen.')
    expect(reading().scrollTop).toBe(BOOK['h2']!.top)
  })
})

// The mode is a view and never a fact about the game (L4). The tab opens in the editable mode
// every time: the designer who left it presented would come back to a book she cannot write in
// without remembering why.
describe('the mode remembers nothing (#227, L4)', () => {
  it('is gone by the next visit to the tab, and was never written anywhere', async () => {
    await openRules()
    await pressPresented()
    expect(lucka()).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Kortvägg' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
    expect(document.querySelector('[data-rulebook]')).not.toBeNull()
    expect(document.querySelector('.byd-rules-panel')).toBeNull()
    expect(within(toggle()).getByRole('button', { name: 'Redigerbar' }).getAttribute('aria-pressed')).toBe('true')

    // Not in the browser, and not in the document: nothing about the switch was ever stored.
    expect(Object.keys(localStorage).filter((k) => /rule/i.test(k))).toEqual([])
    expect(JSON.stringify(await run.projects.load(run.projectId))).not.toMatch(/Som på bordet|"view"/)
  })
})
