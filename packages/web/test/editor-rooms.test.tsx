// @vitest-environment jsdom
// What the editor is in each of its three rooms (L10): the desk it has always been, the tablet
// where its panels become named stages, and the phone where the canvas is not offered at all —
// and says so.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
  await run.projects.create('p1', projectDoc())
})
afterEach(async () => {
  await run.stop()
})

async function editorAt(width: number) {
  atWidth(width)
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
}

const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())

describe('the editor on a phone (L10)', () => {
  it('offers the deck, the data and the tables — and says in so many words what needs a wider screen', async () => {
    await editorAt(390)
    expect(tabNames()).toEqual(['Kortvägg', 'Tabell', 'Symboler', 'Regler', 'Bord'])
    // Not a gap where the tools were: a sentence a designer can act on.
    const said = screen.getByText(/Mallen ritas inte på telefon/)
    expect(said.textContent).toMatch(/768/)
    expect(said.textContent).toMatch(/Duken, verktygen, lagren och egenskaperna/)
    // The two things the editor must never lose are in reach, not off the side of the screen.
    expect(screen.getByRole('button', { name: 'Uppdatera bordet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Spara/ })).toBeTruthy()
  })

  it('leaves an element on the wall where it is rather than opening a canvas it does not have', async () => {
    await editorAt(390)
    await userEvent.click(document.querySelector('[data-card-ref="knight"] [data-element="title"]')!)
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('wall')
    expect(document.querySelector('.byd-canvas')).toBeNull()
  })
})

describe('the editor on a tablet (L10)', () => {
  it('lays the template out as four stages beside the three modes, one panel at a time', async () => {
    await editorAt(800)
    expect(tabNames()).toEqual(['Kortvägg', 'Verktyg', 'Lager', 'Duk', 'Egenskaper', 'Tabell', 'Symboler', 'Regler', 'Bord'])

    await userEvent.click(screen.getByRole('tab', { name: 'Duk' }))
    expect(document.querySelector('.byd-canvas')!.getAttribute('data-stage')).toBe('canvas')
    // The stage draws what it is named after and nothing else: no second copy of a widget, and
    // nothing in the tab order that no tab points at.
    expect(document.querySelector('[role="toolbar"]')).toBeNull()
    expect(document.querySelector('.byd-canvas-props')).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: 'Lager' }))
    expect(screen.getByRole('listbox', { name: /Lager/ })).toBeTruthy()
    expect(document.querySelector('.byd-canvas-stage')).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: 'Egenskaper' }))
    // Nothing chosen yet, so the panel says where the choosing happens rather than standing empty.
    expect(screen.getByText(/Välj ett lager i lagerlistan/)).toBeTruthy()
    await userEvent.click(screen.getByRole('tab', { name: 'Lager' }))
    await userEvent.click(screen.getByRole('option', { name: /title/ }))
    await userEvent.click(screen.getByRole('tab', { name: 'Egenskaper' }))
    expect(screen.getByLabelText(/X \(mm\)/)).toBeTruthy()
  })

  it('is one tab stop with the arrows inside it, and opens the stage that is chosen', async () => {
    const user = userEvent.setup()
    await editorAt(800)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1', '-1', '-1', '-1'])

    tabs[0]!.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(tabs[3])
    // Moving is not choosing: the panel changes on Enter, the way the modes already behave (#11).
    expect(document.querySelector('.byd-canvas')).toBeNull()
    await user.keyboard('{Enter}')
    expect(document.querySelector('.byd-canvas')!.getAttribute('data-stage')).toBe('canvas')
    expect(screen.getByRole('tabpanel')).toBe(document.getElementById('byd-editor-panel-canvas'))
  })

  it('opens the card an element on the wall belongs to, on the stage that draws it', async () => {
    await editorAt(800)
    await userEvent.click(document.querySelector('[data-card-ref="knight"] [data-element="title"]')!)
    expect(document.querySelector('.byd-canvas')!.getAttribute('data-stage')).toBe('canvas')
    expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('template')
  })
})

describe('the editor on a desk (L10)', () => {
  it('is the editor it has always been: four modes in the header and the canvas in four columns', async () => {
    await editorAt(1280)
    expect(tabNames()).toEqual(['Kortvägg', 'Mall', 'Tabell', 'Symboler', 'Regler', 'Bord'])
    expect(screen.queryByText(/Mallen ritas inte på telefon/)).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'Mall' }))
    const canvas = document.querySelector('.byd-canvas')!
    expect(canvas.getAttribute('data-stage')).toBeNull()
    expect(canvas.querySelector('[role="toolbar"]')).toBeTruthy()
    expect(canvas.querySelector('.byd-canvas-layers')).toBeTruthy()
    expect(canvas.querySelector('.byd-canvas-stage')).toBeTruthy()
    expect(canvas.querySelector('.byd-canvas-props')).toBeTruthy()
  })
})
