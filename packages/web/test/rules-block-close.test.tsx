// @vitest-environment jsdom
// An open block of the rulebook and the ways out of it (#481, fynd 1, 10 och 12).
//
// The block closed on the field's blur, and a press on «Ta bort blocket» blurs the field before
// it clicks: the button was gone from the page by the time the click arrived, so no block could be
// taken away with a pointer, and Tab from the field landed on <body>. The line the block keeps is
// now the block's own edge — everything inside it, the foot included, is staying — and a list
// block, which had no way out at all, answers to the same edge and to Escape like the others.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
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
    { kind: 'text', id: 't1', text: 'Dra ett kort.' },
    { kind: 'list', id: 'l1', ordered: true, items: ['Dra.', 'Spela.'] },
    { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp' },
  ],
}

async function openRules(): Promise<void> {
  await run.projects.create(run.projectId, { ...projectDoc(), rules })
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await userEvent.click(screen.getByRole('tab', { name: 'Regler' }))
}
const book = () => document.querySelector('[data-rulebook]') as HTMLElement
const blocks = () => [...book().querySelectorAll('[data-block]')].map((b) => b.getAttribute('data-block'))
const open = () => book().querySelector('.byd-rules-edit')

// What the designer presses to open each kind of block, and the button its foot carries.
const KINDS = [
  { id: 'h1', press: 'Så spelar ni', remove: 'Ta bort avsnittet' },
  { id: 't1', press: 'Dra ett kort.', remove: 'Ta bort blocket' },
  { id: 'l1', press: 'Spela.', remove: 'Ta bort blocket' },
  { id: 's1', press: 'Så ställs bordet upp', remove: 'Ta bort blocket' },
] as const

describe('an open block of the rulebook', () => {
  it.each(KINDS)('takes block $id away with a real press of the pointer', async ({ id, press, remove }) => {
    const user = userEvent.setup()
    await openRules()
    await user.click(within(book()).getByText(press))
    await waitFor(() => expect(open()).not.toBeNull())
    await user.click(within(book()).getByRole('button', { name: remove }))
    await waitFor(() => expect(blocks()).not.toContain(id))
    // The foot went with the block, so the focus goes to the block now standing in its place —
    // or, when the section was the whole book, to the way to write a new one.
    await waitFor(() => expect(document.activeElement?.closest('[data-block], .byd-rules-own')).not.toBeNull())
  })

  it.each(KINDS)('reaches the foot of block $id with Tab, and stays open doing it', async ({ press, remove }) => {
    const user = userEvent.setup()
    await openRules()
    await user.click(within(book()).getByText(press))
    await waitFor(() => expect(open()).not.toBeNull())
    const foot = within(book()).getByRole('button', { name: remove })
    for (let i = 0; i < 8 && document.activeElement !== foot; i++) await user.tab()
    expect(document.activeElement).toBe(foot)
    expect(open()).not.toBeNull()
  })

  it.each(KINDS)('closes block $id on Escape and gives the focus back to the block', async ({ id, press }) => {
    const user = userEvent.setup()
    await openRules()
    await user.click(within(book()).getByText(press))
    await waitFor(() => expect(open()).not.toBeNull())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(open()).toBeNull())
    expect(document.activeElement?.closest('[data-block]')?.getAttribute('data-block')).toBe(id)
  })

  it('closes a list when the pointer presses outside it, and leaves no empty point behind', async () => {
    const user = userEvent.setup()
    await openRules()
    await user.click(within(book()).getByText('Spela.'))
    await user.click(await within(book()).findByRole('button', { name: '＋ Punkt' }))
    await waitFor(() => expect(book().querySelectorAll('.byd-rules-edit input')).toHaveLength(3))
    await user.click(within(book()).getByText('Dra ett kort.'))
    await waitFor(() => expect(within(book()).queryByLabelText(/Punkt \d i l1/)).toBeNull())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(open()).toBeNull())
    expect([...book().querySelectorAll('[data-block="l1"] li')].map((li) => li.textContent)).toEqual(['Dra.', 'Spela.'])
  })
})
