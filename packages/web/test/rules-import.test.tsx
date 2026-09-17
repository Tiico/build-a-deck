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
// constructions the book has a block for and three it has to do something about. It spends its `#`
// on the title and writes its sections with `##`, which is what a file written to be read by a
// person looks like — and the whole of what #202 is about.
const FILE = [
  '# Skogens herrar',
  '',
  'Ett spel om **skogen**.',
  '',
  '## En tur',
  '',
  '1. Dra ett kort ur [[zon:draw]].',
  '2. Spela ett kort.',
  '',
  '### Att passa',
  '',
  'Se [reglerna på webben](https://example.com/regler) för varianter.',
  '',
  '![Bordet från ovan](bordet.png)',
  '',
  '| Kort | Antal |',
  '| --- | --- |',
  '| Drake | 2 |',
].join('\n')

// The pictures a designer hands over beside her Markdown (#173). A real PNG, because what the
// picture is is read out of its bytes and never out of its name.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const picture = (name: string, bytes: BlobPart = PNG) => new File([bytes], name, { type: 'image/png' })

async function pick(text = FILE, name = 'regler-v4.md', beside: File[] = [picture('bordet.png')]): Promise<HTMLElement> {
  fireEvent.change(screen.getByLabelText('Importera från fil'), { target: { files: [new File([text], name, { type: 'text/markdown' }), ...beside] } })
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
    // are read against each other. The file's own title on the first line is no section at all
    // (#191), and the tree under it therefore stands a step up: `##` is a section and `###` a
    // subheading, so the book has the disposition the file had (#202).
    const proposed = document.querySelector('[data-proposal]') as HTMLElement
    expect(within(proposed).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['En tur'])
    expect(within(proposed).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Att passa'])
  })

  it('shows the proposed book in the column too, and never marks its sections empty', async () => {
    await openRules()
    await pick()
    // The disposition says “· tomt” beside a section nobody has written in. A section read out of
    // a file has been written in, and the column must not say otherwise.
    //
    // And the column has something to list at all (#202). A file that spends its `#` on its own
    // title writes its sections as `##`; with the title swallowed and nothing raised, the book had
    // no first level and the column beside it was simply not drawn.
    expect(within(screen.getByRole('navigation', { name: 'Innehåll' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['En tur'])
  })

  it('counts what became a block, and what changed shape on the way', async () => {
    await openRules()
    const report = await pick()
    expect(within(report).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '2 rubriker blir avsnitt',
      '3 stycken blir text',
      '1 lista blir en lista',
      '1 referens känns igen, som i en bok du skrivit själv',
      '1 bild blir en bild i boken',
      '1 rubrik på filens första rad blir ingenting: boken heter vad spelet heter',
      '1 rubriknivå djupare än två viks upp till underrubrik',
      '1 tabell blir text, en rad per rad',
      '1 länk blir sin egen text; adressen stryks',
    ])
  })
})

// The picture in the import report (#173, decided 2026-09-17). A picture comes in; what the report
// has to say is what came in saying nothing about itself, and what could not come in at all.
describe('what the report says about the pictures (#173)', () => {
  it('says how many came in without alt text, so whoever wants to write them can find them', async () => {
    await openRules()
    const report = await pick('# Skogens herrar\n\n![](bordet.png)\n\n![Kasthögen](kast.png)', 'regler-v4.md', [picture('bordet.png'), picture('kast.png')])
    const lines = within(report).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toContain('2 bilder blir bilder i boken')
    // In a rulebook a picture is almost never decorative, so the count is what keeps the decision
    // from being silent — it is the tool not hiding what it just did.
    const quiet = within(report).getByText(/utan alt-text/)
    expect(quiet.textContent).toContain('1 bild')
    expect(quiet.textContent).toContain('dekorativ')
    expect(quiet.getAttribute('data-kind')).toBe('changed')
  })

  it('keeps a picture it could not take in standing in the report, with the reason', async () => {
    await openRules()
    const file = '# Skogens herrar\n\nEtt spel om skogen.\n\n![Bordet](bordet.png)\n\n![Kasthögen](kast.png)\n\n![Handen](handen.png)'
    const report = await pick(file, 'regler-v4.md', [
      picture('kast.png', '<!doctype html><script>x</script>'),
      picture('handen.png', new Uint8Array(9 * 1024 * 1024)),
    ])
    const lines = within(report).getAllByRole('listitem').map((li) => li.textContent)
    // Nothing disappears silently (#131): one line per picture, each saying why, and the book is
    // made without them.
    expect(lines.some((l) => l?.includes('bordet.png') && l.includes('tillsammans'))).toBe(true)
    expect(lines.some((l) => l?.includes('kast.png') && l.includes('PNG'))).toBe(true)
    expect(lines.some((l) => l?.includes('handen.png') && l.includes('stor'))).toBe(true)
    expect(lines.some((l) => l?.includes('bild blir en bild'))).toBe(false)
  })

  // Where the two decisions of the day meet (#173 × #191). The file a designer actually hands
  // over opens with the name of her game and has pictures in it, so both roads are travelled at
  // once and the report has to read as one list and not as two features shouting over each other.
  it('says both that the title became nothing and what the pictures did, in one order', async () => {
    await openRules()
    const report = await pick('# Skogens herrar\n\n![](bordet.png)\n\n![Kasthögen](kast.png)', 'regler-v4.md', [picture('bordet.png'), picture('kast.png')])
    expect(within(report).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '2 bilder blir bilder i boken',
      '1 rubrik på filens första rad blir ingenting: boken heter vad spelet heter',
      '1 bild kom in utan alt-text och är därför dekorativ: dold för skärmläsare tills du skriver en',
    ])
    // And the book is called what the project is called, with no section made out of the file's
    // first line — the pictures came in under it all the same.
    const proposed = document.querySelector('[data-proposal]') as HTMLElement
    expect(within(proposed).queryAllByRole('heading', { level: 2 })).toEqual([])
    expect(proposed.querySelectorAll('.byd-rules-image').length).toBe(2)
  })

  // Where the two decisions of the day meet again, at the point they can cancel each other out
  // (#173 × #191). A file whose content is its pictures, under its own title, leaves no block at
  // all: the title becomes nothing because the book is called what the game is called, and a
  // picture that was not handed over is no block either. Told only that there is nothing in the
  // file, she would never learn that the pictures were the thing she left behind.
  it('says why there is nothing to make a book of, when the pictures were the something', async () => {
    await openRules()
    fireEvent.change(screen.getByLabelText('Importera från fil'), {
      target: { files: [new File(['# Skogens herrar\n\n![Bordet](bordet.png)'], 'regler-v4.md', { type: 'text/markdown' })] },
    })
    const said = (await screen.findByRole('alert')).textContent ?? ''
    expect(said).toContain('regler-v4.md')
    expect(said).toContain('bordet.png')
    expect(said).toContain('tillsammans')
    expect(document.querySelector('[data-rulebook]')).toBeNull()
  })

  it('takes the picture into the project’s own assets, and the book points at it there', async () => {
    await openRules()
    const report = await pick('# Skogens herrar\n\n![Bordet från ovan](bilder/bordet.png)', 'regler-v4.md', [picture('bordet.png')])
    fireEvent.click(within(report).getByRole('button', { name: 'Gör boken' }))
    const stored = await waitFor(async () => {
      const rules = (await run.projects.load(run.projectId))?.rules
      expect(rules?.blocks.some((b) => b.kind === 'image')).toBe(true)
      return rules!
    })
    const block = stored.blocks.find((b) => b.kind === 'image')!
    // The book is versioned with the cards (B4), so the picture travels in the project rather
    // than as an address pointing out of it.
    expect(block).toMatchObject({ alt: 'Bordet från ovan' })
    expect(block.kind === 'image' && block.asset).toMatch(/^asset:[0-9a-f]{64}$/)
    const hash = block.kind === 'image' ? block.asset.slice('asset:'.length) : ''
    const got = await fetch(`${run.http}/assets/${hash}`)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('image/png')
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
