// @vitest-environment jsdom
// Startramarnas typsnitt (#420, B3, L6, L27), som sedan «Utseende» är temats (L57, #633).
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
import type { Element } from '@byd/template'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { FRAMES } from '../src/wizard/frames.js'
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

// Ett spel skapat genom den guidade starten, med den ram och det tema som trycks: sidan, knapparna,
// och det dokument servern blev lämnad med. Temat är «Utseende»:s andra halva (L57, #633), och utan
// ett tryck på det gäller det förvalda.
async function madeWith(frame: string, theme?: string): Promise<ProjectDoc> {
  const gone: string[] = []
  history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
  render(<NewProjectPage onNavigate={(url) => gone.push(url)} />)
  fireEvent.change(screen.getByLabelText('Spelets namn'), { target: { value: 'Skogens herrar' } })
  fireEvent.click(screen.getByRole('button', { name: frame }))
  if (theme) fireEvent.click(screen.getByRole('button', { name: `Välj temat ${theme}` }))
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

const FRAME_NAMES = ['Klassisk', 'Minimal', 'Mörk'] as const
const THEME_NAMES = ['Skogssaga', 'Ren', 'Retro', 'Krönika'] as const

// Varje ram med varje tema (#633): ramen säger var saker står och temat hur det känns, och ingen av
// de tolv kombinationerna får lämna den guidade starten med en lek som faller på kort ett (#420).
describe('a game made through the guided start, in every frame and every theme (#420, #633)', () => {
  for (const frame of FRAME_NAMES)
    for (const theme of THEME_NAMES)
      it(`has no remarks at all in the physical check when the frame is ${frame} and the theme ${theme}`, async () => {
        expect(deckIssues(await madeWith(frame, theme))).toEqual([])
      })
})

// Och *hur* ansiktena kom dit, eftersom noll anmärkningar går att köpa på fel sätt: en familj som
// binds utan att skeppas är precis den bugg #420 fixade, och en fil som läggs i produktens eget
// bygge bryter mot B3. Sedan «Utseende» (L57, #633) är ansiktena temats och inte ramens, och spelet
// får temat som om det valts i Speltema: familjerna, betydelserna och startikonerna, och vilket
// tema det utgår från.
describe('the theme a guided start is made in (#633, #420, B3, L27)', () => {
  it('carries the theme s two families out of the catalog as the project s own assets, with the licences the catalog knows', async () => {
    const doc = await madeWith('Minimal', 'Retro')

    // Katalogens par av adresser och inga andra, för var och en av temats två familjer: arket som
    // säger var filen ligger, och filen. Hela variabelfilen, som L27 kräver.
    expect([...net.asked].sort()).toEqual(
      [
        'https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap',
        'https://fonts.gstatic.com/s/oswald/latin.woff2',
        'https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@100..900&display=swap',
        'https://fonts.gstatic.com/s/roboto-condensed/latin.woff2',
      ].sort(),
    )
    expect(doc.fonts).toEqual({
      Oswald: { stack: '"Oswald", sans-serif', asset: expect.stringMatching(/^asset:[0-9a-f]{64}$/), licence: { licence: 'OFL 1.1', by: 'Vernon Adams, Kalapi Gajjar, Cyreal' }, source: 'catalog' },
      'Roboto Condensed': { stack: '"Roboto Condensed", sans-serif', asset: expect.stringMatching(/^asset:[0-9a-f]{64}$/), licence: { licence: 'OFL 1.1', by: 'Christian Robertson' }, source: 'catalog' },
    })
    // Och det är projektets, inte ett löfte om Google: bytesen ligger på tjänsten.
    for (const font of Object.values(doc.fonts ?? {})) expect((await fetch(`${run.http}/assets/${String(font.asset).slice('asset:'.length)}`)).ok).toBe(true)
  })

  // Samma regel som `setTheme` (L57): prosan i brödtextens familj, allt annat i rubrikens.
  it('sets the prose in the theme s body family and everything else in its heading family', async () => {
    const doc = await madeWith('Klassisk', 'Krönika')
    // Into the frame's conditions too: the cost stands inside the one that draws it only when there is one (#730).
    const all = (els: readonly Element[]): Element[] => els.flatMap((el) => ('children' in el ? [el, ...all(el.children)] : [el]))
    const texts = Object.fromEntries(all(doc.template.faces['front']?.base ?? []).flatMap((el) => (el.kind === 'text' ? [[el.id, el.font.family]] : [])))
    expect(texts).toEqual({ title: 'Lora', body: 'Merriweather', cost: 'Lora' })
  })

  it('remembers the theme it started from, and is given its meanings and its starter icons as Speltema gives them', async () => {
    const doc = await madeWith('Mörk', 'Retro')
    expect(doc.theme).toEqual({ from: 'retro' })
    expect(doc.palette).toEqual({ kostnad: '#8f2d20', vinst: '#7a5c00', försvar: '#155e75', anfall: '#6b2d5c' })
    expect(Object.keys(doc.icons).sort()).toEqual(['dra', 'hjärta', 'kristall', 'mynt', 'svärd', 'sköld'].sort())
    for (const [name, url] of Object.entries(doc.icons)) {
      expect(url, name).toMatch(/^asset:[0-9a-f]{64}$/)
      expect((await fetch(`${run.http}/assets/${url.slice('asset:'.length)}`)).ok, name).toBe(true)
      expect(doc.credits?.[name], name).toMatchObject({ licence: 'CC0-1.0' })
    }
  })

  // Utan ett tryck på något tema gäller det första, och dess familjer hämtas när spelet skapas —
  // inte förr (L27).
  it('starts from the first theme when none is pressed, and fetches its families only when the game is made', async () => {
    const doc = await madeWith('Klassisk')
    expect(doc.theme).toEqual({ from: 'skogssaga' })
    expect(Object.keys(doc.fonts ?? {}).sort()).toEqual(['Cinzel', 'EB Garamond'])
  })

  // Ett tema med en familj ger en fil, inte två.
  it('carries one file for a theme set in one family', async () => {
    const doc = await madeWith('Minimal', 'Ren')
    expect(Object.keys(doc.fonts ?? {})).toEqual(['Inter'])
  })

  // Och ingen kombination hämtar en typsnittsfil ur produktens eget bygge: B3 säger att inga
  // typsnittsfiler följer med produkten, och `felt-font.spec.ts` håller bygget vid det.
  it('asks the build for no font file of its own, whichever frame is chosen', async () => {
    for (const frame of ['Klassisk', 'Minimal', 'Mörk']) {
      net.asked.length = 0
      cleanup()
      await madeWith(frame)
      expect(net.asked.filter((url) => !url.startsWith('https://fonts.googleapis.com/') && !url.startsWith('https://fonts.gstatic.com/')), frame).toEqual([])
    }
  })

  // Ramen säger var saker står, och bär inget typsnitt längre (L57).
  it('leaves the face to the theme: no frame carries a family of its own', () => {
    for (const frame of FRAMES) expect(frame, frame.id).not.toHaveProperty('font')
  })
})

// The preview in the theme's own faces (#476, beslut 2026-09-27; #633): the faces are fetched from
// the catalogue when a theme is pressed, which is the designer's own act (L27), and not before: the
// wizard opening, or a frame pressed, asks Google for nothing, and says the faces come with the
// theme.
describe('the preview in the theme s own faces (#476, #633)', () => {
  const preview = () => document.querySelector('.byd-wizard-preview') as HTMLElement
  const drawn = () => [...preview().querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')

  it('asks the catalogue for nothing until a theme is pressed, a frame included, and says the faces come with it', async () => {
    history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
    render(<NewProjectPage onNavigate={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Minimal' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(net.asked).toEqual([])
    expect(preview().textContent).toContain('Temats typsnitt hämtas när du väljer tema.')
  })

  it('draws the preview in the pressed theme s heading and body faces once they have been fetched', async () => {
    history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
    render(<NewProjectPage onNavigate={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Välj temat Retro' }))
    await waitFor(() => expect(drawn()).toMatch(/@font-face\{font-family:"Oswald";src:url\("https:\/\/fonts\.gstatic\.com\/s\/oswald\/latin\.woff2"\)/))
    expect(drawn()).toMatch(/@font-face\{font-family:"Roboto Condensed";src:url\("https:\/\/fonts\.gstatic\.com\/s\/roboto-condensed\/latin\.woff2"\)/)
    expect(preview().textContent).not.toContain('Temats typsnitt hämtas när du väljer tema.')
  })

  // The theme's colours reach the card through its meanings (E4): a symbol written with a meaning is
  // painted in the theme's colour for it, and another theme paints it in its own.
  it('paints a meaning in the pressed theme s colour, and changes it when the theme changes', async () => {
    history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
    render(<NewProjectPage onNavigate={() => undefined} />)
    fireEvent.change(screen.getByLabelText('kort 1 Text'), { target: { value: 'Betala {mynt|kostnad}.' } })
    const ink = () => (preview().querySelector('.byd-ink') as HTMLElement | null)?.style.background
    await waitFor(() => expect(ink()).toBe('rgb(143, 45, 32)'))
    fireEvent.click(screen.getByRole('button', { name: 'Välj temat Krönika' }))
    await waitFor(() => expect(ink()).toBe('rgb(107, 45, 92)'))
  })
})
