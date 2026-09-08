// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RuleDrawer } from '../src/rules/RuleDrawer.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
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
    { kind: 'text', id: 't1', text: 'Spelet slutar när [[zon:draw]] är tom.' },
    { kind: 'heading', id: 'h2', level: 2, text: 'Kasthögen' },
    { kind: 'text', id: 't2', text: '[[zon:discard]] ligger öppen. Ingen får ta ur den.' },
  ],
}

async function table(withRules = true): Promise<string> {
  await run.projects.create('p1', withRules ? { ...projectDoc(), rules } : projectDoc())
  const res = await fetch(`${run.http}/projects/p1/sessions`, { method: 'POST' })
  return ((await res.json()) as { id: string }).id
}
const open = async (id: string) => {
  render(<RuleDrawer http={run.http} sessionId={id} placement="table" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Regler' }))
  return screen.findByRole('dialog', { name: 'Regler' })
}

describe('the rules at the table (B7)', () => {
  it('is not offered at all when the game has no rulebook', async () => {
    const id = await table(false)
    render(<RuleDrawer http={run.http} sessionId={id} placement="table" />)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Regler' })).toBeNull())
  })

  it('opens the whole book, with every reference standing as the name the reader sees', async () => {
    const panel = await open(await table())
    expect(await within(panel).findByRole('heading', { name: 'Skogens herrar' })).toBeTruthy()
    expect(within(panel).getByRole('heading', { name: 'Kasthögen' })).toBeTruthy()
    expect([...panel.querySelectorAll('[data-ref]')].map((r) => r.textContent)).toEqual(['Draghög', 'Kasthög'])
    fireEvent.click(within(panel).getByRole('button', { name: 'Stäng reglerna' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Regler' })).toBeNull())
  })

  it('answers a question with the passages that mention it, and gives the book back when the question is cleared', async () => {
    const panel = await open(await table())
    await within(panel).findByRole('heading', { name: 'Skogens herrar' })
    const ask = within(panel).getByLabelText('Vad undrar du?')

    fireEvent.change(ask, { target: { value: 'kasthög' } })
    const hits = await within(panel).findAllByRole('listitem')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.textContent).toContain('Kasthög ligger öppen')
    // While a question stands, the book is out of the way.
    expect(within(panel).queryByRole('heading', { name: 'Så spelar ni' })).toBeNull()

    fireEvent.change(ask, { target: { value: 'tärning' } })
    expect(await within(panel).findByText(/Ingen regel nämner det/)).toBeTruthy()

    fireEvent.change(ask, { target: { value: '' } })
    expect(await within(panel).findByRole('heading', { name: 'Så spelar ni' })).toBeTruthy()
  })

  it('reads the rules the table was started with, once, however often it is opened', async () => {
    const id = await table()
    const asked: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (href.endsWith('/rules')) asked.push(href)
      return real(input, init)
    }) as typeof fetch
    try {
      const panel = await open(id)
      await within(panel).findByRole('heading', { name: 'Skogens herrar' })
      fireEvent.click(within(panel).getByRole('button', { name: 'Stäng reglerna' }))
      fireEvent.click(screen.getByRole('button', { name: 'Regler' }))
      await screen.findByRole('dialog', { name: 'Regler' })
      expect(asked).toHaveLength(1)
    } finally {
      globalThis.fetch = real
    }
  })
})
