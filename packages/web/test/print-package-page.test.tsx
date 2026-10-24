// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { PrintPackagePage } from '../src/account/PrintPackagePage.js'
import { HomePage } from '../src/account/HomePage.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// The print package's page (#1208, beslut B 2026-10-23): what Testtryckeriet would be sent, in five
// numbered parts with a packing slip beside it, and the download during the beta. Wired to the real
// server with Testtryckeriet registered; the render queue is completed by a stand-in, so the zip is
// the server's own.
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true, print: true })
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await run.stop()
})

const loggedIn = () => fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })

// The fixture's game with backs that run out into the bleed, so the print checks pass, and two d6.
function printable(): ProjectDoc {
  const doc = projectDoc()
  const back = doc.template.faces['back']?.base[0]
  if (back) Object.assign(back, { x: -3, y: -3, w: 69, h: 94 })
  return { ...doc, setup: { ...doc.setup, dice: [{ faces: 6, count: 2, zone: 'table' }] } }
}

async function made(doc: ProjectDoc): Promise<void> {
  await loggedIn()
  const res = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...doc }) })
  expect(res.status).toBe(201)
}

function open(query = ''): string[] {
  history.replaceState(null, '', `/print-package?project=${run.projectId}&server=${encodeURIComponent(run.http)}${query}`)
  const gone: string[] = []
  render(
    <StatusLive>
      <PrintPackagePage onNavigate={(url) => gone.push(url)} />
    </StatusLive>,
  )
  return gone
}

const slip = () => screen.getByRole('complementary', { name: 'Följesedel' })
const part = (name: string | RegExp) => screen.getByRole('region', { name })
const facts = (dl: HTMLElement) => Object.fromEntries([...dl.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]))

describe('the print package page', () => {
  it('asks a reader who is not logged in to log in', async () => {
    open()
    expect(await screen.findByLabelText('E-post')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Tryckpaketet' })).toBeNull()
  })

  it('lays the package out in five numbered parts, with the packing slip beside them', async () => {
    await made(printable())
    open()
    expect(await screen.findByRole('heading', { level: 1, name: /^Tryckpaketet/ })).toBeTruthy()
    expect(screen.getByText('Skogens herrar · v1')).toBeTruthy()
    expect(screen.getByText(/Det här är vad ett tryckeri skulle få om Skogens herrar trycktes i dag/)).toBeTruthy()
    const parts = [...document.querySelectorAll('.byd-print-part h2')].map((h) => h.textContent)
    expect(parts).toEqual(['Så skärs ett kort', 'Leken: 4 kort', 'Det som inte trycks', 'Testtryckeriets krav', 'Paketet'])
    expect([...document.querySelectorAll('.byd-print-part .byd-print-nr')].map((n) => n.textContent)).toEqual(['1', '2', '3', '4', '5'])
    expect(within(slip()).getByRole('heading', { name: 'Vad tryckeriet skulle svara' })).toBeTruthy()
    expect(facts(slip().querySelector('dl')!)).toEqual({ Kort: '4', 'Olika framsidor': '3', 'Tärningar d6': '2', Tryckkontrollen: 'inga fel' })
    // Back to where the designer came from: Mina spel, or the game in the editor.
    const back = screen.getByRole('link', { name: /Mina spel/ })
    expect(back.getAttribute('href')).toBe(`/?server=${encodeURIComponent(run.http)}`)
  })

  it('says what the test printer would answer, stamped as an example, with no duty inside the EU', async () => {
    await made(printable())
    open()
    const answer = (await screen.findByText('Exempel · inget riktigt pris')).closest('.byd-print-answer') as HTMLElement
    expect(answer.textContent).toContain('Testtryckeriet skulle svara:')
    expect(answer.textContent).toContain('«Vi har tagit emot 4 kort i 3 varianter och 2 tärningar. Filerna håller måtten.»')
    const rows = [...answer.querySelectorAll('.byd-print-answer-row')].map((r) => r.textContent?.replace(/\s+/g, ' '))
    // 4 cards at 2,78 kr and two dice at 7,50 kr; 90 kr shipping; no duty, so a total can be said.
    expect(rows).toEqual(['4 kort och 2 tärningar≈ 26 kr', 'Frakt till Sverige≈ 90 kr', 'Totalt≈ 116 kr'])
    expect(answer.textContent).not.toMatch(/Tull/)
    expect(answer.textContent).toContain('Testtryckeriet låtsas trycka i Sverige, inom EU.')
    expect(within(slip()).getByText(/Ingen beställning läggs\./, { selector: '.byd-print-no-order' }).textContent).toBe('Det här är vad som skulle skickas till ett tryckeri. Ingen beställning läggs.')
    expect(within(slip()).getByText('Öppet under betan.')).toBeTruthy()
  })

  it('lets the knife be tried: the file, a cut that slips, and a card without bleed', async () => {
    await made(printable())
    open()
    const cut = await screen.findByRole('region', { name: 'Så skärs ett kort' })
    expect(within(cut).getByRole('img', { name: 'Drake: filen med utfall, snitt och skyddsmarginal' })).toBeTruthy()
    expect(within(cut).getByRole('button', { name: 'Filen' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(cut).getByText('Utfall, 3 mm.')).toBeTruthy()
    expect(within(cut).getByText('Snitt, 63 × 88 mm.')).toBeTruthy()
    expect(within(cut).getByText('Skyddsmarginal, 3 mm innanför.')).toBeTruthy()
    // A slip of one millimetre straight to the right.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(5 / 9)
    fireEvent.click(within(cut).getByRole('button', { name: 'Skär kortet' }))
    expect(within(cut).getByRole('button', { name: 'Det skurna kortet' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(cut).getByRole('img', { name: 'Drake: det skurna kortet' })).toBeTruthy()
    const said = within(cut).getByText(/Kniven slirade/)
    expect(said.textContent).toContain('Kniven slirade 1,0 mm åt höger.')
    expect(said.textContent).toContain('Ingen vit kant')
    fireEvent.click(within(cut).getByRole('checkbox', { name: 'Utan utfall' }))
    expect(within(cut).getByText(/Kniven slirade/).textContent).toContain('En vit kant syns')
    // Another card from the deck is shown in the knife.
    fireEvent.click(within(part(/^Leken/)).getByRole('button', { name: /Riddare/ }))
    expect(within(cut).getByText(/Visar/).textContent).toBe('Visar Riddare. Välj ett annat kort i leken nedan.')
    expect(within(cut).getByRole('button', { name: 'Filen' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('lists the deck with counts, the dice the printer packs, its requirements and the zip', async () => {
    await made(printable())
    open()
    const deck = await screen.findByRole('region', { name: /^Leken/ })
    expect(within(deck).getByText('Tryckkontrollen hittade inga fel.')).toBeTruthy()
    // Named as a reader hears them: the card's own words on its face are a picture, not its name.
    const cards = within(within(deck).getByRole('group', { name: 'Leken' })).getAllByRole('button').map((b) => [b.querySelector('.byd-print-card-name')?.textContent, b.querySelector('.byd-print-card-count')?.textContent])
    expect(cards).toEqual([
      ['Drake', '× 2 · fram och bak'],
      ['Riddare', '× 1 · fram och bak'],
      ['Trollkarl', '× 1 · fram och bak'],
      ['Baksidan', 'samma på alla 4'],
    ])
    expect(within(deck).getByRole('button', { name: 'Drake × 2 · fram och bak' })).toBeTruthy()
    const stock = part('Det som inte trycks')
    expect(stock.textContent).toContain('2 × sexsidig tärning')
    expect(stock.textContent).toContain('tryckeriet köper vanliga tärningar')
    const needs = part('Testtryckeriets krav')
    const rows = Object.fromEntries([...needs.querySelectorAll('tr')].map((tr) => [tr.querySelector('th')?.textContent, tr.querySelector('td')?.textContent]))
    expect(rows).toEqual({
      'Kortets mått': '63 × 88 mm, rundade hörn 3 mm',
      Utfall: '3 mm per kant, så filen är 69 × 94 mm',
      Skyddsmarginal: '3 mm innanför snittet',
      Filer: 'PDF, en per kortsida; text och former som vektor, bilder i 300 dpi',
      Färger: 'sRGB; tryckeriet gör om till tryckfärger',
      Passmärken: 'Inga',
    })
    const zip = part('Paketet')
    expect(zip.textContent).toContain('Skogens herrar v1 tryckpaket.zip')
    expect(zip.textContent).toContain('tryck/dragon-front.pdf')
    expect(zip.textContent).toContain('tryck/dragon-back.pdf')
    expect(zip.textContent).toContain('… 2 filer till, fram och bak för varje kort')
    expect(zip.textContent).not.toContain('regelhafte')
    // What is not built is said, not pretended.
    expect(zip.textContent).toContain('tryckbilden till lådan, och filer i tryckfärger (CMYK)')
  })

  it('downloads the zip once its files are drawn, under the name the server gives it', async () => {
    await made(printable())
    const saved: string[] = []
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
    open()
    const button = await within(await screen.findByRole('complementary', { name: 'Följesedel' })).findByRole('button', { name: 'Ladda ner tryckpaketet' })
    fireEvent.click(button)
    expect(await within(slip()).findByText(/Förbereder filerna · \d av 4/)).toBeTruthy()
    await run.completeRenders()
    await waitFor(() => expect(saved).toEqual(['Skogens herrar v1 tryckpaket.zip']), { timeout: 5000 })
  })

  // Beställarens beslut 2026-10-23, punkt 2: with an error, the card files are left out of the
  // download by the export's rule (G5), and the page says why.
  it('says that the card files are left out while the print checks find errors', async () => {
    // The fixture's back stops at the trim, which falls short of the bleed (E5).
    await made(projectDoc())
    open()
    const deck = await screen.findByRole('region', { name: /^Leken/ })
    expect(within(deck).getByText(/fel skulle stoppa leken hos ett tryckeri\./)).toBeTruthy()
    expect(within(deck).getByText(/Drake, baksidan: når inte utfallet\./)).toBeTruthy()
    expect(within(deck).getByText(/Kortfilerna följer inte med i nedladdningen förrän felen är rättade/)).toBeTruthy()
    // The finding is on the backs, so the back's tile is marked and the fronts are not.
    expect(within(deck).getByRole('button', { name: /^Baksidan/ }).hasAttribute('data-error')).toBe(true)
    expect(within(deck).getByRole('button', { name: /^Drake/ }).hasAttribute('data-error')).toBe(false)
    expect(within(deck).getByRole('link', { name: 'Rätta i editorn ›' }).getAttribute('href')).toBe(`/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    expect(facts(slip().querySelector('dl')!)['Tryckkontrollen']).toMatch(/^\d+ fel$/)
    expect(within(slip()).getByText('Skulle inte tas emot.')).toBeTruthy()
    expect(within(slip()).getByText('Utan kortfilerna, tills felen i tryckkontrollen är rättade.')).toBeTruthy()
    expect(part('Paketet').textContent).toContain('kortfilerna följer inte med förrän felen är rättade')
    expect(part('Paketet').textContent).not.toContain('dragon-front.pdf')
  })
})

describe('the ways to the print package', () => {
  it('stands in a game’s ⋯ in Mina spel, after «Exportera…»', async () => {
    await made(printable())
    const gone: string[] = []
    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(<HomePage onNavigate={(u) => gone.push(u)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Fler val för Skogens herrar' }))
    const choices = within(screen.getByRole('group', { name: /Skogens herrar/ })).getAllByRole('button').map((b) => b.textContent)
    expect(choices.indexOf('Tryckpaketet…')).toBe(choices.indexOf('Exportera…') + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Tryckpaketet…' }))
    expect(gone.at(-1)).toBe(`/print-package?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  })
})
