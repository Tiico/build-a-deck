// @vitest-environment jsdom
// Ikonfliken erbjuds bara i kolumner där en symbol kan stå (#1370).
//
// Fliken står kvar där den står (#593, #693) och täcker ett hörn av cellen ovanför. I en smal
// kolumn som bara håller tal är det det mesta av cellen, för en knapp som där inte har något att
// göra. Vad en talkolumn är avgörs av samma läsning som sorteringen och bredden redan gör
// (`columnKind`): varje ifylld cell är ett tal. En kolumn där en enda cell har en symbol, som
// `{mynt} 3`, är text, och där finns fliken.
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'

const doc = () => {
  const base = projectDoc()
  const extra: Record<string, Record<string, string | number>> = {
    dragon: { pris: 3, kostnad: '{mynt} 3' },
    knight: { pris: '2', kostnad: '2' },
    wizard: { pris: 4, kostnad: 1 },
  }
  return { ...base, rows: base.rows.map((row) => ({ ...row, fields: { ...row.fields, ...extra[row.id] } })) }
}

const table = () =>
  render(
    <DataTable
      doc={doc()}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
      onSymbol={async () => 'sol'}
    />,
  )

const tabs = () => document.querySelectorAll('.byd-data-icon')

describe('ikonfliken i Tabell (#1370)', () => {
  it('finns i en textkolumn', async () => {
    const user = userEvent.setup()
    table()
    await user.click(screen.getByLabelText('knight title'))
    expect(tabs()).toHaveLength(1)
  })

  it('saknas i en kolumn där varje ifylld cell är ett tal', async () => {
    const user = userEvent.setup()
    table()
    await user.click(screen.getByLabelText('knight pris'))
    expect(tabs()).toHaveLength(0)
    // Och Tabb går rakt vidare till nästa cell, utan ett stopp på en knapp som inte finns.
    await user.tab()
    expect(document.activeElement?.closest('td')?.getAttribute('data-col')).not.toBe('pris')
  })

  it('finns i en kolumn där en cell har en symbol, också i en cell som bara håller ett tal', async () => {
    const user = userEvent.setup()
    table()
    await user.click(screen.getByLabelText('knight kostnad'))
    expect(tabs()).toHaveLength(1)
  })
})
