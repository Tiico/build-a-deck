// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DeckWall } from '../src/editor/DeckWall.js'
import { projectDoc } from './project-doc.js'

describe('DeckWall (C as the home view)', () => {
  it('renders every row as a compiled card with its copies and warnings, and reports clicks on cards and elements', () => {
    const doc = projectDoc()
    doc.rows[2]!.fields['body'] = 'Har {magi}.'
    const onSelectRow = vi.fn()
    const onSelectElement = vi.fn()
    render(<DeckWall doc={doc} face="front" selectedRow="knight" onSelectRow={onSelectRow} onSelectElement={onSelectElement} />)

    const cards = [...document.querySelectorAll('[data-card-ref]')]
    expect(cards.map((c) => c.getAttribute('data-card-ref'))).toEqual(['dragon', 'knight', 'wizard'])
    expect(screen.getByText('Drake')).toBeTruthy()
    expect(cards[0]!.querySelector('[data-copies]')!.textContent).toBe('×2')
    expect(cards[1]!.querySelector('[data-copies]')).toBeNull()
    expect(cards[2]!.querySelector('[data-warnings]')!.textContent).toBe('1')
    expect(cards[0]!.querySelector('[data-warnings]')).toBeNull()
    expect(cards[1]!.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(cards[0]!)
    expect(onSelectRow).toHaveBeenCalledWith('dragon')
    fireEvent.click(cards[2]!.querySelector('[data-element="title"]')!)
    expect(onSelectElement).toHaveBeenCalledWith('title')
  })

  it('opens the card that was clicked, not the one that happened to be selected (#234)', () => {
    const doc = projectDoc()
    const onSelectRow = vi.fn()
    const onSelectElement = vi.fn()
    // `knight` is the selected card and wears the ring; `wizard` is the one the hand goes to.
    render(<DeckWall doc={doc} face="front" selectedRow="knight" onSelectRow={onSelectRow} onSelectElement={onSelectElement} />)
    const wizard = document.querySelector('[data-card-ref="wizard"]')!

    // Almost the whole of a card is its elements — the front's frame shape alone covers 61 × 86 of
    // its 63 × 88 — so a click on a card is nearly always a click on an element of it. The preview
    // stops that click from travelling, which is right: the element is the more particular answer.
    // But the wall still has to say which card the element belongs to, or the view that opens is
    // about whichever card was selected before.
    fireEvent.click(wizard.querySelector('[data-element="title"]')!)
    expect(onSelectElement).toHaveBeenCalledWith('title')
    expect(onSelectRow).toHaveBeenCalledWith('wizard')
  })

  it('says the card is chosen before it says which element, so the element is read on the right card', () => {
    const doc = projectDoc()
    const said: string[] = []
    render(
      <DeckWall
        doc={doc}
        face="front"
        selectedRow="knight"
        onSelectRow={(id) => said.push(`row:${id}`)}
        onSelectElement={(id) => said.push(`element:${id}`)}
      />,
    )
    fireEvent.click(document.querySelector('[data-card-ref="wizard"]')!.querySelector('[data-element="title"]')!)
    expect(said).toEqual(['row:wizard', 'element:title'])
  })
})

// The wall is a list a keyboard can stand in (#477): one tab stop, the arrows between the cards,
// and Enter or Space choosing the one that has focus — the same errand a click is on.
describe('choosing a card from the keyboard (#477)', () => {
  it('is one tab stop of options whose selection is valid ARIA, and Enter and Space choose', () => {
    const onSelectRow = vi.fn()
    render(<DeckWall doc={projectDoc()} face="front" selectedRow="knight" onSelectRow={onSelectRow} onSelectElement={() => undefined} />)
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.getAttribute('data-card-ref'))).toEqual(['dragon', 'knight', 'wizard'])
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    // The chosen card is where Tab lands; the others are reached with the arrows.
    expect(options.map((o) => o.tabIndex)).toEqual([-1, 0, -1])
    expect(options[0]!.closest('[role="listbox"]')).not.toBeNull()

    options[1]!.focus()
    fireEvent.keyDown(options[1]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(options[2])
    fireEvent.keyDown(options[2]!, { key: 'Enter' })
    expect(onSelectRow).toHaveBeenLastCalledWith('wizard')
    fireEvent.keyDown(options[2]!, { key: 'ArrowLeft' })
    fireEvent.keyDown(options[1]!, { key: 'ArrowLeft' })
    fireEvent.keyDown(options[0]!, { key: ' ' })
    expect(onSelectRow).toHaveBeenLastCalledWith('dragon')
  })
})

// How a card stops being chosen (beslut 2026-09-27, #477 fynd 3, variant C): the same gesture that
// chose it, once more, and Escape. «Nothing chosen» is the template's base and no row.
describe('letting the chosen card go (#477)', () => {
  it('lets go on a second press, on Enter or Space on the chosen card, and on Escape', () => {
    const onSelectRow = vi.fn()
    render(<DeckWall doc={projectDoc()} face="front" selectedRow="knight" onSelectRow={onSelectRow} onSelectElement={() => undefined} />)
    const knight = document.querySelector('[data-card-ref="knight"]') as HTMLElement
    fireEvent.click(knight)
    expect(onSelectRow).toHaveBeenLastCalledWith(null)
    fireEvent.keyDown(knight, { key: 'Enter' })
    expect(onSelectRow).toHaveBeenLastCalledWith(null)
    fireEvent.keyDown(knight, { key: ' ' })
    expect(onSelectRow).toHaveBeenLastCalledWith(null)
    // Escape lets go from whichever card has the focus.
    const dragon = document.querySelector('[data-card-ref="dragon"]') as HTMLElement
    onSelectRow.mockClear()
    fireEvent.keyDown(dragon, { key: 'Escape' })
    expect(onSelectRow).toHaveBeenLastCalledWith(null)
    // A card that is not chosen is chosen, as before.
    fireEvent.click(dragon)
    expect(onSelectRow).toHaveBeenLastCalledWith('dragon')
  })

  it('leaves Escape alone when nothing is chosen, so a door further out can answer it', () => {
    const onSelectRow = vi.fn()
    render(<DeckWall doc={projectDoc()} face="front" selectedRow={null} onSelectRow={onSelectRow} onSelectElement={() => undefined} />)
    const dragon = document.querySelector('[data-card-ref="dragon"]') as HTMLElement
    const passed = fireEvent.keyDown(dragon, { key: 'Escape' })
    expect(onSelectRow).not.toHaveBeenCalled()
    expect(passed).toBe(true)
  })
})

describe('images on the wall (E1)', () => {
  it('draws a card whose row points at an asset with the image from the server', () => {
    const doc = projectDoc()
    const hash = 'f'.repeat(64)
    doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
    doc.rows[0]!.fields['art'] = `asset:${hash}`
    render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} assetBase="http://api.local" />)
    // The element is the frame and the picture hangs inside it (E1), so the box a designer
    // grabs stays the box however the picture is fitted into it.
    const img = document.querySelector('[data-card-ref="dragon"] [data-element="art"] img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(`http://api.local/assets/${hash}`)
    // A card without an image draws the frame empty, not with a reference as its address.
    expect(document.querySelector('[data-card-ref="knight"] [data-element="art"]')).not.toBeNull()
    expect(document.querySelector('[data-card-ref="knight"] [data-element="art"] img')).toBeNull()
  })
})

// Since #128 the wall wears a crown: the report and the eyes are behind named boxes that open over
// the deck, rather than a 320 px dock and a row of segments standing there all the time. A box is
// found by the name it starts with, because what follows it is the state it is saying.
const openBox = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))

describe('the physical checks on the wall (E5)', () => {
  const tiny = { kind: 'text', id: 'flavour', x: 6, y: 70, w: 51, h: 10, bind: { field: 'flavour' }, font: { family: 'system-ui', sizePt: 5 }, color: '#111111' } as const
  const paper = { kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#ffffff' } as const
  const body = { kind: 'text', id: 'body', x: 6, y: 30, w: 51, h: 30, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 9 }, color: '#111111' } as const
  const faulty = () => {
    const doc = projectDoc()
    doc.template.faces['front']!.base = [paper, body, tiny]
    doc.template.faces['back']!.base = [paper]
    return doc
  }
  const wall = (doc = faulty()) => {
    render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />)
    return document.querySelector('[data-wall]') as HTMLElement
  }

  it('gathers the deck\'s faults by kind, says what keeps it from print, and marks the cards a fault touches', () => {
    wall()
    openBox(/^Fysisk kontroll/)
    const report = screen.getByRole('list', { name: 'Fysisk kontroll' })
    const rows = within(report).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.textContent).toContain('för liten text')
    expect(rows[0]!.textContent).toContain('3 kort')
    expect(rows[0]!.getAttribute('data-severity')).toBe('error')
    expect(screen.getByText('Ett fel måste rättas innan leken är tryckfärdig.')).toBeTruthy()

    fireEvent.click(within(rows[0]!).getByRole('button', { name: /för liten text/ }))
    expect(document.querySelectorAll('[data-card-ref][data-marked]')).toHaveLength(3)
    expect(within(rows[0]!).getByText(/5 pt/)).toBeTruthy()
    // Clicking it again lets the deck go.
    fireEvent.click(within(rows[0]!).getByRole('button', { name: /för liten text/ }))
    expect(document.querySelectorAll('[data-card-ref][data-marked]')).toHaveLength(0)
  })

  // The marks belong to the report that made them (#477): with the box shut, 77 cards stood
  // framed in yellow and nothing on the screen said why.
  it('lets the marked cards go when the report is closed', () => {
    wall()
    openBox(/^Fysisk kontroll/)
    const report = screen.getByRole('list', { name: 'Fysisk kontroll' })
    fireEvent.click(within(within(report).getAllByRole('listitem')[0]!).getByRole('button', { name: /för liten text/ }))
    expect(document.querySelectorAll('[data-card-ref][data-marked]')).toHaveLength(3)
    openBox(/^Fysisk kontroll/)
    expect(screen.queryByRole('list', { name: 'Fysisk kontroll' })).toBeNull()
    expect(document.querySelectorAll('[data-card-ref][data-marked]')).toHaveLength(0)
  })

  // The way to the print package (#1208, beslut B): under the checks, for those who may take it.
  it('leads to the print package from the checks', () => {
    const went: HTMLElement[] = []
    render(<DeckWall doc={faulty()} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} printPackage={{ href: '/print-package?project=p1&from=editor', onGo: (from) => went.push(from) }} />)
    openBox(/^Fysisk kontroll/)
    const link = screen.getByRole('link', { name: 'Se tryckpaketet ›' })
    expect(link.getAttribute('href')).toBe('/print-package?project=p1&from=editor')
    fireEvent.click(link)
    expect(went).toEqual([link])
  })

  it('offers no way to the print package without one', () => {
    wall()
    openBox(/^Fysisk kontroll/)
    expect(screen.queryByRole('link', { name: 'Se tryckpaketet ›' })).toBeNull()
  })

  it('says so plainly when nothing is wrong', () => {
    const clean = faulty()
    clean.template.faces['front']!.base = [paper, body]
    wall(clean)
    openBox(/^Fysisk kontroll/)
    expect(screen.getByText('Leken klarar kontrollen och är tryckfärdig.')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Fysisk kontroll' })).toBeNull()
  })

  it('leaves the card\'s own badge alone: a template fault is said once in the report, not on every card', () => {
    const doc = faulty()
    doc.rows[0]!.fields['body'] = 'Har {magi}.'
    wall(doc)
    // One unknown icon on this card, and nothing added for the three cards' shared fault.
    expect(document.querySelector('[data-card-ref="dragon"] [data-warnings]')!.textContent).toBe('1')
    expect(document.querySelector('[data-card-ref="knight"] [data-warnings]')).toBeNull()
    openBox(/^Fysisk kontroll/)
    expect(within(screen.getByRole('list', { name: 'Fysisk kontroll' })).getAllByRole('listitem')).toHaveLength(1)
  })
})

// Väggens visning står på ett ställe (L81, #1256): en panel bredvid väggen, och boxarna Visning och
// Fysisk kontroll öppnar var sin, utan flikar mellan dem. Storleken är ett val och ögonen ett annat, så de går att se tillsammans, och läsbarheten
// sägs en gång i panelen i stället för under varje kort.
describe('the wall’s panel: Visning and Kontroll beside the wall (L81, #1256)', () => {
  const wall = (doc = projectDoc()) => {
    render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />)
    return document.querySelector('[data-wall]') as HTMLElement
  }
  const panel = (name: string | RegExp = /^(Visning|Fysisk kontroll)$/) => screen.queryByRole('complementary', { name })
  const viewBox = () => screen.getByRole('button', { name: /^Visning/ })
  const width = (el: HTMLElement) => el.style.getPropertyValue('--byd-wall-card')
  const tinyBody = () => {
    const doc = projectDoc()
    const face = doc.template.faces['front']!
    face.base = face.base.map((e) => (e.kind === 'text' && e.id === 'body' ? { ...e, font: { ...e.font, sizePt: 6 } } : e))
    return doc
  }

  it('opens beside the wall as the box it was opened by, without tabs, and closes with its cross, its box and Escape', () => {
    wall()
    expect(panel()).toBeNull()
    openBox(/^Visning/)
    expect(panel('Visning')).not.toBeNull()
    expect(viewBox().getAttribute('aria-expanded')).toBe('true')
    // The two boxes are the way between the two: the panel repeats neither as a tab (#1328).
    expect(within(panel()!).queryAllByRole('tab')).toHaveLength(0)
    expect(within(panel()!).getByRole('heading', { level: 2 }).textContent).toBe('Visning')
    // The deck stands where it stood: the panel is beside it, not a drawer over it.
    expect(document.querySelector('.byd-crown-drawer')).toBeNull()
    expect(panel()!.closest('.byd-wall-work')).not.toBeNull()

    openBox(/^Fysisk kontroll/)
    expect(panel('Fysisk kontroll')).not.toBeNull()
    expect(within(panel()!).queryAllByRole('tab')).toHaveLength(0)
    expect(viewBox().getAttribute('aria-expanded')).toBe('false')
    openBox(/^Visning/)
    expect(panel('Visning')).not.toBeNull()

    // A press on a card leaves it open: what is chosen in it is read on the cards.
    fireEvent.click(document.querySelector('[data-card-ref="knight"]')!)
    expect(panel()).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Stäng panelen' }))
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(viewBox())

    openBox(/^Visning/)
    openBox(/^Visning/)
    expect(panel()).toBeNull()
    openBox(/^Visning/)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(panel()).toBeNull()
  })

  it('takes the size as one choice and the eye as another, and draws them together', () => {
    localStorage.setItem('byd.wall.density', '3')
    const el = wall()
    expect(width(el)).toBe('150px')
    expect(viewBox().getAttribute('aria-label')).toBe('Visning: 150 px')
    openBox(/^Visning/)
    const size = within(screen.getByRole('radiogroup', { name: 'Storlek' }))
    expect(size.getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Fritt',
      'På armlängds avstånd 90 px',
      'Telefonens läsvy 294 px',
      'Bordets läsvy 341 px',
      'TV:ns visning 672 px',
    ])
    expect((size.getByRole('radio', { name: 'Fritt' }) as HTMLInputElement).checked).toBe(true)

    fireEvent.click(size.getByRole('radio', { name: /^Telefonens läsvy/ }))
    expect(width(el)).toBe('294px')
    fireEvent.click(screen.getByRole('button', { name: 'Deuteranopi' }))
    expect(el.getAttribute('data-eye')).toBe('deuteranopia')
    expect(width(el)).toBe('294px')
    expect(screen.getByRole('button', { name: 'Deuteranopi' }).getAttribute('aria-pressed')).toBe('true')
    expect(viewBox().getAttribute('aria-label')).toBe('Visning: Telefonens läsvy · Deuteranopi')
    // Where the crown is narrow the box shows the surface's short name (#477 variant B, #1047).
    expect(viewBox().querySelector('.byd-crown-long')?.textContent).toBe('Telefonens läsvy · Deuteranopi')
    expect(viewBox().querySelector('.byd-crown-short')?.textContent).toBe('Telefonen · Deuteranopi')
    // The simulation is the same transform the check uses, as a filter over the real cards, and
    // each eye's swatch is seen through its own.
    expect(document.querySelector('#byd-eye-deuteranopia feColorMatrix')).toBeTruthy()
    expect(document.querySelectorAll('[data-eye-swatch]')).toHaveLength(5)

    // Arm's length is a size and not a guide: it keeps the eye.
    fireEvent.click(size.getByRole('radio', { name: /^På armlängds avstånd/ }))
    expect(width(el)).toBe('90px')
    expect(el.getAttribute('data-eye')).toBe('deuteranopia')
    expect(el.hasAttribute('data-arm')).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Snitt och skyddsmarginal' }))
    expect(el.getAttribute('data-trim')).toBe('true')
    expect(viewBox().getAttribute('aria-label')).toBe('Visning: På armlängds avstånd · Deuteranopi · Snitt')
  })

  // Pillret låstes förut av läsvyn och armlängden (#701). Nu väljer ett tryck på det fri storlek,
  // så det aldrig står där utan att svara.
  it('makes a press on the pill a choice of the free size, so the pill is never held', () => {
    localStorage.setItem('byd.wall.density', '3')
    const el = wall()
    openBox(/^Visning/)
    fireEvent.click(screen.getByRole('radio', { name: /^Telefonens läsvy/ }))
    const pill = within(screen.getByRole('group', { name: 'Täthet' }))
    for (const step of pill.getAllByRole('button')) expect(step.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(pill.getByRole('button', { name: 'Färre och större kort' }))
    expect(width(el)).toBe('180px')
    expect((screen.getByRole('radio', { name: 'Fritt' }) as HTMLInputElement).checked).toBe(true)
    expect(localStorage.getItem('byd.wall.density')).toBe('4')
    expect(viewBox().getAttribute('aria-label')).toBe('Visning: 180 px')
  })

  it('says the deck’s smallest text once, in the panel, and nothing under each card', () => {
    const el = wall()
    openBox(/^Visning/)
    expect(document.querySelector('[data-legible]')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /^Telefonens läsvy/ }))
    // 9 pt body at 294 px is 14,8 px.
    expect(document.querySelector('[data-legible]')!.textContent).toBe('Minsta text i leken 14,8 px, golvet 12 px. Alla kort klarar golvet.')
    expect(document.querySelectorAll('[data-card-ref] [data-read]')).toHaveLength(0)
    expect(el.querySelectorAll('[data-under]')).toHaveLength(0)
  })

  it('names the cards under the floor in words, frames them, and can leave only them on the wall', () => {
    const el = wall(tinyBody())
    openBox(/^Visning/)
    fireEvent.click(screen.getByRole('radio', { name: /^Telefonens läsvy/ }))
    expect(document.querySelector('[data-legible]')!.textContent).toContain('Minsta text i leken 9,9 px, golvet 12 px.')
    const under = within(screen.getByRole('list', { name: 'Kort under golvet' }))
    expect(under.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Drake: 9,9 px', 'Riddare: 9,9 px', 'Trollkarl: 9,9 px'])
    // The frame repeats the words; a card under the floor says it to a screen reader as well.
    const dragon = el.querySelector('[data-card-ref="dragon"]')!
    expect(dragon.hasAttribute('data-under')).toBe(true)
    expect(dragon.textContent).toContain('Minsta text 9,9 px · under golvet 12 px')

    // The television holds it up larger: 6 pt there is 22,6 px, still under its 24.
    fireEvent.click(screen.getByRole('radio', { name: /^TV:ns visning/ }))
    expect(document.querySelector('[data-legible]')!.textContent).toContain('Minsta text i leken 22,6 px, golvet 24 px.')
    fireEvent.click(screen.getByRole('radio', { name: /^Bordets läsvy/ }))
    expect(document.querySelector('[data-legible]')!.textContent).toContain('Minsta text i leken 11,5 px, golvet 12 px.')
  })

  it('leaves only the cards under the floor on the wall when asked', () => {
    const doc = tinyBody()
    // The knight keeps a body the phone can read.
    doc.rows[1]!.fields['body'] = ''
    wall(doc)
    openBox(/^Visning/)
    fireEvent.click(screen.getByRole('radio', { name: /^Telefonens läsvy/ }))
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(3)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Visa bara de 2 korten' }))
    expect([...document.querySelectorAll('[data-card-ref]')].map((c) => c.getAttribute('data-card-ref'))).toEqual(['dragon', 'wizard'])
    // Leaving the reading view lets the deck back.
    fireEvent.click(screen.getByRole('radio', { name: 'Fritt' }))
    expect(document.querySelectorAll('[data-card-ref]')).toHaveLength(3)
  })

  it('opens Kontroll from the count of remarks in the foot', () => {
    const doc = tinyBody()
    doc.template.faces['front']!.base.push({ kind: 'text', id: 'flavour', x: 6, y: 70, w: 51, h: 10, bind: { field: 'flavour' }, font: { family: 'system-ui', sizePt: 5 }, color: '#111111' })
    wall(doc)
    fireEvent.click(within(document.querySelector('.byd-crown-foot') as HTMLElement).getByRole('button', { name: /anmärkning/ }))
    expect(screen.getByRole('tab', { name: /^Kontroll/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('list', { name: 'Fysisk kontroll' })).toBeTruthy()
  })
})
