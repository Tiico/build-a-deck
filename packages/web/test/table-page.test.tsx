// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

describe('a proposed rewind on the table (C)', () => {
  it('shows the table as it was, says who is waited on, has no buttons, and returns to the present when it is settled', async () => {
    const id = await createSession(run.store)
    history.replaceState(null, '', `/table?session=${id}&mode=tv&code=KX7P&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText('KX7P')

    const ada = TableClient.connect({ url: run.url, sessionId: id, seat: 'A' })
    const bo = TableClient.connect({ url: run.url, sessionId: id, seat: 'B' })
    await Promise.all([ada.ready(), bo.ready()])
    await ada.send({ v: 'seat.claim', seat: 'A', name: 'Ada' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await bo.send({ v: 'seat.claim', seat: 'B', name: 'Bo' }, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
    await waitFor(() => expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('6'))

    await ada.send({ v: 'rewind.propose', toSeq: 2 })
    await waitFor(() => expect(document.querySelector('[data-rewind-preview]')).toBeTruthy())
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('9')
    expect(document.querySelector('[data-zone="discard"]')!.getAttribute('data-count')).toBe('0')
    expect(screen.getByText(/så här såg bordet ut/)).toBeTruthy()
    expect(screen.getByText(/väntar på Bo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Godkänn|Avvisa/ })).toBeNull()

    await bo.send({ v: 'rewind.reject', proposal: bo.view!.rewind!.id })
    await waitFor(() => expect(document.querySelector('[data-rewind-preview]')).toBeNull())
    expect(document.querySelector('[data-zone="draw"]')!.getAttribute('data-count')).toBe('6')
    ada.close()
    bo.close()
  })
})
