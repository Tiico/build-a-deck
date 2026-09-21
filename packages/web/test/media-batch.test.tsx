// @vitest-environment jsdom
// Flera bilder i ett släpp, och vad biblioteket visar efteråt (#291, L22, HITL 2026-09-20).
//
// En bildbatch har ett annat slut än en enda bild. En bild öppnas i beskärningsrutan, för det är
// den bilden formgivaren just bad om. Fem bilder har ingen sådan bild: vilken som helst av dem
// vore ett godtyckligt val, och «den som nätverket blev klar med först» är det mest godtyckliga
// av alla. Så en batch slutar i biblioteksöversikten, med de lyckade märkta som nyss tillagda och
// resultatet per fil synligt, och ingen bild öppnad.
//
// Det avgörs av hur många filer formgivaren lämnade och inte av hur många uppladdningar som råkar
// lyckas: fem filer där fyra faller bort slutar ändå i översikten, för hon lämnade fem.
//
// Mätt på tråden och inte på skärmen. En uppladdning från jsdom har ljugit i det här repot förr —
// varje enda skickade de tretton bytena i strängen «[object Blob]» och såg en 201 komma tillbaka
// (se `test/setup.ts`). Så det som frågas är vad *tjänsten* håller: adressen är hashen av bytena
// som lämnade webbläsaren, och bytena läses tillbaka av tråden.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { Language } from '../src/i18n/index.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
// Hela PNG-signaturer, eftersom grinden läser filen och aldrig dess namn (#204).
const SKOGSBRYN = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const BORGEN = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9])
const HAVET = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 4, 5, 6])
// Inte en bild alls: grinden läser bytena, så den här filen refuseras hur den än heter.
const INTE_EN_BILD = Uint8Array.from([80, 75, 3, 4, 20, 0, 0, 0])
const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex')

const file = (bytes: Uint8Array<ArrayBuffer>, name: string): File => new File([bytes], name, { type: 'image/png' })

// Ett släpp av filer, som ett släpp verkligen bär dem: inga biblioteksbilder inblandade.
const filesDropped = (files: File[]) => ({ getData: () => '', files, types: ['Files'] })

function deckWithArt(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${SKOG}`
  return doc
}

// Ett spel vars mall ritar en bild men som ännu inte har en enda: det tomma bibliotekets fall.
function emptyDeck(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  return doc
}

let run: Running
beforeEach(async () => {
  run = await startServer()
  await run.projects.create(run.projectId, deckWithArt())
})
afterEach(async () => {
  await run.stop()
})

async function openMedia(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(
    <Language lang="sv">
      <EditorPage />
    </Language>,
  )
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: 'Media' }))
  await screen.findByRole('img', { name: 'Bild på dragon' })
}

const library = () => screen.getByRole('list', { name: 'Media i spelet' })
const tiles = () => [...library().querySelectorAll('li')]

describe('flera bilder i ett släpp på biblioteket (#291)', () => {
  it('lägger till var och en av dem, med de byte formgivaren släppte', async () => {
    const user = userEvent.setup()
    await openMedia(user)

    fireEvent.drop(library(), { dataTransfer: filesDropped([file(SKOGSBRYN, 'skogsbryn.png'), file(BORGEN, 'borgen.png')]) })

    await screen.findByRole('img', { name: 'skogsbryn.png' })
    await screen.findByRole('img', { name: 'borgen.png' })
    expect(tiles().map((li) => li.getAttribute('data-asset'))).toEqual([SKOG, sha256(SKOGSBRYN), sha256(BORGEN)])

    // Och tjänsten håller verkligen de bytena — lästa tillbaka av tråden, byte för byte. Ett
    // «[object Blob]» hade aldrig kunnat ge de här adresserna.
    for (const bytes of [SKOGSBRYN, BORGEN]) {
      const served = await fetch(`${run.http}/assets/${sha256(bytes)}`)
      expect(served.status).toBe(200)
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes)
    }
  })
})

describe('vad biblioteket visar efter en batch (#291, flerfilsbeslutet)', () => {
  it('visar översikten med de lyckade märkta som nyss tillagda, och öppnar ingen av dem', async () => {
    const user = userEvent.setup()
    await openMedia(user)
    // Innan släppet har en bild öppnats i beskärningsarket och stängts igen (#297, L33), så att
    // «ingen är öppnad» efteråt är en förändring och inte ett utgångsläge.
    await user.click(tiles()[0]!.querySelector('.byd-media-tile')!)
    expect(screen.getByRole('dialog', { name: 'Beskärning' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Klart' }))

    fireEvent.drop(library(), { dataTransfer: filesDropped([file(SKOGSBRYN, 'skogsbryn.png'), file(BORGEN, 'borgen.png')]) })
    // Vad batchen blev är vad batchen slutade med, och sedan #339 står en bild i biblioteket
    // redan innan dess byte har rest: den syns när editen läggs in och inte när tjänsten svarat.
    // Att vänta på bilden vore därför att mäta mitt i batchen. Listan per fil finns först när
    // varje fil har fått sitt svar, så den — och bara den — är batchens slut.
    const results = await screen.findByRole('group', { name: 'Resultat per fil' })

    // Ingen bild är vald eller öppnad för beskärning: nätverkets färdigordning får inte välja åt
    // formgivaren, och inte heller bibliotekets egen ordning.
    expect(screen.queryByRole('dialog')).toBeNull()
    // De nya är märkta som nyss tillagda, och den bild som redan fanns är det inte.
    expect(tiles().map((li) => [li.getAttribute('data-asset'), li.getAttribute('data-new')])).toEqual([
      [SKOG, null],
      [sha256(SKOGSBRYN), 'true'],
      [sha256(BORGEN), 'true'],
    ])
    // Märkningen syns också utan färg.
    expect(tiles()[1]!.textContent).toContain('nyss tillagd')
    // Och resultatet står per fil, i den ordning filerna lämnades.
    expect([...results.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['skogsbryn.png är tillagd', 'borgen.png är tillagd'])
    // Handen läggs på översikten, så att den som inte ser skärmen också hamnar där.
    await waitFor(() => expect(document.activeElement).toBe(results))
  })

  it('låter en fil som faller bort stå för sig själv, och de andra komma fram ändå', async () => {
    const user = userEvent.setup()
    await openMedia(user)

    fireEvent.drop(library(), {
      dataTransfer: filesDropped([file(SKOGSBRYN, 'skogsbryn.png'), file(INTE_EN_BILD, 'anteckningar.png'), file(HAVET, 'havet.png')]),
    })
    // Batchens slut, av samma skäl som ovan: en bild syns innan dess byte har rest.
    const results = await screen.findByRole('group', { name: 'Resultat per fil' })

    // De två bilderna är i spelet, och den tredje filen är inte det.
    expect(tiles().map((li) => li.getAttribute('data-asset'))).toEqual([SKOG, sha256(SKOGSBRYN), sha256(HAVET)])
    expect(await (await fetch(`${run.http}/assets/${sha256(INTE_EN_BILD)}`)).status).toBe(404)

    // Och raden per fil säger vilken som var vilken, i den ordning de lämnades.
    const lines = [...results.querySelectorAll('li')]
    expect(lines.map((li) => li.getAttribute('data-result'))).toEqual(['ok', 'failed', 'ok'])
    expect(lines[0]!.textContent).toBe('skogsbryn.png är tillagd')
    // Beskedet namnger vad som försvann ur dokumentet och varför (#344, L37) — och gör det en
    // gång: raden är beskedet, inte filnamnet följt av ett besked som säger filnamnet igen.
    expect(lines[1]!.textContent).toMatch(/^Bilden anteckningar\.png kunde inte laddas upp och har tagits bort igen: /)
    expect(lines[1]!.textContent!.match(/anteckningar\.png/g)).toHaveLength(1)
  })

  it('behåller föregående vy när ingen enda fil kom fram, och visar filfelen', async () => {
    const user = userEvent.setup()
    await openMedia(user)
    const before = tiles().map((li) => li.getAttribute('data-asset'))

    fireEvent.drop(library(), { dataTransfer: filesDropped([file(INTE_EN_BILD, 'ett.png'), file(INTE_EN_BILD, 'två.png')]) })

    const lines = await screen.findByRole('group', { name: 'Resultat per fil' })
    expect([...lines.querySelectorAll('li')].map((li) => li.getAttribute('data-result'))).toEqual(['failed', 'failed'])
    // Vyn står kvar: samma bibliotek som innan, inget ark öppnat och inget bibliotek som bytt läge.
    expect(tiles().map((li) => li.getAttribute('data-asset'))).toEqual(before)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(tiles().map((li) => li.getAttribute('data-new'))).toEqual([null])
  })

  it('tar emot ett släpp också när biblioteket är tomt', async () => {
    const user = userEvent.setup()
    await run.projects.create(run.otherProjectId, emptyDeck())
    history.replaceState(null, '', `/editor?project=${run.otherProjectId}&server=${encodeURIComponent(run.http)}`)
    render(
      <Language lang="sv">
        <EditorPage />
      </Language>,
    )
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('tab', { name: 'Media' }))

    // Det tomma biblioteket är en yta att sikta på och säger vad den är till för, och
    // filvalsknappen står kvar bredvid för den som inte drar med pekare.
    const grid = await screen.findByRole('list', { name: 'Media i spelet' })
    expect(grid.textContent).toContain('Släpp bildfiler här')
    expect(screen.getByLabelText('Ladda upp media')).toBeTruthy()

    fireEvent.drop(grid, { dataTransfer: filesDropped([file(SKOGSBRYN, 'skogsbryn.png')]) })
    expect(await screen.findByRole('img', { name: 'skogsbryn.png' })).toBeTruthy()
  })
})
