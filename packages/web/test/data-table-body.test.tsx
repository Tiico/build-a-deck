// @vitest-environment jsdom
// Body-cellen i Data (#324, L39). Redigeraren är ett lager över #308:s delmängd — den skriver och
// läser samma sträng — och den stängda cellen visar formen i stället för tecknen som bär den.
//
// Höjderna mäts inte här: jsdom lägger ingenting ut. Taket och radhöjderna står i
// `data-table-body-height.test.tsx`, som ställer frågan till en riktig motor.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import { symbolName, type GameSymbol } from '../src/editor/symbols.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const withBody = (body: string) => {
  const doc = projectDoc()
  doc.rows[0]!.fields['body'] = body
  return doc
}

const table = (doc = projectDoc(), extra: Partial<Parameters<typeof DataTable>[0]> = {}) =>
  render(
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
      {...extra}
    />,
  )

// Att skriva i cellen, som en webbläsare gör det: den ändrar noderna och säger `input`, ett
// tecken i taget. jsdom har ingen redigeringsmotor bakom `contenteditable`, så en tangenttryckning
// där ändrar ingenting alls — och ett prov skrivet med `userEvent` vore grönt utan att betyda
// något. Det cellen gör med det den får är dess eget, och det är det som prövas här; vad Chromium
// själv hittar på inuti elementen står i `body-writing.test.ts`.
function skriv(cell: HTMLElement, text: string) {
  const p = cell.querySelector('p') ?? cell.appendChild(cell.ownerDocument.createElement('p'))
  p.textContent = text
  fireEvent.input(cell)
}

describe('den stängda body-cellen visar formen (L39)', () => {
  it('ritar fet, kursiv, stycken och punkter i stället för tecknen som bär dem', () => {
    table(withBody('**Fet** och *kursiv*.\n\n- ett\n- två'))
    const cell = screen.getByLabelText('dragon body')

    expect(within(cell).getByText('Fet').tagName).toBe('STRONG')
    expect(within(cell).getByText('kursiv').tagName).toBe('EM')
    expect(cell.querySelectorAll('p')).toHaveLength(1)
    expect([...cell.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['ett', 'två'])
    // Och tecknen som bar formen står inte kvar i det som ritas.
    expect(cell.textContent).not.toContain('**')
    expect(cell.textContent).not.toContain('- ')
  })
})

describe('verktygen står i den öppna cellens huvud (L39)', () => {
  it('har ingen rad alls medan cellen är stängd', () => {
    table(withBody('Flyger tyst.'))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('ställer raden i huvudet så fort cellen öppnas, som en tabbstopp med pilar mellan knapparna', () => {
    table(withBody('Flyger tyst.'))
    const cell = screen.getByLabelText('dragon body')
    fireEvent.focusIn(cell)

    const tools = screen.getByRole('toolbar', { name: 'Formatera' })
    // Huvudet säger vilket fält och vilket kort, och raden står i det. Den syns innan något
    // skrivits: verktygen är inte ett svar på att man börjat skriva.
    expect(tools.closest('.byd-data-bodyhead')?.querySelector('b')?.textContent).toBe('body · dragon')
    const buttons = within(tools).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Fet', 'Kursiv', 'Punktlista', 'Sätt in en ikon'])
    // Roving tabindex (APG): en tabbstopp in i raden, och pilarna flyttar inuti den.
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1])
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowRight' })
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1])
    fireEvent.keyDown(buttons[1]!, { key: 'ArrowLeft' })
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1])
  })

  it('låter aria-pressed följa markeringen', () => {
    table(withBody('**Fet** och rakt'))
    const cell = screen.getByLabelText('dragon body')
    fireEvent.focusIn(cell)
    const pressed = () =>
      within(screen.getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))
    // Knappen som inte är ett läge — symbolen — har inget `aria-pressed` att följa med.
    expect(pressed()).toEqual(['false', 'false', 'false', null])

    const fet = cell.querySelector('strong')!.firstChild!
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(fet, 1)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    fireEvent(document, new Event('selectionchange'))
    expect(pressed()).toEqual(['true', 'false', 'false', null])
  })
})

// Klammern i en body-cell (E4, L34). Det är samma bibliotek som i en vanlig cell och nås samma
// väg — `{` och sedan namnet — men vägen dit går genom `tillStrang`: cellen räknar i tecken och
// vet ingenting om noder, och det är den räkningen som säger var klammern står.
describe('vägen till verktygen med tangentbordet (#397, L39)', () => {
  // Granskningen läste det som en bugg: framåt-Tabb från skrivytan hoppar över alla fyra
  // verktygen. Den gör den, och det är rätt. L39 ställer raden i cellens **huvud**, alltså
  // ovanför skrivytan, och fokusordningen ska följa den ordning ögat läser i (WCAG 2.4.3) — samma
  // regel som #395 och #396 nyss rättade den här tabellen efter. Så vägen dit är bakåt, därför att
  // raden står före.
  //
  // I en vanlig textcell står ikonen efter fältet (#140) och nås framåt, av exakt samma skäl: den
  // står efter. Det är ordningen som är gemensam, inte tangenten — en hand som lär sig «verktyget
  // ligger dit det syns» har lärt sig båda. Beslut 2026-09-21; #397:s tredje kriterium är ändrat
  // efter det.
  it('når verktygsraden med Shift+Tabb från skrivytan, dit den syns stå', async () => {
    const hand = userEvent.setup()
    table(withBody('Flyger tyst.'))
    const cell = screen.getByLabelText('dragon body')
    fireEvent.focusIn(cell)
    cell.focus()

    await hand.tab({ shift: true })

    const tools = screen.getByRole('toolbar', { name: 'Formatera' })
    expect(tools.contains(document.activeElement)).toBe(true)
  }, JSDOM_TEST_BUDGET)

  it('har raden före skrivytan i dokumentet, så fokus går dit ögat går', () => {
    table(withBody('Flyger tyst.'))
    const cell = screen.getByLabelText('dragon body')
    fireEvent.focusIn(cell)

    const öppen = cell.closest('.byd-data-bodycell')!
    const tools = screen.getByRole('toolbar', { name: 'Formatera' })
    // Fyra i ordningen `compareDocumentPosition` är FOLLOWING: raden står före skrivytan.
    expect(tools.compareDocumentPosition(cell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(öppen.firstElementChild?.className).toBe('byd-data-bodyhead')
  }, JSDOM_TEST_BUDGET)
})

describe('symbollistan i body-cellen (E4)', () => {
  it('öppnas vid klammern, smalnar av med namnet, och skriver symbolen in i texten', async () => {
    const onCell = vi.fn()
    table(withBody('Flygande.'), { onCell, onSymbol: vi.fn(async (s: GameSymbol) => symbolName(s)) })
    const cell = screen.getByLabelText('dragon body')
    fireEvent.focusIn(cell)
    expect(screen.queryByRole('listbox')).toBeNull()

    skriv(cell, 'Flygande. {')
    const list = screen.getByRole('listbox', { name: 'Symboler' })
    expect(within(list).getAllByRole('option').length).toBeGreaterThan(3)

    skriv(cell, 'Flygande. {sköl')
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('sköld')])

    fireEvent.click(within(list).getAllByRole('option')[0]!)
    await waitFor(() => expect(onCell).toHaveBeenCalledWith('dragon', 'body', 'Flygande. {sköld}'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('lämnar en stängd klammer och en siffra i klammer i fred', () => {
    table(withBody('Flygande.'), { onSymbol: vi.fn(async (s: GameSymbol) => symbolName(s)) })
    const cell = screen.getByLabelText('dragon body')
    fireEvent.focusIn(cell)

    skriv(cell, 'Betala {2} för att anfalla.')
    expect(screen.queryByRole('listbox')).toBeNull()
    // En naken siffra är en pip (L2) och ingen symbol att slå upp.
    skriv(cell, 'Betala {2')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

// Att body-cellens väljare är **samma ruta** som den vanliga cellens (L34, #302 × L39, #324).
// Två skrivytor i samma flik med var sin symbolväljare är precis felet L34 stängde: rutan ska
// inte kunna komma att skilja sig åt mellan dem. Så det prövas inte som två listor med samma
// innehåll utan som samma element — ritat av samma kod, med samma listor, samma betydelsesteg
// och samma sträng i foten.
describe('samma ruta i body-cellen som i en vanlig cell (L34)', () => {
  const MEANINGS = { fara: '#8f2d20', vinst: '#2f6136' }
  const medBetydelser = (body: string) => ({ ...withBody(body), palette: MEANINGS })
  const box = () => screen.getByRole('group', { name: 'Infoga symbol' })

  it('öppnar rutan ur en skrivyta med exakt samma märkning som ur ett fält', () => {
    const doc = medBetydelser('Flygande.')
    table(doc, { onSymbol: vi.fn(async (s: GameSymbol) => symbolName(s)) })

    // Ur det vanliga fältet: klammern och namnet skrivs som i vilken cell som helst.
    const field = screen.getByLabelText('dragon title') as HTMLInputElement
    fireEvent.change(field, { target: { value: 'Skada {sköl', selectionStart: 11 } })
    const iFalt = box().outerHTML
    fireEvent.blur(field)

    // Ur skrivytan: samma klammer, samma namn — och rutan som kommer upp är densamma.
    const cell = screen.getByLabelText('dragon body')
    fireEvent.focusIn(cell)
    skriv(cell, 'Skada {sköl')
    expect(box().outerHTML).toBe(iFalt)
  })

  it('tar betydelsen i skrivytan och skriver samma sträng som fältet skriver', async () => {
    const onCell = vi.fn()
    table(medBetydelser('Flygande.'), { onCell, onSymbol: vi.fn(async (s: GameSymbol) => symbolName(s)) })
    const cell = screen.getByLabelText('dragon body')
    fireEvent.focusIn(cell)
    skriv(cell, 'Skada {sköl')

    // Betydelsesteget finns här av samma skäl som i fältet: spelet har namngivna betydelser.
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Symboler' })).getAllByRole('option')[0]!)
    expect(onCell).not.toHaveBeenCalledWith('dragon', 'body', expect.stringContaining('sköld'))
    const betydelser = within(screen.getByRole('listbox', { name: 'Betydelser' })).getAllByRole('option')
    expect(betydelser.map((o) => o.textContent)).toEqual(['Utan betydelse', 'fara', 'vinst'])
    // Foten säger strängen rutan skriver, och det är produktens egen syntax (E4).
    expect(within(box()).getByText('{sköld}')).toBeTruthy()

    fireEvent.click(betydelser[1]!)
    await waitFor(() => expect(onCell).toHaveBeenCalledWith('dragon', 'body', 'Skada {sköld|fara}'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('går från symbolen till betydelsen på tangenterna, med skrivytan pekande på den som är aktiv', async () => {
    const onCell = vi.fn()
    table(medBetydelser('Flygande.'), { onCell, onSymbol: vi.fn(async (s: GameSymbol) => symbolName(s)) })
    const cell = screen.getByLabelText('dragon body')
    fireEvent.focusIn(cell)
    skriv(cell, 'Skada {sköl')

    const symboler = screen.getByRole('listbox', { name: 'Symboler' })
    expect(cell.getAttribute('aria-activedescendant')).toBe(within(symboler).getAllByRole('option')[0]!.id)
    fireEvent.keyDown(cell, { key: 'Enter' })
    const betydelser = within(screen.getByRole('listbox', { name: 'Betydelser' })).getAllByRole('option')
    expect(cell.getAttribute('aria-activedescendant')).toBe(betydelser[0]!.id)
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(cell.getAttribute('aria-activedescendant')).toBe(betydelser[1]!.id)
    fireEvent.keyDown(cell, { key: 'Enter' })

    await waitFor(() => expect(onCell).toHaveBeenCalledWith('dragon', 'body', 'Skada {sköld|fara}'))
  })
})
