// @vitest-environment jsdom
// The starter flow below the desk (#4, L10): three steps with one job each, instead of one page
// two and a half screens long where the frame is chosen half a metre from the card it changes.
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { atWidth } from './viewport.js'

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
    expect(screen.getByLabelText('Namn')).toBeTruthy()
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
    await user.type(screen.getByLabelText('Namn'), 'Skogens herrar')
    await user.click(screen.getByRole('tab', { name: '3 · Korten' }))
    await user.click(screen.getByRole('tab', { name: '1 · Spelet' }))
    expect((screen.getByLabelText('Namn') as HTMLInputElement).value).toBe('Skogens herrar')
  })
})

describe('the wizard on a desk', () => {
  it('is the one page it has always been, with no steps to walk', () => {
    wizardAt(1280)
    expect(tabNames()).toEqual([])
    expect(screen.getByLabelText('Namn')).toBeTruthy()
    expect(screen.getByText('Startram')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Skapa spelet/ })).toBeTruthy()
  })
})
