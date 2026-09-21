// @vitest-environment jsdom
// The rules tab's tools stand together, apart from the mode switch (#298, as rescoped 2026-09-20).
// The switch is #227's and stays exactly where it is: first in the header, after the book's name.
// What this issue moves is the booklet, which used to stand right beside that switch as though it
// were a third mode of the book — it is a thing done *with* the book, like the import, and the two
// stand together in one labelled group at the far end of the header, behind a divider.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { Language } from '../src/i18n/index.js'
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
    { kind: 'text', id: 't1', text: 'Dra ett kort ur [[zon:draw]].' },
  ],
}

async function openRules(lang: 'sv' | 'en' = 'sv'): Promise<void> {
  await run.projects.create(run.projectId, { ...projectDoc(), rules })
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(lang === 'sv' ? <EditorPage /> : <Language lang="en"><EditorPage /></Language>)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: lang === 'sv' ? 'Regler' : 'Rules' }))
}
const bar = () => document.querySelector('.byd-rules-bar') as HTMLElement

describe('the tools of the rules tab (#298)', () => {
  it('holds the import and the booklet in one labelled group, and the mode switch outside it', async () => {
    await openRules()
    const tools = within(bar()).getByRole('group', { name: 'Verktyg' })
    // Exactly the two tools and nothing else: a group that also held the hint or the switch
    // would be the header with a name on it, not a group.
    expect(within(tools).getByLabelText('Importera över boken')).toBeTruthy()
    expect(within(tools).getByRole('button', { name: 'Häfte för tryck' })).toBeTruthy()
    expect(tools.querySelectorAll('button, label').length).toBe(2)
    expect(within(tools).queryByRole('group', { name: 'Läge' })).toBeNull()
    expect(tools.querySelector('.byd-choice')).toBeNull()
    // The switch stands where #227 put it: first after the book's name, and outside the group.
    const modes = within(bar()).getByRole('group', { name: 'Läge' })
    expect(modes.contains(tools)).toBe(false)
    expect(bar().children[1]).toBe(modes)
    // And the group stands last, as far from the switch as the header goes.
    expect(bar().lastElementChild).toBe(tools)
  })

  it('has its name in the reader\'s language too', async () => {
    await openRules('en')
    const tools = within(bar()).getByRole('group', { name: 'Tools' })
    expect(within(tools).getByRole('button', { name: 'Booklet for print' })).toBeTruthy()
  })
})

// The separation is drawn off the spacing ladder (#132) and nowhere else: a divider, and a step
// of air behind it that is one rung longer than the air between the group's own two tools. That
// is what makes the divider read as the edge of a group and not as a third pill's border.
describe('the divider the tools stand behind', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'src/editor/editor.css'), 'utf8')
  const rule = (selector: string) => new RegExp(`(^|\\n)${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? ''
  const rung = (token: string) => Number(new RegExp(`${token}:\\s*(\\d+)px`).exec(css)?.[1])
  const declared = (block: string, property: string) => new RegExp(`(^|[;\\s])${property}\\s*:\\s*([^;]+)`).exec(block)?.[2]?.trim()

  it('is a hairline and a rung of the ladder, one step longer than the gap inside the group', () => {
    const tools = rule('.byd-rules-tools')
    expect(declared(tools, 'border-left')).toMatch(/^1px solid /)
    const air = /^var\((--byd-s\d)\)$/.exec(declared(tools, 'padding-left') ?? '')?.[1]
    const gap = /^var\((--byd-s\d)\)$/.exec(declared(rule('.byd-rules-ways'), 'gap') ?? '')?.[1]
    expect({ air, gap }).toEqual({ air: expect.stringMatching(/^--byd-s\d$/), gap: expect.stringMatching(/^--byd-s\d$/) })
    expect(Number(air!.slice(-1))).toBe(Number(gap!.slice(-1)) + 1)
    expect(rung(air!)).toBeGreaterThan(rung(gap!))
  })
})
