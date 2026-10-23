// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { admit, asTable, createSession, roomOf, seatSetup, startServer, type Running } from './fixture.js'

// The phone beside the television, from the ground up (#1147, beställarens val B 2026-10-22): four
// tabs at the foot — the hand, what lies in front of you, the table, and the rest — and each tab is
// one thing. Everything that used to stand in one long column now has one place.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  cleanup()
  await run.stop()
})

async function open(sessionId: string, seat: string, name: string): Promise<string> {
  const token = await admit(run, sessionId, seat, name)
  history.replaceState(null, '', `/play?session=${sessionId}&seat=${seat}&name=${name}&token=${token}&code=${roomOf(sessionId).code}&server=${encodeURIComponent(run.url)}`)
  render(<PlayerPage />)
  await screen.findByRole('tablist')
  return token
}

const panel = (name: RegExp) => {
  const tab = screen.getByRole('tab', { name })
  return document.getElementById(tab.getAttribute('aria-controls')!)!
}

describe('the phone is four tabs (#1147)', () => {
  it('opens on the hand, and a tab shows its own panel and hides the others', async () => {
    const id = await createSession(run, 's1', undefined, seatSetup())
    await open(id, 'A', 'Ada')
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent?.replace(/\d+/g, '').trim())).toEqual(['Handen', 'Framför mig', 'Bordet', 'Mer'])
    expect(screen.getByRole('tab', { name: /^Handen/ }).getAttribute('aria-selected')).toBe('true')
    expect(panel(/^Handen/).hidden).toBe(false)
    expect(panel(/^Bordet/).hidden).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: /^Bordet/ }))
    expect(screen.getByRole('tab', { name: /^Bordet/ }).getAttribute('aria-selected')).toBe('true')
    expect(panel(/^Bordet/).hidden).toBe(false)
    expect(panel(/^Handen/).hidden).toBe(true)
  })
})
