// @vitest-environment jsdom
// Biblioteket finns för bilderna som *inte* sitter på ett kort än (#222, beslut 4): det är dem
// man hittar, beskär och lägger ut. Men editorn mätte bara bilderna som redan var i bruk, så just
// de bilder biblioteket är till för saknade mått — och utan mått läggs beskärningsrutan över en
// låda av den vanligaste formen i stället för över filens egen, och kortet bredvid ritas obeskuret
// medan rutan dras. Beskärningen syns alltså inte där beslutet lovar att den syns.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

let run: Running
beforeEach(async () => {
  run = await startServer()
  // En riktig fil i spelet, som ligger i regelboken och som inget kort är ritat ur — det fall
  // biblioteket finns för.
  const put = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG })
  const { hash } = (await put.json()) as { hash: string }
  // Mätt en gång, som en fil är: 400 × 200, dubbelt så bred som hög. Måttet läggs där editorn
  // hämtar det, så att provet inte hänger på att jsdom kan rita en bild på en duk.
  await fetch(`${run.http}/assets/${hash}/motif`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ w: 400, h: 200, trim: { left: 0, top: 0, right: 0, bottom: 0 } }),
  })
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rules = { title: 'Regler', blocks: [{ kind: 'image', id: 'karta', asset: `asset:${hash}`, alt: 'Kartan', px: { w: 800, h: 600 } }] }
  await run.projects.create(run.projectId, doc)
})
afterEach(async () => {
  await run.stop()
})

describe('a picture no card uses is still measured (#222, beslut 4)', () => {
  it('lays the crop window over the picture’s own shape and not over a box of the commonest one', async () => {
    const user = userEvent.setup()
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('tab', { name: 'Media' }))
    // The tile by its exact name: since #318 its «Ta bort» stands beside it and says the name too.
    await user.click(await screen.findByRole('button', { name: 'Bild som inget kort använder' }))

    // Måttet hämtas när fliken öppnas, så formen är den rutan landar på och inte den den råkar ha
    // i samma ögonblick som den ritas.
    await waitFor(() => {
      const picture = document.querySelector('.byd-crop-picture') as HTMLElement
      // 400 / 200 = 2. Utan måttet blir det 1,5 — den vanligaste formen, och inte filens.
      const [wide = '0', high = '1'] = picture.style.aspectRatio.split('/')
      expect(Number(wide) / Number(high)).toBe(2)
    })
  })

  // Statusen får inte påstå att servern sparat när så inte skett (#297, L33): i samma ögonblick
  // som tangenten trycks håller klienten editen och statusen är bärnsten; grön blir den först när
  // aktören ekat den tillbaka.
  it('säger «sparas» tills aktören ekat beskärningen, och först då «beskuren»', async () => {
    const user = userEvent.setup()
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('tab', { name: 'Media' }))
    await user.click(await screen.findByRole('button', { name: 'Bild som inget kort använder' }))
    const sheet = screen.getByRole('dialog', { name: 'Beskärning' })
    const status = within(sheet).getByRole('status')
    expect(status.getAttribute('data-state')).toBe('whole')

    fireEvent.keyDown(within(sheet).getByRole('button', { name: 'Nedre högra hörnet' }), { key: 'ArrowLeft', shiftKey: true })

    expect(status.getAttribute('data-state')).toBe('saving')
    await waitFor(() => expect(status.getAttribute('data-state')).toBe('saved'))
    expect(status.textContent).toBe('✓ Beskuren · visar 90 %')
  })
})
