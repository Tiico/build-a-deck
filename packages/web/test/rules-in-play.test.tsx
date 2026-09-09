// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TablePage } from '../src/table/TablePage.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { projectDoc } from './project-doc.js'
import { asSeat, asTable, registerRoom, startServer, type Running } from './fixture.js'
import type { RuleDoc } from '@byd/server'

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
  await run.projects.create('p1', withRules ? { ...projectDoc(), rules } : projectDoc())
  const res = await fetch(`${run.http}/projects/p1/sessions`, { method: 'POST' })
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  registerRoom(made.id, made)
  return made.id
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
    expect(panel.textContent).toContain('Dra ur Draghög och lägg i Kasthög.')
  })

  // Two things wanted the TV's top right corner: the way a phone gets in, and the rulebook. The
  // header lays both out now; the felt's own screen keeps the drawer over the felt (#30).
  it('stands in the TV header beside the way in, and over the felt in table mode', async () => {
    const id = await tableWithRules()
    const { host } = await asTable(run, id)
    const open = (mode: string) => {
      history.replaceState(null, '', `/table?session=${id}&mode=${mode}&host=${encodeURIComponent(host)}&server=${encodeURIComponent(run.url)}`)
      return render(<TablePage />)
    }

    const tv = open('tv')
    const inHeader = await screen.findByRole('button', { name: 'Regler' })
    expect(inHeader.closest('[data-tv] > header')).toBeTruthy()
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

  it('offers nothing at all when the game has no rulebook', async () => {
    const id = await tableWithRules(false)
    const { host } = await asTable(run, id)
    history.replaceState(null, '', `/table?session=${id}&mode=tv&host=${encodeURIComponent(host)}&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(/Skogens herrar|Bordet/)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Regler' })).toBeNull())
  })
})
