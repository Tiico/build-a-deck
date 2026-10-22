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
import { layerPick } from './layers.js'
import { ProjectClient, setEditSocketImplementation, type EditSocketCtor } from '../src/editor/ProjectClient.js'
import { EditSocket } from './setup.js'
import { SavedHeldBack } from './saved-held-back.js'
import { answerStart } from './start-answer.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openEditor(): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
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
  await user.click(screen.getByRole('button', { name: 'Kolumner' }))
  const form = screen.getByRole('form', { name: 'Nytt fält' })
  await user.clear(within(form).getByLabelText('Namn'))
  await user.type(within(form).getByLabelText('Namn'), name)
  await user.click(within(form).getByRole('button', { name: 'Lägg till' }))
}

describe('a field made in the editor is a field the game has (#32, B4)', () => {
  it('is still there after a save and a reload, and is a version that can be taken back', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    await openEditor()
    openTab('Tabell')

    await makeField(user, 'styrka')
    expect(column('styrka')).toBeTruthy()
    // A cell of the new column is there to write in, on every card.
    await user.type(screen.getByLabelText('dragon styrka'), '7')

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await screen.findByText('v2')

    // What the server kept, not what the page remembers.
    const saved = await run.projects.load(run.projectId)
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
    await run.projects.create(run.projectId, projectDoc())
    await openEditor()
    openTab('Tabell')
    await makeField(user, 'styrka')

    // The template can now bind to it: the picker is drawn from the same columns the table is.
    openTab('Mall')
    await user.click(await waitFor(() => layerPick('title')))
    const field = await waitFor(() => screen.getByLabelText('Visar fältet') as HTMLSelectElement)
    expect([...field.options].map((o) => o.value)).toContain('styrka')
    await user.selectOptions(field, 'styrka')
    await waitFor(() => expect((screen.getByLabelText('Visar fältet') as HTMLSelectElement).value).toBe('styrka'))

    // Taking the column away says what goes with it, and then takes the element that drew it too
    // — a template left binding a column that is not there would draw nothing on every card.
    openTab('Tabell')
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Ta bort fältet styrka' }))
    expect(screen.getByText('Ta bort styrka? Inget kort har ett värde i den. Elementet som visar den tas bort ur mallen.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    await waitFor(() => expect(column('styrka')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await screen.findByText('v2')
    const saved = await run.projects.load(run.projectId)
    expect(saved?.rows.every((r) => !('styrka' in r.fields))).toBe(true)
    expect(saved?.template.faces['front']?.base.map((e) => e.id)).toEqual(['frame', 'body'])
  })

  // The canvas door makes a column and binds the element to it, and the designer did one thing.
  // Two edits down the socket would be two versions and two steps back — and the first step back
  // would leave a state she never asked for and cannot read: the new column standing in the table
  // with the element bound to the field it had before. So it goes as one edit (B4).
  it('makes the column and binds the element in one edit, and one step back takes both', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    await openEditor()

    openTab('Mall')
    await user.click(await waitFor(() => layerPick('title')))
    const field = await waitFor(() => screen.getByLabelText('Visar fältet') as HTMLSelectElement)
    await user.selectOptions(field, within(field).getByRole('option', { name: 'nytt fält…' }))
    const form = screen.getByRole('form', { name: 'Nytt fält' })
    await user.clear(within(form).getByLabelText('Namn'))
    await user.type(within(form).getByLabelText('Namn'), 'styrka')
    await user.click(within(form).getByRole('button', { name: 'Lägg till' }))

    // Both halves happened: the element shows the new column, and the table has it.
    await waitFor(() => expect((screen.getByLabelText('Visar fältet') as HTMLSelectElement).value).toBe('styrka'))
    openTab('Tabell')
    await waitFor(() => expect(column('styrka')).toBeTruthy())

    // And one press takes both halves back, together. Not the binding first and the column after.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(await screen.findAllByText(/Tog tillbaka: ett fält i kortleken/)).not.toHaveLength(0)
    await waitFor(() => expect(column('styrka')).toBeNull())
    openTab('Mall')
    await waitFor(() => expect((screen.getByLabelText('Visar fältet') as HTMLSelectElement).value).toBe('title'))

    // And one step forward brings both halves back together, which is the same fact said from the
    // other side: it is one step of the stack, not two.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(await screen.findAllByText(/Gjorde om: ett fält i kortleken/)).not.toHaveLength(0)
    await waitFor(() => expect((screen.getByLabelText('Visar fältet') as HTMLSelectElement).value).toBe('styrka'))
    openTab('Tabell')
    expect(column('styrka')).toBeTruthy()
  })
  // Where a column stands is the document's (#46), so it has to make the same journey a column
  // itself makes: through the real page, over a real socket, into the actor, out of the store and
  // back onto a page that was never told. A move that only reordered a component's state would
  // pass every test in `data-table-order` and be gone by the next reload.
  it('moves a column all the way down: the order is saved, read back, and taken back by one step', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    await openEditor()
    openTab('Tabell')

    const order = () => Array.from(document.querySelectorAll('thead th[data-col]')).map((th) => th.getAttribute('data-col'))
    expect(order()).toEqual(['id', 'antal', 'title', 'body'])

    // Alt and an arrow, which is the same move the drag makes and the one a test can make.
    const heading = document.querySelector('thead th[data-col="body"] button') as HTMLButtonElement
    heading.focus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    await waitFor(() => expect(order()).toEqual(['id', 'antal', 'body', 'title']))

    // It is an edit like any other: one step back puts the column where it stood, named in the
    // words the designer reads rather than in the verb's. Asked here and not after the reload,
    // because the stack lives in the tab and never claimed to survive one — the history is what
    // survives (B4), and it is a different thing.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(await screen.findAllByText(/Tog tillbaka: ett fält i kortleken/)).not.toHaveLength(0)
    await waitFor(() => expect(order()).toEqual(['id', 'antal', 'title', 'body']))

    heading.focus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    await waitFor(() => expect(order()).toEqual(['id', 'antal', 'body', 'title']))
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await screen.findByText(/v[23]/)
    // What the server kept, and in the form the document keeps it in: an order, not a list.
    expect((await run.projects.load(run.projectId))?.columns).toEqual(['body', 'title', 'antal'])

    // A fresh editor over the same project, which has never seen the move happen.
    cleanup()
    await openEditor()
    openTab('Tabell')
    await waitFor(() => expect(order()).toEqual(['id', 'antal', 'body', 'title']))
  })
})

// Bo names a column in the moment Ada names the same one with other capitals (#993). The actor
// folds such a name into the column it has (#694) and refuses Bo's, and Bo's editor has to let go
// of it: kept, it stood beside Ada's on his table under an «Osparat» no save could take away, and
// nothing said that the column he made had not been taken.
describe('a column the actor refuses because a colleague named it first (#993)', () => {
  afterEach(() => setEditSocketImplementation(EditSocket as unknown as EditSocketCtor))

  const REFUSED = 'En ändring gick inte att göra och har tagits bort. Spelet visar nu samma sak för alla.'

  // Bo's requests are held on their way out while he makes «Kraft», and presses `pressed` if he
  // presses something; Ada names «kraft» and saves; and Bo's requests leave after hers. Every
  // frame the actor sends arrives in the order it was sent. With a press, every «saved» is also
  // held on the way in until the test lets it through, so the press is certain to be answered
  // after the refusal has been said rather than merely likely to be.
  async function behindAda(pressed?: (user: ReturnType<typeof userEvent.setup>) => Promise<void>): Promise<SavedHeldBack> {
    const user = userEvent.setup()
    await run.projects.create(run.projectId, projectDoc())
    const line = new SavedHeldBack()
    if (!pressed) line.release()
    setEditSocketImplementation(line.Line)
    await openEditor()
    await waitFor(() => expect(line.heard).toContain('project'))
    setEditSocketImplementation(EditSocket as unknown as EditSocketCtor)
    const ada = await ProjectClient.open({ http: run.http, id: run.projectId, name: 'Ada' })
    try {
      await waitFor(() => expect(ada.connected).toBe(true))
      openTab('Tabell')
      line.holdRequests()
      await makeField(user, 'Kraft')
      await pressed?.(user)
      ada.addField('kraft')
      expect(await ada.save()).toEqual({ ok: true, rev: 2 })
      await waitFor(() => expect(pressed ? line.waiting : line.heard.filter((v) => v === 'saved').length).toBe(1))
      line.letOut()
      await waitFor(() => expect(line.heard).toContain('refused'))
      // Bo's own save has been answered as well, and the answer is waiting at the door.
      if (pressed) await waitFor(() => expect(line.waiting).toBe(2))
    } finally {
      ada.close()
    }
    return line
  }

  it('is taken off the editor again, and the editor says the change did not go through', async () => {
    await behindAda()
    const said = await screen.findByText(REFUSED)
    expect(said.closest('[role="alert"]')).not.toBeNull()
    await waitFor(() => expect(column('Kraft')).toBeNull())
    expect(column('kraft')).not.toBeNull()
    expect(screen.getByText('Sparat').closest('[role="status"]')).not.toBeNull()
  })

  // A save pressed right behind the column is answered after the refusal, and a save that went
  // through put every notice away: the column vanished without a word, which is what #993 was
  // there to stop (#996). A save puts away what stood when it was pressed, and nothing said since.
  it('is still said once a save pressed behind it has gone through', async () => {
    const line = await behindAda(async (user) => {
      await user.click(screen.getByRole('button', { name: 'Spara' }))
    })
    await screen.findByText(REFUSED)
    line.release()
    // The save is over: its button says «Spara» again, and has nothing left to save.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Spara' }).getAttribute('aria-disabled')).toBe('true'))
    expect(screen.getByText('Sparat').closest('[role="status"]')).not.toBeNull()
    expect(screen.getByText(REFUSED).closest('[role="alert"]')).not.toBeNull()
    expect(column('Kraft')).toBeNull()
  })

  // «Starta bord» saves before it starts, and a table that started put every notice away the same
  // way (#996).
  it('is still said once a table started behind it is running', async () => {
    const line = await behindAda(async (user) => {
      await user.click(screen.getByRole('button', { name: 'Starta bord' }))
      await answerStart()
    })
    await screen.findByText(REFUSED)
    line.release()
    await screen.findByText(/startade ett nytt bord|Nytt bord startat/)
    expect(screen.getByText(REFUSED).closest('[role="alert"]')).not.toBeNull()
    expect(column('Kraft')).toBeNull()
  })
})
