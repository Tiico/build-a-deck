// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A deck whose cards carry a `typ` column, so there is something to group by.
function typed(): ProjectDoc {
  const doc = structuredClone(projectDoc())
  doc.rows = [
    { id: 'dragon', fields: { typ: 'varelse', title: 'Drake', body: 'Flygande.', antal: 2 } },
    { id: 'trap', fields: { typ: 'fälla', title: 'Fallgrop', body: 'Spelas dolt.', antal: 1 } },
    { id: 'snare', fields: { typ: 'fälla', title: 'Snara', body: 'Stoppa ett drag.', antal: 1 } },
  ]
  return doc
}

async function openTemplate(doc: ProjectDoc = typed()) {
  const user = userEvent.setup()
  await run.projects.create('p1', doc)
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: /mall/i }))
  return user
}

const layers = () => within(screen.getByRole('listbox', { name: /lager/i })).getAllByRole('option')
const stored = async () => (await run.projects.load('p1'))!.template.faces

describe('the two faces of the template (#13, L7)', () => {
  it('starts on the front and switches to the back, which is edited the same way', async () => {
    const user = await openTemplate()
    const faces = screen.getByRole('radiogroup', { name: /kortsida/i })
    expect((within(faces).getByRole('radio', { name: 'Framsida' }) as HTMLElement).getAttribute('aria-checked')).toBe('true')
    expect(layers().map((l) => l.getAttribute('data-layer'))).toEqual(['body', 'title', 'frame'])

    await user.click(within(faces).getByRole('radio', { name: 'Baksida' }))
    expect(layers().map((l) => l.getAttribute('data-layer'))).toEqual(['bg'])

    // An edit on the back lands on the back's base, and the front is left alone.
    await user.click(layers()[0]!)
    await user.keyboard('{ArrowRight}')
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    expect((await stored())['back']?.base).toMatchObject([{ id: 'bg', x: 0.5 }])
    expect((await stored())['front']?.base.find((e) => e.id === 'frame')).toMatchObject({ x: 1 })
  })

  it('moves between the faces with the arrow keys, as one tab stop', async () => {
    const user = await openTemplate()
    const faces = screen.getByRole('radiogroup', { name: /kortsida/i })
    within(faces).getByRole('radio', { name: 'Framsida' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(within(faces).getByRole('radio', { name: 'Baksida' }).getAttribute('aria-checked')).toBe('true')
    expect(layers().map((l) => l.getAttribute('data-layer'))).toEqual(['bg'])
  })
})

// Variant A, as chosen: a column makes the groups, the canvas gets a tab per group, and what is
// changed with a group tab open becomes that group's override (#13).
describe('grouping the deck by a column (#13)', () => {
  const groupTabs = () => within(screen.getByRole('tablist', { name: /kortgrupper/i })).getAllByRole('tab')

  it('has no groups until a column is chosen, and then one per value in it', async () => {
    const user = await openTemplate()
    expect(screen.queryByRole('tablist', { name: /kortgrupper/i })).toBeNull()

    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    expect(groupTabs().map((t) => t.textContent)).toEqual(['Bas (alla)', 'typ = varelse', 'typ = fälla'])

    // The rule is the group: it lives on the template, not on a list of cards.
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    expect((await stored())['front']?.variantBy).toBe('typ')
    expect((await stored())['back']?.variantBy).toBe('typ')
  })

  it('shows a card of the group and turns an edit into the group’s override, leaving the base alone', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await user.click(groupTabs()[2]!)
    expect(screen.getByText('Fallgrop')).toBeTruthy()

    await user.click(layers()[1]!)
    await user.keyboard('{ArrowRight}')
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    const front = (await stored())['front']!
    expect(front.base.find((e) => e.id === 'title')).toMatchObject({ x: 5 })
    expect(front.variants['fälla']?.override).toMatchObject([{ id: 'title', x: 5.5 }])
  })

  it('gives the group a back of its own, which is what a card in it lies face down as (L7)', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await user.click(groupTabs()[2]!)
    await user.click(screen.getByRole('radio', { name: 'Baksida' }))
    await user.click(layers()[0]!)
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    expect((await stored())['back']?.base).toMatchObject([{ id: 'bg', x: 0 }])
    expect((await stored())['back']?.variants['fälla']?.override).toMatchObject([{ id: 'bg', x: 5 }])
  })

  it('says per layer whether it is the base’s or the group’s, and which cards the group is about', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    expect(screen.getByText('Alla 3 kort')).toBeTruthy()

    await user.click(groupTabs()[2]!)
    expect(screen.getByText('2 kort med typ = fälla')).toBeTruthy()
    expect(layers().map((l) => l.textContent)).toEqual(['text body · bas', 'text title · bas', 'shape frame · bas'])

    await user.click(layers()[1]!)
    await user.keyboard('{ArrowRight}')
    expect(layers().map((l) => l.textContent)).toEqual(['text body · bas', 'text title · typ = fälla', 'shape frame · bas'])
  })

  it('lets a layer fall back to the base, and only offers that where there is an override', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await user.click(groupTabs()[2]!)
    await user.click(layers()[1]!)
    expect(screen.queryByRole('button', { name: /återgå till basen/i })).toBeNull()

    await user.keyboard('{ArrowRight}')
    await user.click(screen.getByRole('button', { name: /återgå till basen/i }))
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    expect((await stored())['front']?.variants['fälla']?.override).toEqual([])
  })

  it('summarises the groups as the rules they are, with what each changes against the base', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await user.click(groupTabs()[2]!)
    await user.click(layers()[1]!)
    await user.keyboard('{ArrowRight}')

    const rules = within(screen.getByRole('list', { name: /grupper/i })).getAllByRole('listitem')
    expect(rules.map((r) => r.textContent)).toEqual([
      'typ = varelse · 1 kort · ärver basen helt',
      'typ = fälla · 2 kort · framsida: title',
    ])
  })

  it('moves between the groups with the arrow keys, as one tab stop', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    groupTabs()[0]!.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}')
    expect(groupTabs()[2]!.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('2 kort med typ = fälla')).toBeTruthy()
  })
})

// Variant C is not the way a group is made, but the table is where the deck is read, so it says
// which group a row falls into (#13). Reading only: the rule is changed on the canvas.
describe('the group a row falls into, in the table (#13)', () => {
  it('says nothing about groups until the deck is grouped, and then names the rule per row', async () => {
    const user = await openTemplate()
    await user.click(screen.getByRole('tab', { name: /tabell/i }))
    expect(screen.queryByRole('columnheader', { name: 'grupp' })).toBeNull()

    await user.click(screen.getByRole('tab', { name: /mall/i }))
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await user.click(screen.getByRole('tab', { name: /tabell/i }))
    expect(screen.getByRole('columnheader', { name: 'grupp' })).toBeTruthy()
    expect([...document.querySelectorAll('[data-group-of]')].map((c) => c.textContent)).toEqual(['typ = varelse', 'typ = fälla', 'typ = fälla'])
  })

  it('says a card with no value in the column takes the base look', async () => {
    const doc = typed()
    doc.rows.push({ id: 'blank', fields: { typ: '', title: 'Namnlös', body: '', antal: 1 } })
    const user = await openTemplate(doc)
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await user.click(screen.getByRole('tab', { name: /tabell/i }))
    expect([...document.querySelectorAll('[data-group-of]')].map((c) => c.textContent)).toEqual(['typ = varelse', 'typ = fälla', 'typ = fälla', 'Bas'])
  })
})

// A group may take a base element away on its own cards (L3). The layer must not vanish with it,
// or the removal would be a one-way door: it stays in the panel, marked, and can be given back.
describe('a layer a group takes away (#13)', () => {
  const groupTabs = () => within(screen.getByRole('tablist', { name: /kortgrupper/i })).getAllByRole('tab')

  it('keeps the layer in the panel, marked as taken away, and gives it back to the group', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await user.click(groupTabs()[2]!)
    await user.click(layers()[0]!)
    await user.keyboard('{Delete}')

    expect(layers().map((l) => l.textContent)).toEqual(['text body · borttaget i typ = fälla', 'text title · bas', 'shape frame · bas'])
    expect(layers().map((l) => l.hasAttribute('data-removed'))).toEqual([true, false, false])
    // The card of the group no longer draws it, while the base still does.
    expect(screen.queryByText('Spelas dolt.')).toBeNull()

    await user.click(layers()[0]!)
    await user.click(screen.getByRole('button', { name: /återgå till basen/i }))
    expect(layers().map((l) => l.textContent)).toEqual(['text body · bas', 'text title · bas', 'shape frame · bas'])
    expect(screen.getByText('Spelas dolt.')).toBeTruthy()
  })
})
