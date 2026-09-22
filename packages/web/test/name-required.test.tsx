// @vitest-environment jsdom
// Namnet krävs, och nu sägs det (#416, variant B: «vid tryck»).
//
// Två skärmar låste varje väg framåt tills ett namn var ifyllt, och ingen av dem sade det:
// wizardens båda utgångar och anslutningssidans tre var `disabled` med tomt fält, utan ett ord om
// varför. Beställaren valde B: vägarna står öppna, och den som trycker med tomt namn får beskedet
// vid fältet, fältet märkt ogiltigt och markören flyttad dit.
//
// Det är den grenen acceptanskriteriet uttryckligen tillåter — «eller släpper igenom och säger vad
// som saknas efteråt» — och den ställer ett krav kriteriet inte ställde på A: beskedet finns inte
// på skärmen förrän man tryckt, så det måste *nå* en skärmläsare när det kommer. Därför läses det
// här som en levande region med fältet pekande på den, och aldrig som en rad som råkar synas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JoinPage } from '../src/join/JoinPage.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { createSession, roomOf, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { atWidth } from './viewport.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function picker(gone: string[]): Promise<void> {
  const id = await createSession(run)
  history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
  render(<JoinPage onSit={(url) => gone.push(url)} />)
  await screen.findByRole('button', { name: /Sätt dig/ })
}

const nameField = () => screen.getByLabelText('Ditt namn')

describe('anslutningssidan med tomt namn (#416)', () => {
  it('svarar vid tryck: beskedet når läsaren, markören hamnar i fältet, och ingen går vidare', async () => {
    const gone: string[] = []
    await picker(gone)

    const sit = screen.getByRole('button', { name: /Sätt dig/ }) as HTMLButtonElement
    // Vägen in står öppen. En låst knapp är precis vad B valdes bort ifrån.
    expect(sit.disabled).toBe(false)
    fireEvent.click(sit)

    // Beskedet står i det tillgängliga trädet, inte bara på skärmen.
    const said = await screen.findByRole('alert')
    expect(said.textContent).toMatch(/Skriv ditt namn först/)
    // Och det kommer efter trycket, så det måste vara en region som läses upp när den ändras.
    expect(said.getAttribute('aria-live')).toBe('assertive')

    // Fältet pekar på beskedet och säger att det är fältet som är fel.
    const field = nameField()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect((field.getAttribute('aria-describedby') ?? '').split(/\s+/)).toContain(said.id)

    // Markören flyttas dit felet ska rättas. Läst som ett villkor och inte direkt efter en
    // rendering, eftersom en fokusläsning omedelbart efter `findBy*` är en kapplöpning här.
    await waitFor(() => expect(document.activeElement).toBe(field))

    // Och ingenting hände: trycket ledde ingenstans.
    expect(gone).toEqual([])
  })

  it('svarar likadant från alla tre vägarna in, och säger villkoret en gång per skärm', async () => {
    const gone: string[] = []
    await picker(gone)

    for (const way of [/Sätt dig/, /Spela på den här skärmen/, /Bara titta/]) {
      const exit = screen.getByRole('button', { name: way }) as HTMLButtonElement
      expect(exit.disabled, `${way} är låst med tomt namn`).toBe(false)
      fireEvent.click(exit)
      await waitFor(() => expect(document.activeElement).toBe(nameField()))
      // En gång per skärm: ett besked, hur många utgångar som än trycks.
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(screen.getByRole('alert').textContent).toMatch(/Skriv ditt namn först/)
      expect(gone).toEqual([])
    }

    // Och villkoret slutar gälla i samma stund namnet finns.
    fireEvent.change(nameField(), { target: { value: 'Vera' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(nameField().getAttribute('aria-invalid')).toBe('false')
  })

  it('ger fältet en synlig etikett och låter det tomma fältet se tomt ut', async () => {
    await picker([])
    const field = nameField() as HTMLInputElement
    // Ingen platshållare som läses som ett ifyllt värde.
    expect(field.getAttribute('placeholder')).toBeNull()
    // Namnet står skrivet över fältet, och det skrivna är det fältet heter (WCAG 2.5.3).
    const label = field.closest('label')
    expect(label?.textContent).toBe('Ditt namn')
    expect(field.getAttribute('aria-required')).toBe('true')
  })
})

describe('wizarden med tomt namn (#416)', () => {
  function guide(gone: string[]): void {
    history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
    render(<NewProjectPage onNavigate={(url) => gone.push(url)} />)
  }
  const gameField = () => screen.getByLabelText('Spelets namn')

  it('svarar vid tryck på den guidade vägen: beskedet når läsaren, markören hamnar i fältet, och inget spel skapas', async () => {
    const gone: string[] = []
    guide(gone)

    const create = screen.getByRole('button', { name: /fortsätt i editorn/i }) as HTMLButtonElement
    expect(create.disabled).toBe(false)
    fireEvent.click(create)

    const said = await screen.findByRole('alert')
    expect(said.textContent).toMatch(/Spelet behöver ett namn först/)
    expect(said.getAttribute('aria-live')).toBe('assertive')

    const field = gameField()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect((field.getAttribute('aria-describedby') ?? '').split(/\s+/)).toContain(said.id)
    await waitFor(() => expect(document.activeElement).toBe(field))
    expect(gone).toEqual([])
  })

  it('svarar likadant från vägen förbi den guidade starten, och säger villkoret en gång per skärm', async () => {
    const gone: string[] = []
    guide(gone)

    const blank = screen.getByRole('button', { name: 'Skapa ett tomt spel i editorn' }) as HTMLButtonElement
    expect(blank.disabled).toBe(false)
    fireEvent.click(blank)

    await waitFor(() => expect(document.activeElement).toBe(gameField()))
    // Två utgångar i var sin spalt, ett besked.
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toMatch(/Spelet behöver ett namn först/)
    expect(gone).toEqual([])

    // Och villkoret slutar gälla i samma stund namnet finns.
    fireEvent.change(gameField(), { target: { value: 'Kråkkriget' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(gameField().getAttribute('aria-invalid')).toBe('false')
  })

  // Under skrivbordsbredd är wizarden tre steg (L10), och namnet bor i det första medan den
  // guidade utgången står i det tredje. Ett tryck som bara flyttar fokus skulle då sikta på ett
  // fält som inte är målat: steget där villkoret hör hemma öppnas först.
  it('öppnar steget där namnet bor när utgången trycks under skrivbordsbredd', async () => {
    atWidth(390)
    const gone: string[] = []
    guide(gone)

    fireEvent.click(screen.getByRole('tab', { name: '3 · Korten' }))
    const create = await screen.findByRole('button', { name: /fortsätt i editorn/i })
    fireEvent.click(create)

    await waitFor(() => expect(document.activeElement).toBe(gameField()))
    expect(screen.getByRole('alert').textContent).toMatch(/Spelet behöver ett namn först/)
    expect(gone).toEqual([])
  })

  it('håller exemplet som exempel i stället för som värde i fältet', () => {
    guide([])
    const field = gameField() as HTMLInputElement
    expect(field.getAttribute('placeholder')).toBeNull()
    expect(field.getAttribute('aria-required')).toBe('true')
    // Exemplet står skrivet vid fältet och når läsaren genom fältets egen beskrivning.
    const example = screen.getByText(/Till exempel «Skogens herrar»/)
    expect((field.getAttribute('aria-describedby') ?? '').split(/\s+/)).toContain(example.id)
  })
})
