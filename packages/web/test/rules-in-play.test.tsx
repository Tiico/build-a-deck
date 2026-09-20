// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TablePage } from '../src/table/TablePage.js'
import { TableClient } from '../src/client.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { projectDoc } from './project-doc.js'
import { asSeat, asTable, registerRoom, startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const rules: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Dra ur [[zon:draw]] och lägg i [[zon:discard]].' },
  ],
}

async function tableWithRules(withRules = true): Promise<string> {
  await run.projects.create(run.projectId, withRules ? { ...projectDoc(), rules } : projectDoc())
  const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  return made.id
}

// Boken som den lästes innan den fick en levande siffra: brickorna bortskalade, orden kvar.
function withoutBadges(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement
  for (const badge of copy.querySelectorAll('.byd-rules-tally')) badge.remove()
  return copy.textContent ?? ''
}

describe('the rules where the game is played (B7)', () => {
  it('is one press away on the table screen, and shows the rules that table plays by', async () => {
    const id = await tableWithRules()
    const { host } = await asTable(run, id)
    history.replaceState(null, '', `/table?session=${id}&mode=tv&host=${encodeURIComponent(host)}&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
    const panel = await screen.findByRole('dialog', { name: 'Regler' })
    expect(await within(panel).findByRole('heading', { name: 'Skogens herrar' })).toBeTruthy()
    // Bokens ord, utan de levande siffrorna (#226). Brickan är ett tillägg bredvid taggen och
    // aldrig ett inskott i meningen: skalas den bort står precis det designern skrev kvar.
    expect(withoutBadges(panel)).toContain('Dra ur Draghög och lägg i Kasthög.')
  })

  // Two things wanted the TV's top right corner: the way a phone gets in, and the rulebook. The
  // head of the column beside the felt lays both out now; the felt's own screen keeps the drawer
  // over the felt (#30).
  it('stands in the TV head beside the way in, and over the felt in table mode', async () => {
    const id = await tableWithRules()
    const { host } = await asTable(run, id)
    const open = (mode: string) => {
      history.replaceState(null, '', `/table?session=${id}&mode=${mode}&host=${encodeURIComponent(host)}&server=${encodeURIComponent(run.url)}`)
      return render(<TablePage />)
    }

    const tv = open('tv')
    const inHeader = await screen.findByRole('button', { name: 'Regler' })
    expect(inHeader.closest('[data-tv] .byd-tv-head')).toBeTruthy()
    expect(inHeader.closest('.byd-rules-drawer')?.getAttribute('data-placement')).toBe('tv')
    tv.unmount()

    open('table')
    const overFelt = await screen.findByRole('button', { name: 'Regler' })
    expect(overFelt.closest('[data-tv]')).toBeNull()
    expect(overFelt.closest('.byd-rules-drawer')?.getAttribute('data-placement')).toBe('table')
  })

  it('is one press away on the phone too', async () => {
    const id = await tableWithRules()
    const { token } = await asSeat(run, id, 'A', 'Ada')
    history.replaceState(null, '', `/play?session=${id}&seat=A&token=${encodeURIComponent(token)}&server=${encodeURIComponent(run.url)}`)
    render(<PlayerPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
    const panel = await screen.findByRole('dialog', { name: 'Regler' })
    expect(await within(panel).findByRole('heading', { name: 'Skogens herrar' })).toBeTruthy()
  })

  // Den levande siffran (#226, beslutad 2026-09-20). Brickan visar vad läsarens *egen* projektion
  // säger om zonen — fylld där boken får läsa högen, ihålig där räkningen är allt som finns att
  // veta — och den följer patchströmmen medan luckan står öppen. Att den gör det utan att hämta
  // något en andra gång är hela poängen: boken läses en gång, för den ändrar sig inte (B7, B4),
  // och siffran rider på den ström ytan redan lyssnar på.
  it('shows the living number beside a tagged zone and keeps it living while the drawer stays open', async () => {
    const id = await tableWithRules()
    const { host } = await asTable(run, id)
    history.replaceState(null, '', `/table?session=${id}&mode=tv&host=${encodeURIComponent(host)}&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
    const panel = await screen.findByRole('dialog', { name: 'Regler' })
    const badge = (name: string) => within(panel).getByText(name, { selector: '.byd-rules-ref' }).querySelector('.byd-rules-tally')

    // Draghögen är dold även för bordets egen skärm, så brickan är ihålig; kasthögen ligger öppen.
    await waitFor(() => expect(badge('Draghög')).toBeTruthy())
    expect(badge('Draghög')?.getAttribute('data-tally')).toBe('counted')
    expect(badge('Kasthög')?.getAttribute('data-tally')).toBe('read')
    const before = Number(badge('Draghög')?.textContent)
    expect(before).toBeGreaterThan(0)
    expect(badge('Kasthög')?.textContent).toBe('0')

    // Och så rör sig spelet under den öppna luckan.
    const mover = TableClient.connect(await asTable(run, id))
    try {
      await mover.ready()
      await mover.send({ v: 'draw', from: 'draw', to: 'discard', count: 1 })
      await waitFor(() => expect(badge('Kasthög')?.textContent).toBe('1'))
      expect(Number(badge('Draghög')?.textContent)).toBe(before - 1)
    } finally {
      mover.close()
    }
  })

  // Varje läsare får sin egen siffra, av samma skäl som filten bredvid: brickan visar vad just
  // den här platsens projektion säger. Egna handen är en läsning, grannens är en räkning.
  it('gives each reader the number their own projection allows, and no other', async () => {
    const hands: RuleDoc = { title: 'Skogens herrar', blocks: [{ kind: 'text', id: 't1', text: 'Du håller [[zon:hand:A]]. Motståndaren håller [[zon:hand:B]].' }] }
    await run.projects.create(run.projectId, { ...projectDoc(), rules: hands })
    const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
    const made = (await res.json()) as { id: string; code: string; hostKey: string }
    registerRoom(made.id, made)
    const { token } = await asSeat(run, made.id, 'A', 'Ada')

    const dealer = TableClient.connect(await asTable(run, made.id))
    try {
      await dealer.ready()
      await dealer.send({ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 1 })
    } finally {
      dealer.close()
    }

    history.replaceState(null, '', `/play?session=${made.id}&seat=A&token=${encodeURIComponent(token)}&server=${encodeURIComponent(run.url)}`)
    render(<PlayerPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
    const panel = await screen.findByRole('dialog', { name: 'Regler' })
    const badge = (name: string) => within(panel).getAllByText(name, { selector: '.byd-rules-ref' })[0]?.querySelector('.byd-rules-tally')
    await waitFor(() => expect(badge('Hand')).toBeTruthy())
    const [mine, theirs] = within(panel).getAllByText('Hand', { selector: '.byd-rules-ref' })
    expect(mine?.querySelector('.byd-rules-tally')?.getAttribute('data-tally')).toBe('read')
    expect(theirs?.querySelector('.byd-rules-tally')?.getAttribute('data-tally')).toBe('counted')
    expect(mine?.querySelector('.byd-rules-tally')?.textContent).toBe('1')
    expect(theirs?.querySelector('.byd-rules-tally')?.textContent).toBe('1')
  })

  it('offers nothing at all when the game has no rulebook', async () => {
    const id = await tableWithRules(false)
    const { host } = await asTable(run, id)
    history.replaceState(null, '', `/table?session=${id}&mode=tv&host=${encodeURIComponent(host)}&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(/Skogens herrar|Bordet/)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Regler' })).toBeNull())
  })
})
