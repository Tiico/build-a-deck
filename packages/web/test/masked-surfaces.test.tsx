// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TableClient } from '../src/client.js'
import { EditorPage } from '../src/editor/EditorPage.js'
import { HomePage } from '../src/account/HomePage.js'
import { SurveyPage } from '../src/account/SurveyPage.js'
import { JoinPage } from '../src/join/JoinPage.js'
import { ObserverPage } from '../src/observer/ObserverPage.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { TablePage } from '../src/table/TablePage.js'
import { Language } from '../src/i18n/index.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { atWindow } from './felt-frame.js'
import { placeholderDrawn } from './placeholder-drawn.js'
import { admit, asSeat, asTable, registerRoom, roomOf, startServer, type Running } from './fixture.js'

// No surface draws a masked field's placeholder (#1349, G6). An erasure (#1279) leaves U+E000
// where a name or a person's words stood, and every place that draws a name out of the log or out
// of an admission says it in the reader's words instead (#1281, `masked.ts`). Those places are:
//
// - every screen at a table — the TV, the phone, the online seat, the observer and the picker —
//   which reads its names, notes and flags through the table client (`useTableClient`);
// - the editor's Bord tab and Resultat, which read the playtest (`sayPlaytest`): the people, the
//   answers, the flags, and the hand a flagged card lay in;
// - Mina spel and its survey page, which read the account's admissions (`/me/played`).
//
// The mails draw no name out of a log or an admission: the invitation and the login say the
// account's own name and address, the report's receipt what the reporter wrote in the form, and
// the last letter the games' names. So none of them is here.
//
// One guest, Adelina, sits at A with a card in her hand that she flagged with a comment, and has
// written on the notepad; Bo sits at B. Then she removes her name. Each surface is read whole —
// its text, every attribute and the page's title (`placeholderDrawn`) — and has to have said the
// masked name somewhere, so that a surface that drew no name proves nothing by passing.

const NAME = 'Adelina Raderas'
const NOTE = 'Adelinas anteckning'
const COMMENT = 'Draken är för stark'
const json = { 'content-type': 'application/json' }

// Everything a reader is given of the page, as one text to look for a word in.
const given = (): string => [document.body.textContent ?? '', ...[...document.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.value))].join('\n')
async function saysMasked(word = 'Utan namn'): Promise<void> {
  await waitFor(() => expect(given()).toContain(word), { timeout: 8000 })
  expect(placeholderDrawn()).toEqual([])
  expect(given()).not.toContain(NAME)
  expect(given()).not.toContain(NOTE)
  expect(given()).not.toContain(COMMENT)
}

type Erased = { id: string; bo: string; ada: string }
// A project's table, so that the editor has it; Adelina's token is claimed first by the account
// when `claim` is given, so that Mina spel has her table among the account's.
async function erased(run: Running, claim = false): Promise<Erased> {
  const made = (await (await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST', headers: json, body: '{}' })).json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  const id = made.id
  const seat = await asSeat(run, id, 'A', NAME)
  const ada = TableClient.connect(seat)
  await ada.ready()
  await ada.send({ v: 'seat.claim', seat: 'A', name: NAME })
  await ada.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
  const card = ada.view!.components.find((c) => c.zone === 'hand:A')!
  await ada.send({ v: 'flag', component: card.id, note: COMMENT })
  await ada.send({ v: 'note.add', text: NOTE })
  const boToken = await admit(run, id, 'B', 'Bo')
  const bo = TableClient.connect({ url: run.url, sessionId: id, seat: 'B', token: boToken })
  await bo.ready()
  await bo.send({ v: 'seat.claim', seat: 'B', name: 'Bo' })
  ada.close()
  bo.close()
  if (claim) expect((await fetch(`${run.http}/guests/claim`, { method: 'POST', headers: json, body: JSON.stringify({ token: seat.token }) })).status).toBe(200)
  expect((await fetch(`${run.http}/sessions/${id}/erase`, { method: 'POST', headers: json, body: JSON.stringify({ token: seat.token }) })).status).toBe(200)
  return { id, bo: boToken, ada: seat.token }
}

describe('a masked name at the table and in the editor (#1349)', () => {
  let run: Running
  beforeEach(async () => {
    run = await startServer()
    await run.projects.create(run.projectId, projectDoc())
  })
  afterEach(async () => {
    await run.stop()
  })

  it('is said on the TV and never drawn', async () => {
    const { id } = await erased(run)
    history.replaceState(null, '', `/table?session=${id}&host=${roomOf(id).hostKey}&mode=tv&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await saysMasked()
  })

  it('is said in the picker and never drawn', async () => {
    const { id } = await erased(run)
    history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    render(<JoinPage />)
    await saysMasked()
  })

  it('is said to someone watching and never drawn', async () => {
    const { id } = await erased(run)
    history.replaceState(null, '', `/observe?session=${id}&token=${await admit(run, id, null, 'Eva')}&server=${encodeURIComponent(run.url)}`)
    render(<ObserverPage />)
    await saysMasked()
  })

  it('is said on the next player’s phone and never drawn', async () => {
    const { id, bo } = await erased(run)
    history.replaceState(null, '', `/play?session=${id}&seat=B&code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}#token=${bo}`)
    render(<PlayerPage />)
    await saysMasked()
  })

  it('is said at the next seat online and never drawn', async () => {
    const { id, bo } = await erased(run)
    atWindow({ w: 1280, h: 800 })
    history.replaceState(null, '', `/online?session=${id}&seat=B&code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}#token=${bo}`)
    render(<OnlinePage />)
    await saysMasked()
  })

  it.each([
    ['sv', { tables: 'Bord', results: 'Resultat', name: 'Utan namn' }],
    ['en', { tables: 'Tables', results: 'Results', name: 'No name' }],
  ] as const)('is said in the Bord tab, in Resultat and on the lifted card, and never drawn (%s)', async (lang, words) => {
    const { id } = await erased(run)
    const user = userEvent.setup()
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(
      <Language lang={lang}>
        <EditorPage />
      </Language>,
    )
    await screen.findByText('Skogens herrar')
    await user.click(screen.getByRole('tab', { name: words.tables }))
    await saysMasked(words.name)
    // Resultat reads the tables that have ended.
    const host = TableClient.connect(await asTable(run, id))
    await host.ready()
    await host.send({ v: 'session.end' })
    host.close()
    await user.click(screen.getByRole('button', { name: words.results }))
    const thumb = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('.byd-results-thumb')
      expect(found).not.toBeNull()
      return found!
    })
    await saysMasked(words.name)
    await user.click(thumb)
    expect(screen.getByRole('dialog')).toBeTruthy()
    await saysMasked(words.name)
  })
})

describe('a masked name in Mina spel (#1349)', () => {
  let run: Running
  beforeEach(async () => {
    run = await startServer({ auth: true, authBypass: true })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'adelina@example.com' }) })
    await fetch(`${run.http}/projects`, { method: 'POST', headers: json, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })
  })
  afterEach(async () => {
    await run.stop()
  })

  it('is said on the tables she sat at, and on the survey they lead to, and never drawn', async () => {
    const { id } = await erased(run, true)
    const host = TableClient.connect(await asTable(run, id))
    await host.ready()
    await host.send({ v: 'session.end' })
    host.close()

    history.replaceState(null, '', `/?server=${encodeURIComponent(run.http)}`)
    render(
      <StatusLive>
        <HomePage onNavigate={() => undefined} />
      </StatusLive>,
    )
    await screen.findByText('Bord du har spelat vid')
    await saysMasked()
    cleanup()

    history.replaceState(null, '', `/survey?session=${id}&server=${encodeURIComponent(run.http)}`)
    render(<SurveyPage onNavigate={() => undefined} />)
    // Her name and her answers are gone, and the page says so rather than asking again (#1353).
    expect(await screen.findByText('Ditt namn och dina svar är borttagna.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nästa' })).toBeNull()
    await saysMasked()
  })
})
