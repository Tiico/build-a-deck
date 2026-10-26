// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { LoginCard } from '../src/account/LoginCard.js'
import { Language } from '../src/i18n/index.js'
import { clockWord } from '../src/editor/when.js'
import { startServer, type Running } from './fixture.js'

// The receipt «Kolla din mejl» on the login card (#1360, beställarens beslut A): a row in the receipt,
// in the form the passkey's offer has on the same green, with «Fel adress?» and «Skicka igen». Nothing
// outside the receipt changes (L36, #691), and nothing waits on a timer: a second press says when the
// new link went out and that the earlier one still works, and the limiter's refusal (five links an
// hour per address, `LoginLimiter`) says in the receipt when the next one can go.
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true })
  history.replaceState(null, '', '/login')
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await run.stop()
})

const mailsTo = (email: string) => run.mail.sent.filter((m) => m.to === email).length

async function sendTo(email: string): Promise<HTMLElement> {
  const field = await screen.findByLabelText<HTMLInputElement>('E-post')
  fireEvent.change(field, { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Skicka inloggningslänk' }))
  return receipt()
}

const receipt = async () => (await screen.findByText('Kolla din mejl')).closest<HTMLElement>('.byd-login-sent')!

describe('the receipt after the link (#1360)', () => {
  it('holds both ways on, in one row inside it', async () => {
    render(<LoginCard http={run.http} next="/" onNavigate={() => undefined} />)
    const sent = await sendTo('ada@example.com')
    const row = sent.querySelector('.byd-login-sent-answers')!
    expect(row).toBeTruthy()
    expect(within(row as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(['Fel adress?', 'Skicka igen'])
    // Nothing on the card outside the receipt is new: the field and its button are gone as before.
    expect(screen.queryByLabelText('E-post')).toBeNull()
  })

  it('«Fel adress?» goes back to the field with the address in it, and a corrected address gets its own link', async () => {
    render(<LoginCard http={run.http} next="/" onNavigate={() => undefined} />)
    const sent = await sendTo('ada@exmaple.com')
    fireEvent.click(within(sent).getByRole('button', { name: 'Fel adress?' }))
    const field = await screen.findByLabelText<HTMLInputElement>('E-post')
    expect(field.value).toBe('ada@exmaple.com')
    // Where the caret stands is a real browser's question (an email field has no selection here):
    // the journey in packages/e2e types into it.
    await waitFor(() => expect(document.activeElement).toBe(field))

    const again = await sendTo('ada@example.com')
    expect(again.textContent).toContain('ada@example.com')
    expect(mailsTo('ada@example.com')).toBe(1)
    expect(mailsTo('ada@exmaple.com')).toBe(1)
    // A receipt for a new address is a first receipt: nothing about a link sent again.
    expect(again.textContent).not.toMatch(/En ny länk/)
  })

  it('«Skicka igen» mails the same address again and says when, and that the earlier link works too', async () => {
    render(<LoginCard http={run.http} next="/" onNavigate={() => undefined} />)
    const sent = await sendTo('bo@example.com')
    const button = within(sent).getByRole('button', { name: 'Skicka igen' })
    button.focus()
    fireEvent.click(button)
    await waitFor(() => expect(mailsTo('bo@example.com')).toBe(2))
    const line = await within(sent).findByText(/^En ny länk skickades/)
    expect(line.textContent).toBe(`En ny länk skickades ${clockWord(new Date().toISOString(), 'sv')}. Den förra fungerar också.`)
    // The answer is said where the reader is listening: inside the receipt's status.
    expect(line.closest('[role="status"]')).toBe(sent)
    // The press keeps its place: the focus does not fall to the page.
    expect(document.activeElement).toBe(within(sent).getByRole('button', { name: 'Skicka igen' }))
  })

  it('says in the receipt when the next link can go once the limiter refuses, and the button rests without losing the focus', async () => {
    render(<LoginCard http={run.http} next="/" onNavigate={() => undefined} />)
    const sent = await sendTo('cee@example.com')
    for (let n = 2; n <= 5; n++) {
      fireEvent.click(within(sent).getByRole('button', { name: 'Skicka igen' }))
      await waitFor(() => expect(mailsTo('cee@example.com')).toBe(n))
    }
    const button = within(sent).getByRole('button', { name: 'Skicka igen' })
    button.focus()
    fireEvent.click(button)
    const refusal = await within(sent).findByRole('alert')
    expect(refusal.textContent).toBe('Fem länkar har gått till den adressen den senaste timmen. Nästa kan skickas om 60 minuter.')
    // Resting is said, not done by taking the button away: a disabled button would drop the focus.
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(button)
    fireEvent.click(button)
    await new Promise((r) => setTimeout(r, 50))
    expect(mailsTo('cee@example.com')).toBe(5)
    // The way out is still open: the other address has five of its own.
    fireEvent.click(within(sent).getByRole('button', { name: 'Fel adress?' }))
    expect((await screen.findByLabelText<HTMLInputElement>('E-post')).value).toBe('cee@example.com')
  })

  it('counts the minutes up from the seconds', async () => {
    stubAnswers([ok(), refused('61')])
    render(<LoginCard http="http://server.test" next="/" onNavigate={() => undefined} />)
    const sent = await sendTo('ada@example.com')
    fireEvent.click(within(sent).getByRole('button', { name: 'Skicka igen' }))
    expect((await within(sent).findByRole('alert')).textContent).toBe('Fem länkar har gått till den adressen den senaste timmen. Nästa kan skickas om 2 minuter.')
  })

  it('says one minute in the singular', async () => {
    stubAnswers([ok(), refused('30')])
    render(<LoginCard http="http://server.test" next="/" onNavigate={() => undefined} />)
    const sent = await sendTo('ada@example.com')
    fireEvent.click(within(sent).getByRole('button', { name: 'Skicka igen' }))
    expect((await within(sent).findByRole('alert')).textContent).toBe('Fem länkar har gått till den adressen den senaste timmen. Nästa kan skickas om en minut.')
  })

  it('says «om en stund» when the refusal does not say when', async () => {
    stubAnswers([ok(), refused(null)])
    render(<LoginCard http="http://server.test" next="/" onNavigate={() => undefined} />)
    const sent = await sendTo('ada@example.com')
    fireEvent.click(within(sent).getByRole('button', { name: 'Skicka igen' }))
    expect((await within(sent).findByRole('alert')).textContent).toBe('Fem länkar har gått till den adressen den senaste timmen. Försök igen om en stund.')
  })

  it('says a send that failed in the receipt, and the button stays live for another try', async () => {
    stubAnswers([ok(), 'down', ok()])
    render(<LoginCard http="http://server.test" next="/" onNavigate={() => undefined} />)
    const sent = await sendTo('ada@example.com')
    fireEvent.click(within(sent).getByRole('button', { name: 'Skicka igen' }))
    expect((await within(sent).findByRole('alert')).textContent).toBe('Det gick inte att skicka. Försök igen.')
    const button = within(sent).getByRole('button', { name: 'Skicka igen' })
    expect(button.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(button)
    await within(sent).findByText(/^En ny länk skickades/)
    expect(within(sent).queryByRole('alert')).toBeNull()
  })

  it('says all of it in English under an English page', async () => {
    stubAnswers([ok(), ok(), refused('600')])
    render(
      <Language lang="en">
        <LoginCard http="http://server.test" next="/" onNavigate={() => undefined} />
      </Language>,
    )
    const field = await screen.findByLabelText('Email')
    fireEvent.change(field, { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
    const sent = (await screen.findByText('Check your email')).closest<HTMLElement>('.byd-login-sent')!
    expect(within(sent).getAllByRole('button').map((b) => b.textContent)).toEqual(['Wrong address?', 'Send again'])
    fireEvent.click(within(sent).getByRole('button', { name: 'Send again' }))
    expect((await within(sent).findByText(/^A new link went out/)).textContent).toBe(`A new link went out at ${clockWord(new Date().toISOString(), 'en')}. The earlier one works too.`)
    fireEvent.click(within(sent).getByRole('button', { name: 'Send again' }))
    expect((await within(sent).findByRole('alert')).textContent).toBe('Five links have gone to that address in the last hour. The next can be sent in 10 minutes.')
  })
})

type Answer = Response | 'down'
const ok = (): Response => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
const refused = (retryAfter: string | null): Response =>
  new Response(JSON.stringify({ error: 'too many links; try again later' }), { status: 429, headers: { 'content-type': 'application/json', ...(retryAfter ? { 'retry-after': retryAfter } : {}) } })

// The login card's own asks answered in turn; anything else the card asks for (the about line's
// version) is answered empty.
function stubAnswers(answers: Answer[]): void {
  const real = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith('http://server.test/auth/login')) return url.startsWith('http://server.test') ? Promise.resolve(new Response('{}', { status: 404 })) : real(input, init)
    const next = answers.shift()
    if (!next) throw new Error('no more answers')
    return next === 'down' ? Promise.reject(new TypeError('fetch failed')) : Promise.resolve(next)
  })
}
