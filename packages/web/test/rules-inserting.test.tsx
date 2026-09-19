// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { namesOfProject, type ProjectDoc, type RuleDoc } from '@byd/server'
import { referables } from '../src/editor/RulesPanel.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// Twenty cards on top of the fixture's three, which with the five zones makes twenty-eight
// references — the issue's acceptance is "at least twenty", and the prototype measured the row of
// buttons at a hundred and seventy-six. The names are deliberately unalike and none is the
// beginning of another, so what narrows the list is the letters and never the order they are in.
const CARDS = [
  'Björnjägaren',
  'Cirkelns väktare',
  'Dimslöjan',
  'Eldpilen',
  'Frostväven',
  'Gläntans herre',
  'Hökögat',
  'Isbrodden',
  'Järnhanden',
  'Klippvandraren',
  'Lyktbäraren',
  'Månskäran',
  'Nattflöjten',
  'Ormtungan',
  'Pilgrimen',
  'Rävlisten',
  'Stenklyvaren',
  'Tjuvens knop',
  'Uvens öga',
  'Vargbrodern',
]

function bigGame(): ProjectDoc {
  const base = projectDoc()
  return { ...base, rows: [...base.rows, ...CARDS.map((title, i) => ({ id: `c${i + 1}`, fields: { title, body: '', antal: 1 } }))] }
}

// A block the template laid out, which carries a question of its own; one of the designer's own,
// which carries none; and a list, whose points are fields like any other.
const ASK = 'Vad ligger var när ni börjar, och vad får var och en på hand?'
const rules: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Dra ett kort ur ', ask: 'Vad gör man först? Och sedan?' },
    { kind: 'text', id: 't2', text: '', ask: ASK },
    { kind: 'text', id: 't3', text: '' },
    { kind: 'list', id: 'l1', ordered: true, items: ['Dra.', 'Spela ut.'] },
  ],
}

async function openBook(): Promise<void> {
  await run.projects.create(run.projectId, { ...bigGame(), rules })
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
}

const book = () => document.querySelector('[data-rulebook]') as HTMLElement
const blockOf = (id: string) => book().querySelector(`[data-block="${id}"]`) as HTMLElement

// The block opened to its fields, by pressing the paragraph the reader sees.
async function openBlock(id: string, label: string): Promise<HTMLTextAreaElement> {
  fireEvent.click(blockOf(id).querySelector('[role="button"]')!)
  return (await within(book()).findByLabelText(label)) as HTMLTextAreaElement
}

// What a keystroke looks like from outside the page: the field carries the new text, the caret
// stands where the designer is writing, and only then does the page hear about it. Setting the
// caret first is the whole point — a reference goes in where she is writing, and the field is
// never only its own end. `fireEvent.change`'s own `target.value` would leave the caret there.
function typeInto(field: HTMLTextAreaElement | HTMLInputElement, value: string, caret = value.length): void {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value)
  field.setSelectionRange(caret, caret)
  fireEvent.change(field)
}

const list = () => within(book()).queryByRole('listbox', { name: 'Referenser' })
const optionNames = () => within(list()!).getAllByRole('option').map((o) => o.querySelector('span')!.textContent)

describe('the way a reference is put into a rule (#215)', () => {
  it('draws no button per reference under an open block, however many the game has', async () => {
    await openBook()
    // The row it replaces drew one button per reference, always, under every block opened.
    expect(referables(namesOfProject(bigGame()))).toHaveLength(28)
    await openBlock('t1', 'Text t1')
    const names = within(blockOf('t1'))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent)
    // What is left is the block's own two controls: take it away, and add one after it.
    expect(names).toEqual(['Ta bort blocket', 'Lägg till efter t1'])
  })

  it('opens a list of what the game has when [[ is written, and adds no stop to the tab order', async () => {
    await openBook()
    const field = await openBlock('t1', 'Text t1')
    expect(list()).toBeNull()
    typeInto(field, 'Dra ett kort ur [[')
    await waitFor(() => expect(list()).toBeTruthy())
    // Every option refuses the tab order: the focus stays in the sentence being written, and the
    // field points at the one the keys are on instead (#215, and the symbol list before it).
    expect(within(list()!).getAllByRole('option').every((o) => o.getAttribute('tabindex') === '-1')).toBe(true)
    expect(field.getAttribute('aria-activedescendant')).toBe(within(list()!).getAllByRole('option')[0]!.id)
  })

  it('narrows as more is written, and holds every reference the game has within reach', async () => {
    await openBook()
    const field = await openBlock('t1', 'Text t1')
    typeInto(field, 'Dra ett kort ur [[')
    // Eight of twenty-eight: the list is a list and never the whole game.
    await waitFor(() => expect(optionNames()).toHaveLength(8))
    typeInto(field, 'Dra ett kort ur [[dra')
    await waitFor(() => expect(optionNames()).toEqual(['Draghög', 'Drake', 'Klippvandraren']))
    typeInto(field, 'Dra ett kort ur [[drak')
    await waitFor(() => expect(optionNames()).toEqual(['Drake']))
    // And nothing the game has is left behind the cut: for every one of the twenty-eight there is
    // a beginning of its own name that lifts it into the eight shown.
    for (const r of referables(namesOfProject(bigGame()))) {
      typeInto(field, `[[${r.name}`)
      await waitFor(() => expect(optionNames()).toContain(r.name))
    }
  })

  it('says so when nothing in the game is called what was written, rather than vanishing', async () => {
    await openBook()
    const field = await openBlock('t1', 'Text t1')
    typeInto(field, 'Dra ett kort ur [[xyzzy')
    expect(await within(book()).findByText('Inget med det namnet')).toBeTruthy()
    expect(within(list()!).queryAllByRole('option')).toHaveLength(0)
  })

  it('puts the reference where the designer is writing, not at the end of the field, and keeps the focus', async () => {
    await openBook()
    const field = await openBlock('t1', 'Text t1')
    field.focus()
    // Mid-sentence, with the rest of it already written behind the caret. The row this replaces
    // could only ever append, so a reference could not be put into a sentence at all.
    const upto = 'Dra ett kort ur [[drag'
    typeInto(field, `${upto} och lägg det i kasthögen.`, upto.length)
    await waitFor(() => expect(optionNames()).toEqual(['Draghög']))
    fireEvent.keyDown(field, { key: 'Enter' })
    const written = () => within(book()).getByLabelText('Text t1') as HTMLTextAreaElement
    await waitFor(() => expect(written().value).toBe('Dra ett kort ur [[zon:draw]] och lägg det i kasthögen.'))
    // The list is gone, and the sentence is still being written: the focus never left the field,
    // and the caret stands after what was put in.
    await waitFor(() => expect(list()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(written()))
    await waitFor(() => expect(written().selectionStart).toBe('Dra ett kort ur [[zon:draw]]'.length))
    // And once the block is left, the book reads the reference by what the thing is called now.
    fireEvent.blur(written())
    await waitFor(() => expect(within(book()).getByText('Draghög')).toBeTruthy())
  })

  it('walks the list with the arrows and takes the one they stand on', async () => {
    await openBook()
    const field = await openBlock('t1', 'Text t1')
    field.focus()
    typeInto(field, 'Dra ett kort ur [[dra')
    await waitFor(() => expect(optionNames()).toEqual(['Draghög', 'Drake', 'Klippvandraren']))
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    await waitFor(() => expect(field.getAttribute('aria-activedescendant')).toBe(within(list()!).getAllByRole('option')[2]!.id))
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect((within(book()).getByLabelText('Text t1') as HTMLTextAreaElement).value).toBe('Dra ett kort ur [[kort:c10]]'))
  })

  // Eight rows are eight targets, and every target in the editor is 44 px tall: the box is 230 px
  // and holds five of them, measured in Chromium. The keys still walk all eight, so the one they
  // stand on has to be brought into the box — a control that answers and cannot be seen to answer
  // has not answered (#235). jsdom lays nothing out and has no `scrollIntoView` of its own, so
  // what is read here is that the option the keys are on is the one asked to come into view.
  it('brings the option the keys are on into the box, however far down the list it stands', async () => {
    const shown: Element[] = []
    const had = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
    Element.prototype.scrollIntoView = function (this: Element) {
      shown.push(this)
    }
    try {
      await openBook()
      const field = await openBlock('t1', 'Text t1')
      field.focus()
      typeInto(field, 'Dra ett kort ur [[')
      await waitFor(() => expect(optionNames()).toHaveLength(8))
      for (let i = 0; i < 7; i++) fireEvent.keyDown(field, { key: 'ArrowDown' })
      await waitFor(() => expect(shown.at(-1)).toBe(within(list()!).getAllByRole('option')[7]))
    } finally {
      if (had) Object.defineProperty(Element.prototype, 'scrollIntoView', had)
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('closes on Escape and leaves what was written exactly as it was written', async () => {
    await openBook()
    const field = await openBlock('t1', 'Text t1')
    field.focus()
    typeInto(field, 'Dra ett kort ur [[drag')
    await waitFor(() => expect(list()).toBeTruthy())
    fireEvent.keyDown(field, { key: 'Escape' })
    await waitFor(() => expect(list()).toBeNull())
    expect((within(book()).getByLabelText('Text t1') as HTMLTextAreaElement).value).toBe('Dra ett kort ur [[drag')
  })

  it('leaves a [[ that led nowhere standing in the book as the text somebody typed', async () => {
    await openBook()
    const field = await openBlock('t1', 'Text t1')
    field.focus()
    typeInto(field, 'Skriv [[ för att hämta något.')
    fireEvent.keyDown(field, { key: 'Escape' })
    fireEvent.blur(within(book()).getByLabelText('Text t1'))
    await waitFor(() => expect(book().querySelector('textarea')).toBeNull())
    // Two characters somebody typed are two characters somebody typed, in the book and in what
    // is saved of it.
    expect(blockOf('t1').textContent).toContain('Skriv [[ för att hämta något.')
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rules?.blocks[1]).toMatchObject({ text: 'Skriv [[ för att hämta något.' }))
  })

  it('answers in a list block too, and writes into the point being written in', async () => {
    await openBook()
    fireEvent.click(blockOf('l1').querySelector('[role="button"]')!)
    const item = (await within(book()).findByLabelText('Punkt 2 i l1')) as HTMLInputElement
    item.focus()
    typeInto(item, 'Spela ut i [[spel')
    await waitFor(() => expect(optionNames()).toEqual(['Spelyta']))
    fireEvent.keyDown(item, { key: 'Enter' })
    await waitFor(() => expect((within(book()).getByLabelText('Punkt 2 i l1') as HTMLInputElement).value).toBe('Spela ut i [[zon:table]]'))
    // The point beside it is untouched: the list belongs to the field the caret is in.
    expect((within(book()).getByLabelText('Punkt 1 i l1') as HTMLInputElement).value).toBe('Dra.')
  })

  it('is one step back of its own, so the way out of an insertion is one press', async () => {
    await openBook()
    const field = await openBlock('t1', 'Text t1')
    field.focus()
    typeInto(field, 'Dra ett kort ur [[drag')
    await waitFor(() => expect(optionNames()).toEqual(['Draghög']))
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect((within(book()).getByLabelText('Text t1') as HTMLTextAreaElement).value).toBe('Dra ett kort ur [[zon:draw]]'))
    // The chord is the project's and not a field's (#35), so the block is left first.
    fireEvent.blur(within(book()).getByLabelText('Text t1'))
    await waitFor(() => expect(book().querySelector('textarea')).toBeNull())
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    // One press, and what she typed is back — the letters, not the sentence before them.
    await waitFor(() => expect(blockOf('t1').textContent).toContain('Dra ett kort ur [[drag'))
  })

  // #272: a reference written into a heading is never read as one — `renderRules` does not parse
  // headings inline, so it stands raw in the book and in the printed booklet. That is a bug of its
  // own and a separate issue; what must not happen here is a new way to make one.
  it('does not answer in a heading, where a reference would never become a reference', async () => {
    await openBook()
    fireEvent.click(blockOf('h1').querySelector('[role="button"]')!)
    const head = (await within(book()).findByLabelText('Rubrik h1')) as HTMLInputElement
    head.focus()
    typeInto(head, 'Så spelar ni [[dra')
    await waitFor(() => expect((within(book()).getByLabelText('Rubrik h1') as HTMLInputElement).value).toBe('Så spelar ni [[dra'))
    expect(list()).toBeNull()
  })
})

// A box opens where there is room for it (#229). The reading itself is `placement.test.ts` and the
// wiring for a slot is `slot-placement.test.tsx`; this is the same wiring for the list `[[` opens,
// which the prototype note asked for by name. A block near the foot of the page has no room under
// it — measured in Chromium at 1440 × 900, eight rows are 240 px and the page does not scroll to
// meet them — so the list has to go the other way. jsdom lays nothing out, so the rectangle the
// list opens from is the one said out loud here.
describe('the list opens where there is room (#229)', () => {
  const openAt = async (topPx: number): Promise<HTMLElement> => {
    window.innerHeight = 800
    window.innerWidth = 1200
    await openBook()
    const field = await openBlock('t1', 'Text t1')
    const wrap = field.closest('.byd-rules-field') as HTMLElement
    wrap.getBoundingClientRect = () =>
      ({ x: 540, y: topPx, top: topPx, left: 540, right: 1108, bottom: topPx + 90, width: 568, height: 90, toJSON: () => ({}) }) as DOMRect
    field.focus()
    typeInto(field, 'Dra ett kort ur [[dra')
    await waitFor(() => expect(list()).toBeTruthy())
    return list()!
  }

  it('goes upward from a block standing at the foot of the page', async () => {
    expect((await openAt(700)).getAttribute('data-place-y')).toBe('up')
  })

  it('goes downward from one standing at the top of it', async () => {
    expect((await openAt(60)).getAttribute('data-place-y')).toBe('down')
  })

  it('is never taller than the room it was given', async () => {
    const box = await openAt(700)
    const room = parseFloat(box.style.getPropertyValue('--byd-place-room'))
    expect(room).toBeGreaterThan(0)
    expect(room).toBeLessThanOrEqual(700)
  })
})

// The way in is two characters, and two characters cannot be seen. The block's own empty field is
// the one surface that is already free to say so (#215, the approved form «Radad»).
describe('what an empty block says about the way in (#215)', () => {
  it('carries the block’s own question on the first line and the tool’s notice on the second', async () => {
    await openBook()
    const field = await openBlock('t2', 'Text t2')
    expect(field.getAttribute('placeholder')).toBe(`${ASK}\n[[ hämtar en zon eller ett kort.`)
  })

  it('carries the notice alone in a block the designer added herself, which has no question', async () => {
    await openBook()
    const field = await openBlock('t3', 'Text t3')
    expect(field.getAttribute('placeholder')).toBe('[[ hämtar en zon eller ett kort.')
  })
})
