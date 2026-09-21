// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  await run.stop()
})

const rules: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Dra ett kort ur [[zon:draw]] och lägg det i [[zon:discard]].' },
    { kind: 'list', id: 'l1', ordered: true, items: ['Dra.', 'Spela [[kort:dragon]].'] },
    { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp' },
  ],
}

async function openRules(withRules = true): Promise<void> {
  await run.projects.create(run.projectId, withRules ? { ...projectDoc(), rules } : projectDoc())
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
}
const book = () => document.querySelector('[data-rulebook]') as HTMLElement

describe('the rulebook in the editor (B7)', () => {
  it('shows the book as the reader will meet it, with every reference standing for what the thing is called now', async () => {
    await openRules()
    expect(within(book()).getByRole('heading', { name: 'Så spelar ni' })).toBeTruthy()
    const refs = [...book().querySelectorAll('[data-ref]')].map((r) => r.textContent)
    expect(refs).toEqual(['Draghög', 'Kasthög', 'Drake'])
    // The setup picture is the game's own zones (B5), not a drawing kept beside them. It stands
    // folded until somebody asks for it (#270), here exactly as in the players' own book.
    expect(within(book()).getByText('Så ställs bordet upp')).toBeTruthy()
    expect(book().querySelectorAll('[data-setup-zone]')).toHaveLength(0)
    fireEvent.click(within(book()).getByRole('button', { name: 'Visa uppställningen' }))
    expect(book().querySelectorAll('[data-setup-zone]').length).toBeGreaterThan(1)
  })

  it('opens a paragraph where it stands, writes into the document, and closes when it is left', async () => {
    await openRules()
    expect(book().querySelector('textarea')).toBeNull()
    fireEvent.click(within(book()).getByText(/Dra ett kort ur/))
    const field = await within(book()).findByLabelText('Text t1')
    fireEvent.change(field, { target: { value: 'Dra två kort ur [[zon:draw]].' } })
    await waitFor(() => expect(within(book()).getByText(/Dra två kort ur/)).toBeTruthy())
    fireEvent.blur(field)
    await waitFor(() => expect(book().querySelector('textarea')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    const stored = await run.projects.load(run.projectId)
    expect(stored?.rules?.blocks[1]).toMatchObject({ kind: 'text', text: 'Dra två kort ur [[zon:draw]].' })
    // The rules were versioned with everything else (B4).
    expect((await run.projects.at(run.projectId, 1))?.rules?.blocks[1]).toMatchObject({ text: 'Dra ett kort ur [[zon:draw]] och lägg det i [[zon:discard]].' })
  })

  // How a reference gets into a rule at all is `rules-inserting`'s (#215): the row of one button
  // per reference is gone, and `[[` opens a list that narrows where the caret stands.

  it('adds a block after the one it is asked for, and takes one away', async () => {
    await openRules()
    const before = book().querySelectorAll('[data-block]').length
    // The one ＋ the book draws stands at the block the hand is on (#216), so the hand goes there
    // first; where it stands and what it does with a keyboard is `rules-one-plus`'s.
    fireEvent.pointerOver(book().querySelector('[data-block="h1"]')!)
    fireEvent.click(await within(book()).findByRole('button', { name: 'Lägg till efter h1' }))
    await waitFor(() => expect(book().querySelectorAll('[data-block]')).toHaveLength(before + 1))
    fireEvent.click(within(book()).getByRole('button', { name: 'Ta bort blocket' }))
    await waitFor(() => expect(book().querySelectorAll('[data-block]')).toHaveLength(before))
  })

  it('marks a rule that names something the game no longer has, rather than showing nothing', async () => {
    await run.projects.create(run.otherProjectId, { ...projectDoc(), rules: { title: 'X', blocks: [{ kind: 'text', id: 't1', text: 'Lägg i [[zon:soptunna]].' }] } })
    history.replaceState(null, '', `/editor?project=${run.otherProjectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
    const missing = book().querySelector('[data-ref][data-missing]')!
    expect(missing.textContent).toContain('soptunna')
    expect(screen.getByText(/1 referens pekar på något spelet inte har/)).toBeTruthy()
  })

  // A reference in a heading (#272). The heading was the one line of the book the renderer never
  // read inline, so a section named after a pile stood in raw characters — in the book, in the
  // column beside it, and in the count of references that point at nothing. All three read the
  // heading the same way as the paragraph under it now.
  it('reads a reference in a heading, in the book and in the column, and counts a lost one', async () => {
    await run.projects.create(run.otherProjectId, {
      ...projectDoc(),
      rules: {
        title: 'X',
        blocks: [
          { kind: 'heading', id: 'h1', level: 1, text: 'Om [[zon:draw]]' },
          { kind: 'heading', id: 'h2', level: 2, text: 'Och om [[zon:soptunna]]' },
        ],
      },
    })
    history.replaceState(null, '', `/editor?project=${run.otherProjectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
    await waitFor(() => expect(book().querySelector('[data-block="h1"]')).toBeTruthy())
    expect(book().querySelector('[data-block="h1"] h2')!.textContent).toBe('Om Draghög')
    // The column points at the same words the reader meets, and never at the id behind them.
    const toc = document.querySelector('.byd-rules-toc') as HTMLElement
    expect([...toc.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Om Draghög', 'Underrubrik: Och om zon:soptunna'])
    // A reference the game lost says so where it stands, and is counted with the rest of them.
    expect(book().querySelector('[data-block="h2"] [data-ref][data-missing]')!.textContent).toContain('soptunna')
    expect(screen.getByText(/1 referens pekar på något spelet inte har/)).toBeTruthy()
  })

  // What an empty tab offers, and what each way in leaves behind, is `rules-disposition`'s (#131).
  // What this holds on to is that a book begun there is a book the project keeps.
  it('writes a rulebook into the document when the game has none', async () => {
    await openRules(false)
    fireEvent.click(screen.getByRole('button', { name: 'Börja skriva reglerna' }))
    expect(await within(book()).findByRole('heading', { name: 'Skogens herrar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rules?.blocks.length).toBeGreaterThan(0))
  })
})

// The picture in the book as the designer meets it (#173, decided 2026-09-17). The editor draws
// the same picture the table and the booklet draw, and it is where a decorative one can be given
// the words it came in without.
describe('a picture in the editor’s book (#173)', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const withPicture = async (alt: string, caption?: string): Promise<void> => {
    const put = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG })
    const { hash } = (await put.json()) as { hash: string }
    await run.projects.create(run.projectId, {
      ...projectDoc(),
      rules: { ...rules, blocks: [...rules.blocks, { kind: 'image', id: 'i1', asset: `asset:${hash}`, alt, ...(caption === undefined ? {} : { caption }), px: { w: 1400, h: 800 } }] },
    })
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
  }

  it('draws it out of the project’s own assets, with what it says about itself', async () => {
    await withPicture('Bordet från ovan')
    const picture = await within(book()).findByRole('img', { name: 'Bordet från ovan' })
    expect(picture.getAttribute('src')).toMatch(new RegExp(`^${run.http}/assets/[0-9a-f]{64}$`))
  })

  it('says in the page that a decorative picture is hidden, and lets the words be written there', async () => {
    await withPicture('')
    // The decision of 2026-09-17 took the cost of a decorative picture deliberately; what it did
    // not take is hiding it, so the book says so where the picture stands.
    expect(await within(book()).findByText('Utan alt-text: dold för skärmläsare')).toBeTruthy()
    expect(within(book()).queryByRole('img')).toBeNull()

    fireEvent.click(book().querySelector('[data-block="i1"] [role="button"]')!)
    const field = await within(book()).findByLabelText('Alt-text för bilden i1')
    fireEvent.change(field, { target: { value: 'Bordet från ovan' } })
    await waitFor(() => expect(within(book()).getByRole('img', { name: 'Bordet från ovan' })).toBeTruthy())
    fireEvent.blur(field)

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rules?.blocks.at(-1)).toMatchObject({ kind: 'image', alt: 'Bordet från ovan' }))
  })
})

// The caption is the second of the picture's two fields (decided 2026-09-17): the alt text is
// written for whoever cannot see the picture, the caption for whoever can, and an imported book has
// no captions at all until the designer writes them here.
describe('the picture’s caption in the editor (#173)', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const withPicture = async (alt: string, caption?: string): Promise<void> => {
    const put = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG })
    const { hash } = (await put.json()) as { hash: string }
    await run.projects.create(run.projectId, {
      ...projectDoc(),
      rules: { ...rules, blocks: [...rules.blocks, { kind: 'image', id: 'i1', asset: `asset:${hash}`, alt, ...(caption === undefined ? {} : { caption }), px: { w: 1400, h: 800 } }] },
    })
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
  }

  it('reads the caption in the book, and writes it in a field of its own beside the alt text', async () => {
    await withPicture('Bordet från ovan', 'Bordet vid tre spelare')
    // It is in the book, because it is the reader's own line and is printed.
    expect(await within(book()).findByText('Bordet vid tre spelare')).toBeTruthy()

    fireEvent.click(book().querySelector('[data-block="i1"] [role="button"]')!)
    const alt = await within(book()).findByLabelText('Alt-text för bilden i1')
    const caption = await within(book()).findByLabelText('Bildtext i1')
    // Two fields, and neither of them holds what the other says.
    expect((alt as HTMLInputElement).value).toBe('Bordet från ovan')
    expect((caption as HTMLInputElement).value).toBe('Bordet vid tre spelare')
    fireEvent.change(caption, { target: { value: 'Bordet vid fyra spelare' } })
    // And the alt text is untouched by writing it: they are two readers, not one field twice.
    expect(within(book()).getByRole('img', { name: 'Bordet från ovan' })).toBeTruthy()
    // Leaving the fields closes the block, exactly as leaving a paragraph does, and what stands
    // there afterwards is the book the reader meets.
    fireEvent.blur(caption)
    await waitFor(() => expect(within(book()).getByText('Bordet vid fyra spelare')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () =>
      expect((await run.projects.load(run.projectId))?.rules?.blocks.at(-1)).toMatchObject({ kind: 'image', alt: 'Bordet från ovan', caption: 'Bordet vid fyra spelare' }),
    )
  })
})

// The counting affordance in the contents' foot (the approved prototype). The import band says how
// many pictures came in without alt text; this says the same thing a week later, when the band is
// long gone — which is the difference between "nothing disappears silently at the import" and
// nothing disappearing silently at all.
describe('the pictures without alt text, counted in the contents (#173)', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const withPictures = async (...alts: string[]): Promise<void> => {
    const put = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG })
    const { hash } = (await put.json()) as { hash: string }
    await run.projects.create(run.projectId, {
      ...projectDoc(),
      rules: { ...rules, blocks: [...rules.blocks, ...alts.map((alt, i) => ({ kind: 'image' as const, id: `i${i + 1}`, asset: `asset:${hash}`, alt, px: { w: 1400, h: 800 } }))] },
    })
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
  }
  const contents = () => screen.getByRole('navigation', { name: 'Innehåll' })

  it('counts them in the contents long after any import report is gone, goes to one, and marks it', async () => {
    await withPictures('Bordet från ovan', '', '')
    // No import anywhere in sight: this is the book as it stands days later.
    const counter = await within(contents()).findByRole('button', { name: /2 · bilder utan alt-text/ })
    fireEvent.click(counter)
    // It goes to the first picture that says nothing, and says which one it took her to — in a
    // word and never in a ring drawn round it, because a decoration is not an answer (L12).
    const found = book().querySelector('[data-block="i2"]') as HTMLElement
    await waitFor(() => expect(found.getAttribute('data-found')).toBe('true'))
    expect(within(found).getByText('Bilden du sökte')).toBeTruthy()
    // And it is a picture the designer can act on where she was taken: the block is open to its
    // fields, so the mark is not a place to look at but a place to write.
    expect(document.activeElement).toBe(found.querySelector('[role="button"]'))
  })

  it('says nothing at all when every picture in the book says something', async () => {
    await withPictures('Bordet från ovan')
    expect(within(contents()).queryByRole('button', { name: /utan alt-text/ })).toBeNull()
  })
})

describe('the rulebook as a booklet (B7)', () => {
  it('is ordered from the rules and opens when it is rendered', async () => {
    await openRules()
    const order = screen.getByRole('button', { name: 'Häfte för tryck' })
    fireEvent.click(order)
    expect(await screen.findByText(/Häftet renderas/)).toBeTruthy()

    await run.completeRenders()
    const link = await screen.findByRole('link', { name: 'Öppna häftet' }, { timeout: 3000 })
    expect(link.getAttribute('href')).toMatch(/\/faces\/[0-9a-f]{64}$/)
  })

  it('is not offered at all before there are any rules', async () => {
    await openRules(false)
    expect(screen.queryByRole('button', { name: 'Häfte för tryck' })).toBeNull()
  })
})

describe('a heading kept open while its level is chosen (#217)', () => {
  it('stays open when the focus goes from the field to the level beside it', async () => {
    await openRules()
    fireEvent.click(within(book()).getByRole('heading', { name: 'Så spelar ni' }))
    const field = await within(book()).findByLabelText('Rubrik h1')
    const level = within(book()).getByLabelText('Nivå på h1')
    // Leaving the field for the chooser beside it is staying, not going — the same rule the
    // picture's two fields already follow.
    fireEvent.blur(field, { relatedTarget: level })
    await waitFor(() => expect(within(book()).queryByLabelText('Nivå på h1')).toBeTruthy())
    expect(within(book()).getByLabelText('Rubrik h1')).toBeTruthy()
  })

  it('takes the level the chooser is set to, and draws the heading at it', async () => {
    await openRules()
    fireEvent.click(within(book()).getByRole('heading', { name: 'Så spelar ni' }))
    const field = await within(book()).findByLabelText('Rubrik h1')
    const level = within(book()).getByLabelText('Nivå på h1')
    fireEvent.blur(field, { relatedTarget: level })
    fireEvent.change(level, { target: { value: '2' } })
    // An open block shows its fields and not the heading, so the level is read off the book once
    // the block is closed again — which is where the reader meets it.
    fireEvent.blur(level, { relatedTarget: document.body })
    await waitFor(() => expect(within(book()).getByRole('heading', { level: 3, name: 'Så spelar ni' })).toBeTruthy())
  })

  it('closes when the focus leaves the heading row altogether', async () => {
    await openRules()
    fireEvent.click(within(book()).getByRole('heading', { name: 'Så spelar ni' }))
    const field = await within(book()).findByLabelText('Rubrik h1')
    fireEvent.blur(field, { relatedTarget: document.body })
    await waitFor(() => expect(within(book()).queryByLabelText('Rubrik h1')).toBeNull())
  })
})

// Uppställningen i editorns bok (#270). Sedan bilden har egna kontroller — utfällningen och
// platsväljaren — kan blocket inte längre vara en enda stor knapp: en kontroll inuti en kontroll
// är ogiltig och nås inte av en skärmläsare (UX-37, #82). Vägen in i blocket är därför dess
// bildtext, som också är det enda i en uppställning en designer skriver.
describe('uppställningens block i editorn (#270)', () => {

  it('lägger ingen kontroll inuti en annan, med bilden både hopfälld och utfälld', async () => {
    await openRules()
    const nested = () => book().querySelectorAll('button button, button [role="button"], [role="button"] button, [role="button"] [role="button"], [role="button"] select, button select')
    expect(book().querySelectorAll('button, [role="button"]').length).toBeGreaterThan(0)
    expect([...nested()].map((el) => el.outerHTML.slice(0, 60))).toEqual([])
    fireEvent.click(within(book()).getByRole('button', { name: 'Visa uppställningen' }))
    expect([...nested()].map((el) => el.outerHTML.slice(0, 60))).toEqual([])
  })

  it('öppnar bildtexten ur bildtexten, och fäller ut bilden utan att öppna något fält', async () => {
    await openRules()
    // Att fälla ut bilden är att läsa, inte att skriva.
    fireEvent.click(within(book()).getByRole('button', { name: 'Visa uppställningen' }))
    expect(book().querySelector('input')).toBeNull()
    // Och bildtexten är vägen in i blocket.
    fireEvent.click(within(book()).getByRole('button', { name: 'Så ställs bordet upp' }))
    const field = await within(book()).findByLabelText('Bildtext s1')
    expect((field as HTMLInputElement).value).toBe('Så ställs bordet upp')
    fireEvent.change(field, { target: { value: 'Bordet vid två spelare' } })
    fireEvent.blur(field)
    await waitFor(() => expect(within(book()).getByRole('button', { name: 'Bordet vid två spelare' })).toBeTruthy())
  })

  it('erbjuder vägen in också när ingen bildtext är skriven ännu', async () => {
    await run.projects.create(run.projectId, { ...projectDoc(), rules: { ...rules, blocks: [{ kind: 'setup', id: 's1' }] } })
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
    fireEvent.click(await within(book()).findByRole('button', { name: 'Bildtext…' }))
    expect(await within(book()).findByLabelText('Bildtext s1')).toBeTruthy()
  })
})
