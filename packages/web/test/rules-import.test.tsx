// @vitest-environment jsdom
// The import from a Markdown file (#131, second slice). A designer who writes her rules in her own
// editor should be able to hand the file over, and what the file loses on the way in must be read
// before the book is made — not afterwards, and not in a log.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { useEditSocketImplementation, type EditSocketCtor } from '../src/editor/ProjectClient.js'
import { EditSocket, RefusesToSave } from './setup.js'
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

async function openRules(): Promise<void> {
  await run.projects.create(run.projectId, projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  // The fixture says it is answering rather than the surface guessing it from a word the project
  // happens to carry (#149).
  await run.answering()
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
}

// A file of the kind a designer keeps beside her game: it opens with its own title, then five
// constructions the book has a block for and three it has to do something about.
const FILE = [
  '# Skogens herrar',
  '',
  'Ett spel om **skogen**.',
  '',
  '# En tur',
  '',
  '1. Dra ett kort ur [[zon:draw]].',
  '2. Spela ett kort.',
  '',
  '## Att passa',
  '',
  'Se [reglerna på webben](https://example.com/regler) för varianter.',
  '',
  '![Bordet från ovan](bordet.png)',
  '',
  '| Kort | Antal |',
  '| --- | --- |',
  '| Drake | 2 |',
].join('\n')

async function pick(text = FILE, name = 'regler-v4.md'): Promise<HTMLElement> {
  fireEvent.change(screen.getByLabelText('Importera från fil'), { target: { files: [new File([text], name, { type: 'text/markdown' })] } })
  return await screen.findByRole('region', { name: 'Vad importen gör med filen' })
}

describe('the third way in (#131)', () => {
  it('stands beside the two that were already there, on the empty tab', async () => {
    await openRules()
    expect(screen.getByRole('button', { name: 'Börja skriva reglerna' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Börja från en mall' })).toBeTruthy()
    expect(screen.getByLabelText('Importera från fil')).toBeTruthy()
  })
})

describe('the report, which is the last thing read before the book (#131)', () => {
  it('stands before the import and not after it, with the two answers beside it', async () => {
    await openRules()
    const report = await pick()
    expect(within(report).getByRole('button', { name: 'Gör boken' })).toBeTruthy()
    expect(within(report).getByRole('button', { name: 'Avbryt' })).toBeTruthy()
    // Nothing has been written: the tab still has no book, only the one being proposed.
    expect(document.querySelector('[data-rulebook]')).toBeNull()
    // The book the file would make stands under the report at its own reading width, so the two
    // are read against each other. `#` is a section and `##` a subheading, as the map says — and
    // the file's own title on the first line is no section at all (#191).
    const proposed = document.querySelector('[data-proposal]') as HTMLElement
    expect(within(proposed).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['En tur'])
    expect(within(proposed).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Att passa'])
  })

  it('shows the proposed book in the column too, and never marks its sections empty', async () => {
    await openRules()
    await pick()
    // The disposition says “· tomt” beside a section nobody has written in. A section read out of
    // a file has been written in, and the column must not say otherwise.
    expect(within(screen.getByRole('navigation', { name: 'Innehåll' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['En tur'])
  })

  it('counts what became a block, what changed shape on the way, and what did not come in', async () => {
    await openRules()
    const report = await pick()
    expect(within(report).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '2 rubriker blir avsnitt',
      '3 stycken blir text',
      '1 lista blir en lista',
      '1 referens känns igen, som i en bok du skrivit själv',
      '1 rubrik på filens första rad blir ingenting: boken heter vad spelet heter',
      '1 tabell blir text, en rad per rad',
      '1 länk blir sin egen text; adressen stryks',
      // The book has a picture now (#173), and this file names one whose bytes were not handed
      // over with it: the line says so by name, and says what the book will be.
      'bordet.png kom inte med — filen fanns inte bland dem du valde. Boken görs utan den.',
    ])
  })

  // The picture the book now has (#173). A browser cannot follow `bordet.png` on its own, so a
  // designer who hands over only the Markdown has handed over a book with a picture missing from
  // it — and that is said out loud, by name, rather than being a figure that quietly never appears.
  it('says by name that a picture did not come in, and that the book is made without it', async () => {
    await openRules()
    const report = await pick()
    const image = within(report).getByText(/bordet\.png/)
    expect(image.getAttribute('data-kind')).toBe('going')
    expect(image.textContent).toContain('Boken görs utan den.')
    // And the proposal stands a struck block where the picture would have been, so the reader of
    // the report can see where in the book the hole is.
    const gone = document.querySelector('[data-proposal] .byd-rules-left') as HTMLElement
    expect(within(gone).getByText('Kom inte med')).toBeTruthy()
  })
})

const gone = async () => waitFor(() => expect(screen.queryByRole('region', { name: 'Vad importen gör med filen' })).toBeNull())

describe('the two answers the report stands beside (#131)', () => {
  it('leaves the tab exactly as it was when the answer is Avbryt', async () => {
    await openRules()
    const report = await pick()
    fireEvent.click(within(report).getByRole('button', { name: 'Avbryt' }))
    await gone()
    expect(document.querySelector('[data-rulebook]')).toBeNull()
    // The disposition and all three ways in are standing there again, unchanged.
    expect(screen.getByLabelText('Importera från fil')).toBeTruthy()
    expect(within(screen.getByRole('navigation', { name: 'Innehåll' })).getAllByRole('link').map((a) => a.textContent)).toEqual(
      ['Översikt', 'Uppställning', 'En tur', 'Handlingar', 'Spelet tar slut'].map((s) => `${s}\u00b7 tomt`),
    )
  })

  it('writes the book the report described when the answer is Gör boken', async () => {
    await openRules()
    const report = await pick()
    fireEvent.click(within(report).getByRole('button', { name: 'Gör boken' }))
    const written = await waitFor(() => document.querySelector('[data-rulebook]') as HTMLElement)
    expect(within(written).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['En tur'])
    expect(written.textContent).toContain('Ett spel om skogen.')
    // The emphasis the file wrote is emphasis in the book, not four asterisks in the prose.
    expect(written.querySelector('strong')?.textContent).toBe('skogen')
    // The list the file counted with is a numbered list, and the reference stands for the zone it
    // names — the same as in a book written by hand (B7).
    expect(written.querySelector('ol')).not.toBeNull()
    expect(within(written).getByText('Draghög')).toBeTruthy()
    await gone()
  })
})

async function makeTheBook(): Promise<HTMLElement> {
  fireEvent.click(within(await pick()).getByRole('button', { name: 'Gör boken' }))
  return await waitFor(() => {
    const written = document.querySelector('[data-rulebook]')
    expect(written).not.toBeNull()
    return written as HTMLElement
  })
}

describe('what the book remembers of the file it came from (#131)', () => {
  it('writes the name and the moment into the document, as text and never as a file handle', async () => {
    await openRules()
    await makeTheBook()
    // A handle belongs to one browser and one person; a name travels with the project, which is
    // what the next slice’s “import the same file again” has to read.
    const source = await waitFor(async () => {
      const stored = (await run.projects.load(run.projectId))?.rules?.source
      expect(stored).toBeTruthy()
      return stored
    })
    expect(source?.file).toBe('regler-v4.md')
    expect(Number.isNaN(Date.parse(source?.at ?? ''))).toBe(false)
  })

  it('says in the tab itself which file the book came out of', async () => {
    await openRules()
    await makeTheBook()
    expect(await screen.findByText(/regler-v4\.md/)).toBeTruthy()
  })
})

describe('the protection an import lays down (#131, B4)', () => {
  it('lays a version named for the file, because a whole rulebook is too much to hang on Ctrl+Z', async () => {
    await openRules()
    await makeTheBook()
    await waitFor(async () => {
      const named = (await run.projects.versions(run.projectId)).flatMap((v) => (v.label ? [v.label] : []))
      expect(named).toEqual(['Importerad: regler-v4.md'])
    })
  })
})

describe('where the import is offered (#131)', () => {
  it('stands over a written book too, under the name that slice built for it', async () => {
    await openRules()
    fireEvent.click(screen.getByRole('button', { name: 'Börja från en mall' }))
    await waitFor(() => expect(document.querySelector('[data-rulebook]')).not.toBeNull())
    // The second slice shipped no control here on purpose: one that replaced a whole book without
    // saying what it took would have been a promise nobody kept. The third slice keeps the promise,
    // and `rules-reimport` is where what it now says is tested. The empty tab's own control is a
    // third way in and not this one, so it is gone with the empty tab.
    expect(screen.queryByLabelText('Importera från fil')).toBeNull()
    expect(screen.getByLabelText('Importera över boken')).toBeTruthy()
  })

  it('says so, rather than doing nothing, when the file has nothing to make a book of', async () => {
    await openRules()
    fireEvent.change(screen.getByLabelText('Importera från fil'), { target: { files: [new File(['\n---\n'], 'tom.md', { type: 'text/markdown' })] } })
    expect((await screen.findByRole('alert')).textContent).toContain('tom.md')
    expect(document.querySelector('[data-rulebook]')).toBeNull()
  })
})

describe('a file is untrusted input (#131)', () => {
  it('cannot put markup into the book, because nothing it contains is ever markup', async () => {
    await openRules()
    const nasty = ['# Skogens herrar', '', '# <img src=x onerror="document.title = \'taken\'">', '', '<script>document.title = \'taken\'</script>', '', 'En [länk](javascript:alert(1)) till ingenting.'].join('\n')
    const report = await pick(nasty, 'otrygg.md')
    fireEvent.click(within(report).getByRole('button', { name: 'Gör boken' }))
    const written = await waitFor(() => {
      const book = document.querySelector('[data-rulebook]')
      expect(book).not.toBeNull()
      return book as HTMLElement
    })
    expect(written.querySelector('script')).toBeNull()
    expect(written.querySelector('img')).toBeNull()
    expect(written.querySelector('a')).toBeNull()
    expect(document.title).not.toBe('taken')
    // It is all there, and all of it is text: nothing disappeared, and nothing was obeyed.
    expect(written.textContent).toContain('<script>document.title = \'taken\'</script>')
    expect(written.textContent).toContain('En länk till ingenting.')
  })
})

describe('the report is read without a mouse (L12)', () => {
  it('takes the focus when it appears and takes Escape as the answer Avbryt', async () => {
    await openRules()
    const report = await pick()
    // Waited for, not timed (#149): the band takes the focus in an effect, so it lands a beat
    // after the band is in the page, and a read taken the instant the band appears is green on a
    // quiet machine and red under a full run. This one has not fallen yet; the same line in
    // `rules-reimport.test.tsx` fell on CI, and this is the same line.
    await waitFor(() => expect(document.activeElement).toBe(report))
    fireEvent.keyDown(report, { key: 'Escape' })
    await gone()
    expect(document.querySelector('[data-rulebook]')).toBeNull()
  })
})


// The one ending an import has that is not the designer's own doing: the save behind it does not
// happen, because someone else saved from the same revision first. Two tabs on the same project
// is all it takes, and the failure it must never have is the quiet one — a book on the screen,
// nothing on the server, and nobody told.
//
// The refusal is the actor's own answer, given by the stand-in socket the editor's other
// collision tests use (`setup.ts`). It is not raced into being: with a live actor (D3) this
// editor is told about someone else's version as it happens, so the window for a collision is a
// moment too short to arrange from outside. Here the answer to a save is a fact, and the test
// waits on the screen rather than on a clock.
describe('when the save behind the import collides with someone else (#131)', () => {
  it('says the book is not saved and what to do about it, and leaves nothing behind on the server', async () => {
    useEditSocketImplementation(RefusesToSave)
    await openRules()
    fireEvent.click(within(await pick()).getByRole('button', { name: 'Gör boken' }))

    const said = await screen.findByRole('alert')
    // Both halves of it: which state the book is in, and the way out of that state. The word the
    // protocol uses for the collision is not a word anyone can act on, so it is not on the screen.
    expect(said.textContent).toMatch(/inte sparad/i)
    expect(said.textContent).toMatch(/ladda om/i)
    expect(said.textContent).not.toMatch(/conflict/i)

    // Nothing was half-written. The project on the server has no book and no version named for
    // the file: the import either happens whole or does not happen.
    const stored = await run.projects.load(run.projectId)
    expect(stored?.rules).toBeUndefined()
    expect(stored?.rev).toBe(1)
    expect((await run.projects.versions(run.projectId)).flatMap((v) => (v.label ? [v.label] : []))).toEqual([])

    // And she is not stranded: the book the file made is in front of her, the editor says in its
    // own words that the work is unsaved, and the tab will not go without asking (#8) — so the
    // way back is a reload and the same file again, which is what the line told her.
    expect(document.querySelector('[data-rulebook]')).not.toBeNull()
    expect(screen.getByText('Osparat')).toBeTruthy()
  })
})
