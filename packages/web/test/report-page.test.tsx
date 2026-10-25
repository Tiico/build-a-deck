// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReportPage } from '../src/terms/ReportPage.js'
import { TermsPage } from '../src/terms/TermsPage.js'
import { PictureSlot } from '../src/editor/PictureSlot.js'
import { WithheldStrip } from '../src/editor/WithheldStrip.js'
import { WithheldPictures } from '../src/editor/withheld.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { startServer, type Running } from './fixture.js'

// A report of a picture (#1274, beställarens beslut 2026-10-25, variant A with C's strip in Tabell):
// the page at /villkor/anmal against the real server, from the terms' section 11; and the tile that
// says «Spärrad» and the strip that says why.
let run: Running
beforeEach(async () => {
  localStorage.clear()
  run = await startServer({ auth: true, authBypass: true, appOrigin: location.origin })
})
afterEach(async () => {
  cleanup()
  await run.stop()
})

function at(path: string, page: ReactNode) {
  history.replaceState(null, '', `${path}${path.includes('?') ? '&' : '?'}server=${encodeURIComponent(run.http)}`)
  render(<StatusLive>{page}</StatusLive>)
}

describe('the report page (#1274)', () => {
  it('asks what DSA art. 16 asks, says what is missing, and sends the report with a receipt', async () => {
    at('/villkor/anmal', <ReportPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Anmäl en bild' })).toBeTruthy()
    for (const name of ['Vilken bild är det?', 'Var finns den?', 'Varför får den inte finnas?', 'Ditt namn', 'Din e-post']) expect(screen.getByLabelText(name)).toBeTruthy()
    const send = screen.getByRole('button', { name: 'Skicka anmälan' })
    fireEvent.click(send)
    // Nothing goes until what, where, why and the good faith are there, and the first gap has the focus.
    expect(await screen.findByText('Säg vilken bild det är, till exempel kortets namn.')).toBeTruthy()
    expect(screen.getByText('Kryssa i rutan för att skicka.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Vilken bild är det?'))
    expect((await run.reports.list()).length).toBe(0)

    fireEvent.change(screen.getByLabelText('Vilken bild är det?'), { target: { value: 'Bilden på kortet Skogsvaktaren' } })
    fireEvent.change(screen.getByLabelText('Var finns den?'), { target: { value: 'Skogens råd' } })
    fireEvent.change(screen.getByLabelText('Varför får den inte finnas?'), { target: { value: 'Min målning.' } })
    fireEvent.change(screen.getByLabelText('Din e-post'), { target: { value: 'mira@example.com' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(send)
    expect(await screen.findByText('Anmälan är skickad')).toBeTruthy()
    expect(screen.getByText('Ett kvitto med det du skrev har gått till mira@example.com. Anmälan heter A-0001.')).toBeTruthy()
    const [kept] = await run.reports.list()
    expect(kept).toMatchObject({ what: 'Bilden på kortet Skogsvaktaren', where: 'Skogens råd', why: 'Min målning.', email: 'mira@example.com', lang: 'sv' })
    expect(run.mail.sent.some((m) => m.to === 'mira@example.com' && m.subject.includes('A-0001'))).toBe(true)
  })

  it('is reached from section 11 of the terms', async () => {
    at('/villkor', <TermsPage />)
    const link = await screen.findByRole('link', { name: 'anmälningssidan' })
    expect(link.getAttribute('href')).toBe(`/villkor/anmal?server=${encodeURIComponent(run.http)}`)
  })
})

describe('a blocked picture in Tabell (#1274)', () => {
  const HASH = 'b'.repeat(64)
  const block = { reason: 'rights' as const, at: '2026-10-25T12:00:00.000Z' }

  it('is the word «Spärrad» on its tile, and a press asks for the reasons rather than opening the library', () => {
    const onChoose = vi.fn()
    const onWithheld = vi.fn()
    render(
      <WithheldPictures.Provider value={new Map([[HASH, block]])}>
        <PictureSlot label="Bild för dragon" choose="Välj" replace="Byt" alt="dragon art" base="http://api.local" value={HASH} onChoose={onChoose} onPick={vi.fn()} onFiles={vi.fn()} onClear={vi.fn()} onWithheld={onWithheld} />
      </WithheldPictures.Provider>,
    )
    const tile = screen.getByRole('button', { name: 'Bilden är spärrad. Visa varför' })
    expect(tile.textContent).toBe('Spärrad')
    // Never asked of the service, so never the broken-picture glyph.
    expect(screen.queryByRole('img')).toBeNull()
    fireEvent.click(tile)
    expect(onWithheld).toHaveBeenCalled()
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('says why, how to object, and opens on «Byt bilden»', async () => {
    const onSwap = vi.fn()
    const onClose = vi.fn()
    render(<WithheldStrip block={block} onSwap={onSwap} onClose={onClose} />)
    const strip = screen.getByRole('dialog', { name: 'Bilden är spärrad efter en anmälan' })
    expect(strip.textContent).toContain('Den som äger rätten till bilden anmälde den, och en människa beslutade 25 oktober.')
    expect(strip.textContent).toContain('Vill du invända, svara på mejlet du fick.')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Byt bilden' })))
    fireEvent.click(screen.getByRole('button', { name: 'Byt bilden' }))
    expect(onSwap).toHaveBeenCalled()
    fireEvent.keyDown(strip, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
