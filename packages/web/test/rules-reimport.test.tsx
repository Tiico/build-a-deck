// @vitest-environment jsdom
// Importing over a rulebook that is already written (#131, third slice). The product owner rejected
// "import only from the empty state": a designer who prefers to write in her own editor and hand
// the file over again and again is a way of working to support, not an accident to guard against.
// What that demands is that she is told — very clearly — what the book she has is about to lose,
// before she presses anything.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { useEditSocketImplementation, type EditSocketCtor } from '../src/editor/ProjectClient.js'
import { EditSocket } from './setup.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  useEditSocketImplementation(EditSocket as unknown as EditSocketCtor)
  await run.stop()
})

// The book she wrote by hand: three sections, one of which is nowhere in any file. Both files here
// open with the game's own title, which is what a file written outside the app looks like — and
// which becomes nothing on the way in, because the book is called what the project is called (#191).
const WRITTEN = [
  '# Skogens herrar',
  '',
  '# Översikt',
  '',
  'Ett spel om att bluffa. Två till fem spelare.',
  '',
  '# En tur',
  '',
  'Dra ett kort.',
  '',
  '# Fusk och straff',
  '',
  'Den som blir påkommen lägger tillbaka hela handen och tar ett guld ur potten.',
].join('\n')

// The file she keeps beside the game: it rewrites one section, leaves one alone, brings one that
// is new — and has never heard of the one she wrote by hand.
const FILE = ['# Skogens herrar', '', '# Översikt', '', 'Ett spel om att bluffa. Två till sex spelare.', '', '# En tur', '', 'Dra ett kort.', '', '# Två spelare', '', 'Fyra kort läggs åt sidan.'].join('\n')

async function openRules(): Promise<void> {
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  // The fixture says it is answering; the surface does not guess it from a word the project
  // happens to carry (#149). `Skogens herrar` below is then a wait for the document to be in the
  // page, which is what it reads as — and not a wait for the server, which it was never able to say.
  await run.answering()
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
}

const bookIsThere = () =>
  waitFor(() => {
    const written = document.querySelector('[data-rulebook]')
    expect(written).not.toBeNull()
    return written as HTMLElement
  })

// A book already standing in the tab, written out of a file so it is the same book every run.
async function aWrittenBook(markdown = WRITTEN, name = 'skrivet.md'): Promise<HTMLElement> {
  await openRules()
  pickFile(markdown, name, 'Importera från fil')
  fireEvent.click(within(await screen.findByRole('region', { name: 'Vad importen gör med filen' })).getByRole('button', { name: 'Gör boken' }))
  return await bookIsThere()
}

const pickFile = (text: string, name: string, label: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { files: [new File([text], name, { type: 'text/markdown' })] } })

describe('the import is offered over a book that is already written (#131)', () => {
  it('stands in the bar of a written book, naming the file the book remembers', async () => {
    await aWrittenBook()
    // The second slice deliberately shipped no control here, because a control that overwrote a
    // whole book without saying what it took would have been a promise nobody kept. It is real now.
    expect(await screen.findByLabelText('Importera samma fil igen: skrivet.md')).toBeTruthy()
  })
})

const reportOverTheBook = async (markdown = FILE, name = 'regler-v4.md'): Promise<HTMLElement> => {
  pickFile(markdown, name, 'Importera samma fil igen: skrivet.md')
  return await screen.findByRole('region', { name: 'Vad importen gör med boken du har' })
}

// The "very clear" part of the decision. Counting what the file loses is no longer enough: a
// designer who wrote three sections by hand and hands over a file with two has to see, before she
// presses anything, that one of them is going away.
describe('what the report says about the book she already has (#131)', () => {
  it('leads with what the book loses, in sections and in words, before what the file loses', async () => {
    await aWrittenBook()
    const report = await reportOverTheBook()
    expect(within(report).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1 avsnitt försvinner ur boken, 17 ord',
      '1 avsnitt skrivs om',
      '1 nytt avsnitt',
      '3 rubriker blir avsnitt',
      '3 stycken blir text',
      '1 rubrik på filens första rad blir ingenting: boken heter vad spelet heter',
    ])
  })

  it('has nothing to report about the book when the same file is handed over again', async () => {
    await aWrittenBook()
    // The whole reason the preview won over the balance sheet: the form does not get worse from
    // being used. A re-import that changed nothing is a book with no marks on it at all — which is
    // what the fifth time the same file is handed over looks like.
    const report = await reportOverTheBook(WRITTEN, 'skrivet.md')
    expect(within(report).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '3 rubriker blir avsnitt',
      '3 stycken blir text',
      '1 rubrik på filens första rad blir ingenting: boken heter vad spelet heter',
    ])
    expect([...proposedBook().querySelectorAll('[data-block]')].every((el) => el.getAttribute('data-mark') === 'kept')).toBe(true)
    expect(proposedBook().querySelector('.byd-rules-mark')).toBeNull()
    expect(document.querySelector('.byd-rules-toc a[data-mark]:not([data-mark="kept"])')).toBeNull()
  })
})

const proposedBook = (): HTMLElement => document.querySelector('[data-proposal]') as HTMLElement

// Variant B, which the product owner chose over the balance sheet in a dialog: no dialog at all.
// The file is laid into the book as a proposal at the book's own reading width, and what
// disappears is struck through where it stands. A number says that seventeen words are going; the
// struck text says which, and that it was the section about cheating that never made it into the
// file.
describe('the file is laid into the book as a proposal (#131, prototype 8 variant B)', () => {
  it('keeps the file’s order and strikes the hand-written section where it stood', async () => {
    await aWrittenBook()
    await reportOverTheBook()
    const proposed = proposedBook()
    expect(within(proposed).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Översikt', 'En tur', 'Två spelare', 'Fusk och straff'])
    expect([...proposed.querySelectorAll('[data-block]')].map((el) => el.getAttribute('data-mark'))).toEqual([
      'kept',
      'changed',
      'kept',
      'kept',
      'added',
      'added',
      'going',
      'going',
    ])
    // Nothing has been written yet: the book on the server is the one she wrote.
    expect(document.querySelector('[data-rulebook]')).toBeNull()
  })

  it('marks the one sentence the file rewrote and leaves the ones around it standing', async () => {
    await aWrittenBook()
    await reportOverTheBook()
    const rewritten = proposedBook().querySelector('[data-mark="changed"]') as HTMLElement
    expect(rewritten.querySelector('del')?.textContent).toBe('Två till fem spelare.')
    expect(rewritten.querySelector('ins')?.textContent).toBe('Två till sex spelare.')
    // The sentence that came through untouched is neither, so a re-import of a barely changed file
    // is a barely marked book.
    expect(rewritten.textContent).toContain('Ett spel om att bluffa.')
    expect(rewritten.querySelector('del')?.textContent).not.toContain('bluffa')
  })

  it('marks the column beside the book too, because the section that goes may be below the fold', async () => {
    await aWrittenBook()
    await reportOverTheBook()
    expect(
      within(screen.getByRole('navigation', { name: 'Innehåll' }))
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Översikt· skrivs om', 'En tur', 'Två spelare· nytt', 'Fusk och straff· försvinner'])
  })
})

// A screen reader user has to learn that a section is going, and a strike-through is a decoration
// (L12). The word is text in the page, in the order it is read, and it is the same word in the
// column beside the book.
describe('the marks are never carried by colour or decoration alone (L12)', () => {
  it('writes what is happening to a block as text of its own, beside the block it happens to', async () => {
    await aWrittenBook()
    await reportOverTheBook()
    const proposed = proposedBook()
    const said = (mark: string) => (proposed.querySelector(`[data-mark="${mark}"] .byd-rules-mark`) as HTMLElement | null)?.textContent
    expect({ going: said('going'), changed: said('changed'), added: said('added') }).toEqual({ going: 'Försvinner', changed: 'Skrivs om', added: 'Nytt' })
  })

  it('says it once per run and not once per block, so a two-block section is not told twice', async () => {
    await aWrittenBook()
    await reportOverTheBook()
    // Three runs in this proposal: the rewritten paragraph, the new section, the one going away —
    // each of the last two a heading and a paragraph. The word stands at the head of its run,
    // which is where it is read, and the rail carries the rest of the way.
    expect([...proposedBook().querySelectorAll('.byd-rules-mark')].map((el) => el.textContent)).toEqual(['Skrivs om', 'Nytt', 'Försvinner'])
  })

  it('still says it at every section, so three sections going in a row are three tellings', async () => {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
    await bookIsThere()
    // The template's five sections against a file that mentions one of them: four are going, three
    // of them one after another. A reader who hears "försvinner" once and then reads three struck
    // headings has been told once about three losses, which is being told worse.
    pickFile(['# Skogens herrar', '', '# Uppställning', '', 'Var och en får fem guld.'].join('\n'), 'regler-v4.md', 'Importera över boken')
    await screen.findByRole('region', { name: 'Vad importen gör med boken du har' })
    expect([...proposedBook().querySelectorAll('.byd-rules-mark')].map((el) => el.textContent)).toEqual([
      'Försvinner',
      'Orörd · spelets egna zoner',
      'Skrivs om',
      'Försvinner',
      'Försvinner',
      'Försvinner',
    ])
  })
})

describe('the two answers, over a book that is already written (#131)', () => {
  it('leaves the book exactly as it was when the answer is Avbryt', async () => {
    await aWrittenBook()
    const report = await reportOverTheBook()
    fireEvent.click(within(report).getByRole('button', { name: 'Avbryt' }))
    const written = await bookIsThere()
    expect(within(written).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Översikt', 'En tur', 'Fusk och straff'])
    expect(written.querySelector('[data-mark]')).toBeNull()
    expect(await screen.findByLabelText('Importera samma fil igen: skrivet.md')).toBeTruthy()
  })

  it('writes the book the proposal showed, and lays a version named for the file', async () => {
    await aWrittenBook()
    const report = await reportOverTheBook()
    fireEvent.click(within(report).getByRole('button', { name: 'Gör boken' }))
    const written = await waitFor(async () => {
      const book = document.querySelector('[data-rulebook]') as HTMLElement
      expect(within(book).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Översikt', 'En tur', 'Två spelare'])
      return book
    })
    expect(written.textContent).not.toContain('Fusk och straff')
    expect(written.textContent).toContain('Två till sex spelare.')
    // Nothing is overwritten (B4): the book she wrote by hand is a row in the history, because
    // fifty steps of undo live in one tab and a whole rulebook is too much to hang on Ctrl+Z.
    await waitFor(async () => {
      const named = (await run.projects.versions(run.projectId)).flatMap((v) => (v.label ? [v.label] : []))
      // The history answers newest first.
      expect(named).toEqual(['Importerad: regler-v4.md', 'Importerad: skrivet.md'])
    })
    // And the book remembers the file it now came out of, so the next re-import names that one.
    expect(await screen.findByLabelText('Importera samma fil igen: regler-v4.md')).toBeTruthy()
  })
})

// An explicit exception to "the file decides" (B5, decided 2026-09-17). The setup block is not
// text: it is the game's own zones, drawn out of the state, and no Markdown file has it in it. A
// file that never mentions it has nothing to say about it. The prose around it follows the file.
describe('the setup block can never be imported away (#131, B5)', () => {
  const onlySetupSection = ['# Skogens herrar', '', '# Uppställning', '', 'Var och en får fem guld.'].join('\n')

  async function aTemplateBook(): Promise<void> {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
    await bookIsThere()
  }

  it('draws it untouched in the middle of everything that is changing, and says so in words', async () => {
    await aTemplateBook()
    pickFile(onlySetupSection, 'bara-uppstallning.md', 'Importera över boken')
    await screen.findByRole('region', { name: 'Vad importen gör med boken du har' })
    const setup = proposedBook().querySelector('.byd-rules-setup')?.closest('[data-block]') as HTMLElement
    expect(setup.getAttribute('data-mark')).toBe('kept')
    expect(setup.querySelector('.byd-rules-mark')?.textContent).toBe('Orörd · spelets egna zoner')
  })

  it('still stands in the book the import writes, though no file could ever have written it', async () => {
    await aTemplateBook()
    pickFile(onlySetupSection, 'bara-uppstallning.md', 'Importera över boken')
    fireEvent.click(within(await screen.findByRole('region', { name: 'Vad importen gör med boken du har' })).getByRole('button', { name: 'Gör boken' }))
    await waitFor(async () => {
      const book = document.querySelector('[data-rulebook]') as HTMLElement
      // Four of the five sections the template laid out are gone, because the file decided that.
      expect(within(book).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Uppställning'])
      // The zones are still drawn, and the prose beside them is the file's.
      expect(book.querySelector('.byd-rules-setup')).not.toBeNull()
      expect(book.textContent).toContain('Var och en får fem guld.')
    })
    // And it is in the document on the server, not only on the screen.
    await waitFor(async () => {
      const stored = (await run.projects.load(run.projectId))?.rules
      expect(stored?.blocks.filter((b) => b.kind === 'setup').length).toBe(1)
    })
  })
})

describe('a proposal is read, not written in (#131, L12)', () => {
  it('takes the focus, answers Escape with Avbryt, and cannot be typed into while it lies there', async () => {
    await aWrittenBook()
    const report = await reportOverTheBook()
    // The band takes the focus in an effect, so it lands a beat after the band itself is in the
    // page — and the read has to wait for that rather than time it (#149). Read the instant the
    // band appears it is green on a quiet machine and red under a full run, which is the same
    // fault as timing a server by a word that happens to show up once it answered. A bigger
    // number would only move the line; what is asked here is the condition, and it answers the
    // moment focus lands.
    await waitFor(() => expect(document.activeElement).toBe(report))
    // A page that could be typed into while it says what it is about to lose would be two things
    // at once. The blocks stop being buttons, and the plus signs beside them are gone.
    expect(proposedBook().querySelector('[role="button"]')).toBeNull()
    expect(screen.queryByLabelText(/^Lägg till efter/)).toBeNull()
    fireEvent.keyDown(report, { key: 'Escape' })
    const written = await bookIsThere()
    // And the book she can type into is back, with the section the file never had.
    expect(written.textContent).toContain('Fusk och straff')
    expect(within(written).getAllByRole('button').length).toBeGreaterThan(0)
  })
})
