// @vitest-environment jsdom
// «Höjden föreslår, designern avgör» (L43, #362). Rutans höjd i mallen sätter förvalet för vilken
// kolumn som får L39:s riktextredigerare, men valet står skrivet per kolumn i Data och går att
// vända.
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DataTable } from '../src/editor/DataTable.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

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
      onProse={() => undefined}
      {...extra}
    />,
  )

// En skrivyta är ett `role="textbox"`; en vanlig cell är ett `<input>`. Cellens namn är detsamma
// i båda fallen, så frågan «vad är den här cellen» ställs till elementet och inte till namnet.
const cell = (label: string) => screen.getByLabelText(label)

describe('ett uttryckligt val väger över höjden (L43)', () => {
  it('ger ingen skrivyta åt en kolumn vars ruta rymmer två rader när designern sagt nej', () => {
    const doc = projectDoc()
    doc.prose = { body: false }
    table(doc)
    expect(cell('dragon body').tagName).toBe('INPUT')
  })

  it('ger en skrivyta åt en kolumn vars ruta inte rymmer två rader när designern sagt ja', () => {
    const doc = projectDoc()
    doc.prose = { title: true }
    table(doc)
    expect(cell('dragon title').getAttribute('role')).toBe('textbox')
  })
})

// Det enskilt viktigaste provet i #362: regeln som var hela sanningen före valet är kvar som
// förval, så ingen befintlig lek byter utseende av att valet finns.
describe('en kolumn utan uttryckligt val följer höjden precis som förut (L43)', () => {
  it('låter höjdens förslag stå oemotsagt i ett dokument som inte har någon post alls', () => {
    const doc = projectDoc()
    expect(doc.prose).toBeUndefined()
    table(doc)
    // `body` är 40 mm för 9 pt och är prosa; `title` är 10 mm för 14 pt och är det inte.
    expect(cell('dragon body').getAttribute('role')).toBe('textbox')
    expect(cell('dragon title').tagName).toBe('INPUT')
  })

  it('rör inte de kolumner som inte nämns när en annan kolumn har ett val', () => {
    const doc = projectDoc()
    doc.prose = { title: true }
    table(doc)
    expect(cell('dragon body').getAttribute('role')).toBe('textbox')
  })
})

// Följden som fällde dagens regel: när valet en gång är skrivet är det designerns, inte höjdens.
describe('att ändra rutans höjd i mallen ändrar inte ett uttryckligt val (L43)', () => {
  // Mallen ritad om: `body` krymper till en rad och `title` växer till flera.
  const omritad = () => {
    const doc = projectDoc()
    const base = doc.template.faces['front']!.base
    const box = (id: string) => {
      const el = base.find((candidate) => candidate.id === id)
      if (!el || el.kind !== 'text') throw new Error(`no text element ${id}`)
      return el
    }
    box('title').h = 40
    box('body').h = 4
    return doc
  }

  it('låter höjden vända en kolumn som aldrig fått ett val', () => {
    table(omritad())
    expect(cell('dragon title').getAttribute('role')).toBe('textbox')
    expect(cell('dragon body').tagName).toBe('INPUT')
  })

  it('lämnar båda valen där designern lade dem när samma ruta ritas om', () => {
    const doc = omritad()
    doc.prose = { title: false, body: true }
    table(doc)
    // Höjden säger nu tvärtemot båda valen, och båda valen står kvar.
    expect(cell('dragon title').tagName).toBe('INPUT')
    expect(cell('dragon body').getAttribute('role')).toBe('textbox')
  })
})

// Skillnaden mellan förval och val bärs i form — prickad mot ifylld — och formen finns inte för
// en skärmläsare. Så utfällningens *namn* bär samma skillnad i ord (L12, L43).
const head = (field: string) => document.querySelector(`thead th[data-col="${field}"]`) as HTMLElement
const dot = (field: string) => head(field).querySelector('.byd-prose-mark') as HTMLElement
const reach = (field: string) => fireEvent.pointerEnter(head(field))

describe('märket säger vad kolumnen är och vem som sade det (L43)', () => {
  it('säger «höjden föreslog» om en kolumn som aldrig fått ett val', () => {
    table()
    reach('body')
    expect(screen.getByRole('group', { name: 'body skrivs som prosa, höjden föreslog' })).toBeTruthy()
    fireEvent.pointerLeave(head('body'))
    reach('title')
    expect(screen.getByRole('group', { name: 'title skrivs som vanlig text, höjden föreslog' })).toBeTruthy()
  })

  it('säger «du valde» om en kolumn designern har svarat för, åt båda hållen', () => {
    const doc = projectDoc()
    doc.prose = { body: false, title: true }
    table(doc)
    reach('body')
    expect(screen.getByRole('group', { name: 'body skrivs som vanlig text, du valde' })).toBeTruthy()
    fireEvent.pointerLeave(head('body'))
    reach('title')
    expect(screen.getByRole('group', { name: 'title skrivs som prosa, du valde' })).toBeTruthy()
  })

  it('bär skillnaden i form också, så den syns utan att läsas', () => {
    const doc = projectDoc()
    doc.prose = { body: true }
    table(doc)
    expect(dot('body').dataset['from']).toBe('choice')
    expect(dot('body').dataset['prose']).toBe('true')
    expect(dot('title').dataset['from']).toBe('height')
    expect(dot('title').dataset['prose']).toBe('false')
  })

  it('är ingen kontroll i vila: en prick på sex pixlar kan inte vara en träffyta (L12)', () => {
    table()
    // Det är samma räkning som fällde variant A. Det som *är* kontroller — knapparna som vänder
    // valet — finns bara när utfällningen är framme, och de når hela `--byd-tap`.
    expect(dot('body').tagName).toBe('SPAN')
    expect(dot('body').getAttribute('aria-hidden')).toBe('true')
    expect(head('body').querySelectorAll('button')).toHaveLength(1)
  })

  it('sätter inget märke på räknekolumnen, som är motorns egen (L4)', () => {
    table()
    expect(head('antal').querySelector('.byd-prose-mark')).toBeNull()
    reach('antal')
    expect(screen.queryByRole('group', { name: /^antal skrivs/ })).toBeNull()
  })
})

// En utfällning vid hover är ett a11y-åtagande: den ska nås med tangentbordet också (#184, #216).
describe('utfällningen nås med pekaren och med tangentbordet (L43)', () => {
  const turn = () => screen.queryByRole('button', { name: 'Gör vanlig text' })

  it('står stängd i vila och kostar ingenting', () => {
    table()
    expect(turn()).toBeNull()
    expect(head('body').getAttribute('data-prose')).toBe('')
  })

  it('fälls ut när pekaren vilar på rubriken, och åker in när den lämnar', () => {
    table()
    reach('body')
    expect(turn()).toBeTruthy()
    fireEvent.pointerLeave(head('body'))
    expect(turn()).toBeNull()
  })

  it('fälls ut av fokus ensamt, och knapparna står i tabbordningen efter rubriken', async () => {
    table()
    const user = userEvent.setup()
    act(() => (screen.getByRole('button', { name: /^body$/ }) as HTMLElement).focus())
    const vand = screen.getByRole('button', { name: 'Gör vanlig text' })
    // Nästa Tabb landar i utfällningen och inte förbi den: en utfällning som inte går att tabba
    // in i är ingen väg in alls (#216).
    await user.tab()
    expect(document.activeElement).toBe(vand)
  })

  it('åker in när fokus lämnar rubriken helt', () => {
    table()
    fireEvent.focusIn(head('body'))
    expect(turn()).toBeTruthy()
    fireEvent.focusOut(head('body'), { relatedTarget: document.body })
    expect(turn()).toBeNull()
  })

  it('står kvar när fokus går från rubriken till en av utfällningens knappar', () => {
    table()
    fireEvent.focusIn(head('body'))
    fireEvent.focusOut(head('body'), { relatedTarget: turn()! })
    expect(turn()).toBeTruthy()
  })

  it('läggs ihop av Escape utan att flytta handen, och fälls ut igen nästa gång rubriken nås', () => {
    table()
    reach('body')
    fireEvent.keyDown(head('body'), { key: 'Escape' })
    expect(turn()).toBeNull()
    fireEvent.pointerLeave(head('body'))
    reach('body')
    expect(turn()).toBeTruthy()
  })

  it('ger knapparna hela träffytan editorn kräver', () => {
    table()
    reach('body')
    // Måttet är editorns eget och ställs till stilmallen i `editor-viewport.test.tsx`; här står
    // att knappen är den knapp måttet gäller. En absolut pixel här vore ett prov om vilken
    // maskin sviten kördes på.
    expect(turn()!.className).toContain('byd-prose-turn')
  })
})

describe('knapparna vänder valet och lämnar tillbaka det (L43)', () => {
  it('skriver ett uttryckligt nej om en kolumn höjden föreslog prosa åt', () => {
    const onProse = vi.fn()
    table(projectDoc(), { onProse })
    reach('body')
    fireEvent.click(screen.getByRole('button', { name: 'Gör vanlig text' }))
    expect(onProse.mock.calls).toEqual([['body', false]])
  })

  it('skriver ett uttryckligt ja om en kolumn höjden föreslog vanlig text åt', () => {
    const onProse = vi.fn()
    table(projectDoc(), { onProse })
    reach('title')
    fireEvent.click(screen.getByRole('button', { name: 'Gör prosa' }))
    expect(onProse.mock.calls).toEqual([['title', true]])
  })

  it('lämnar tillbaka frågan till höjden, och erbjuder det bara där det finns ett val att lämna', () => {
    const onProse = vi.fn()
    const doc = projectDoc()
    doc.prose = { body: false }
    table(doc, { onProse })
    reach('title')
    expect(screen.queryByRole('button', { name: 'Följ höjden igen' })).toBeNull()
    fireEvent.pointerLeave(head('title'))
    reach('body')
    fireEvent.click(screen.getByRole('button', { name: 'Följ höjden igen' }))
    expect(onProse.mock.calls).toEqual([['body', null]])
  })

  it('säger vad höjden föreslår, i rutans egna mått', () => {
    table()
    reach('body')
    // `body` är 40 mm hög och dess rad är 9 pt i mallens förvalda radavstånd ≈ 4,0 mm.
    const why = screen.getByRole('group', { name: /^body skrivs/ })
    expect(within(why).getByText(/40,0 mm/)).toBeTruthy()
    expect(within(why).getByText(/4,0 mm/)).toBeTruthy()
  })
})
