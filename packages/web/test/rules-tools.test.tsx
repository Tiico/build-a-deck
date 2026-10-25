// @vitest-environment jsdom
// The rules tab's tools stand together, apart from the mode switch (#298, as rescoped 2026-09-20,
// and as #1258 rearranged the row on 2026-10-24).
// The switch is #227's and stays exactly where it is: first in the header, after the book's name.
// What #298 moved was the booklet, which used to stand right beside that switch as though it were a
// third mode of the book — it is a thing done *with* the book, like the import. Since #1258 the two
// are the book as a file and stand in the «Boken» box at the far end of the row, behind its button;
// the row's own divider now stands before what is added to the book, «Lägg till», which is the
// second thing the row does. The order of the row itself is `rules-toolbar`'s to prove; what is
// held here is that nothing of the book as a file has strayed out of its box, and the divider.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { Language } from '../src/i18n/index.js'
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
    { kind: 'text', id: 't1', text: 'Dra ett kort ur [[zon:draw]].' },
  ],
  source: { file: 'regler.md', at: new Date(Date.now() - 60_000).toISOString() },
}

async function openRules(lang: 'sv' | 'en' = 'sv'): Promise<void> {
  await run.projects.create(run.projectId, { ...projectDoc(), rules })
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(lang === 'sv' ? <EditorPage /> : <Language lang="en"><EditorPage /></Language>)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: lang === 'sv' ? 'Regler' : 'Rules' }))
}
const bar = () => document.querySelector('.byd-rules-bar') as HTMLElement
// The box the «Boken» button opens, opened.
const openBook = (name: string): HTMLElement => {
  const button = within(bar()).getByRole('button', { name })
  fireEvent.click(button)
  return document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement
}

describe('the tools of the rules tab (#298, #1258)', () => {
  it('holds the file and the print in the book’s box, and the switch and the adding outside it', async () => {
    await openRules()
    const box = openBook('Boken')
    const file = within(box).getByRole('group', { name: 'Fil' })
    const print = within(box).getByRole('group', { name: 'Tryck' })
    // Exactly the book's tools and nothing else: a box that also held the switch or a way to add
    // would be the header folded away, not the book as a file.
    expect(within(file).getByLabelText('Läs in regler.md igen')).toBeTruthy()
    expect(within(file).getByLabelText('Ersätt med en annan fil…')).toBeTruthy()
    expect(file.querySelectorAll('button, label').length).toBe(2)
    expect(within(print).getByRole('button', { name: 'Ladda ner PDF-häfte' })).toBeTruthy()
    expect(print.querySelectorAll('button, label, a').length).toBe(1)
    expect(box.querySelectorAll('button, label, a').length).toBe(3)
    const modes = within(bar()).getByRole('group', { name: 'Visa boken' })
    const adding = within(bar()).getByRole('group', { name: 'Lägg till' })
    for (const other of [modes, adding]) {
      expect(box.contains(other)).toBe(false)
      expect(other.contains(box)).toBe(false)
    }
    // And none of the book's tools has strayed out of the box into the row.
    const outside = [...bar().querySelectorAll('input[type="file"], .byd-rules-booklet')].filter((el) => !box.contains(el))
    expect(outside.map((el) => el.closest('label')?.textContent ?? el.textContent)).toEqual(['＋ Bild'])
    // The switch stands where #227 put it: first after the book's name, and outside the box.
    expect(bar().children[1]).toBe(modes)
  })

  it('has its names in the reader\'s language too', async () => {
    await openRules('en')
    const box = openBook('The book')
    expect(within(within(box).getByRole('group', { name: 'File' })).getByLabelText('Replace with another file…')).toBeTruthy()
    expect(within(within(box).getByRole('group', { name: 'Print' })).getByRole('button', { name: 'Download PDF booklet' })).toBeTruthy()
  })
})

// The separation is drawn off the spacing ladder (#132) and nowhere else: a divider, and a step
// of air behind it that is one rung longer than the air between the group's own controls. That is
// what makes the divider read as the edge of a group and not as one more pill's border. Since
// #1258 it is the adding group that stands behind it, so the gap it is measured against is that
// group's own.
describe('the divider the adding stands behind (#1258)', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'src/editor/editor.css'), 'utf8')
  const rule = (selector: string) => new RegExp(`(^|\\n)${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? ''
  const rung = (token: string) => Number(new RegExp(`${token}:\\s*(\\d+)px`).exec(css)?.[1])
  const declared = (block: string, property: string) => new RegExp(`(^|[;\\s])${property}\\s*:\\s*([^;]+)`).exec(block)?.[2]?.trim()

  it('is a hairline and a rung of the ladder, one step longer than the gap inside the group', () => {
    const adding = rule('.byd-rules-adding')
    expect(declared(adding, 'border-left')).toMatch(/^1px solid /)
    const air = /^var\((--byd-s\d)\)$/.exec(declared(adding, 'padding-left') ?? '')?.[1]
    const gap = /^var\((--byd-s\d)\)$/.exec(declared(adding, 'gap') ?? '')?.[1]
    expect({ air, gap }).toEqual({ air: expect.stringMatching(/^--byd-s\d$/), gap: expect.stringMatching(/^--byd-s\d$/) })
    expect(Number(air!.slice(-1))).toBe(Number(gap!.slice(-1)) + 1)
    expect(rung(air!)).toBeGreaterThan(rung(gap!))
  })
})
