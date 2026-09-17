// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TablePage } from '../src/table/TablePage.js'
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

  it('offers nothing at all when the game has no rulebook', async () => {
    const id = await tableWithRules(false)
    const { host } = await asTable(run, id)
    history.replaceState(null, '', `/table?session=${id}&mode=tv&host=${encodeURIComponent(host)}&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    await screen.findByText(/Skogens herrar|Bordet/)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Regler' })).toBeNull())
  })
})

// A picture in the book the players read (#173). Nothing here is the editor's: the reader meets
// the figure and its caption and nothing else, and the picture is fetched from the same place a
// card's image is — the game's own assets, addressed by the hash of its bytes.
describe('a picture at the table and on the phone (B7, #173)', () => {
  const src = `asset:${'c'.repeat(64)}`
  const withImage: RuleDoc = {
    title: 'Skogens herrar',
    blocks: [
      { kind: 'heading', id: 'h1', level: 1, text: 'Uppställning' },
      { kind: 'image', id: 'i1', src, alt: 'Dragbunten till vänster, spelytan i mitten.', caption: 'Bordet vid start, sett från nord.', px: { w: 2400, h: 1350 } },
      { kind: 'image', id: 'i2', src, alt: '', px: { w: 1600, h: 640 } },
    ],
  }

  const openDrawer = async () => {
    await run.projects.create(run.projectId, { ...projectDoc(), rules: withImage })
    const res = await fetch(`${run.http}/projects/${run.projectId}/sessions`, { method: 'POST' })
    const made = (await res.json()) as { id: string; code: string; hostKey: string }
    registerRoom(made.id, made)
    const { host } = await asTable(run, made.id)
    history.replaceState(null, '', `/table?session=${made.id}&mode=tv&host=${encodeURIComponent(host)}&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
    return await screen.findByRole('dialog', { name: 'Regler' })
  }

  it('draws the figure at the share of the column the press will give it, and says what it shows', async () => {
    const panel = await openDrawer()
    const shown = await within(panel).findByRole('img', { name: 'Dragbunten till vänster, spelytan i mitten.' })
    // The picture comes from the game's own assets, not from an address pointing out of it.
    expect(shown.getAttribute('src')).toBe(`${run.http}/assets/${'c'.repeat(64)}`)
    // The one measurement, scaled by the surface: 118 mm of an 118 mm column is the whole of it.
    const figure = shown.closest('figure')
    expect(figure?.style.getPropertyValue('--byd-rule-image-w')).toBe('118')
    expect(figure?.style.getPropertyValue('--byd-rule-image-h')).toBe('66.375')
    // The caption is the designer's own line, and it is read beside the picture.
    expect(within(panel).getByText('Bordet vid start, sett från nord.')).toBeTruthy()
  })

  it('hides a decorative picture from a screen reader, and shows the reader no mark at all', async () => {
    const panel = await openDrawer()
    // Only the one that carries an alt text is a picture to a screen reader.
    expect(await within(panel).findAllByRole('img')).toHaveLength(1)
    const decorative = panel.querySelector('[data-block="i2"] img')
    expect(decorative?.getAttribute('alt')).toBe('')
    expect(decorative?.getAttribute('aria-hidden')).toBe('true')
    // The editor's words for a decorative picture never reach the table.
    expect(panel.textContent).not.toContain('Dekorativ')
  })
})
