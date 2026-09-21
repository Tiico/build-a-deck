// @vitest-environment jsdom
// Tangentbordsvägen genom en cell (#33, #140, #395).
//
// `{ }` ritas bara i den cell som arbetas i — en knapp per cell är hundra stopp i tabbordningen,
// och det står skrivet vid knappen. Men «bara i cellen som arbetas i» räknades på att **fältet**
// har fokus, och en Tabb till knappen tar fokus från fältet. Knappen försvann alltså i samma
// ögonblick som den tog emot fokus, och fokus föll ur dokumentet: `document.activeElement` blev
// `<body>`, och nästa Tabb började om från sidans topp.
//
// Två krav, och det är samma fix som bär båda: knappen ska gå att nå med tangentbordet, och en
// vandring genom en rad ska aldrig landa på `<body>`. Editorns a11y är inte mjukad (L12).
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Vägen till en ikon finns bara när projektet kan ta emot en (E4); utan `onSymbol` är en klammer
// i en cell bara en klammer, och då finns ingen knapp att nå.
const table = (extra: Partial<Parameters<typeof DataTable>[0]> = {}) =>
  render(
    <DataTable
      doc={projectDoc()}
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
      {...extra}
    />,
  )

// Var fokus står, sagt så att ett misslyckande namnger stället i stället för att räkna upp noder.
const at = () => {
  const el = document.activeElement
  if (!el || el === document.body) return '<body>'
  const cell = el.closest('td')?.getAttribute('data-col')
  return `${el.tagName.toLowerCase()}${el.className ? `.${el.className.split(' ')[0]}` : ''}${cell ? ` [${cell}]` : ''}`
}

describe('en Tabb ur en cell landar aldrig utanför dokumentet (#395)', () => {
  it('flyttar fokus från fältet till cellens egen ikonknapp, som står kvar när den har det', async () => {
    const user = userEvent.setup()
    table()
    await user.click(screen.getByLabelText('dragon title'))
    await user.tab()
    expect(at()).toBe('button.byd-data-icon [title]')
  })

  it('går vidare från ikonknappen in i nästa cell, och lämnar ingen knapp kvar i cellen den lämnade', async () => {
    const user = userEvent.setup()
    table()
    await user.click(screen.getByLabelText('dragon title'))
    await user.tab()
    await user.tab()
    expect(at()).toBe('div.byd-data-body [body]')
    // Knappen ritas bara i cellen som arbetas i (#33). En cell man gått ifrån arbetas inte i.
    expect(document.querySelectorAll('.byd-data-icon')).toHaveLength(0)
  })

  // Och när avfärden går någon annanstans än till nästa cell, som inte råkar skriva över vem som
  // står var: då är det knappens egen avfärd som måste räknas, och ingen annans.
  it('tar med sig knappen när fokus lämnar tabellen från knappen själv', async () => {
    const user = userEvent.setup()
    table()
    await user.click(screen.getByLabelText('dragon title'))
    await user.tab()
    expect(at()).toBe('button.byd-data-icon [title]')
    await user.click(screen.getByRole('button', { name: '+ Nytt kort' }))
    expect(document.querySelectorAll('.byd-data-icon')).toHaveLength(0)
  })

  // Att nå knappen är ingenting värt om den inte går att trycka på därifrån.
  it('skriver klammern när knappen trycks med tangentbordet, precis som när den klickas', async () => {
    const user = userEvent.setup()
    const wrote: string[] = []
    table({ onCell: (_cardRef, _field, value) => wrote.push(String(value)) })
    await user.click(screen.getByLabelText('dragon title'))
    await user.tab()
    await user.keyboard('{Enter}')
    expect(wrote).toEqual(['Drake{'])
  })

  // Och hela vandringen: inget steg genom en rad får lämna dokumentet.
  it('passerar bara riktiga kontroller på vägen genom en rad', async () => {
    const user = userEvent.setup()
    table()
    await user.click(screen.getByLabelText('dragon title'))
    const seen: string[] = []
    for (let step = 0; step < 8; step++) {
      await user.tab()
      seen.push(at())
    }
    expect(seen).not.toContain('<body>')
  })
})
