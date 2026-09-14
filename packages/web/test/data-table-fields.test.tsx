// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { applyEdit } from '@byd/server/doc'
import { Language } from '../src/i18n/index.js'
import { DataTable } from '../src/editor/DataTable.js'
import type { ProjectDoc, ProjectRow } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The table doing its own work: every edit it asks for is applied by the one pure function the
// actor applies it with, and the answer goes straight back into the document the table is drawn
// from. So a new column is seen where it will stand rather than only in a spy's log.
// `asked` is every field the table asked for, in order, so a test can tell a refusal that never
// asked from one that asked and got nothing back. The difference is the whole of #32's "with a
// word about why, not in silence": an edit that reaches the client is a version and a step of the
// undo stack whether or not it changed anything.
function Editing({ doc: initial = projectDoc(), asked }: { doc?: ProjectDoc; asked?: string[] }) {
  const [doc, setDoc] = useState(initial)
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={(rows: ProjectRow[]) => setDoc((current) => ({ ...current, rows }))}
      onAddField={(field) => {
        asked?.push(field)
        setDoc((current) => applyEdit(current, { v: 'addField', field }))
      }}
      onRemoveField={(field) => setDoc((current) => applyEdit(current, { v: 'removeField', field }))}
    />
  )
}

// A column is a sort control with the field's name on it (#15), so that is what says whether the
// table has the column at all.
const column = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name}[\\s↕↑↓×]*$`) })

describe('a field arrives in the editor (#32)', () => {
  it('grows the column where the button stands, with no wizard and no CSV file in the way', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    expect(column('fält1')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))

    expect(column('fält1')).toBeTruthy()
  })

  it('refuses a name the table already answers to, and says which one it is', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    const name = screen.getByLabelText('Namn')

    await user.clear(name)
    await user.type(name, 'title')
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(screen.getByRole('alert').textContent).toBe('Det finns redan ett fält som heter title.')
    // Nothing happened to the deck: `title` is one column and still holds what it held.
    expect(screen.getAllByRole('columnheader').filter((h) => /^title/.test(h.textContent ?? ''))).toHaveLength(1)
    expect(screen.getByDisplayValue('Drake')).toBeTruthy()

    // `antal` is the engine's own column (L4) and is refused by the same sentence: it is a name
    // the table already answers to, whatever else it is.
    await user.clear(name)
    await user.type(name, 'antal')
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(screen.getByRole('alert').textContent).toBe('Det finns redan ett fält som heter antal.')

    // And a field with no name at all is not a field.
    await user.clear(name)
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(screen.getByRole('alert').textContent).toBe('Ett fält behöver ett namn.')
    expect(screen.getByRole('form', { name: 'Nytt fält' })).toBeTruthy()
  })

  // A column is a key written onto every card, so a deck with no cards has nowhere to keep one and
  // the add is a no-op: the form closes, a version is written, a step goes on the undo stack, and
  // the table looks exactly as it did. Every card can be deleted — by the row's × or in bulk — so
  // this is a deck a designer can be standing in front of, not a state only a test can reach.
  it('refuses a column on a deck with no cards, rather than closing the form on nothing', async () => {
    const user = userEvent.setup()
    const asked: string[] = []
    render(<Editing doc={{ ...projectDoc(), rows: [] }} asked={asked} />)

    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))

    expect(screen.getByRole('alert').textContent).toBe('Ett fält är en kolumn på korten. Lägg till ett kort först.')
    // Refused the way a taken name is: the form stands open with the name still in it, so the
    // answer is to make a card and press the button again rather than to start over.
    expect(screen.getByRole('form', { name: 'Nytt fält' })).toBeTruthy()
    expect((screen.getByLabelText('Namn') as HTMLInputElement).value).toBe('fält1')
    // And nothing was asked of the document. An edit that reaches the client is a version and a
    // step to take back even when it changes nothing, which is the silence #32 forbids.
    expect(asked).toEqual([])
    expect(column('fält1')).toBeNull()
  })

  it('says what a column takes with it — the value on every card — before it takes it', async () => {
    const user = userEvent.setup()
    render(<Editing />)

    // The values are what the criterion asks the question to name, and they are named. But the
    // template draws `body` too, and the element that draws it goes with the column — a template
    // binding a column that is not there would draw nothing on every card — so the question says
    // that as well rather than doing it quietly. The × itself is behind the head's own door,
    // where everything the table says about its columns as columns is said (#46).
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Ta bort fältet body' }))
    expect(screen.getByText('Ta bort body? Värdet försvinner på 3 kort. Elementet som visar den tas bort ur mallen.')).toBeTruthy()
    // The question is a question: saying no leaves the column exactly where it was.
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(column('body')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Ta bort fältet body' }))
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    expect(column('body')).toBeNull()
    expect(screen.queryByDisplayValue('Flygande.')).toBeNull()

    // `antal` is the engine's own column and is not the designer's to take away (L4); neither is
    // the card's id. Both are columns; neither has an ×.
    expect(screen.queryByRole('button', { name: 'Ta bort fältet antal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ta bort fältet id' })).toBeNull()
    expect(column('antal')).toBeTruthy()
  })

  it('counts an empty column as what it is: nothing to lose', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))

    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Ta bort fältet fält1' }))
    expect(screen.getByText('Ta bort fält1? Inget kort har ett värde i den.')).toBeTruthy()
  })

  // A question that takes the focus has to give it back (#8). Where back is depends on the
  // answer: to the × that asked, or — when what it asked about is gone with it — to the button
  // that would make a column, which is the only thing left in the head that was not there before.
  it('hands the focus back where the question was asked from, and to the head when the column has gone', async () => {
    const user = userEvent.setup()
    render(<Editing />)

    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Namn'))
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kolumner' }))

    // Saying yes takes the focus away just as saying no does — the button that was pressed
    // unmounts with the form — and it has to come back to the same place. Only the cancel path
    // was ever asserted, so a designer who made a column with the keyboard was left on `<body>`
    // and had to tab in from the top of the page to make a second one.
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(column('fält1')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kolumner' }))

    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Ta bort fältet body' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Avbryt' }))
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ta bort fältet body' }))

    await user.click(screen.getByRole('button', { name: 'Ta bort fältet body' }))
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kolumner' }))
  })

  // The boundary A4 draws, and #27 drew again for exactly this case: what the tool *says* follows
  // the reader, what the tool *suggests as a key* does not. Two designers pressing the same
  // button in different languages must get the same column, or one of them would bind `bild1` in
  // the template and the other `image1`.
  it('says the form in the reader\'s language and suggests a key in neither', async () => {
    const user = userEvent.setup()
    render(
      <Language lang="en">
        <Editing />
      </Language>,
    )
    await user.click(screen.getByRole('button', { name: 'Columns' }))
    const form = screen.getByRole('form', { name: 'New field' })
    const name = () => within(form).getByLabelText('Name') as HTMLInputElement
    expect(within(form).getByRole('button', { name: 'Add' })).toBeTruthy()
    expect(name().value).toBe('fält1')

    // The kind is the wizard's three, in the reader's words; the key it suggests is the wizard's.
    expect(within(form).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['Text', 'Number', 'Image'])
    await user.click(within(form).getByRole('radio', { name: 'Image' }))
    expect(name().value).toBe('bild1')

    await user.click(within(form).getByRole('button', { name: 'Add' }))
    expect(column('bild1')).toBeTruthy()
    // And a designer who writes her own word gets hers, kind or no kind.
    await user.click(screen.getByRole('button', { name: 'Columns' }))
    const second = screen.getByRole('form', { name: 'New field' })
    await user.clear(within(second).getByLabelText('Name'))
    await user.type(within(second).getByLabelText('Name'), 'styrka')
    await user.click(within(second).getByRole('radio', { name: 'Number' }))
    expect((within(second).getByLabelText('Name') as HTMLInputElement).value).toBe('styrka')
    await user.click(within(second).getByRole('button', { name: 'Add' }))
    expect(column('styrka')).toBeTruthy()
  })
})
// Where a column is taken away (#46 on #32). The × used to stand on the column's own heading, and
// the heading paid for it: two 44 px targets do not fit in a column a number wide, so the heading
// handed them out in turn, the × lay over the right 44 px of the sort control in its own ground,
// and in a `cost` column of 64 the part of the sort control a thumb could still reach was ten
// pixels. None of that arithmetic is about taking a column away; it is about where the control
// stood. The head's own door already knows about columns — it is where one is made — so it is
// where one is taken away, and the heading goes back to being the column's name and the way it
// sorts, which is all a heading that can also be dragged and pulled has room to be.
describe('the door the head keeps for its columns (#46 on #32)', () => {
  const heads = () => Array.from(document.querySelectorAll('thead th[data-col]')) as HTMLElement[]

  it('keeps every column behind one door, and leaves the heading nothing but its name', async () => {
    const user = userEvent.setup()
    render(<Editing />)

    // At rest there is no × anywhere in the head, and none of the headings carries a control
    // besides the one that sorts it.
    expect(screen.queryByRole('button', { name: 'Ta bort fältet body' })).toBeNull()
    expect(document.querySelectorAll('thead .byd-data-dropfield')).toHaveLength(0)
    expect(document.querySelectorAll('thead .byd-data-system')).toHaveLength(0)
    expect(heads().every((th) => th.querySelectorAll('button').length === 1)).toBe(true)

    // The door names the columns in the order the table shows them, the card's own id included:
    // it is a column of the table without being a field of a card, and the list is about the
    // table's columns.
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    const panel = screen.getByRole('group', { name: 'Kolumner' })
    expect(within(panel).getAllByRole('listitem').map((li) => li.getAttribute('data-col'))).toEqual(['id', 'title', 'body', 'antal'])

    // The designer's own columns can go from here, and the two that are the tool's cannot — with
    // the reason written beside them rather than a hole where the × of the others is.
    expect(within(panel).getByRole('button', { name: 'Ta bort fältet body' })).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Ta bort fältet antal' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Ta bort fältet id' })).toBeNull()
    expect(within(panel).getByText('antal är verktygets egen kolumn och kan inte tas bort')).toBeTruthy()
    expect(within(panel).getByText('id är verktygets egen kolumn och kan inte tas bort')).toBeTruthy()
  })

  it('asks the same question it always asked, and takes the column when it is answered', async () => {
    const user = userEvent.setup()
    render(<Editing />)

    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Ta bort fältet body' }))
    expect(screen.getByText('Ta bort body? Värdet försvinner på 3 kort. Elementet som visar den tas bort ur mallen.')).toBeTruthy()

    // Saying no leaves the column where it was, and leaves the door open — the question was asked
    // from inside it, and the × that asked has to be there to take the focus back.
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(column('body')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ta bort fältet body' }))

    await user.click(screen.getByRole('button', { name: 'Ta bort fältet body' }))
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    expect(column('body')).toBeNull()
    // And what is gone is gone from the list as well as from the table.
    expect(screen.queryByRole('button', { name: 'Ta bort fältet body' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kolumner' }))
  })

  it('is the same door a column is made at: the form stands under the list', async () => {
    const user = userEvent.setup()
    render(<Editing />)

    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(column('fält1')).toBeTruthy()

    // And the new column is in the list, with the × the designer's own columns have.
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    expect(screen.getByRole('button', { name: 'Ta bort fältet fält1' })).toBeTruthy()
  })
})
