// @vitest-environment jsdom
// The starter flow below the desk (#4, L10): three steps with one job each, instead of one page
// two and a half screens long where the frame is chosen half a metre from the card it changes.
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { atWidth } from './viewport.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

function wizardAt(width: number) {
  atWidth(width)
  history.replaceState(null, '', '/new')
  render(<NewProjectPage />)
}

const tabNames = () => screen.queryAllByRole('tab').map((tab) => tab.textContent?.trim())

describe('the wizard on a phone', () => {
  it('is three steps, each with one thing to do', async () => {
    const user = userEvent.setup()
    wizardAt(390)
    expect(tabNames()).toEqual(['1 · Spelet', '2 · Fälten', '3 · Korten'])
    expect(screen.getByLabelText('Spelets namn')).toBeTruthy()
    expect(screen.queryByText('Startram')).toBeNull()

    await user.click(screen.getByRole('tab', { name: '2 · Fälten' }))
    expect(screen.getByLabelText('Titel namn')).toBeTruthy()
    // The frame belongs with the fields it frames, not in another chapter.
    expect(screen.getByText('Startram')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: '3 · Korten' }))
    // The card owns the top of its own step, beside nothing and under nothing.
    expect(document.querySelector('.byd-wizard-preview [data-card]')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Skapa spelet/ })).toBeTruthy()
  })

  it('walks forward and back, and says where the ends are', async () => {
    const user = userEvent.setup()
    wizardAt(390)
    const back = () => screen.getByRole('button', { name: /Föregående/ }) as HTMLButtonElement
    const on = () => screen.getByRole('button', { name: /Nästa/ }) as HTMLButtonElement
    expect(back().disabled).toBe(true)

    await user.click(on())
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Fälten')
    await user.click(on())
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Korten')
    expect(on().disabled).toBe(true)
    await user.click(back())
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Fälten')
  })

  it('is one tab stop with the arrows inside it', async () => {
    const user = userEvent.setup()
    wizardAt(390)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    tabs[0]!.focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[1])
    await user.keyboard('{Enter}')
    expect(screen.getByRole('tabpanel')).toBe(document.getElementById('byd-wizard-panel-falten'))
  })

  it('keeps what has been typed when the step changes', async () => {
    const user = userEvent.setup()
    wizardAt(390)
    await user.type(screen.getByLabelText('Spelets namn'), 'Skogens herrar')
    await user.click(screen.getByRole('tab', { name: '3 · Korten' }))
    await user.click(screen.getByRole('tab', { name: '1 · Spelet' }))
    expect((screen.getByLabelText('Spelets namn') as HTMLInputElement).value).toBe('Skogens herrar')
  })
})

describe('the wizard on a desk', () => {
  it('is the one page it has always been, with no steps to walk', () => {
    wizardAt(1280)
    expect(tabNames()).toEqual([])
    expect(screen.getByLabelText('Spelets namn')).toBeTruthy()
    expect(screen.getByText('Startram')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Skapa spelet/ })).toBeTruthy()
  })
})

// Where the focus goes (#476): Enter in a field did nothing, a new field or card left the focus
// on the button that made it, and a control that went away or locked left it on <body>.
describe('the focus in the wizard (#476)', () => {
  it('starts in the name on a desk, and Enter there goes on to the fields', async () => {
    const user = userEvent.setup()
    wizardAt(1280)
    expect(document.activeElement).toBe(screen.getByLabelText('Spelets namn'))
    await user.type(screen.getByLabelText('Spelets namn'), 'Skogens herrar{Enter}')
    expect(document.activeElement).toBe(screen.getByLabelText('Titel namn'))
  })

  it('goes on to the next step from the name on a phone', async () => {
    const user = userEvent.setup()
    wizardAt(390)
    await user.type(screen.getByLabelText('Spelets namn'), 'Skogens herrar{Enter}')
    expect(screen.getByRole('tab', { name: '2 · Fälten' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Titel namn'))
  })

  it('puts the focus in what was just made: a new field s name, a new card s title', async () => {
    const user = userEvent.setup()
    wizardAt(1280)
    await user.click(screen.getByRole('button', { name: '+ Textfält' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Nytt textfält namn'))
    await user.click(screen.getByRole('button', { name: '+ Nytt kort' }))
    expect(document.activeElement).toBe(screen.getByLabelText('kort 2 Titel'))
  })

  it('never leaves the focus on nothing when a card is taken away or a step button locks', async () => {
    const user = userEvent.setup()
    wizardAt(1280)
    await user.click(screen.getByRole('button', { name: '+ Nytt kort' }))
    await user.click(screen.getByRole('button', { name: 'Ta bort valt kort' }))
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.getAttribute('aria-pressed')).toBe('true')
    cleanup()

    wizardAt(390)
    await user.click(screen.getByRole('button', { name: 'Nästa →' }))
    await user.click(screen.getByRole('button', { name: 'Nästa →' }))
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByRole('tabpanel').contains(document.activeElement)).toBe(true)
  })
})
