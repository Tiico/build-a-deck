// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A project with a history: three saves, the middle one worth naming.
async function withHistory(): Promise<void> {
  const doc = projectDoc()
  await run.projects.create('p1', doc)
  const second = structuredClone(doc)
  second.rows[0]!.fields['title'] = 'Drakhona'
  await run.projects.replace('p1', 1, second)
  const third = structuredClone(second)
  third.rows.push({ id: 'troll', fields: { title: 'Troll', antal: 1 } })
  await run.projects.replace('p1', 2, third)
}

async function openEditor(): Promise<void> {
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

describe('the project\'s history in the editor (B4)', () => {
  it('opens from the revision, lists the versions newest first with when they were, and closes again', async () => {
    await withHistory()
    await openEditor()
    expect(screen.queryByRole('dialog', { name: 'Historik' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.getAttribute('data-rev'))).toEqual(['3', '2', '1'])
    expect(rows[0]!.textContent).toContain('Version 3')
    expect(rows[0]!.textContent).toMatch(/i dag|i går/)
    // The version the editor stands on says so.
    expect(rows[0]!.getAttribute('data-current')).toBe('true')

    fireEvent.click(within(panel).getByRole('button', { name: 'Stäng historiken' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Historik' })).toBeNull())
  })

  it('says what a version changed when it is opened, in words rather than as a patch', async () => {
    await withHistory()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    fireEvent.click(await within(panel).findByRole('button', { name: /Version 2/ }))
    expect(await within(panel).findByText(/1 ändrade/)).toBeTruthy()
    fireEvent.click(await within(panel).findByRole('button', { name: /Version 3/ }))
    expect(await within(panel).findByText(/1 nya kort/)).toBeTruthy()
  })

  it('names a version and takes the name back, without changing the game', async () => {
    await withHistory()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    fireEvent.click(await within(panel).findByRole('button', { name: /Version 2/ }))
    const field = await within(panel).findByLabelText('Namn på version 2')
    fireEvent.change(field, { target: { value: 'Första blindtestet' } })
    fireEvent.blur(field)
    await waitFor(async () => expect((await run.projects.versions('p1')).find((v) => v.rev === 2)?.label).toBe('Första blindtestet'))
    expect(await within(panel).findByText('Första blindtestet')).toBeTruthy()
    // The document did not move: naming is not an edit.
    expect((await run.projects.load('p1'))?.rev).toBe(3)
  })

  it('brings an older version back as an edit, which becomes the next version when saved', async () => {
    await withHistory()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })

    fireEvent.click(await within(panel).findByRole('button', { name: /Version 1/ }))
    fireEvent.click(await within(panel).findByRole('button', { name: 'Återställ version 1' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Historik' })).toBeNull())
    // The card is as it was in version 1, and the change is unsaved.
    expect(await screen.findByText('Drake')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(4))
    const stored = await run.projects.load('p1')
    expect(stored?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drake')
    // Nothing that came before was rewritten.
    expect((await run.projects.at('p1', 3))?.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')
  })
})

describe('holding the table against an older version (B4)', () => {
  it('starts the comparison from the history, opens the table on it, and lets it go again', async () => {
    await withHistory()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: /rev 3/ }))
    const panel = await screen.findByRole('dialog', { name: 'Historik' })
    fireEvent.click(await within(panel).findByRole('button', { name: /Version 1/ }))
    fireEvent.click(await within(panel).findByRole('button', { name: 'Jämför version 1 i tabellen' }))

    // The table opens, holding what is on screen against that version.
    await waitFor(() => expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('table'))
    expect(await screen.findByText(/Jämför med version 1/)).toBeTruthy()
    const dragon = document.querySelector('[data-card-ref="dragon"]')!
    expect(dragon.getAttribute('data-change')).toBe('changed')
    expect(within(dragon as HTMLElement).getByText('Drake', { selector: 's' })).toBeTruthy()
    expect(document.querySelector('[data-card-ref="troll"]')!.getAttribute('data-change')).toBe('added')

    fireEvent.click(screen.getByRole('button', { name: 'Sluta jämföra' }))
    await waitFor(() => expect(screen.queryByText(/Jämför med version/)).toBeNull())
    expect(document.querySelector('[data-card-ref="dragon"]')!.getAttribute('data-change')).toBeNull()
  })
})
