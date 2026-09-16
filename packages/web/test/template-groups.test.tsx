// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent, type UserEvent } from '@testing-library/user-event'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { drag, laidOut, target } from './drag.js'
import { startServer, type Running } from './fixture.js'
import { layerRows } from './layers.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A deck whose cards carry a `typ` column, so there is something to group by.
function typed(): ProjectDoc {
  const doc = projectDoc()
  doc.rows = [
    { id: 'dragon', fields: { typ: 'varelse', title: 'Drake', body: 'Flygande.', antal: 2 } },
    { id: 'trap', fields: { typ: 'fälla', title: 'Fallgrop', body: 'Spelas dolt.', antal: 1 } },
    { id: 'snare', fields: { typ: 'fälla', title: 'Snara', body: 'Stoppa ett drag.', antal: 1 } },
  ]
  return doc
}

async function openTemplate(doc: ProjectDoc = typed()) {
  const user = userEvent.setup()
  await run.projects.create(run.projectId, doc)
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  await user.click(screen.getByRole('tab', { name: /mall/i }))
  return user
}

// The panel is a grid (L15): the rows are the layers, and clicking a layer means pressing the
// cell that is the layer.
const layers = () => layerRows()
const pick = (at: number) => layers()[at]!.querySelector('.byd-layer-pick') as HTMLElement
// Nudging an element is the card's keyboard, not the panel's: inside the panel the arrows walk
// the grid (L15), exactly as they do in any other layer panel. So the focus leaves the panel
// first, which is what happens when a designer picks a layer and then goes back to the card.
const nudge = async (user: UserEvent, keys: string) => {
  ;(document.activeElement as HTMLElement | null)?.blur()
  await user.keyboard(keys)
}
const stored = async () => (await run.projects.load(run.projectId))!.template.faces
// The groups stand behind one button in the crown since #129: it carries the open group and how
// many cards that is, and the list of every group is what it opens. Opening it is what a designer
// does before she chooses, so every test that chooses a group does it the same way here.
const groupButton = () => screen.getByRole('button', { name: /kortgrupper/i })
const openGroups = async (user: UserEvent) => {
  await user.click(groupButton())
  return within(screen.getByRole('menu', { name: /kortgrupper/i })).getAllByRole('menuitemradio')
}
const chooseGroup = async (user: UserEvent, at: number) => {
  const items = await openGroups(user)
  await user.click(items[at]!)
}

describe('the two faces of the template (#13, L7)', () => {
  it('starts on the front and switches to the back, which is edited the same way', async () => {
    const user = await openTemplate()
    const faces = screen.getByRole('radiogroup', { name: /kortsida/i })
    expect((within(faces).getByRole('radio', { name: 'Framsida' }) as HTMLElement).getAttribute('aria-checked')).toBe('true')
    expect(layers().map((l) => l.getAttribute('data-layer'))).toEqual(['body', 'title', 'frame'])

    await user.click(within(faces).getByRole('radio', { name: 'Baksida' }))
    expect(layers().map((l) => l.getAttribute('data-layer'))).toEqual(['bg'])

    // An edit on the back lands on the back's base, and the front is left alone.
    await user.click(pick(0))
    await nudge(user, '{ArrowRight}')
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

// Variant A, as chosen: a column makes the groups, and what is changed with a group open becomes
// that group's override (#13). Which group is open is the crown's menu since #129 — the row of tabs
// hid 61 % of itself — but a group is the same rule it always was.
describe('grouping the deck by a column (#13)', () => {
  it('has no groups until a column is chosen, and then one per value in it', async () => {
    const user = await openTemplate()
    expect(screen.queryByRole('button', { name: /kortgrupper/i })).toBeNull()

    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    // The button carries the open group and its count on its own, and the list behind it carries
    // every group with the same two things (#129).
    expect(groupButton().textContent).toBe('Bas (alla) · 3 kort▾')
    expect((await openGroups(user)).map((t) => t.textContent)).toEqual(['Bas (alla)3 kort', 'typ = varelse1 kort', 'typ = fälla2 kort'])

    // The rule is the group: it lives on the template, not on a list of cards.
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    expect((await stored())['front']?.variantBy).toBe('typ')
    expect((await stored())['back']?.variantBy).toBe('typ')
  })

  it('shows a card of the group and turns an edit into the group’s override, leaving the base alone', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await chooseGroup(user, 2)
    expect(screen.getByText('Fallgrop')).toBeTruthy()

    await user.click(pick(1))
    await nudge(user, '{ArrowRight}')
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    const front = (await stored())['front']!
    expect(front.base.find((e) => e.id === 'title')).toMatchObject({ x: 5 })
    expect(front.variants['fälla']?.override).toMatchObject([{ id: 'title', x: 5.5 }])
  })

  it('gives the group a back of its own, which is what a card in it lies face down as (L7)', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await chooseGroup(user, 2)
    await user.click(screen.getByRole('radio', { name: 'Baksida' }))
    await user.click(pick(0))
    await nudge(user, '{Shift>}{ArrowRight}{/Shift}')
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    expect((await stored())['back']?.base).toMatchObject([{ id: 'bg', x: 0 }])
    expect((await stored())['back']?.variants['fälla']?.override).toMatchObject([{ id: 'bg', x: 5 }])
  })

  it('says per layer whether it is the base’s or the group’s, and which cards the group is about', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    expect(screen.getByText('Alla 3 kort')).toBeTruthy()

    await chooseGroup(user, 2)
    expect(screen.getByText('2 kort med typ = fälla')).toBeTruthy()
    expect(layers().map((l) => (l.querySelector('.byd-layer-pick') as HTMLElement).textContent)).toEqual(['body· bas', 'title· bas', 'frame· bas'])

    await user.click(pick(1))
    await nudge(user, '{ArrowRight}')
    expect(layers().map((l) => (l.querySelector('.byd-layer-pick') as HTMLElement).textContent)).toEqual(['body· bas', 'title· typ = fälla', 'frame· bas'])
  })

  it('lets a layer fall back to the base, and only offers that where there is an override', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await chooseGroup(user, 2)
    await user.click(pick(1))
    expect(screen.queryByRole('button', { name: /återgå till basen/i })).toBeNull()

    await nudge(user, '{ArrowRight}')
    await user.click(screen.getByRole('button', { name: /återgå till basen/i }))
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    expect((await stored())['front']?.variants['fälla']?.override).toEqual([])
  })

  it('summarises the groups as the rules they are, with what each changes against the base', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await chooseGroup(user, 2)
    await user.click(pick(1))
    await nudge(user, '{ArrowRight}')

    const rules = within(screen.getByRole('list', { name: /grupper/i })).getAllByRole('listitem')
    expect(rules.map((r) => r.textContent)).toEqual([
      'typ = varelse · 1 kort · ärver basen helt',
      'typ = fälla · 2 kort · framsida: title',
    ])
  })

  // Every group is reachable from the keyboard, which is half of what #129 asks: the menu opens on
  // the group that is already open, the arrows walk the list from there, Enter chooses, and Escape
  // leaves — with the focus back on the button it was opened from, not dropped on the document.
  it('opens on the group that is open, walks the list with the arrow keys and chooses with Enter', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    const items = await openGroups(user)
    expect(document.activeElement).toBe(items[0])

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(screen.queryByRole('menu', { name: /kortgrupper/i })).toBeNull()
    expect(document.activeElement).toBe(groupButton())
    expect(groupButton().textContent).toBe('typ = fälla · 2 kort▾')
    expect(screen.getByText('2 kort med typ = fälla')).toBeTruthy()

    const again = await openGroups(user)
    expect(again.map((t) => t.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: /kortgrupper/i })).toBeNull()
    expect(document.activeElement).toBe(groupButton())
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
  it('keeps the layer in the panel, marked as taken away, and gives it back to the group', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await chooseGroup(user, 2)
    await user.click(pick(0))
    await user.keyboard('{Delete}')
    // The question the key opens says how far this removal reaches, which with a group open is
    // the group's own cards and not the deck (#143, L9).
    // Two of the deck's three cards are `typ = fälla`, and the question counts those and not the deck.
    expect(screen.getByRole('alertdialog').textContent).toMatch(/2 kort/)
    await user.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    expect(layers().map((l) => (l.querySelector('.byd-layer-pick') as HTMLElement).textContent)).toEqual(['body· borttaget i typ = fälla', 'title· bas', 'frame· bas'])
    expect(layers().map((l) => l.hasAttribute('data-removed'))).toEqual([true, false, false])
    // The card of the group no longer draws it, while the base still does.
    expect(screen.queryByText('Spelas dolt.')).toBeNull()

    await user.click(pick(0))
    await user.click(screen.getByRole('button', { name: /återgå till basen/i }))
    expect(layers().map((l) => (l.querySelector('.byd-layer-pick') as HTMLElement).textContent)).toEqual(['body· bas', 'title· bas', 'frame· bas'])
    expect(screen.getByText('Spelas dolt.')).toBeTruthy()
  })
})

// The base tab is the base (#13): it says so, the layer panel lists the base, and what is changed
// there reaches every card. The card it drew did not agree. With a column chosen and no group
// open, the preview was still a card of the deck, so it was drawn as its own group draws it —
// the group's overrides in place and the group's own elements on top — while the panel beside it
// listed the base alone. An element the designer could drag but could not find in the panel or
// reach in the properties is the bug; the throw was only how it finally announced itself, since
// a drag with no group open patches the base, where a group's own element is not (#41).
describe('the base tab draws the base and nothing else (#13, #41)', () => {
  it('does not offer a group’s own element to the pointer with the base tab open, and drags the base under it', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')

    // The first card of the deck is a `varelse`, so what that group draws is what the base tab
    // would be showing: give the group an element of its own.
    await chooseGroup(user, 1)
    await user.click(screen.getByRole('button', { name: 'Form' }))
    const mine = layers()[0]!.getAttribute('data-layer')!
    laidOut()
    expect(target(mine)).toBeTruthy()

    // Back to the base, where that element is none of the designer's business.
    await chooseGroup(user, 0)
    expect(layers().map((l) => l.getAttribute('data-layer'))).toEqual(['body', 'title', 'frame'])
    expect(target(mine)).toBeNull()

    // And the base element under it still drags, from the base's own place, onto the base: the
    // tab is the base, not a card with the group's work hidden.
    laidOut()
    drag(target('title')!, [100, 100], [160, 120])
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    const front = (await stored())['front']!
    expect(front.base.find((e) => e.id === 'title')).toMatchObject({ x: 15, y: 8.3 })
    expect(front.variants['varelse']?.override?.map((e) => e.id)).toEqual([mine])
  })

  // An id belongs to the face, not to the tab it was minted on. A base element named after a
  // group's own element would be overridden by that group the moment one of its cards was drawn:
  // two elements, one id, and the base one invisible wherever the group applies.
  it('does not name a new base element after an element some group already has', async () => {
    const user = await openTemplate()
    await user.selectOptions(screen.getByLabelText(/grupperas av kolumnen/i), 'typ')
    await chooseGroup(user, 1)
    await user.click(screen.getByRole('button', { name: 'Form' }))

    await chooseGroup(user, 0)
    await user.click(screen.getByRole('button', { name: 'Form' }))
    await user.click(screen.getByRole('button', { name: /spara/i }))
    await screen.findByText('rev 2')
    const front = (await stored())['front']!
    expect(front.base.map((e) => e.id)).toEqual(['frame', 'title', 'body', 'shape-2'])
    expect(front.variants['varelse']?.override?.map((e) => e.id)).toEqual(['shape-1'])
  })
})
