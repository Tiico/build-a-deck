// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { TablePage } from '../src/table/TablePage.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { DEFAULT_TIMING } from '../src/status/connection.js'
import { projectDoc } from './project-doc.js'
import { admit, registerRoom, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Starten väntar på korten (#765, beslut B 2026-10-06). En värd som delar ut medan renderkön
// fortfarande arbetar delar ut kort utan ansikte; TV:n säger därför i sin spalt hur långt korten
// har kommit, och «Starta spelet» står släckt i sin befintliga form med skälet under ordet tills
// sista kortet är klart — samma princip som att editorns länk väntar på texturerna (L5). En kö som
// står still (#88) får inte hålla bordet stängt för alltid: då blir brickan «Starta ändå».
//
// Fixturen kör ingen renderare, så det som köas står kvar i kön tills testet själv renderar det.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// Fyra kort och en start som blandar draghögen: det minsta bordet som har en startbricka.
function gameWithAStart(): ProjectDoc {
  const doc = projectDoc()
  return {
    ...doc,
    setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === 'draw' ? { ...z, actions: [{ id: 'b', label: 'Blanda', when: 'start' as const, steps: [{ v: 'shuffle' as const }] }] } : z)) },
  }
}

async function newTable(): Promise<{ id: string; code: string; hostKey: string }> {
  await run.projects.create(run.projectId, gameWithAStart())
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  return made
}

async function tvOfANewTable(renderStalledAfterMs: number): Promise<void> {
  const made = await newTable()
  history.replaceState(null, '', `/table?session=${made.id}&host=${made.hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
  render(<TablePage timing={{ ...DEFAULT_TIMING, renderStalledAfterMs }} />)
}

const tile = () => document.querySelector<HTMLButtonElement>('[data-table-start]')
const line = () => document.querySelector<HTMLElement>('.byd-tv-render')

describe('starten väntar på korten (#765)', () => {
  it('säger i TV:ns spalt hur långt korten kommit och håller «Starta spelet» släckt tills alla är klara', async () => {
    await tvOfANewTable(60_000)
    await waitFor(() => expect(line()?.textContent).toBe('Korten ritas0 av 4'))
    expect(line()!.getAttribute('role')).toBe('status')
    expect(tile()!.disabled).toBe(true)
    expect(tile()!.textContent).toBe('Starta speletkorten ritas · 0/4')
    expect(tile()!.getAttribute('title')).toBe('Går inte att starta just nu: korten ritas fortfarande')

    expect(await run.completeRenders(1)).toBe(1)
    await waitFor(() => expect(line()?.textContent).toBe('Korten ritas1 av 4'))
    expect(tile()!.textContent).toBe('Starta speletkorten ritas · 1/4')

    expect(await run.completeRenders()).toBe(3)
    await waitFor(() => expect(line()).toBeNull())
    expect(tile()!.disabled).toBe(false)
    expect(tile()!.textContent).toBe('Starta spelet')
  })

  it('blir «Starta ändå» när kön står still (#88), och den startar', async () => {
    await tvOfANewTable(300)
    await waitFor(() => expect(tile()?.textContent).toBe('Starta ändåkorten står stilla · 0/4'))
    expect(line()!.textContent).toBe('Korten står stilla0 av 4')
    expect(tile()!.disabled).toBe(false)
    fireEvent.click(tile()!)
    // Något har hänt vid bordet: brickan lämnar filten och står som «Starta om» (#482).
    expect(await screen.findByRole('button', { name: 'Starta om' })).toBeTruthy()
  })

  // Den som spelar på distans har samma bricka på sin filt, och den delar ut lika ansiktslösa kort.
  it('håller brickan släckt också vid en distansspelares filt', async () => {
    const made = await newTable()
    history.replaceState(null, '', `/online?session=${made.id}&seat=A&name=Ada&token=${await admit(run, made.id, 'A', 'Ada')}&code=${made.code}&server=${encodeURIComponent(run.url)}`)
    render(<OnlinePage timing={{ ...DEFAULT_TIMING, renderStalledAfterMs: 60_000 }} />)
    await waitFor(() => expect(tile()?.textContent).toBe('Starta speletkorten ritas · 0/4'))
    expect(tile()!.disabled).toBe(true)
    expect(await run.completeRenders()).toBe(4)
    await waitFor(() => expect(tile()!.disabled).toBe(false))
    expect(tile()!.textContent).toBe('Starta spelet')
  })
})
