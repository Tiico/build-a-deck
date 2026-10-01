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

// Var valet står (L43, ändrat i #615): i kolumnlistan bakom `＋`, på samma rad som namnet. Huvudet
// bär ingen kontroll för det och fäller ingenting ut — det var en prick klistrad mot ordet och en
// ruta med en primärknapp över raderna, och varje designerkolumn kostade ett tabbstopp i huvudet.
const head = (field: string) => document.querySelector(`thead th[data-col="${field}"]`) as HTMLElement
const pilcrow = (field: string) => head(field).querySelector('.byd-prose-pilcrow') as HTMLElement | null
const door = () => fireEvent.click(screen.getByRole('button', { name: 'Kolumner' }))
const row = (field: string) => document.querySelector(`.byd-columns li[data-col="${field}"]`) as HTMLElement
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('huvudet bär ingen kontroll för prosavalet (#615)', () => {
  it('har bara rubrikens egen knapp, och fäller ingenting ut när pekaren vilar på den', () => {
    vi.useFakeTimers()
    try {
      table()
      for (const field of ['title', 'body']) {
        expect(head(field).querySelectorAll('button')).toHaveLength(1)
        fireEvent.pointerEnter(head(field))
        act(() => vi.advanceTimersByTime(1000))
        expect(head(field).querySelector('[role="group"]')).toBeNull()
        fireEvent.focusIn(head(field))
        expect(head(field).querySelector('[role="group"]')).toBeNull()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('sätter ett ¶ efter namnet på kolumnerna som skrivs som prosa, och bara på dem', () => {
    table()
    expect(pilcrow('body')?.textContent).toBe('¶')
    expect(pilcrow('title')).toBeNull()
    expect(pilcrow('antal')).toBeNull()
    expect(pilcrow('id')).toBeNull()
  })

  // Märket är en signal till ögat; orden står i dörren. Ett ¶ som lästes upp i rubrikens namn
  // vore en symbol utan mening för en skärmläsare.
  it('låter ¶ vara tyst för skärmläsaren och rubrikens namn vara namnet', () => {
    table()
    expect(pilcrow('body')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('bär skillnaden mellan förval och val i märkets form', () => {
    const doc = projectDoc()
    doc.prose = { title: true }
    table(doc)
    expect(pilcrow('body')!.dataset['from']).toBe('height')
    expect(pilcrow('title')!.dataset['from']).toBe('choice')
  })
})

describe('valet står i dörren, på kolumnens egen rad (#615)', () => {
  it('säger «höjden föreslog» om en kolumn som aldrig fått ett val', () => {
    table()
    door()
    expect(within(row('body')).getByRole('group', { name: 'body skrivs som prosa, höjden föreslog' })).toBeTruthy()
    expect(within(row('title')).getByRole('group', { name: 'Titel skrivs som vanlig text, höjden föreslog' })).toBeTruthy()
  })

  it('säger «du valde» om en kolumn designern har svarat för, åt båda hållen', () => {
    const doc = projectDoc()
    doc.prose = { body: false, title: true }
    table(doc)
    door()
    expect(within(row('body')).getByRole('group', { name: 'body skrivs som vanlig text, du valde' })).toBeTruthy()
    expect(within(row('title')).getByRole('group', { name: 'Titel skrivs som prosa, du valde' })).toBeTruthy()
  })

  it('visar vad kolumnen är som en tryckt knapp av två', () => {
    table()
    door()
    expect(pressed('Prosa, body')).toBe('true')
    expect(pressed('Text, body')).toBe('false')
    expect(pressed('Prosa, Titel')).toBe('false')
    expect(pressed('Text, Titel')).toBe('true')
  })

  it('bär skillnaden mellan förval och val i växelns form också', () => {
    const doc = projectDoc()
    doc.prose = { title: true }
    table(doc)
    door()
    expect((within(row('body')).getByRole('group') as HTMLElement).dataset['from']).toBe('height')
    expect((within(row('title')).getByRole('group') as HTMLElement).dataset['from']).toBe('choice')
  })

  it('ger ingen växel åt kolumnerna verktyget äger (L4)', () => {
    table()
    door()
    expect(within(row('antal')).queryByRole('group')).toBeNull()
    expect(within(row('id')).queryByRole('group')).toBeNull()
  })

  it('säger vad höjden föreslår, i rutans egna mått, och beskriver knapparna med det', () => {
    table()
    door()
    // `body` är 40 mm hög och dess rad är 9 pt i mallens förvalda radavstånd ≈ 4,0 mm.
    const why = within(row('body')).getByText(/^Höjden föreslår prosa/)
    expect(why.textContent).toMatch(/40,0 mm/)
    expect(why.textContent).toMatch(/4,0 mm/)
    expect(screen.getByRole('button', { name: 'Text, body' }).getAttribute('aria-describedby')).toBe(why.id)
  })
})

describe('växeln vänder valet och lämnar tillbaka det (L43, #615)', () => {
  it('skriver ett uttryckligt nej om en kolumn höjden föreslog prosa åt', () => {
    const onProse = vi.fn()
    table(projectDoc(), { onProse })
    door()
    fireEvent.click(screen.getByRole('button', { name: 'Text, body' }))
    expect(onProse.mock.calls).toEqual([['body', false]])
  })

  it('skriver ett uttryckligt ja om en kolumn höjden föreslog vanlig text åt', () => {
    const onProse = vi.fn()
    table(projectDoc(), { onProse })
    door()
    fireEvent.click(screen.getByRole('button', { name: 'Prosa, Titel' }))
    expect(onProse.mock.calls).toEqual([['title', true]])
  })

  // Att trycka den knapp som redan är tryckt på en kolumn som följer höjden gör förslaget till ett
  // val: designern har sagt det, och då ska nästa omritning av mallen inte ta det ifrån henne.
  it('gör förslaget till ett val när den redan tryckta knappen trycks', () => {
    const onProse = vi.fn()
    table(projectDoc(), { onProse })
    door()
    fireEvent.click(screen.getByRole('button', { name: 'Prosa, body' }))
    expect(onProse.mock.calls).toEqual([['body', true]])
  })

  it('lämnar tillbaka frågan till höjden, och erbjuder det bara där det finns ett val att lämna', () => {
    const onProse = vi.fn()
    const doc = projectDoc()
    doc.prose = { body: false }
    table(doc, { onProse })
    door()
    expect(screen.queryByRole('button', { name: 'Följ höjden igen, Titel' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Följ höjden igen, body' }))
    expect(onProse.mock.calls).toEqual([['body', null]])
  })

  it('står kvar öppen efter ett val, så nästa kolumn kan väljas i samma andetag', () => {
    table()
    door()
    fireEvent.click(screen.getByRole('button', { name: 'Text, body' }))
    expect(document.querySelector('.byd-columns')).not.toBeNull()
  })

  it('visar ingen växel i en tabell som inte har något projekt att skriva i', () => {
    table(projectDoc(), { onProse: undefined })
    door()
    expect(screen.queryByRole('button', { name: 'Prosa, body' })).toBeNull()
  })
})

// Dörren håller tangentbordet i en lista med ett tabbstopp och pilar inom raden (#388, L45).
// Växeln är en del av raden och nås med pilarna som namnet och ×.
describe('växeln nås med tangentbordet i dörrens egen ordning (#388, #615)', () => {
  it('står mellan namnet och × på samma rad', async () => {
    table(projectDoc(), { onRenameField: () => undefined })
    door()
    const user = userEvent.setup()
    act(() => screen.getByRole('button', { name: 'Byt namn på kolumnen body' }).focus())
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Prosa, body' }))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Text, body' }))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ta bort fältet body' }))
  })
})
