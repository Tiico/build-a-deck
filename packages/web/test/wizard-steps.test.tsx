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
    expect(screen.queryByText('Utseende')).toBeNull()

    await user.click(screen.getByRole('tab', { name: '2 · Fälten' }))
    expect(screen.getByLabelText('Kostnad namn')).toBeTruthy()
    // The frame belongs with the fields it frames, not in another chapter.
    expect(screen.getByText('Utseende')).toBeTruthy()

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
    expect(screen.getByText('Utseende')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Skapa spelet/ })).toBeTruthy()
  })
})

// Landmarks and the preview (#555 A-9, A-10): the form is the page's main content, all three steps
// of it, and the card beside it is one picture with one name rather than three nameless drawings.
describe.each([1280, 390])('the wizard to a screen reader at %i px (#555)', (width) => {
  it('keeps every step inside main, and has nothing to call a side column', () => {
    wizardAt(width)
    const main = screen.getByRole('main')
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(main.contains(screen.getByLabelText('Spelets namn'))).toBe(true)
    for (const panel of document.querySelectorAll('[role="tabpanel"]')) expect(main.contains(panel)).toBe(true)
    if (width === 1280) {
      expect(main.contains(screen.getByLabelText('Kostnad namn'))).toBe(true)
      expect(main.contains(screen.getByRole('button', { name: /Skapa spelet/ }))).toBe(true)
    }
  })
})

describe('the wizard\'s preview (#555)', () => {
  it('is one image named for the card it shows, with nothing inside it to read on its own', async () => {
    const user = userEvent.setup()
    wizardAt(1280)
    const preview = document.querySelector('.byd-wizard-preview')!
    const images = screen.getAllByRole('img').filter((image) => preview.contains(image))
    expect(images).toHaveLength(1)
    const [card] = images
    expect(card!.contains(preview.querySelector('[data-card]'))).toBe(true)
    await user.clear(screen.getByLabelText('kort 1 Titel'))
    await user.type(screen.getByLabelText('kort 1 Titel'), 'Drake')
    expect(card!.getAttribute('aria-label')).toBe('Förhandsvisning av kort 1: Drake')
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
    expect(document.activeElement).toBe(screen.getByLabelText('Kostnad namn'))
  })

  it('goes on to the next step from the name on a phone', async () => {
    const user = userEvent.setup()
    wizardAt(390)
    await user.type(screen.getByLabelText('Spelets namn'), 'Skogens herrar{Enter}')
    expect(screen.getByRole('tab', { name: '2 · Fälten' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Kostnad namn'))
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

// The names in step 2 are the columns the game gets (#476, L44), so the ones the document cannot
// hold are stopped where they are written: none, one used twice, and the tool's own. The title is
// the tool's column too, shown as «Titel» and not written over.
describe('the names of the fields (#476)', () => {
  it('shows the title as the tool s own column, not a name to write over', () => {
    wizardAt(1280)
    const row = document.querySelector('[data-field="title"]') as HTMLElement
    expect(row.textContent).toContain('Titel')
    expect(row.querySelector('input')).toBeNull()
  })

  it('stops a name used twice, an empty one and the tool s own at the field, and keeps «Skapa» from going on', async () => {
    const user = userEvent.setup()
    const gone: string[] = []
    atWidth(1280)
    history.replaceState(null, '', '/new')
    render(<NewProjectPage onNavigate={(u) => gone.push(u)} />)
    await user.type(screen.getByLabelText('Spelets namn'), 'Skogens herrar')
    const cost = screen.getByLabelText('Kostnad namn')

    await user.clear(cost)
    await user.type(cost, 'Regeltext')
    expect(cost.getAttribute('aria-invalid')).toBe('true')
    const said = document.getElementById(cost.getAttribute('aria-describedby') ?? '')
    expect(said?.textContent).toBe('Två fält kan inte heta «Regeltext».')

    await user.clear(cost)
    expect(document.getElementById(cost.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Fältet behöver ett namn.')

    await user.type(cost, 'antal')
    expect(document.getElementById(cost.getAttribute('aria-describedby') ?? '')?.textContent).toBe('«antal» är verktygets eget namn.')
    await user.clear(cost)
    await user.type(cost, 'titel')
    expect(document.getElementById(cost.getAttribute('aria-describedby') ?? '')?.textContent).toBe('«titel» är verktygets eget namn.')

    await user.click(screen.getByRole('button', { name: /Skapa spelet och fortsätt i editorn/ }))
    expect(document.activeElement).toBe(cost)
    expect(gone).toEqual([])

    await user.clear(cost)
    await user.type(cost, 'Pris')
    expect(cost.getAttribute('aria-invalid')).not.toBe('true')
  })
})

describe('a field added twice (#476)', () => {
  it('suggests a name no other field has, so a new field is never born refused', async () => {
    const user = userEvent.setup()
    wizardAt(1280)
    await user.click(screen.getByRole('button', { name: '+ Textfält' }))
    await user.click(screen.getByRole('button', { name: '+ Textfält' }))
    expect(screen.getByLabelText('Nytt textfält 2 namn')).toBeTruthy()
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
  })
})

// A field taken away hands the keys to its neighbour (#555 A-4, WCAG 2.4.3): the × that was pressed
// is gone, and the focus used to fall to the page, where a screen reader is told nothing.
describe('taking a field away keeps the keys in the field list (#555)', () => {
  it('moves the focus to the next field’s ×, and to the field before it when it was the last', async () => {
    const user = userEvent.setup()
    wizardAt(1280)
    const removes = () => [...document.querySelectorAll<HTMLButtonElement>('.byd-wizard-field-list button')]
    const [first] = removes()
    const next = removes()[1]!
    first!.focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(next)
    // The last one: the focus goes back to the field before it.
    const all = removes()
    all.at(-1)!.focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(removes().at(-1))
    // None left: the way to add one.
    while (removes().length > 0) {
      removes()[0]!.focus()
      await user.keyboard('{Enter}')
    }
    expect(document.activeElement?.closest('.byd-wizard-add-fields')).not.toBeNull()
  })
})
