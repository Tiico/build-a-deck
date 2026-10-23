// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { TableClient } from '../src/client.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { projectDoc } from './project-doc.js'
import { admit, asSeat, registerRoom, startServer, type Running } from './fixture.js'
import { atWindow } from './felt-frame.js'

// Distansvyn börjar i ett väntrum (L77, #1130). Tills något har hänt vid bordet ligger ett väntrum
// över filten på /online: hur många platser som är tagna, rummets adress med en kopieringsknapp,
// platserna och vem som sitter var, och «Starta spelet» — samma bricka som filtens (K25).

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// Fyra kort och en start som blandar draghögen.
function gameWithAStart(): ProjectDoc {
  const doc = projectDoc()
  return {
    ...doc,
    setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === 'draw' ? { ...z, actions: [{ id: 'b', label: 'Blanda', when: 'start' as const, steps: [{ v: 'shuffle' as const }] }] } : z)) },
  }
}

async function newTable(doc: ProjectDoc = gameWithAStart()): Promise<{ id: string; code: string; hostKey: string }> {
  await run.projects.create(run.projectId, doc)
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  return made
}

async function asGuest(made: { id: string; code: string }, seat = 'A', name = 'Ada'): Promise<void> {
  atWindow({ w: 1280, h: 800 })
  history.replaceState(null, '', `/online?session=${made.id}&seat=${seat}&name=${name}&token=${await admit(run, made.id, seat, name)}&code=${made.code}&server=${encodeURIComponent(run.url)}`)
  render(<OnlinePage />)
}

const room = () => screen.findByRole('region', { name: /Väntar på spelare/ })

describe('väntrummet på /online (L77, #1130)', () => {
  it('säger hur många som kommit, adressen som värd/KOD och platserna, och fylls medan man tittar', async () => {
    const made = await newTable()
    await asGuest(made)
    const panel = await room()
    await waitFor(() => expect(within(panel).getByRole('heading').textContent).toBe('Väntar på spelare · 1 av 2'))
    expect(panel.textContent).toContain('Skicka länken till dem som ska spela. Bordet startar när du säger till.')
    expect(panel.querySelector('[data-address]')!.textContent).toBe(`${location.host}/${made.code}`)
    const seats = () => [...panel.querySelectorAll('li')].map((li) => li.textContent)
    expect(seats()).toEqual(['AAda (du)', 'Bväntar…'])

    const bo = TableClient.connect(await asSeat(run, made.id, 'B', 'Bo'))
    await bo.ready()
    await bo.send({ v: 'seat.claim', seat: 'B', name: 'Bo' })
    await waitFor(() => expect(within(panel).getByRole('heading').textContent).toBe('Väntar på spelare · 2 av 2'))
    expect(seats()).toEqual(['AAda (du)', 'BBo'])
    bo.close()
  })

  // K25: väntrummets knapp är filtens start och inte en andra. Den väntar på korten som brickan
  // gör, och medan väntrummet står visas ingen bricka på filten därtill.
  it('startar med filtens egen start, väntar på korten som brickan, och går när spelet börjat', async () => {
    const made = await newTable()
    await asGuest(made)
    const panel = await room()
    const starts = () => document.querySelectorAll<HTMLButtonElement>('[data-table-start]')
    await waitFor(() => expect(starts()).toHaveLength(1))
    const start = within(panel).getByRole<HTMLButtonElement>('button', { name: /Starta spelet/ })
    expect(starts()[0]).toBe(start)
    await waitFor(() => expect(start.textContent).toBe('Starta speletladdar kort · 0/4'))
    expect(start.disabled).toBe(true)
    expect(start.title).toBe('Kan inte starta än: korten laddas fortfarande')

    expect(await run.completeRenders()).toBe(4)
    await waitFor(() => expect(start.disabled).toBe(false))
    start.focus()
    start.click()
    await waitFor(async () => expect((await run.store.read(made.id)).at(-1)?.intent).toMatchObject({ v: 'shuffle', pile: 'draw' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: /Väntar på spelare/ })).toBeNull())
    // Brickan som tog dess plats är samma kontroll under ett annat namn, och fokus följer med (#761).
    const again = await screen.findByRole('button', { name: 'Starta om' })
    await waitFor(() => expect(document.activeElement).toBe(again))
  })

  // Ett spel utan startåtgärd har inget att starta: knappen lägger bara undan väntrummet.
  it('lägger undan väntrummet med «Börja spela» när spelet saknar start', async () => {
    const made = await newTable(projectDoc())
    await asGuest(made)
    const panel = await room()
    expect(document.querySelector('[data-table-start]')).toBeNull()
    within(panel).getByRole('button', { name: 'Börja spela' }).click()
    await waitFor(() => expect(screen.queryByRole('region', { name: /Väntar på spelare/ })).toBeNull())
    expect(document.querySelector('[data-table-start]')).toBeNull()
  })

  // Väntrummet ligger över högarna, och den som vill röra dem före starten ska kunna det: × lägger
  // undan det, och filtens egen bricka står där i stället — samma start, nu på filten (K25).
  it('läggs undan med × och lämnar starten åt filtens bricka, med fokus på den', async () => {
    const made = await newTable()
    await asGuest(made)
    const panel = await room()
    within(panel).getByRole('button', { name: 'Göm väntrummet' }).click()
    await waitFor(() => expect(screen.queryByRole('region', { name: /Väntar på spelare/ })).toBeNull())
    const tile = document.querySelector<HTMLButtonElement>('.byd-table-start[data-table-start]')
    expect(tile).not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(tile))
  })

  it('kopierar hela länken och säger «Kopierad», och markerar adressen när urklippet nekas', async () => {
    const made = await newTable()
    const written: string[] = []
    let refuse = false
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (refuse) throw new DOMException('denied', 'NotAllowedError')
          written.push(text)
        },
      },
    })
    await asGuest(made)
    const panel = await room()
    within(panel).getByRole('button', { name: 'Kopiera länk' }).click()
    await within(panel).findByRole('button', { name: 'Kopierad' })
    expect(written).toEqual([`${location.origin}/${made.code}?server=${encodeURIComponent(run.url).replace(/%20/g, '+')}`])
    expect(within(panel).getByRole('status').textContent).toBe('Kopierad')

    refuse = true
    within(panel).getByRole('button', { name: /Kopiera/ }).click()
    await waitFor(() => expect(within(panel).getByRole('status').textContent).toBe('Gick inte att kopiera. Adressen är markerad, så kopiera den själv.'))
    expect(window.getSelection()?.toString()).toBe(`${location.host}/${made.code}`)
  })

  // Ett tryck i samma ögonblick som väntrummet kommer (#1221). Väntrummet nollställde «Kopierad» i en
  // effekt som också körs när det monteras, och React kör den effekten först i en senare uppgift: ett
  // tryck före den slogs ihop med nollställningen, och «Kopierad» syntes aldrig. Det är vad en
  // findBy som löser på just den commit:en gör, och vad en upptagen CI-maskin gjorde av testet ovan.
  it('säger «Kopierad» också för ett tryck i samma ögonblick som väntrummet kommer', async () => {
    const made = await newTable()
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    })
    // Tryckt från den commit som för in väntrummet, innan React har kört dess effekter.
    const pressed = new Promise<void>((resolve) => {
      const watch = new MutationObserver(() => {
        const button = document.querySelector<HTMLButtonElement>('.byd-waiting-copy')
        if (!button) return
        watch.disconnect()
        button.click()
        resolve()
      })
      watch.observe(document.body, { childList: true, subtree: true })
    })
    await asGuest(made)
    await pressed
    const panel = await room()
    await within(panel).findByRole('button', { name: 'Kopierad' })
    expect(written).toHaveLength(1)
  })

  // Värden som sitter vid sitt eget bord från editorn har kanske ingen kod i adressen: servern
  // berättar den för hennes plats, och berättar den nya efter «Ny kod».
  it('visar värdens adress utan kod i URL:en, och den nya koden efter «Ny kod»', async () => {
    const made = await newTable()
    atWindow({ w: 1280, h: 800 })
    history.replaceState(null, '', `/online?session=${made.id}&seat=A&name=Vera&owner=1&server=${encodeURIComponent(run.url)}`)
    render(<OnlinePage />)
    const panel = await room()
    await waitFor(() => expect(panel.querySelector('[data-address]')?.textContent).toBe(`${location.host}/${made.code}`))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } })
    within(panel).getByRole('button', { name: 'Kopiera länk' }).click()
    await within(panel).findByRole('button', { name: 'Kopierad' })
    const rotated = (await (await fetch(`${run.http}/sessions/${made.id}/code`, { method: 'POST', headers: { authorization: `Bearer ${made.hostKey}` } })).json()) as { code: string }
    await waitFor(() => expect(panel.querySelector('[data-address]')?.textContent).toBe(`${location.host}/${rotated.code}`))
    // En ny kod är en ny adress: det som kopierades förut är inte det som står här nu.
    expect(within(panel).getByRole('button', { name: 'Kopiera länk' })).toBeTruthy()
    expect(within(panel).getByRole('status').textContent).toBe('')
  })
})
