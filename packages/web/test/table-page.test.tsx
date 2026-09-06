// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { TablePage } from '../src/table/TablePage.js'
import { createSession, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('TablePage', () => {
  it('connects from the URL, renders the table with TV chrome, and follows the table live', async () => {
    const id = await createSession(run.store)
    history.replaceState(null, '', `/table?session=${id}&mode=tv&code=KX7P&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)

    expect(await screen.findByText('KX7P')).toBeTruthy()
    expect(document.querySelector('[data-table]')).toBeTruthy()
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('10')

    const other = TableClient.connect({ url: run.url, sessionId: id, seat: null })
    await other.ready()
    await other.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    expect(await screen.findByText(/Ada satte sig/)).toBeTruthy()
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('7')
    expect(document.querySelector('[data-zone="hand:A"]')!.textContent).toContain('Ada')
    other.close()
  })
})
