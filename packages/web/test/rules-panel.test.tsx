// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'

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
  await run.projects.create('p1', withRules ? { ...projectDoc(), rules } : projectDoc())
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
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
    // The setup picture is the game's own zones (B5), not a drawing kept beside them.
    expect(within(book()).getByText('Så ställs bordet upp')).toBeTruthy()
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
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    const stored = await run.projects.load('p1')
    expect(stored?.rules?.blocks[1]).toMatchObject({ kind: 'text', text: 'Dra två kort ur [[zon:draw]].' })
    // The rules were versioned with everything else (B4).
    expect((await run.projects.at('p1', 1))?.rules?.blocks[1]).toMatchObject({ text: 'Dra ett kort ur [[zon:draw]] och lägg det i [[zon:discard]].' })
  })

  it('puts a reference in from a list of what the game has, so a rule never holds a name', async () => {
    await openRules()
    fireEvent.click(within(book()).getByText(/Dra ett kort ur/))
    await within(book()).findByLabelText('Text t1')
    fireEvent.click(within(book()).getByRole('button', { name: 'Sätt in Spelyta' }))
    await waitFor(() => expect((within(book()).getByLabelText('Text t1') as HTMLTextAreaElement).value).toContain('[[zon:table]]'))
    expect(within(book()).getAllByText('Spelyta').length).toBeGreaterThan(0)
  })

  it('adds a block after the one it is asked for, and takes one away', async () => {
    await openRules()
    const before = book().querySelectorAll('[data-block]').length
    fireEvent.click(within(book()).getByRole('button', { name: 'Lägg till efter h1' }))
    await waitFor(() => expect(book().querySelectorAll('[data-block]')).toHaveLength(before + 1))
    fireEvent.click(within(book()).getByRole('button', { name: 'Ta bort blocket' }))
    await waitFor(() => expect(book().querySelectorAll('[data-block]')).toHaveLength(before))
  })

  it('marks a rule that names something the game no longer has, rather than showing nothing', async () => {
    await run.projects.create('p2', { ...projectDoc(), rules: { title: 'X', blocks: [{ kind: 'text', id: 't1', text: 'Lägg i [[zon:soptunna]].' }] } })
    history.replaceState(null, '', `/editor?project=p2&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    fireEvent.click(screen.getByRole('tab', { name: 'Regler' }))
    const missing = book().querySelector('[data-ref][data-missing]')!
    expect(missing.textContent).toContain('soptunna')
    expect(screen.getByText(/1 referens pekar på något spelet inte har/)).toBeTruthy()
  })

  it('offers to start a rulebook when the game has none', async () => {
    await openRules(false)
    expect(screen.getByText(/Inga regler ännu/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Börja skriva reglerna' }))
    expect(await within(book()).findByRole('heading', { name: 'Skogens herrar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rules?.blocks.length).toBeGreaterThan(0))
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
