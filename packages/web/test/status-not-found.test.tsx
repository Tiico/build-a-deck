// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotFoundPage } from '../src/status/NotFoundPage.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The way out of a page that does not exist leads to `/`, which is the reader's games when signed in
// and the login card otherwise (#475). "Till mina spel" over the second is a
// promise the page it leads to does not keep.
let run: Running
beforeEach(async () => {
  run = await startServer({ auth: true, authBypass: true })
})
afterEach(async () => {
  await run.stop()
})

describe('the way out of a page that does not exist (#475)', () => {
  it('leads to the start page for whoever is not signed in', async () => {
    history.replaceState(null, '', `/finns-inte?server=${encodeURIComponent(run.http)}`)
    render(<NotFoundPage />)
    expect(await screen.findByRole('link', { name: 'Till startsidan' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Till mina spel' })).toBeNull()
  })

  it('leads to the reader s games once the reader is known to be signed in', async () => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    history.replaceState(null, '', `/finns-inte?server=${encodeURIComponent(run.http)}`)
    render(<NotFoundPage />)
    const home = await screen.findByRole('link', { name: 'Till mina spel' })
    expect(home.getAttribute('href')).toBe(`/?server=${encodeURIComponent(run.http)}`)
  })
})
