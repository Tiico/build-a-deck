// @vitest-environment jsdom
// Vad en kolumn är — text, prosa eller bild — väljs där kolumnen görs och går att vända (#1085,
// beställarens beslut variant B). Mallen föreslår, designern avgör: ett bildlager föreslår bild och
// en hög ruta prosa, men det designern har valt i dörren väger över. En kolumn som görs som bild tar
// emot bilder i Tabell direkt, utan att någon behöver gå till Mall först.
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { applyEdit } from '@byd/server/doc'
import { DataTable } from '../src/editor/DataTable.js'
import { imageFieldsOf } from '../src/editor/assets.js'
import { proseFieldsOf } from '../src/editor/body.js'
import type { ProjectDoc, ProjectRow } from '../src/editor/types.js'
import { projectDoc } from './project-doc.js'

// Leken med en kolumn som mallen ritar som bild (`art`) och en som den inte ritar alls (`typ`).
function deck(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 5, y: 16, w: 53, h: 12, bind: { field: 'art' } })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, art: '', typ: ['Best', 'Hjälte', ''][i] ?? '' } }))
  return doc
}

// Tabellen som gör sitt eget arbete: varje redigering den ber om går genom samma rena funktion som
// aktören använder, och svaret ritas om. `asked` är det tabellen bad om, i ordning.
function Editing({ doc: initial = deck(), asked }: { doc?: ProjectDoc; asked?: unknown[] }) {
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
      onAddField={(field, kind) => {
        asked?.push(['addField', field, kind])
        setDoc((current) => applyEdit(current, { v: 'addField', field, ...(kind ? { kind } : {}) }))
      }}
      onRemoveField={(field) => setDoc((current) => applyEdit(current, { v: 'removeField', field }))}
      onMoveField={() => undefined}
      onColumnKind={(field, kind) => {
        asked?.push(['setColumnKind', field, kind])
        setDoc((current) => applyEdit(current, { v: 'setColumnKind', field, kind }))
      }}
      assetBase="http://api.local"
      onUpload={async () => 'e'.repeat(64)}
    />
  )
}

const door = () => screen.getByRole('group', { name: 'Kolumner' })
const doorRow = (field: string) => door().querySelector<HTMLElement>(`li[data-col="${field}"]`)!
const imageCells = (field: string) => document.querySelectorAll(`td.byd-data-image[data-col="${field}"]`)

describe('mallen föreslår, designern avgör (#1085)', () => {
  it('gör en kolumn som designern valt som bild till bildceller, utan något bildlager i mallen', () => {
    const doc = deck()
    doc.images = { typ: true }
    render(<Editing doc={doc} />)
    expect(imageCells('typ')).toHaveLength(3)
    expect(imageFieldsOf(doc)).toEqual(['art', 'typ'])
  })

  it('låter ett nej till bild väga över mallens bildlager', () => {
    const doc = deck()
    doc.images = { art: false }
    render(<Editing doc={doc} />)
    expect(imageCells('art')).toHaveLength(0)
    expect(screen.getByLabelText('dragon art').tagName).toBe('INPUT')
  })

  it('ger en bildkolumn aldrig en skrivyta, vad prosavalet under den än säger', () => {
    const doc = deck()
    doc.prose = { typ: true }
    doc.images = { typ: true }
    expect(proseFieldsOf(doc)).not.toContain('typ')
  })

  it('låter en lek som aldrig valt något se ut precis som förut', () => {
    const doc = deck()
    render(<Editing doc={doc} />)
    expect(imageCells('art')).toHaveLength(3)
    expect(imageCells('typ')).toHaveLength(0)
  })
})

describe('typen står på kolumnens rad i dörren (#1085, variant B)', () => {
  it('har Text, Prosa och Bild på varje designerkolumn och ingen på verktygets egna', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    expect(within(doorRow('typ')).getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining(['Text', 'Prosa', 'Bild']))
    // Mallens förslag är det som är tryckt när ingen har valt: `art` ritas som bild.
    expect(within(doorRow('art')).getByRole('button', { name: 'Bild, art' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(doorRow('body')).getByRole('button', { name: 'Prosa, body' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(doorRow('typ')).getByRole('button', { name: 'Text, typ' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(doorRow('antal')).queryByRole('button', { name: /^Bild/ })).toBeNull()
    expect(within(doorRow('id')).queryByRole('button', { name: /^Bild/ })).toBeNull()
  })

  it('gör en befintlig kolumn till bild med ett tryck, och lämnar tillbaka den till mallen med ett till', async () => {
    const user = userEvent.setup()
    const asked: unknown[] = []
    render(<Editing asked={asked} />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(within(doorRow('typ')).getByRole('button', { name: 'Bild, typ' }))
    expect(asked).toEqual([['setColumnKind', 'typ', 'image']])
    expect(imageCells('typ')).toHaveLength(3)
    await user.click(within(doorRow('typ')).getByRole('button', { name: 'Följ mallen igen, typ' }))
    expect(asked.at(-1)).toEqual(['setColumnKind', 'typ', null])
    expect(imageCells('typ')).toHaveLength(0)
  })

  it('säger att texten står kvar när en kolumn med text blir bild, och visar den i cellen', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    await user.click(within(doorRow('typ')).getByRole('button', { name: 'Bild, typ' }))
    expect(doorRow('typ').textContent).toContain('2 kort har text i typ. Den står kvar och kommer tillbaka om du väljer Text igen.')
    // Texten är inte en bild och ritas inte som en, men den är inte heller borta.
    const kept = document.querySelector('td.byd-data-image[data-col="typ"] .byd-data-kept')
    expect(kept?.textContent).toBe('Best')
  })

  // Dörrens förklaringar står i dess hjälp och inte under raderna (beslut 2026-10-03): en rad är en
  // kontrollrad. Texten som står kvar är det enda undantaget, och bara medan den står kvar.
  it('säger ingenting under en rad som inte har text kvar', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    expect(door().querySelectorAll('.byd-columns-note')).toHaveLength(0)
  })
})

describe('en ny kolumn får sin typ i formuläret (#1085, variant B)', () => {
  it('är ett tabbstopp med pilar mellan de tre, som dörrens rader', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    const form = screen.getByRole('form', { name: 'Nytt fält' })
    // Under namnet, så att vägen upp från namnet till listan är lika kort som förut (#388).
    await user.keyboard('{Tab}')
    expect(document.activeElement).toBe(within(form).getByRole('button', { name: 'Text' }))
    await user.keyboard('{ArrowRight}{ArrowRight}')
    const bild = within(form).getByRole('button', { name: 'Bild' })
    expect(document.activeElement).toBe(bild)
    expect(bild.getAttribute('aria-pressed')).toBe('true')
    expect((within(form).getByLabelText('Namn') as HTMLInputElement).value).toBe('bild1')
    // Och ett steg till är «Lägg till», inte en annan av de tre.
    await user.keyboard('{Tab}')
    expect(document.activeElement).toBe(within(form).getByRole('button', { name: 'Lägg till' }))
  })

  it('gör en bildkolumn som tar emot bilder direkt, med ett namn som säger bild', async () => {
    const user = userEvent.setup()
    const asked: unknown[] = []
    render(<Editing asked={asked} />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    const form = screen.getByRole('form', { name: 'Nytt fält' })
    await user.click(within(form).getByRole('button', { name: 'Bild' }))
    expect((within(form).getByLabelText('Namn') as HTMLInputElement).value).toBe('bild1')
    await user.click(within(form).getByRole('button', { name: 'Lägg till' }))
    expect(asked).toEqual([['addField', 'bild1', 'image']])
    expect(imageCells('bild1')).toHaveLength(3)
  })

  it('låter ett namn designern själv skrivit stå kvar när typen byts', async () => {
    const user = userEvent.setup()
    render(<Editing />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    const form = screen.getByRole('form', { name: 'Nytt fält' })
    const name = within(form).getByLabelText('Namn')
    await user.clear(name)
    await user.type(name, 'porträtt')
    await user.click(within(form).getByRole('button', { name: 'Bild' }))
    expect((name as HTMLInputElement).value).toBe('porträtt')
  })

  it('har Text tryckt när formuläret öppnas, som en kolumn alltid har gjorts', async () => {
    const user = userEvent.setup()
    const asked: unknown[] = []
    render(<Editing asked={asked} />)
    await user.click(screen.getByRole('button', { name: 'Kolumner' }))
    const form = screen.getByRole('form', { name: 'Nytt fält' })
    expect(within(form).getByRole('button', { name: 'Text' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(form).getByRole('button', { name: 'Lägg till' }))
    expect(asked).toEqual([['addField', 'fält1', 'text']])
  })
})
