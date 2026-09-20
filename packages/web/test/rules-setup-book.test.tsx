// @vitest-environment jsdom
// Uppställningen i spelarnas bok (#270, HITL 2026-09-20).
//
// Boken spelarna läser visade bara bildtexten: den kunde säga att det fanns en uppställning utan
// att säga vad den var. Nu är den en utfällbar, grupperad zonöversikt — gemensamma zoner först,
// sedan en vald plats i taget — och den ritas av samma komponent i editorn och vid bordet.
//
// Måtten hör inte hemma här. Det här är beteendet: att den fälls ut, att en plats går att välja
// med pekdon och med tangentbord, att valet står kvar när bilden fälls ihop, och att bokens egen
// sökning, läsning och stängning är orörda. Bredderna mäts i `rules-setup-widths`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { RuleDrawer } from '../src/rules/RuleDrawer.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
  // A server of its own per test, so the table made against the last one is not a table any more.
  table = null
})
afterEach(async () => {
  await run.stop()
})

// The table this test's book is read at, made once and read in whichever box the test asks for.
let table: string | null = null

const rules: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Uppställning' },
    { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp' },
    { kind: 'heading', id: 'h2', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Dra ett kort ur [[zon:draw]] och lägg det i [[zon:discard]].' },
  ],
}

// Bordet som en spelare möter det: ett riktigt projekt, en riktig session och den ruta telefonen
// och TV:n öppnar. Zonerna kommer hela vägen ur den låsta versionen och inte ur en fixtur här.
type Placement = 'table' | 'tv' | 'phone'
async function openBook(placement: Placement = 'table'): Promise<{ panel: HTMLElement; unmount: () => void }> {
  if (table === null) {
    await run.projects.create(run.projectId, { ...projectDoc(), rules })
    const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
    table = ((await res.json()) as { id: string }).id
  }
  const { unmount } = render(<RuleDrawer http={run.http} sessionId={table} placement={placement} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
  const panel = await screen.findByRole('dialog', { name: 'Regler' })
  await within(panel).findByRole('heading', { name: 'Skogens herrar' })
  return { panel, unmount }
}
const bookIn = async (placement: Placement = 'table'): Promise<HTMLElement> => (await openBook(placement)).panel

const zonesIn = (el: HTMLElement): string[] => [...el.querySelectorAll('[data-setup-zone]')].map((z) => z.textContent ?? '')
const show = (el: HTMLElement) => within(el).getByRole('button', { name: 'Visa uppställningen' })
const hide = (el: HTMLElement) => within(el).getByRole('button', { name: 'Dölj uppställningen' })

describe('uppställningen i spelarnas bok (#270)', () => {
  it('står hopfälld tills någon ber om den, och säger med sitt eget ord att den går att fälla ut', async () => {
    const panel = await bookIn()
    // Bildtexten är designerns rad och står kvar där den alltid stått.
    expect(within(panel).getByText('Så ställs bordet upp')).toBeTruthy()
    expect(show(panel).getAttribute('aria-expanded')).toBe('false')
    expect(zonesIn(panel)).toEqual([])
  })

  it('visar gemensamma zoner först och sedan en plats i taget, med hela namn', async () => {
    const panel = await bookIn()
    fireEvent.click(show(panel))
    // Vad som står på bordet för alla, i uppställningens egen ordning.
    expect(zonesIn(within(panel).getByRole('list', { name: 'Gemensamma zoner' }) as HTMLElement)).toEqual(['Draghög', 'Kasthög', 'Spelyta'])
    // Och en plats i taget. Båda händerna heter `Hand`; vilken plats de står vid är zonens egen
    // uppgift och aldrig något som lästs ur namnet.
    expect(within(panel).getByRole('heading', { name: 'Plats A' })).toBeTruthy()
    expect(zonesIn(within(panel).getByRole('list', { name: 'Zoner vid plats A' }) as HTMLElement)).toEqual(['Hand'])
    // Alla platser ryms i väljaren, som bär sitt eget namn.
    const picker = within(panel).getByRole('combobox', { name: 'Visa plats' }) as HTMLSelectElement
    expect([...picker.options].map((o) => o.textContent)).toEqual(['Plats A', 'Plats B'])
  })

  it('behåller den valda platsen när uppställningen fälls ihop och öppnas igen', async () => {
    const user = userEvent.setup()
    const panel = await bookIn()
    await user.click(show(panel))
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Visa plats' }), 'B')
    expect(within(panel).getByRole('heading', { name: 'Plats B' })).toBeTruthy()

    await user.click(hide(panel))
    await waitFor(() => expect(within(panel).queryByRole('heading', { name: 'Plats B' })).toBeNull())
    await user.click(show(panel))
    // Valet är läsarens och inte något bilden glömmer så fort den slår igen.
    expect(await within(panel).findByRole('heading', { name: 'Plats B' })).toBeTruthy()
    expect((within(panel).getByRole('combobox', { name: 'Visa plats' }) as HTMLSelectElement).value).toBe('B')
  })

  it('fälls ut och får sin plats vald av ett tangentbord allena', async () => {
    const user = userEvent.setup()
    const panel = await bookIn()
    const toggle = show(panel)
    toggle.focus()
    // Kontrollerna är plattformens egna: en knapp som svarar på Enter och en väljare som står i
    // tabbordningen. En div med en klickhanterare hade fallit här.
    await user.keyboard('{Enter}')
    expect(hide(panel).getAttribute('aria-expanded')).toBe('true')
    await user.tab()
    const picker = within(panel).getByRole('combobox', { name: 'Visa plats' })
    expect(document.activeElement).toBe(picker)
    await user.selectOptions(picker, 'B')
    expect(within(panel).getByRole('heading', { name: 'Plats B' })).toBeTruthy()
  })

  // Kriteriet säger «i de tre ytorna», så det är i de tre ytorna det prövas. Komponenten är
  // densamma i alla tre — det är hela poängen — och det som skiljer dem åt är rutan den står i.
  it.each(['table', 'tv', 'phone'] as const)('fälls ut, byter plats och minns valet också i %s', async (placement) => {
    const user = userEvent.setup()
    const { panel, unmount } = await openBook(placement)
    try {
      await user.click(show(panel))
      await user.selectOptions(within(panel).getByRole('combobox', { name: 'Visa plats' }), 'B')
      await user.click(hide(panel))
      await user.click(show(panel))
      expect(await within(panel).findByRole('heading', { name: 'Plats B' })).toBeTruthy()
      expect(zonesIn(within(panel).getByRole('list', { name: 'Zoner vid plats B' }) as HTMLElement)).toEqual(['Hand'])
    } finally {
      unmount()
    }
  })

  it('lämnar bokens fråga, läsning och stängning orörda med uppställningen utfälld', async () => {
    const panel = await bookIn()
    fireEvent.click(show(panel))
    const ask = within(panel).getByRole('searchbox', { name: 'Vad undrar du?' })
    fireEvent.change(ask, { target: { value: 'Draghög' } })
    // Frågan svarar med de stycken som nämner ordet, och zonlistan är inte ett av dem: en
    // uppställning är inte en mening att söka i.
    const hits = await within(panel).findAllByRole('listitem')
    expect(hits.map((li) => li.textContent).join(' ')).toContain('Dra ett kort ur Draghög')
    expect(within(panel).queryByRole('button', { name: 'Dölj uppställningen' })).toBeNull()

    // Frågan byter ut boken, så boken kommer tillbaka som den står: hopfälld, precis som
    // läsplatsen redan återgår idag. Vad beslutet lovar är att valet består över en hopfällning,
    // och det är vad provet ovan mäter — inte att en fråga läses som en hopfällning.
    fireEvent.change(ask, { target: { value: '' } })
    expect(await within(panel).findByRole('button', { name: 'Visa uppställningen' })).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Stäng reglerna' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Regler' })).toBeNull())
  })
})

// En enda renderare för bokens ord (CLAUDE.md, B7). Editorn och bordet ritar samma uppställning
// därför att de kallar på samma komponent — inte därför att två filer råkar vara skrivna lika.
// Det som skulle ha sagt ifrån om en andra väg uppstått är det här: ingen annan modul än
// `SetupOverview` får rita ett uppställningsblock, och båda ytorna måste hämta sin ur den.
describe('en enda väg till bokens uppställning (#270)', () => {
  const src = join(import.meta.dirname, '..', 'src')
  const filesUnder = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []))

  it('ritar uppställningens zoner i en enda modul, som båda ytorna hämtar den ur', () => {
    const drawing = filesUnder(src).filter((path) => /data-setup-zone/.test(readFileSync(path, 'utf8')))
    expect(drawing.map((p) => p.slice(src.length + 1))).toEqual(['rules/SetupOverview.tsx'])
    for (const surface of ['rules/RuleDrawer.tsx', 'editor/RulesPanel.tsx'])
      expect(readFileSync(join(src, surface), 'utf8'), `${surface} ritar inte uppställningen ur den delade komponenten`).toContain('SetupOverview')
  })
})
