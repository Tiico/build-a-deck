// @vitest-environment jsdom
// A field arriving in the editor, all the way down (#32): through the real page, over a real
// socket, into a real actor and back out of the store. A column that only exists in a component's
// state is not a column — the question the issue asks is whether it is still there tomorrow.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openEditor(): Promise<void> {
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(
    <StatusLive>
      <EditorPage />
    </StatusLive>,
  )
  await screen.findByText('Skogens herrar')
}

const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))
const column = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name}[\\s↕↑↓×]*$`) })

async function makeField(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: '+ Nytt fält' }))
  const form = screen.getByRole('form', { name: 'Nytt fält' })
  await user.clear(within(form).getByLabelText('Namn'))
  await user.type(within(form).getByLabelText('Namn'), name)
  await user.click(within(form).getByRole('button', { name: 'Lägg till' }))
}

describe('a field made in the editor is a field the game has (#32, B4)', () => {
  it('is still there after a save and a reload, and is a version that can be taken back', async () => {
    const user = userEvent.setup()
    await run.projects.create('p1', projectDoc())
    await openEditor()
    openTab('Tabell')

    await makeField(user, 'styrka')
    expect(column('styrka')).toBeTruthy()
    // A cell of the new column is there to write in, on every card.
    await user.type(screen.getByLabelText('dragon styrka'), '7')

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await screen.findByText('rev 2')

    // What the server kept, not what the page remembers.
    const saved = await run.projects.load('p1')
    expect(saved?.rows.map((r) => r.fields['styrka'])).toEqual(['7', '', ''])

    // A fresh editor over the same project: the column is drawn from what was stored.
    cleanup()
    await openEditor()
    openTab('Tabell')
    await waitFor(() => expect(column('styrka')).toBeTruthy())
    expect((screen.getByLabelText('dragon styrka') as HTMLInputElement).value).toBe('7')

    // And it is an edit like any other: one step back and the column is gone again, named in the
    // words the designer reads rather than the verb's.
    await makeField(user, 'uthållighet')
    expect(column('uthållighet')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(await screen.findAllByText(/Tog tillbaka: ett fält i kortleken/)).not.toHaveLength(0)
    await waitFor(() => expect(column('uthållighet')).toBeNull())
    expect(column('styrka')).toBeTruthy()
  })

  it('can be chosen in the template\'s binding, and takes the element with it when it goes', async () => {
    const user = userEvent.setup()
    await run.projects.create('p1', projectDoc())
    await openEditor()
    openTab('Tabell')
    await makeField(user, 'styrka')

    // The template can now bind to it: the picker is drawn from the same columns the table is.
    openTab('Mall')
    await user.click(await screen.findByRole('option', { name: 'text title' }))
    const field = await waitFor(() => screen.getByLabelText('Fält') as HTMLSelectElement)
    expect([...field.options].map((o) => o.value)).toContain('styrka')
    await user.selectOptions(field, 'styrka')
    await waitFor(() => expect((screen.getByLabelText('Fält') as HTMLSelectElement).value).toBe('styrka'))

    // Taking the column away says what goes with it, and then takes the element that drew it too
    // — a template left binding a column that is not there would draw nothing on every card.
    openTab('Tabell')
    await user.click(screen.getByRole('button', { name: 'Ta bort fältet styrka' }))
    expect(screen.getByText('Ta bort styrka? Inget kort har ett värde i den. Elementet som visar den tas bort ur mallen.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    await waitFor(() => expect(column('styrka')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await screen.findByText('rev 2')
    const saved = await run.projects.load('p1')
    expect(saved?.rows.every((r) => !('styrka' in r.fields))).toBe(true)
    expect(saved?.template.faces['front']?.base.map((e) => e.id)).toEqual(['frame', 'body'])
  })
})
