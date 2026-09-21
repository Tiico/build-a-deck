// @vitest-environment jsdom
// «Namnet är nyckeln», och ytan är dörren (#384, beslut 2026-09-21). `renameField` har funnits
// sedan #362 utan att någon yta anropade det. Kolumnen döps om i listan bakom ＋ sist i
// kolumnhuvudet — den dörr #46 redan flyttade × till — så rubriken rörs inte alls och huvudet
// kostar inte ett enda tabbstopp till.
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { applyEdit, type EditIntent } from '@byd/server/doc'
import { DataTable } from '../src/editor/DataTable.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Tabellen gör sitt eget arbete: varje namnbyte den ber om läggs på med samma rena funktion som
// aktören lägger på det med, och svaret går rakt tillbaka in i dokumentet tabellen ritas ur.
// `asked` är varje redigering som nådde klienten, i ordning, så ett avslag som aldrig frågade går
// att skilja från ett som frågade. Skillnaden är hela «beskedet i ytan, innan verbet kastar»: en
// redigering som når klienten är en version och ett steg i ångerstacken vare sig den ändrade något
// eller inte — och ett kast är inget besked alls.
function Editing({ doc: initial = projectDoc(), asked, latest }: { doc?: ProjectDoc; asked?: EditIntent[]; latest?: { doc: ProjectDoc } }) {
  const [doc, setDoc] = useState(initial)
  if (latest) latest.doc = doc
  return (
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
      onRenameField={(from, to) => {
        asked?.push({ v: 'renameField', from, to })
        setDoc((current) => applyEdit(current, { v: 'renameField', from, to }))
      }}
    />
  )
}

// En kolumn är en sorteringskontroll med fältets namn på (#15), så det är den som säger om
// tabellen har kolumnen alls.
const column = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name}[\\s↕↑↓×]*$`) })
const door = () => within(screen.getByRole('group', { name: 'Kolumner' }))

// Vägen in med tangentbordet, utan en enda pekare: fokus på ＋ sist i huvudet, Enter öppnar
// dörren, och därifrån tillbaka genom listan tills kolumnens eget namn står under fokus.
async function reachByKeyboard(user: ReturnType<typeof userEvent.setup>, field: string) {
  screen.getByRole('button', { name: 'Kolumner' }).focus()
  await user.keyboard('{Enter}')
  const wanted = door().getByRole('button', { name: `Byt namn på kolumnen ${field}` })
  for (let step = 0; step < 20 && document.activeElement !== wanted; step++) await user.tab({ shift: true })
  expect(document.activeElement).toBe(wanted)
  await user.keyboard('{Enter}')
}

describe('kolumnens namn byts i dörren (#384)', () => {
  it('döper om kolumnen hela vägen med tangentbordet, utan att rubriken blir en kontroll', async () => {
    const user = userEvent.setup()
    render(<Editing />)

    await reachByKeyboard(user, 'title')
    const name = screen.getByLabelText('Namn på kolumnen title') as HTMLInputElement
    expect(name.value).toBe('title')
    await user.clear(name)
    await user.type(name, 'rubrik{Enter}')

    expect(column('rubrik')).toBeTruthy()
    expect(column('title')).toBeNull()
    // Dörren står kvar öppen med det nya namnet i listan, och rubriken är vad den var: ett namn
    // och ett sätt att sortera, ingenting annat.
    expect(door().getByRole('button', { name: 'Byt namn på kolumnen rubrik' })).toBeTruthy()
    const head = document.querySelector('thead th[data-col="rubrik"]') as HTMLElement
    expect(head.querySelectorAll('button')).toHaveLength(1)
  })
})

// Verbet kastar redan på en upptagen nyckel, och ett kast får inte nå användaren: det som når
// henne ska vara ett besked i ytan, sagt medan hon skriver och innan något lämnar dörren.
describe('vad ytan svarar innan verbet hinner kasta (#384)', () => {
  it('avvisar en upptagen nyckel med ett besked, utan att fråga dokumentet', async () => {
    const user = userEvent.setup()
    const asked: EditIntent[] = []
    render(<Editing asked={asked} />)

    await reachByKeyboard(user, 'title')
    const name = screen.getByLabelText('Namn på kolumnen title')
    await user.clear(name)
    await user.type(name, 'body')

    // Beskedet står där innan Enter: felet kommer med tangenten som skrev det, inte med den som
    // skickar. Och fältet säger själv att det är fel, så beskedet hittas av den som inte ser det.
    expect(door().getByRole('status').textContent).toBe('Det finns redan ett fält som heter body.')
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(name.getAttribute('aria-describedby')).toBe(door().getByRole('status').id)

    // Enter gör ingenting: dokumentet har inte fått frågan, så kastet kan inte ha skett. En
    // redigering som når klienten är en version och ett steg tillbaka även när den ändrar
    // ingenting — och den här skulle ha kastat i stället.
    await user.keyboard('{Enter}')
    expect(asked).toEqual([])
    expect(column('title')).toBeTruthy()
    expect(document.querySelectorAll('thead th[data-col="body"]')).toHaveLength(1)

    // `id` och `antal` är verktygets egna kolumner (L4) och avvisas av samma mening: de är namn
    // tabellen redan svarar på, vad de än är för övrigt.
    await user.clear(name)
    await user.type(name, 'antal')
    expect(door().getByRole('status').textContent).toBe('Det finns redan ett fält som heter antal.')
    await user.clear(name)
    await user.type(name, 'id')
    expect(door().getByRole('status').textContent).toBe('Det finns redan ett fält som heter id.')

    // Och ett namn som inte är något namn är inte ett namn.
    await user.clear(name)
    expect(door().getByRole('status').textContent).toBe('Ett fält behöver ett namn.')
    await user.keyboard('{Enter}')
    expect(asked).toEqual([])
    expect(column('title')).toBeTruthy()

    // Beskedet går tillbaka när namnet gör det: det är ett svar på vad som står i rutan, inte ett
    // märke som fastnar på kolumnen.
    await user.type(name, 'rubrik')
    expect(door().queryByRole('status')).toBeNull()
    await user.keyboard('{Enter}')
    expect(asked).toEqual([{ v: 'renameField', from: 'title', to: 'rubrik' }])
    expect(column('rubrik')).toBeTruthy()
  })
})

// Allt dokumentet skriver kolumnen med följer med namnet. `renameField` gör redan hela det
// arbetet — det är därför beslutet blev «namnet är nyckeln» — men ingen yta anropade det, så det
// som prövas här är att ytan faktiskt når det. Ett prov per sak.
function richDoc(): ProjectDoc {
  const doc = projectDoc()
  const front = doc.template.faces['front']!
  // Ett villkor på kolumnen, med en bindning till samma kolumn inuti sig.
  front.base.push({
    kind: 'if',
    id: 'omtitel',
    when: { field: 'title', nonEmpty: true },
    children: [{ kind: 'text', id: 'eko', x: 5, y: 70, w: 53, h: 8, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 8 }, color: '#333' }],
  })
  // Gruppkolumnen (#13): vilken kolumn korten varierar på.
  front.variantBy = 'title'
  return {
    ...doc,
    // Ordningen är dokumentets (#46), och `title` står sist av designerns egna.
    columns: ['body', 'title'],
    // En beskärning hör till ett kort och en kolumn på en gång (E1), och nyckeln bär båda.
    framing: { 'dragon/title': { zoom: 2 } },
    // Och prosavalet, som skrevs per kolumn tre dagar innan det här (L43, #362).
    prose: { title: true },
  }
}

async function renameInDoor(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await reachByKeyboard(user, from)
  const name = screen.getByLabelText(`Namn på kolumnen ${from}`)
  await user.clear(name)
  await user.type(name, `${to}{Enter}`)
}

describe('vad som följer med namnet (#384)', () => {
  const renamed = async () => {
    const user = userEvent.setup()
    const latest = { doc: richDoc() }
    render(<Editing doc={richDoc()} latest={latest} />)
    await renameInDoor(user, 'title', 'rubrik')
    return latest
  }

  it('tar bindningarna i mallen med sig', async () => {
    const base = (await renamed()).doc.template.faces['front']!.base
    const bound = base.filter((el) => 'bind' in el && 'field' in el.bind && el.bind.field === 'rubrik')
    expect(bound.map((el) => el.id)).toEqual(['title'])
    // Och den som ligger inne i villkoret följde med den: en bindning i ett barn är en bindning.
    const omtitel = base.find((el) => el.id === 'omtitel')!
    expect(omtitel.kind).toBe('if')
    expect(omtitel.kind === 'if' && omtitel.children.map((el) => ('bind' in el && 'field' in el.bind ? el.bind.field : null))).toEqual(['rubrik'])
    expect(JSON.stringify(base)).not.toContain('"field":"title"')
  })

  it('tar villkoret med sig', async () => {
    const omtitel = (await renamed()).doc.template.faces['front']!.base.find((el) => el.id === 'omtitel')!
    expect(omtitel.kind === 'if' && omtitel.when.field).toBe('rubrik')
  })

  it('tar gruppkolumnen med sig', async () => {
    expect((await renamed()).doc.template.faces['front']!.variantBy).toBe('rubrik')
  })

  it('lämnar kolumnen där den stod', async () => {
    const doc = (await renamed()).doc
    expect(doc.columns).toEqual(['body', 'rubrik'])
    // Och ordningen är den tabellen ritar: rubriken står kvar sist av designerns egna, med
    // räknekolumnen efter sig som alltid.
    // `#group` är inte en kolumn i dokumentet utan duken läst baklänges (#13), och den står där
    // den alltid står: sist av allt utom räknekolumnen.
    expect(Array.from(document.querySelectorAll('thead th[data-col]')).map((th) => th.getAttribute('data-col'))).toEqual(['id', 'body', 'rubrik', 'antal', '#group'])
  })

  it('tar beskärningarna med sig, kort för kort', async () => {
    expect((await renamed()).doc.framing).toEqual({ 'dragon/rubrik': { zoom: 2 } })
  })

  it('tar prosavalet med sig (L43)', async () => {
    const latest = await renamed()
    expect(latest.doc.prose).toEqual({ rubrik: true })
    // Och det syns där valet syns: cellen är en skrivyta och inte ett vanligt fält.
    expect(screen.getByLabelText('dragon rubrik').getAttribute('role')).toBe('textbox')
  })

  it('flyttar värdet på varje kort, med nyckeln kvar på sin plats i posten', async () => {
    const rows = (await renamed()).doc.rows
    expect(rows.map((row) => row.fields['rubrik'])).toEqual(['Drake', 'Riddare', 'Trollkarl'])
    expect(rows.every((row) => !('title' in row.fields))).toBe(true)
    expect(Object.keys(rows[0]!.fields)).toEqual(['rubrik', 'body', 'antal'])
  })
})

// En lek som fanns innan #384 ska bete sig precis som den gjorde. Vad dörren rymmer är dörrens
// sak; tabellen under den är oförändrad tills någon faktiskt byter ett namn.
describe('ingenting händer förrän ett namn byts (#384)', () => {
  it('ritar tabellen precis som förut, vare sig ytan kan döpa om eller inte', () => {
    const table = () => document.querySelector('.byd-data')!.innerHTML
    const { unmount } = render(<Editing />)
    const before = table()
    unmount()

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
      />,
    )
    expect(table()).toBe(before)
  })

  it('frågar ingenting om ett namn som skrivs och sedan tas tillbaka', async () => {
    const user = userEvent.setup()
    const asked: EditIntent[] = []
    const initial = projectDoc()
    const latest = { doc: initial }
    render(<Editing doc={initial} asked={asked} latest={latest} />)

    await reachByKeyboard(user, 'title')
    await user.type(screen.getByLabelText('Namn på kolumnen title'), 'onsdag')
    await user.keyboard('{Escape}')

    // Utkastet var dörrens eget hela tiden: dokumentet är inte ett nytt dokument, utan samma.
    expect(asked).toEqual([])
    expect(latest.doc).toBe(initial)
    expect(column('title')).toBeTruthy()
    // Och Escape i rutan svarar rutan, inte dörren: fokus står på namnet den kom ifrån, och
    // listan är kvar att gå vidare i.
    expect(document.activeElement).toBe(door().getByRole('button', { name: 'Byt namn på kolumnen title' }))
  })
})

// Samtidighet (#384, beslut): bytet går igenom och rubriken byts under handen hos den som har
// leken öppen. Det är ett steg i loggen som alla andra — `decide` → commit → `apply` → patchar —
// och inte något ytan avvisar. Ett dokument är delat tillstånd, och den som döper om en kolumn
// har rätt att göra det.
function Shared({ port }: { port: { apply?: (intent: EditIntent) => void } }) {
  const [doc, setDoc] = useState(projectDoc())
  // Den andres steg, som det når den här fliken: en patch på dokumentet, inte en fråga till ytan.
  port.apply = (intent) => setDoc((current) => applyEdit(current, intent))
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={(cardRef, field, value) => setDoc((current) => applyEdit(current, { v: 'setCell', cardRef, field, value }))}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
      onRenameField={() => undefined}
    />
  )
}

describe('någon annan döper om kolumnen medan leken står öppen (#384)', () => {
  it('byter rubriken under handen och låter det som skrivs i cellen stå kvar', async () => {
    const user = userEvent.setup()
    const port: { apply?: (intent: EditIntent) => void } = {}
    render(<Shared port={port} />)

    const cell = screen.getByLabelText('dragon title') as HTMLInputElement
    await user.clear(cell)
    await user.type(cell, 'Drakhona')

    act(() => port.apply!({ v: 'renameField', from: 'title', to: 'rubrik' }))

    // Rubriken är en annan, cellen är samma cell: det hon skrev är kvar, för strängen är samma
    // sträng. Ingenting avvisades, och ytan sade inte emot.
    expect(column('rubrik')).toBeTruthy()
    expect(column('title')).toBeNull()
    const moved = screen.getByLabelText('dragon rubrik') as HTMLInputElement
    expect(moved.value).toBe('Drakhona')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})


// A4: det är namnet som läses upp — och sedan beslutet är namnet nyckeln. Den enda kolumn som
// heter något annat på skärmen än i dokumentet är `antal`, som är motorns egen (L4), och den är
// en av de två som inte döps om alls.
describe('det som läses upp är namnet (#384, A4)', () => {
  it('säger kolumnens nya namn, i huvudet och i dörren', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await renameInDoor(user, 'title', 'rubrik')

    expect(screen.getByRole('columnheader', { name: /^rubrik/ })).toBeTruthy()
    expect(screen.getByLabelText('dragon rubrik')).toBeTruthy()
    expect(door().getByRole('button', { name: 'Byt namn på kolumnen rubrik' })).toBeTruthy()
  })

  it('lämnar verktygets två egna kolumner utan en väg in: de är just de två verbet vägrar', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    screen.getByRole('button', { name: 'Kolumner' }).focus()
    await user.keyboard('{Enter}')

    expect(door().queryByRole('button', { name: 'Byt namn på kolumnen id' })).toBeNull()
    expect(door().queryByRole('button', { name: 'Byt namn på kolumnen antal' })).toBeNull()
    // De står kvar som ord, med hänglåsets mening bredvid sig, precis som #46 lämnade dem.
    expect(door().getByText('antal är verktygets egen kolumn och kan inte tas bort')).toBeTruthy()
    expect(door().getAllByRole('button', { name: /^Byt namn på kolumnen/ }).map((b) => b.textContent)).toEqual(['title', 'body'])
  })
})
