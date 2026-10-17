// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { DocumentTitle } from '../src/status/DocumentTitle.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { HomePage } from '../src/account/HomePage.js'
import { startServer, type Running } from './fixture.js'

function open(server: string) {
  history.replaceState(null, '', `/?server=${encodeURIComponent(server)}`)
  render(
    <DocumentTitle route="home">
      <StatusLive>
        <HomePage />
      </StatusLive>
    </DocumentTitle>,
  )
}

const notice = () => document.querySelector('[data-status-notice]')

// The start page is where every other route's "way home" leads, so it is the last place that may
// answer with a raw English sentence (#12).
describe('the start page when the service cannot be reached', () => {
  it('says there is no contact in Swedish, with a retry, and never in the server s own words', async () => {
    open('http://127.0.0.1:1')
    await waitFor(() => expect(notice()?.getAttribute('data-status-notice')).toBe('offline'), { timeout: 4000 })
    const panel = notice() as HTMLElement
    expect(panel.textContent).toMatch(/når inte/i)
    expect(panel.textContent).not.toMatch(/fetch failed|Error|could not/i)
    expect(within(panel).getByRole('button', { name: /försök igen/i })).toBeTruthy()
    await waitFor(() => expect(document.title).toBe('Ingen kontakt · build-your-deck'))
  })

  it('says it is loading before it says anything else', () => {
    open('http://127.0.0.1:1')
    expect(notice()?.getAttribute('data-status-notice')).toBe('loading')
    expect(screen.queryByRole('alert')?.textContent ?? '').not.toMatch(/fetch/i)
  })
})

// `/` has two shapes: the games for whoever is logged in, and the login card for whoever is not.
// The tab said "Mina spel" over both, which is a promise the second one does not keep — and the
// name of the tab is how someone finds their way back to it (#12, UX-kontroll 2026-09-10).
describe('the tab over the way in', () => {
  let run: Running
  beforeEach(async () => {
    run = await startServer({ auth: true })
  })
  afterEach(async () => {
    await run.stop()
  })

  it('says what the page is showing: the login card, and then the games', async () => {
    open(run.http)
    await screen.findByLabelText('E-post')
    await waitFor(() => expect(document.title).toBe('Logga in · build-your-deck'))

    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')![0]
    await fetch(`${run.http}${link}`, { redirect: 'manual' })
    open(run.http)
    await screen.findAllByText('Mina spel')
    await waitFor(() => expect(document.title).toBe('Mina spel · build-your-deck'))
  })
})
