// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { REDACTED } from '@byd/protocol'
import { TableClient } from '../src/client.js'
import { PlayerPage, type PlayerPageProps } from '../src/player/PlayerPage.js'
import { admit, asTable, createSession, roomOf, startServer, type Running } from './fixture.js'

// The guest's own way to be forgotten (#1281, G6, F5; beställarens val C med en ändring
// 2026-10-25): where she leaves, and under the thanks. Keeping her name is the first choice, with a
// sentence on why it helps the designer, and removing it is a second button, visible and never
// dressed as an equal choice. What it does is the server's erasure with her own token (#1279).

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
  await run.stop()
})

const NAME = 'Adelina Raderas'
const NOTE = 'Adelinas anteckning'

async function open(sessionId: string, props: PlayerPageProps = {}): Promise<string> {
  const token = await admit(run, sessionId, 'A', NAME)
  history.replaceState(null, '', `/play?session=${sessionId}&seat=A&code=${roomOf(sessionId).code}&server=${encodeURIComponent(run.url)}#token=${token}`)
  render(<PlayerPage {...props} />)
  await screen.findByText(NAME)
  return token
}
const tab = (name: RegExp) => fireEvent.click(screen.getByRole('tab', { name }))
const answers = async (id: string) => (await (await fetch(`${run.http}/sessions/${id}/surveys`)).json()) as { who: string }[]
const raw = async (id: string) => JSON.stringify([await run.store.read(id), await run.store.guestsAt(id)])

describe('leaving and removing my name (#1281)', () => {
  it('offers it under the two ways out, as a quieter button after why keeping it helps', async () => {
    const id = await createSession(run)
    await open(id, { onLeave: () => undefined })
    tab(/^Mer/)
    fireEvent.click(screen.getByRole('button', { name: 'Lämna… eller avsluta bordet' }))
    const sheet = screen.getByRole('dialog', { name: 'Lämna bordet?' })
    // In this order: the ways out first, then the reason to keep the name, then the way to remove it.
    const buttons = within(sheet).getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['Lämna bordet', 'Avsluta för alla', 'Lämna och ta bort mitt namn…', 'Avbryt'])
    expect(sheet.textContent).toContain('Med ditt namn kvar vet designern vem som gjorde och sa vad.')
    const forget = within(sheet).getByRole('button', { name: 'Lämna och ta bort mitt namn…' })
    const leave = within(sheet).getByRole('button', { name: 'Lämna bordet' })
    expect(forget.dataset['kind']).toBe('forget')
    expect(leave.dataset['kind']).toBe('leave')
  })

  it('asks first, and then removes her name and her words, leaves the seat and says it is done', async () => {
    const id = await createSession(run)
    const went: string[] = []
    const token = await open(id, { onLeave: (url) => went.push(url) })
    const tv = TableClient.connect(await asTable(run, id))
    await tv.ready()
    // She writes on the notepad, so there is a word of hers to remove.
    const phone = TableClient.connect({ url: run.url, sessionId: id, seat: 'A', token })
    await phone.ready()
    await phone.send({ v: 'note.add', text: NOTE })
    phone.close()
    expect(await raw(id)).toContain(NAME)
    expect(await raw(id)).toContain(NOTE)

    tab(/^Mer/)
    fireEvent.click(screen.getByRole('button', { name: 'Lämna… eller avsluta bordet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lämna och ta bort mitt namn…' }))
    const ask = screen.getByRole('alertdialog', { name: 'Lämna och ta bort ditt namn?' })
    expect(ask.textContent).toContain(`namnet du satt under, ${NAME}`)
    expect(ask.textContent).toContain('det du skrivit i anteckningsblocket och i flaggor')
    expect(ask.textContent).toContain('Dragen står kvar vid bordet under «Utan namn». Det går inte att ångra.')
    // Asking is not yet doing, and the focus is on the answer that changes nothing.
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Avbryt'))
    expect(await raw(id)).toContain(NAME)

    fireEvent.click(within(ask).getByRole('button', { name: 'Ja, lämna och ta bort' }))
    expect(await screen.findByRole('heading', { name: 'Du har lämnat bordet, och ditt namn är borttaget.' })).toBeTruthy()
    expect(screen.getByText(/Säkerhetskopiorna glömmer dem inom åtta dagar\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Till startsidan' })).toBeTruthy()
    // She is told it is done here, and not sent on to the picker.
    expect(went).toEqual([])
    const stored = await raw(id)
    expect(stored).not.toContain(NAME)
    expect(stored).not.toContain(NOTE)
    expect((await run.store.read(id)).at(-1)).toMatchObject({ by: 'A', intent: { v: 'seat.release', seat: 'A' } })
    expect((await run.store.guestsAt(id)).map((g) => g.name)).toEqual([REDACTED])
    tv.close()
  })

  it('says so when the name could not be removed, and leaves her sitting where she was', async () => {
    const id = await createSession(run)
    await open(id, { onLeave: () => undefined })
    const real = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => (String(input).endsWith('/erase') ? Promise.resolve(new Response('{}', { status: 503 })) : real(input, init)))
    tab(/^Mer/)
    fireEvent.click(screen.getByRole('button', { name: 'Lämna… eller avsluta bordet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lämna och ta bort mitt namn…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, lämna och ta bort' }))
    expect(await screen.findByText('Det gick inte att ta bort namnet. Försök igen.')).toBeTruthy()
    expect((await run.store.read(id)).map((l) => l.intent.v)).toEqual(['seat.claim'])
    expect(await raw(id)).toContain(NAME)
  })
})

describe('removing my name and my answers under the thanks (#1281)', () => {
  async function thanked(id: string) {
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    const token = await open(id)
    await table.send({ v: 'session.end' })
    table.close()
    for (const n of ['4', '3', '2']) {
      fireEvent.click(await screen.findByRole('button', { name: n }))
      fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))
    }
    fireEvent.change(screen.getByPlaceholderText(/En mening räcker/), { target: { value: 'Adelinas önskan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }))
    await screen.findByText(`Tack, ${NAME}.`)
    return token
  }

  it('keeps the save as the way on, and offers removing as a quieter button after why the name helps', async () => {
    const id = await createSession(run)
    await thanked(id)
    const thanks = document.querySelector('.byd-survey-thanks')!
    const controls = [...thanks.querySelectorAll('a, button')].map((c) => c.textContent)
    expect(controls).toEqual(['Spara till ditt konto', 'Villkor', 'Integritet', 'Ta bort mitt namn och mina svar…'])
    expect(thanks.textContent).toContain('Med ditt namn kvar vet designern vem som gjorde och sa vad.')
    expect((thanks.querySelector('button[data-kind="forget"]') as HTMLElement).textContent).toBe('Ta bort mitt namn och mina svar…')
  })

  it('asks first, then removes her name and her answers, and says it is done in place of the save', async () => {
    const id = await createSession(run)
    await thanked(id)
    expect((await answers(id)).map((s) => s.who)).toEqual([NAME])
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort mitt namn och mina svar…' }))
    const ask = screen.getByRole('alertdialog', { name: 'Ta bort ditt namn och dina svar?' })
    expect(ask.textContent).toContain('dina enkätsvar')
    fireEvent.click(within(ask).getByRole('button', { name: 'Ja, ta bort' }))
    expect(await screen.findByText('Ditt namn och dina svar är borttagna.')).toBeTruthy()
    expect(screen.getByText('Tack.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Spara till ditt konto' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ta bort mitt namn och mina svar…' })).toBeNull()
    expect(await answers(id)).toEqual([])
    expect(await raw(id)).not.toContain(NAME)
    // A reload remembers it, as it remembers that the answers were sent.
    cleanup()
    render(<PlayerPage />)
    expect(await screen.findByText('Ditt namn och dina svar är borttagna.')).toBeTruthy()
    expect(document.body.textContent).not.toContain(REDACTED)
  })
})
