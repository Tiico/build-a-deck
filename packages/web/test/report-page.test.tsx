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
    for (const name of ['Vilken bild är det?', 'Var finns den?', 'Varför får den inte finnas?', 'Ditt namn', 'Din e‑post']) expect(screen.getByLabelText(name)).toBeTruthy()
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
    fireEvent.change(screen.getByLabelText('Din e‑post'), { target: { value: 'mira@example.com' } })
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

  // The way back is section 11 itself, opened, and not the top of the terms (#1361).
  it('leads back to section 11 of the terms, which opens on arrival', async () => {
    at('/villkor/anmal', <ReportPage />)
    expect(screen.getByRole('link', { name: 'Villkor, avsnitt 11' }).getAttribute('href')).toBe(`/villkor?server=${encodeURIComponent(run.http)}#villkor-11`)
    cleanup()
    history.replaceState(null, '', `/villkor?server=${encodeURIComponent(run.http)}#villkor-11`)
    render(
      <StatusLive>
        <TermsPage />
      </StatusLive>,
    )
    const eleven = (await screen.findByText('Anmälan och borttagning')).closest('details')
    expect(eleven?.id).toBe('villkor-11')
    expect(eleven?.open).toBe(true)
    expect(document.querySelectorAll('details[open]').length).toBe(1)
  })

  // The receipt takes the focus the form had, so the next Tab goes on from it (#1362, WCAG 2.4.3).
  it('puts the focus on the receipt’s heading once the report is sent', async () => {
    at('/villkor/anmal', <ReportPage />)
    fireEvent.change(screen.getByLabelText('Vilken bild är det?'), { target: { value: 'Bilden' } })
    fireEvent.change(screen.getByLabelText('Var finns den?'), { target: { value: 'Skogens råd' } })
    fireEvent.change(screen.getByLabelText('Varför får den inte finnas?'), { target: { value: 'Min.' } })
    fireEvent.click(screen.getByRole('checkbox'))
    const send = screen.getByRole('button', { name: 'Skicka anmälan' })
    send.focus()
    fireEvent.click(send)
    const heading = await screen.findByRole('heading', { name: 'Anmälan är skickad' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })

  // The beställare's decision (#1376, punkt 2): logged in, the name and the address are filled in
  // where they can be seen, and both can be emptied (L88).
  it('fills in the name and the address of whoever is logged in, and lets both be emptied', async () => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'mira@example.com' }) })
    expect((await fetch(`${run.http}/me/name`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mira Lind' }) })).ok).toBe(true)
    at('/villkor/anmal', <ReportPage />)
    const name = screen.getByLabelText<HTMLInputElement>('Ditt namn')
    const email = screen.getByLabelText<HTMLInputElement>('Din e‑post')
    await waitFor(() => expect(email.value).toBe('mira@example.com'))
    expect(name.value).toBe('Mira Lind')
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.change(email, { target: { value: '' } })
    expect(name.value).toBe('')
    expect(email.value).toBe('')
  })

  it('fills in nothing for nobody, and never over what has been typed', async () => {
    at('/villkor/anmal', <ReportPage />)
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Bo' } })
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.getByLabelText<HTMLInputElement>('Ditt namn').value).toBe('Bo')
    expect(screen.getByLabelText<HTMLInputElement>('Din e‑post').value).toBe('')
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
