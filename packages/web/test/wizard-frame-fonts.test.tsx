// @vitest-environment jsdom
// Startramarnas typsnitt (#420, B3, L6, L27).
//
// Den guidade starten producerade en lek som föll på produktens egen fysiska kontroll (E5) på
// kort ett: alla tre ramarna band text till `Georgia, serif` och `system-ui`, och wizardens
// dokument satte inga `fonts`. Kriteriet är därför inte «färre anmärkningar» utan noll — räknat
// på alla anmärkningskoder och på varje kort, eftersom prototypen mätte att ramarna inte har
// något annat fel.
//
// Vägen mäts hela vägen: sidan trycks, dokumentet går till `POST /projects`, och kontrollen körs
// på det som ligger kvar på servern — inte på det som byggdes i minnet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { FRAMES } from '../src/wizard/frames.js'
import { parseCatalog } from '../src/editor/font-catalog.js'
import { deckIssues } from '../src/editor/checks.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { watchFontNet, type FontNet } from './font-net.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
let net: FontNet
beforeEach(async () => {
  run = await startServer()
  net = watchFontNet()
})
afterEach(async () => {
  net.undo()
  await run.stop()
})

// Två kort med riktig svensk text, som i felrapporten och som i prototypen: frågan är om
// brödtext på ett 63 mm-kort överlever, och ett tomt textfält svarar inte på den.
const KORT = [
  { title: 'Skogsvakten', body: 'När Skogsvakten kommer i spel: dra ett kort.\n\nSå länge den står kvar får dina djur +1 i styrka.' },
  { title: 'Gläntans ljus', body: 'Lägg en markör här. Vid rundans slut flyttas den till ett annat kort du äger.' },
]

// Ett spel skapat genom den guidade starten, med den ram som trycks: sidan, knappen, och det
// dokument servern blev lämnad med.
async function madeWith(frame: string): Promise<ProjectDoc> {
  const gone: string[] = []
  history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
  render(<NewProjectPage onNavigate={(url) => gone.push(url)} />)
  fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Skogens herrar' } })
  fireEvent.click(screen.getByRole('button', { name: frame }))
  for (const [i, kort] of KORT.entries()) {
    if (i > 0) fireEvent.click(screen.getByRole('button', { name: '+ Nytt kort' }))
    fireEvent.change(screen.getByLabelText(`kort ${i + 1} Titel`), { target: { value: kort.title } })
    fireEvent.change(screen.getByLabelText(`kort ${i + 1} Text`), { target: { value: kort.body } })
  }
  fireEvent.click(screen.getByRole('button', { name: /skapa spelet och fortsätt i editorn/i }))
  await waitFor(() => expect(gone).toHaveLength(1))
  const id = new URL(gone[0] ?? '', 'http://x').searchParams.get('project') ?? ''
  const stored = await run.projects.load(id)
  expect(stored).toBeTruthy()
  return stored as unknown as ProjectDoc
}

describe('a game made through the guided start (#420)', () => {
  it('has no remarks at all in the physical check when the frame is Klassisk', async () => {
    expect(deckIssues(await madeWith('Klassisk'))).toEqual([])
  })

  it('has no remarks at all in the physical check when the frame is Minimal', async () => {
    expect(deckIssues(await madeWith('Minimal'))).toEqual([])
  })

  it('has no remarks at all in the physical check when the frame is Mörk', async () => {
    expect(deckIssues(await madeWith('Mörk'))).toEqual([])
  })
})

// Och *hur* ansiktet kom dit, eftersom noll anmärkningar går att köpa på fel sätt: en familj som
// binds utan att skeppas är precis den bugg som fixas här, och en fil som läggs i produktens eget
// bygge bryter mot B3. Det här är de två lagliga vägarna, mätta på adresserna.
describe('the face a start frame is set in (#420, B3, L27)', () => {
  it('comes in out of the catalog as the project’s own asset, with the licence the catalog knows', async () => {
    const doc = await madeWith('Klassisk')

    // Katalogens par av adresser och inga andra: arket som säger var filen ligger, och filen.
    // Hela variabelfilen, som L27 kräver, och dess latinska snitt.
    expect(net.asked).toEqual(['https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400..800&display=swap', 'https://fonts.gstatic.com/s/eb-garamond/latin.woff2'])
    expect(doc.fonts?.['EB Garamond']).toEqual({
      stack: '"EB Garamond", serif',
      asset: expect.stringMatching(/^asset:[0-9a-f]{64}$/),
      licence: { licence: 'OFL 1.1', by: 'Georg Duffner, Octavio Pardo' },
      source: 'catalog',
    })
    // Och det är projektets, inte ett löfte om Google: bytesen ligger på tjänsten.
    const hash = String(doc.fonts?.['EB Garamond']?.asset).slice('asset:'.length)
    const served = await fetch(`${run.http}/assets/${hash}`)
    expect(served.ok).toBe(true)
    expect((await served.arrayBuffer()).byteLength).toBeGreaterThan(0)

    // Familjen mallen sätter text i är dokumentets nyckel. Är de två inte samma sträng hittar
    // den fysiska kontrollen ingen fil, hur väl filen än ligger där.
    const families = doc.template.faces['front']?.base.flatMap((el) => (el.kind === 'text' ? [el.font.family] : []))
    expect([...new Set(families)]).toEqual(['EB Garamond'])
  })

  // Mörk bär den familj appen redan skriver filten i (K20), och tar den ändå samma väg som de
  // andra två. Det är gränsen K20 själv drar mot B3: den inbakade filen är appens eget ansikte
  // för sitt eget gränssnitt, och projektets typsnitt är projektets — även när det är samma
  // familj. Att i stället hämta den ur bygget hade krävt en lös woff2 där, vilket
  // `felt-font.spec.ts` fäller, eller en andra kopia av samma bytes i wizardens kod.
  it('takes Mörk’s family the same way, although the app already writes the felt in it', async () => {
    const doc = await madeWith('Mörk')

    expect(net.asked).toEqual(['https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@100..900&display=swap', 'https://fonts.gstatic.com/s/roboto-condensed/latin.woff2'])
    expect(doc.fonts?.['Roboto Condensed']).toEqual({
      stack: '"Roboto Condensed", sans-serif',
      asset: expect.stringMatching(/^asset:[0-9a-f]{64}$/),
      licence: { licence: 'OFL 1.1', by: 'Christian Robertson' },
      source: 'catalog',
    })
    const hash = String(doc.fonts?.['Roboto Condensed']?.asset).slice('asset:'.length)
    expect((await fetch(`${run.http}/assets/${hash}`)).ok).toBe(true)
  })

  // Och ingen av de tre hämtar en typsnittsfil ur produktens eget bygge: B3 säger att inga
  // typsnittsfiler följer med produkten, och `felt-font.spec.ts` håller bygget vid det.
  it('asks the build for no font file of its own, whichever frame is chosen', async () => {
    for (const frame of ['Klassisk', 'Minimal', 'Mörk']) {
      net.asked.length = 0
      cleanup()
      await madeWith(frame)
      expect(net.asked.filter((url) => !url.startsWith('https://fonts.googleapis.com/') && !url.startsWith('https://fonts.gstatic.com/')), frame).toEqual([])
    }
  })

  // Tre ramar, tre familjer: L6 lovar tre utseenden, och tre färgsättningar av samma typografi är
  // inte tre utseenden. Sagt på ramarna själva, så att ett byte som gör två ramar till en syns.
  it('gives each of the three frames a voice of its own', () => {
    expect(FRAMES.map((frame) => frame.font.family)).toEqual(['EB Garamond', 'Inter', 'Roboto Condensed'])
  })

  // Ramens rad är skriven av hand ur den genererade listan, och listan genereras om (#370, L27).
  // En vikt eller en licens som flyttar där ska inte kunna lämna ramen kvar på gamla uppgifter:
  // vikterna är vad `css2` bes om, och licensen är vad tryckordern får med sig.
  it('copies each frame’s family out of the generated catalog, word for word', async () => {
    const { GOOGLE_FONTS } = await import('../src/editor/google-fonts.js')
    const listed = parseCatalog(GOOGLE_FONTS)
    for (const frame of FRAMES) {
      const row = listed.find((family) => family.family === frame.font.family)
      expect(row, `${frame.font.family} is not in the catalog`).toBeTruthy()
      expect(frame.font).toEqual(row)
    }
  })
})
