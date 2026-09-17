// @vitest-environment jsdom
// A picture in the rulebook, in the editor (B7, #173).
//
// What is checked here is what the prototype argued: the figure is the share of the column the
// press will give it, the designer's own two fields stay apart, and a picture that carries no alt
// text is decorative *and findable* — the word stands in the page as text, the button that fixes it
// is a real target, and the column keeps counting the silent pictures long after the import band
// is gone. Nothing here pins a pixel: what is measured is the millimetres and the structure.
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

const src = `asset:${'d'.repeat(64)}`
const rules: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Uppställning' },
    { kind: 'image', id: 'i1', src, alt: 'Dragbunten till vänster, spelytan i mitten.', px: { w: 2400, h: 1350 } },
    { kind: 'heading', id: 'h2', level: 1, text: 'Handlingar' },
    { kind: 'image', id: 'i2', src, alt: '', px: { w: 1600, h: 640 } },
  ],
}

async function openRules(doc: RuleDoc = rules): Promise<void> {
  await run.projects.create(run.projectId, { ...projectDoc(), rules: doc })
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
}
const book = () => document.querySelector('[data-rulebook]') as HTMLElement
const figure = (id: string) => book().querySelector(`[data-block="${id}"] figure`) as HTMLElement

describe('a picture in the rulebook, in the editor (B7, #173)', () => {
  it('draws it at the share of the column the press will give it, and says what that comes to', async () => {
    await openRules()
    await waitFor(() => expect(figure('i1')).toBeTruthy())
    // One measurement, arrived at once: 2400 px wide is wider than the column, so it fills it.
    expect(figure('i1').style.getPropertyValue('--byd-rule-image-w')).toBe('118')
    expect(figure('i1').dataset['fit']).toBe('column')
    // And the editor says what the figure becomes in the booklet, because that is the thing the
    // designer cannot otherwise see from a screen.
    expect(within(book()).getByText(/118 × 66 mm/)).toBeTruthy()
  })

  it('marks a picture with no alt text as decorative in words, not in a colour alone (L12)', async () => {
    await openRules()
    const block = await waitFor(() => book().querySelector('[data-block="i2"]') as HTMLElement)
    expect(within(block).getByText('Dekorativ · dold för skärmläsare')).toBeTruthy()
    // The one that has an alt text says the alt text instead, and neither is a colour.
    const written = book().querySelector('[data-block="i1"]') as HTMLElement
    expect(within(written).getByText('Dragbunten till vänster, spelytan i mitten.')).toBeTruthy()
    expect(within(written).queryByText('Dekorativ · dold för skärmläsare')).toBeNull()
  })

  it('opens the alt text where the picture stands, saves it, and the mark goes', async () => {
    await openRules()
    const block = await waitFor(() => book().querySelector('[data-block="i2"]') as HTMLElement)
    fireEvent.click(within(block).getByRole('button', { name: 'Skriv alt-text' }))
    const field = await within(block).findByLabelText('Alt-text för bilden')
    // The field opens where the picture is, and it holds the focus: a designer working on the
    // keyboard is in the field she asked for and not back at the top of the book (L12).
    expect(document.activeElement).toBe(field)
    fireEvent.change(field, { target: { value: 'Fyra symboler och vad de betyder.' } })
    fireEvent.click(within(block).getByRole('button', { name: 'Klart' }))
    await waitFor(() => expect(within(block).queryByText('Dekorativ · dold för skärmläsare')).toBeNull())
    expect((book().querySelector('[data-block="i2"] img') as HTMLImageElement).alt).toBe('Fyra symboler och vad de betyder.')
  })

  // An empty field is still decorative: closing the field without writing anything is not a way of
  // sneaking the mark off a picture that still stands for nothing.
  it('keeps the decorative mark when the field is closed with nothing in it', async () => {
    await openRules()
    const block = await waitFor(() => book().querySelector('[data-block="i2"]') as HTMLElement)
    fireEvent.click(within(block).getByRole('button', { name: 'Skriv alt-text' }))
    fireEvent.change(await within(block).findByLabelText('Alt-text för bilden'), { target: { value: '   ' } })
    fireEvent.click(within(block).getByRole('button', { name: 'Klart' }))
    await waitFor(() => expect(within(block).getByText('Dekorativ · dold för skärmläsare')).toBeTruthy())
  })

  // Alt text and caption are two fields for two readers, and writing one never writes the other.
  it('writes the caption in a field of its own, and leaves the alt text where it was', async () => {
    await openRules()
    const block = await waitFor(() => book().querySelector('[data-block="i1"]') as HTMLElement)
    fireEvent.click(within(block).getByRole('button', { name: 'Bildtext' }))
    const field = await within(block).findByLabelText('Bildtext i1')
    fireEvent.change(field, { target: { value: 'Bordet vid start, sett från nord.' } })
    fireEvent.click(within(block).getByRole('button', { name: 'Klart' }))
    await waitFor(() => expect(within(block).getByText('Bordet vid start, sett från nord.')).toBeTruthy())
    expect((block.querySelector('img') as HTMLImageElement).alt).toBe('Dragbunten till vänster, spelytan i mitten.')
  })

  // The affordance that outlives the import band: the column counts the silent pictures and goes
  // to one. It stands in the book's own contents, so it is there the day after as well.
  it('counts the pictures with no alt text in the foot of the contents, and goes to one', async () => {
    await openRules()
    const toc = await screen.findByRole('navigation', { name: 'Innehåll' })
    const found = within(toc).getByRole('button', { name: '1 · bild utan alt-text' })
    // A real target, reachable by keyboard, and not a hover-only affordance (L12).
    expect(found.tagName).toBe('BUTTON')
    fireEvent.click(found)
    await waitFor(() => expect((book().querySelector('[data-block="i2"] figure') as HTMLElement).dataset['found']).toBe('true'))
  })

  it('says nothing is left to write once every picture carries an alt text', async () => {
    await openRules({ ...rules, blocks: rules.blocks.filter((b) => b.id !== 'i2') })
    const toc = await screen.findByRole('navigation', { name: 'Innehåll' })
    expect(within(toc).queryByRole('button', { name: /bild utan alt-text/ })).toBeNull()
  })
})

// The way in (#131) now brings the pictures with it (#173). The file names them by an address, the
// designer hands them over beside the Markdown, and they become the game's own assets — a book
// versioned with the cards can hold nothing that lives anywhere else (B4, B7).
describe('importing a book that has pictures in it (B7, #173)', () => {
  beforeEach(() => {
    // jsdom decodes nothing, so the browser's own measurement is stood in for. What is under test
    // is what the import does with a measurement, not that a browser can take one.
    URL.createObjectURL = () => 'blob:byd'
    URL.revokeObjectURL = () => undefined
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { value: async () => undefined, configurable: true })
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { get: () => 2400, configurable: true })
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { get: () => 1350, configurable: true })
  })

  const md = (text: string) => new File([text], 'regler.md', { type: 'text/markdown' })
  const hand = async (files: File[]) => {
    const input = document.querySelector('.byd-rules-ways input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files } })
  }

  it('takes the picture into the game’s own assets and stands it where the file had it', async () => {
    await openRules({ title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'b1', level: 1, text: 'Uppställning' }] })
    await hand([md('# Skogens herrar\n\n## Uppställning\n\nLägg ut zonerna.\n\n![Bordet från ovan](bilder/bordet.png)\n'), new File([new Uint8Array(8)], 'bordet.png', { type: 'image/png' })])
    const report = await screen.findByRole('region')
    expect(within(report).getByText(/1 bild kom med/)).toBeTruthy()
    // The proposal shows the figure itself, at the share of the column the press will give it.
    const proposal = await waitFor(() => document.querySelector('[data-proposal] figure') as HTMLElement)
    expect(proposal.style.getPropertyValue('--byd-rule-image-w')).toBe('118')
    fireEvent.click(within(report).getByRole('button', { name: 'Gör boken' }))
    // And the book that is made carries an asset reference and never the address out of the file.
    const made = await waitFor(() => book().querySelector('figure img') as HTMLImageElement)
    expect(made.getAttribute('src')).toContain('/assets/')
    expect(made.alt).toBe('Bordet från ovan')
  })

  it('stands a picture that did not come in where it would have been, struck, and only in the proposal', async () => {
    await openRules({ title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'b1', level: 1, text: 'Uppställning' }] })
    await hand([md('## Uppställning\n\nLägg ut zonerna.\n\n![Uppställningen](uppstallning.tiff)\n'), new File([new Uint8Array(4)], 'uppstallning.tiff', { type: 'image/tiff' })])
    const report = await screen.findByRole('region')
    // The reason is given with the limit written out, and never as a silence.
    expect(within(report).getByText(/uppstallning\.tiff/)).toBeTruthy()
    const left = await waitFor(() => document.querySelector('[data-proposal] .byd-rules-left') as HTMLElement)
    expect(within(left).getByText('Kom inte med')).toBeTruthy()
    fireEvent.click(within(report).getByRole('button', { name: 'Gör boken' }))
    // A reader never meets an error message in a rulebook: the book is made without it.
    await waitFor(() => expect(book().querySelector('.byd-rules-left')).toBeNull())
    expect(book().textContent).not.toContain('uppstallning.tiff')
  })

  // The picker takes more than one file now, so it can be handed the wrong ones — and a control
  // that does nothing at all is the one answer "nothing disappears quietly" does not allow.
  it('says so when the pictures were picked without the file that names them', async () => {
    await openRules({ title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'b1', level: 1, text: 'Uppställning' }] })
    await hand([new File([new Uint8Array(8)], 'bordet.png', { type: 'image/png' })])
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('regelfil'))
    expect(screen.queryByRole('region')).toBeNull()
  })
})
