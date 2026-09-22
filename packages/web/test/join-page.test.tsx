// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StatusLive } from '../src/status/StatusLive.js'
import { TableClient } from '../src/client.js'
import { JoinPage } from '../src/join/JoinPage.js'
import { admit, asSeat, asTable, createSession, recipeSetup, roomOf, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function open(sessionId: string) {
  history.replaceState(null, '', `/join?code=${roomOf(sessionId).code}&server=${encodeURIComponent(run.url)}`)
  render(<JoinPage />)
  await screen.findByRole('button', { name: /Sätt dig/ })
}

describe('JoinPage', () => {
  it('shows every seat live with who sits there, and preselects the next free one', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await open(id)

    const a = document.querySelector('[data-seat="A"]')!
    const b = document.querySelector('[data-seat="B"]')!
    expect(a.textContent).toContain('Ada')
    expect(a.getAttribute('aria-disabled')).toBe('true')
    expect(b.getAttribute('aria-pressed')).toBe('true')

    // Someone else sits down while we look: the picker follows.
    const other = TableClient.connect(await asSeat(run, id, 'B'))
    await other.ready()
    await other.send({ v: 'seat.claim', seat: 'B', name: 'Bo' })
    await waitFor(() => expect(document.querySelector('[data-seat="B"]')!.textContent).toContain('Bo'))
    expect(document.querySelector('[aria-pressed="true"]')).toBeNull()
    table.close()
    other.close()
  })
})

describe('sitting down', () => {
  it('navigates to /play with the chosen seat, the name and the server; a taken seat cannot be picked', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    const gone: string[] = []
    render(<JoinPage onSit={(url) => gone.push(url)} />)
    await screen.findByRole('button', { name: /Sätt dig/ })

    fireEvent.click(document.querySelector('[data-seat="A"]')!)
    expect(document.querySelector('[data-seat="B"]')!.getAttribute('aria-pressed')).toBe('true')

    // Vägen in står öppen utan namn och svarar när den trycks (#416, variant B): beskedet kommer
    // vid fältet och ingen skickas någonstans. `name-required.test.tsx` mäter hela det svaret.
    expect((screen.getByRole('button', { name: /Sätt dig/ }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Sätt dig/ }))
    expect(gone).toEqual([])
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: ' Bo ' } })
    fireEvent.click(screen.getByRole('button', { name: /Sätt dig/ }))
    // The code buys a token for the seat first (DRIFT §9); the link carries it.
    await waitFor(() => expect(gone).toHaveLength(1))
    const link = new URL(gone[0] ?? '', 'http://x')
    expect(link.pathname).toBe('/play')
    expect(Object.fromEntries(link.searchParams)).toMatchObject({ session: id, seat: 'B', name: 'Bo', server: run.url })
    expect(link.searchParams.get('token')?.length).toBeGreaterThan(20)
    table.close()
  })
})

describe('watching instead of playing (C8)', () => {
  it('offers to observe with a name, which leads to the observer view', async () => {
    const id = await createSession(run)
    const seen: string[] = []
    history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    render(<JoinPage onSit={(url) => seen.push(url)} />)
    await screen.findByRole('button', { name: /Sätt dig/ })
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Eva' } })
    fireEvent.click(screen.getByRole('button', { name: /Bara titta/ }))
    await waitFor(() => expect(seen).toHaveLength(1))
    const link = new URL(seen[0] ?? '', 'http://x')
    expect(link.pathname).toBe('/observe')
    expect(Object.fromEntries(link.searchParams)).toMatchObject({ session: id, name: 'Eva' })
    expect(link.searchParams.get('token')?.length).toBeGreaterThan(20)
  })
})

describe('playing from this screen (C2)', () => {
  it('offers to play with the table on this screen, which leads to the online view for the chosen seat', async () => {
    const id = await createSession(run)
    const seen: string[] = []
    history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    render(<JoinPage onSit={(url) => seen.push(url)} />)
    await screen.findByRole('button', { name: /Sätt dig/ })
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: /Spela på den här skärmen/ }))
    await waitFor(() => expect(seen).toHaveLength(1))
    const link = new URL(seen[0] ?? '', 'http://x')
    expect(link.pathname).toBe('/online')
    expect(Object.fromEntries(link.searchParams)).toMatchObject({ session: id, seat: 'A', name: 'Ada' })
    expect(link.searchParams.get('token')?.length).toBeGreaterThan(20)
  })
})

// Where the way out lands (#31). Whoever left is back where she chose her seat, and the picker is
// what tells her the leaving actually happened — the seat she gave up is drawn free like any
// other, so without a word she would be looking at a picker she cannot tell from the one she came
// in through.
describe('coming back to the picker after leaving (#31)', () => {
  it('says the seat is free and the hand is back in the pile, and offers the seat again at once', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/join?code=${roomOf(id).code}&left=1&server=${encodeURIComponent(run.url)}`)
    render(<JoinPage />)
    await screen.findByRole('button', { name: /Sätt dig/ })
    expect(screen.getByText(/Din plats är ledig och handen ligger tillbaka i draghögen/)).toBeTruthy()
    expect(document.querySelector('[data-seat="A"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('says nothing of the sort to somebody who simply scanned the code', async () => {
    const id = await createSession(run)
    await open(id)
    expect(screen.queryByText(/Din plats är ledig/)).toBeNull()
  })
})

describe('a code that does not resolve (DRIFT §9)', () => {
  it('says the code no longer applies instead of connecting', async () => {
    history.replaceState(null, '', `/join?code=ZZZZZZ&server=${encodeURIComponent(run.url)}`)
    // The page says it where every state is said (#7): the one assertive live region the app
    // mounts, rather than a `role="alert"` of its own invention.
    render(
      <StatusLive>
        <JoinPage />
      </StatusLive>,
    )
    const said = await screen.findByText(/gäller inte längre/)
    expect(said.textContent).toContain('ZZZZZZ')
    await waitFor(() => expect(document.querySelector('[data-status-live="assertive"]')!.textContent).toMatch(/bordet finns inte/i))
  })
})

// Two free seats say the same word, and which one a finger is pointing at is carried by colour
// and by which edge of the table it sits on — neither of which a reader hears. The seat's own
// letter belongs in the name, in front of the word that is already there (UX-kontroll 2026-09-10).
describe('the seats a reader hears', () => {
  it('says which seat each one is, free or taken', async () => {
    const id = await createSession(run)
    const table = TableClient.connect(await asTable(run, id))
    await table.ready()
    await table.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await open(id)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Plats A, Ada' })).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Plats B, ledig' })).toBeTruthy()
    // What the eye reads is the seat's own letter over the word (#80): "ledig" said alone told
    // one free seat from another by colour and place and nothing else. The spoken name is
    // untouched by that — it said the letter first all along — so the pair on the screen is
    // hidden from the reader rather than read out after it.
    const b = document.querySelector('[data-seat="B"]')!
    expect(b.textContent).toBe('Bledig')
    expect([...b.children].map((el) => [el.tagName, el.textContent, el.getAttribute('aria-hidden')])).toEqual([
      ['B', 'B', 'true'],
      ['SPAN', 'ledig', 'true'],
    ])
    table.close()
  })
})

// Ett val gjort med handen släpps aldrig tyst (#408). Väljaren valde åt den som inte brydde sig —
// och tog tillbaka valet från den som brydde sig: tryckte hon på C och någon annan hann före,
// bytte sidan tyst till nästa lediga plats och satte henne där. Hon tryckte på C och hamnade på D
// utan ett ord. `free[0]` är ett erbjudande till den orörda väljaren, inte en rättelse av ett val.
describe('a seat chosen by hand that somebody else takes (#408)', () => {
  const picker = async (run_: Running, onSit?: (url: string) => void) => {
    const id = await createSession(run_, 's1', undefined, recipeSetup(4))
    history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run_.url)}`)
    render(<JoinPage {...(onSit ? { onSit } : {})} />)
    await screen.findByRole('button', { name: /Sätt dig/ })
    return id
  }
  const seatOf = (seat: string) => document.querySelector(`[data-seat="${seat}"]`)!

  it('keeps the pick where she put it and says in the picker that it was taken', async () => {
    const id = await picker(run)
    fireEvent.click(seatOf('C'))
    expect(seatOf('C').getAttribute('aria-pressed')).toBe('true')

    const other = TableClient.connect(await asSeat(run, id, 'C', 'Robin'))
    await other.ready()
    await other.send({ v: 'seat.claim', seat: 'C', name: 'Robin' })

    // The picker says it, where the control that is refused stands — not on an error page.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/togs precis av någon annan/))
    // And the pick is still hers: nothing else was chosen behind her back.
    expect(seatOf('C').getAttribute('aria-pressed')).toBe('true')
    expect([...document.querySelectorAll('[aria-pressed="true"]')].map((el) => el.getAttribute('data-seat'))).toEqual(['C'])
    other.close()
  })

  it('takes «sätt dig» away until she has chosen somewhere else', async () => {
    const id = await picker(run)
    fireEvent.click(seatOf('C'))
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Kim' } })
    const sit = () => screen.getByRole('button', { name: /Sätt dig/ }) as HTMLButtonElement
    const here = () => screen.getByRole('button', { name: /Spela på den här skärmen/ }) as HTMLButtonElement
    expect(sit().disabled).toBe(false)

    const other = TableClient.connect(await asSeat(run, id, 'C', 'Robin'))
    await other.ready()
    await other.send({ v: 'seat.claim', seat: 'C', name: 'Robin' })
    await waitFor(() => expect(sit().disabled).toBe(true))
    // The same goes for the other way in to a seat: both would ask for C and both would be refused.
    expect(here().disabled).toBe(true)
    // Disabled, not absent: the control keeps its name and its place, so the picker does not
    // rearrange itself under a thumb that is already on the way down.
    expect(sit().textContent).toMatch(/Sätt dig/)

    // Choosing again is what gives it back, and the refusal goes with the choice it was about.
    fireEvent.click(seatOf('D'))
    expect(sit().disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
    other.close()
  })

  // The other half of the rule, and the half that must not be broken by fixing the first: somebody
  // who has touched nothing has made no choice to defend, so the picker keeps offering the next
  // free seat and says nothing about it.
  it('still slides an untouched picker to the next free seat, without a word and without asking', async () => {
    const id = await picker(run)
    expect(seatOf('A').getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Moa' } })

    const other = TableClient.connect(await asSeat(run, id, 'A', 'Ada'))
    await other.ready()
    await other.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await waitFor(() => expect(seatOf('B').getAttribute('aria-pressed')).toBe('true'))

    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByRole('button', { name: /Sätt dig/ }) as HTMLButtonElement).disabled).toBe(false)
    other.close()
  })

  // The whole point of the rule, said as the thing that must never happen: whatever the picker
  // shows as chosen is the seat the phone asks for, and there is no other way out of this form.
  it('never sends anyone to a seat other than the one the picker shows', async () => {
    const gone: string[] = []
    const id = await picker(run, (url) => gone.push(url))
    fireEvent.click(seatOf('C'))
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Kim' } })

    const other = TableClient.connect(await asSeat(run, id, 'C', 'Robin'))
    await other.ready()
    await other.send({ v: 'seat.claim', seat: 'C', name: 'Robin' })
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())

    // Pressing anyway leads nowhere: no seat is bought, least of all another one.
    fireEvent.click(screen.getByRole('button', { name: /Sätt dig/ }))
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(seatOf('C').textContent).toContain('Robin'))
    expect(gone).toEqual([])

    // And when she chooses again, the seat she is sent to is the one drawn as chosen.
    fireEvent.click(seatOf('D'))
    const pressed = document.querySelector('[aria-pressed="true"]')!.getAttribute('data-seat')
    fireEvent.click(screen.getByRole('button', { name: /Sätt dig/ }))
    await waitFor(() => expect(gone).toHaveLength(1))
    expect(new URL(gone[0] ?? '', 'http://x').searchParams.get('seat')).toBe(pressed)
    other.close()
  })

  // Two phones can press at the same instant, before either has seen the other: then the refusal
  // comes from the server rather than from the live view. It is the same refusal and it has to
  // behave the same way — it belongs to the choice it was about, and goes when that choice does.
  it('clears a refusal the server gave when she chooses somewhere else', async () => {
    const gone: string[] = []
    const id = await picker(run, (url) => gone.push(url))
    fireEvent.click(seatOf('C'))
    fireEvent.change(screen.getByLabelText('Ditt namn'), { target: { value: 'Kim' } })
    // Robin buys C without sitting down in it, so the picker still draws C free: the phone asks
    // for a seat that is gone and hears it from the server.
    await admit(run, id, 'C', 'Robin')
    fireEvent.click(screen.getByRole('button', { name: /Sätt dig/ }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/togs precis av någon annan/))
    expect(gone).toEqual([])

    fireEvent.click(seatOf('D'))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Sätt dig/ }))
    await waitFor(() => expect(gone).toHaveLength(1))
    expect(new URL(gone[0] ?? '', 'http://x').searchParams.get('seat')).toBe('D')
  })
})
