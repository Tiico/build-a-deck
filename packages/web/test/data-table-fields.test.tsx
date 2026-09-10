// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { applyEdit } from '@byd/server/doc'
import { Language } from '../src/i18n/index.js'
import { DataTable } from '../src/editor/DataTable.js'
import type { ProjectDoc, ProjectRow } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'

// The table doing its own work: every edit it asks for is applied by the one pure function the
// actor applies it with, and the answer goes straight back into the document the table is drawn
// from. So a new column is seen where it will stand rather than only in a spy's log.
function Editing({ doc: initial = projectDoc() }: { doc?: ProjectDoc }) {
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
      onAddField={(field) => setDoc((current) => applyEdit(current, { v: 'addField', field }))}
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

    await user.click(screen.getByRole('button', { name: '+ Nytt fält' }))
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))

    expect(column('fält1')).toBeTruthy()
  })

  it('refuses a name the table already answers to, and says which one it is', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.click(screen.getByRole('button', { name: '+ Nytt fält' }))
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

  it('says what a column takes with it — the value on every card — before it takes it', async () => {
    const user = userEvent.setup()
    render(<Editing />)

    await user.click(screen.getByRole('button', { name: 'Ta bort fältet body' }))
    expect(screen.getByText('Ta bort body? Värdet försvinner på 3 kort.')).toBeTruthy()
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
    await user.click(screen.getByRole('button', { name: '+ Nytt fält' }))
    await user.click(screen.getByRole('button', { name: 'Lägg till' }))

    await user.click(screen.getByRole('button', { name: 'Ta bort fältet fält1' }))
    expect(screen.getByText('Ta bort fält1? Inget kort har ett värde i den.')).toBeTruthy()
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
    await user.click(screen.getByRole('button', { name: '+ New field' }))
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
    await user.click(screen.getByRole('button', { name: '+ New field' }))
    const second = screen.getByRole('form', { name: 'New field' })
    await user.clear(within(second).getByLabelText('Name'))
    await user.type(within(second).getByLabelText('Name'), 'styrka')
    await user.click(within(second).getByRole('radio', { name: 'Number' }))
    expect((within(second).getByLabelText('Name') as HTMLInputElement).value).toBe('styrka')
    await user.click(within(second).getByRole('button', { name: 'Add' }))
    expect(column('styrka')).toBeTruthy()
  })
})
