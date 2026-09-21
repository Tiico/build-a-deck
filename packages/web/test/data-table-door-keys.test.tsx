// @vitest-environment jsdom
// #388, beslut 2026-09-21: listan i kolumndörren blir ett roving-tabbstopp och dörren fokusfälls.
//
// Mätningen (`docs/ux-audits/2026-09-21/388-dorrens-fokus.md`) läste tabbordningen ur sidan genom
// att gå ringen ett stopp i taget, inte ur markupen, och det är så det här provet är skrivet:
// varje ärende är en följd av tangenttryck, och det som binds är hur många de är och var handen
// hamnar. Ett prov som räknade `tabIndex` i markupen skulle säga ja till en dörr ingen kan gå
// genom.
//
// Talen till höger är mätningens egna, vid tio kolumner och två egna bredder. Inget ärende får bli
// dyrare än i dagens dörr.
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { applyEdit } from '@byd/server/doc'
import { DataTable } from '../src/editor/DataTable.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const PROJECT = 'p1'
// De sex kolumnerna mätningen la till, så tabellen står med samma tio som rapporten mätte:
// `id`, `title`, `body`, `fält1`–`fält6`, `antal`.
const MINE = ['fält1', 'fält2', 'fält3', 'fält4', 'fält5', 'fält6']

function tenColumns(): ProjectDoc {
  const base = projectDoc()
  return {
    ...base,
    rows: base.rows.map((row) => ({ ...row, fields: { ...row.fields, ...Object.fromEntries(MINE.map((f) => [f, ''])) } })),
  }
}

// De två egna bredderna. En bredd är en vy och inte dokumentet (L4), så den bor i webbläsaren —
// och det är enda vägen att seeda fallet: knappen i dörren finns bara för en kolumn designern
// själv har dragit.
function twoOwnWidths() {
  localStorage.setItem('byd.widths', JSON.stringify({ [PROJECT]: { title: 96, 'fält3': 120 } }))
}

function Editing({ doc: initial = tenColumns() }: { doc?: ProjectDoc }) {
  const [doc, setDoc] = useState(initial)
  return (
    <DataTable
      doc={doc}
      project={PROJECT}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={(field) => setDoc((current) => applyEdit(current, { v: 'addField', field }))}
      onRemoveField={(field) => setDoc((current) => applyEdit(current, { v: 'removeField', field }))}
      onMoveField={() => undefined}
      onRenameField={(from, to) => setDoc((current) => applyEdit(current, { v: 'renameField', from, to }))}
    />
  )
}

type Press = 'Tabb' | 'bakTabb' | 'Enter' | 'ned' | 'upp' | 'höger' | 'vänster' | 'End' | 'Home'

const KEY: Record<Exclude<Press, 'Tabb' | 'bakTabb'>, string> = {
  Enter: '{Enter}',
  ned: '{ArrowDown}',
  upp: '{ArrowUp}',
  höger: '{ArrowRight}',
  vänster: '{ArrowLeft}',
  End: '{End}',
  Home: '{Home}',
}

// Ett ärende: handen står på ＋ med stängd dörr, och trycker. Svaret är hur många tryck det blev,
// så ärendets kostnad står i provet som ett tal och inte som en kommentar.
async function errand(user: ReturnType<typeof userEvent.setup>, keys: Press[]): Promise<number> {
  screen.getByRole('button', { name: 'Kolumner' }).focus()
  for (const key of keys) {
    if (key === 'Tabb') await user.tab()
    else if (key === 'bakTabb') await user.tab({ shift: true })
    else await user.keyboard(KEY[key])
  }
  return keys.length
}

const door = () => within(screen.getByRole('group', { name: 'Kolumner' }))

describe('vad dörren kostar i tangenttryck (#388)', () => {
  it('når första kolumnens namn på tre tryck: listan är ett enda tabbstopp', async () => {
    const user = userEvent.setup()
    twoOwnWidths()
    render(<Editing />)

    // Enter öppnar dörren och autofokus står kvar i formuläret, en bakåt-Tabb går in i listan —
    // som är ett stopp, och står på sin första rad — och Enter öppnar rutan där namnet skrivs.
    expect(await errand(user, ['Enter', 'bakTabb', 'Enter'])).toBe(3)
    expect(document.activeElement).toBe(screen.getByLabelText('Namn på kolumnen title'))
  })

  it('når sista kolumnens namn på fyra tryck, lika billigt som i dagens dörr', async () => {
    const user = userEvent.setup()
    twoOwnWidths()
    render(<Editing />)

    // `End` går till listans sista rad — `antal` är ingen rad i ringen, den har varken namnknapp
    // eller ×, så den sista är `fält6`. Fyra tryck är vad dagens dörr kostar för samma ärende, och
    // inget ärende fick bli dyrare.
    expect(await errand(user, ['Enter', 'bakTabb', 'End', 'Enter'])).toBe(4)
    expect(document.activeElement).toBe(screen.getByLabelText('Namn på kolumnen fält6'))
  })

  it('når en egen bredd mitt i listan på sju tryck, mot dagens nio', async () => {
    const user = userEvent.setup()
    twoOwnWidths()
    render(<Editing />)

    // `↓` går mellan raderna och `→` inom en rad: fyra rader ned från `title` står handen på
    // `fält3`, och ett steg åt höger på bredden hon själv dragit.
    expect(await errand(user, ['Enter', 'bakTabb', 'ned', 'ned', 'ned', 'ned', 'höger'])).toBe(7)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Låt fält3 följa innehållet igen' }))

    // Och ×:et står ett steg till, som det gör i markupen: åtta, vilket är precis vad dagens dörr
    // kostar för samma ärende.
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ta bort fältet fält3' }))
  })

  it('tar emot handen på radens namn när den kommer från en annan rad', async () => {
    const user = userEvent.setup()
    twoOwnWidths()
    render(<Editing />)

    // Raderna är inte lika långa — `fält3` har en egen bredd och `fält4` har ingen — så ett index
    // som följde med mellan dem skulle landa på ×:et i den ena och på bredden i den andra. Raden
    // tas emot på det den heter.
    await errand(user, ['Enter', 'bakTabb', 'ned', 'ned', 'ned', 'ned', 'höger'])
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Låt fält3 följa innehållet igen' }))

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(door().getByRole('button', { name: 'Byt namn på kolumnen fält4' }))
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(door().getByRole('button', { name: 'Byt namn på kolumnen fält3' }))
  })

  it('skapar en kolumn på ett tryck, som förut: autofokus står kvar i formuläret', async () => {
    const user = userEvent.setup()
    twoOwnWidths()
    render(<Editing />)

    // Hela skälet till att D valdes framför B och C: det vanligaste ärendet blir inte ett enda
    // tryck dyrare, eftersom handen släpps där den alltid släpptes.
    expect(await errand(user, ['Enter'])).toBe(1)
    expect(document.activeElement).toBe(screen.getByLabelText('Namn'))
  })
})

describe('dörren håller tangentbordet så länge den står (#388)', () => {
  it('viker ringen runt inuti dörren i stället för att släppa ut handen i cellerna bakom', async () => {
    const user = userEvent.setup()
    twoOwnWidths()
    render(<Editing />)

    await errand(user, ['Enter'])
    // Sista stoppet i dörren är «Avbryt», och en Tabb därifrån gick rakt in i tabellens första
    // cellrad — som ligger bakom den öppna dörren och till stor del är skymd av den.
    const cancel = screen.getByRole('button', { name: 'Avbryt' })
    cancel.focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kolumner' }))
    expect(screen.getByRole('group', { name: 'Kolumner' })).toBeTruthy()

    // Och åt andra hållet: en bakåt-Tabb från ＋ gick ut på rubrikernas sorteringsknappar med
    // dörren kvar öppen. Ringen är dörrens egen: ＋, listan, formuläret.
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(cancel)
  })

  it('släpper taget medan en kolumn frågas om, och tar det igen när frågan är besvarad', async () => {
    const user = userEvent.setup()
    twoOwnWidths()
    render(<Editing />)

    // Frågan om en kolumn ställs utanför dörren och måste kunna ta fokus. En fälla som höll kvar
    // tangentbordet skulle ha ryckt tillbaka handen in i dörren innan frågan hann läsas.
    await errand(user, ['Enter', 'bakTabb', 'ned', 'ned', 'ned', 'ned', 'höger', 'höger', 'Enter'])
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Avbryt' }))
    expect(screen.getByText('Ta bort fält3? Inget kort har ett värde i den.')).toBeTruthy()

    // Frågan öppnar på det svar som inte förlorar något, så det som gör det står ett steg bakåt.
    await user.tab({ shift: true })
    await user.keyboard('{Enter}')
    // Kolumnen är borta, och fokus står på ＋ som förut (#8) — inuti fällan, inte utanför den.
    expect(screen.queryByRole('button', { name: 'Ta bort fältet fält3' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kolumner' }))

    // Listan ändrades under handen: raden hon stod i finns inte, och tabbstoppet står på den rad
    // som tog dess plats, på samma ställe i raden — inte på listans början, och inte på `<body>`.
    await user.tab()
    expect(document.activeElement).toBe(door().getByRole('button', { name: 'Ta bort fältet fält4' }))
  })

  it('låter namnrutan svara sitt eget Escape, och panelen sitt', async () => {
    const user = userEvent.setup()
    twoOwnWidths()
    render(<Editing />)

    // Dörrens två Escape-lager från #384 står kvar: fällan får inte svara för något av dem.
    await errand(user, ['Enter', 'bakTabb', 'Enter'])
    await user.keyboard('{Escape}')
    expect(screen.getByRole('group', { name: 'Kolumner' })).toBeTruthy()
    expect(document.activeElement).toBe(door().getByRole('button', { name: 'Byt namn på kolumnen title' }))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Kolumner' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kolumner' }))
  })
})
