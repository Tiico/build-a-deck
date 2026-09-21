// @vitest-environment jsdom
// The start, the account and the guided start, shortened behind L32's question mark (L36, #304).
//
// Ten strings were explanatory prose — 879 characters, 280 px across three surfaces — and every
// one of them goes behind the question mark; what stays on the surface is a short line the page
// still reads by. The seven that were errors, consequences and status stay where they were. Each
// surface below asks the same two things `help-in-tabs.test.tsx` asks of the editor: the moved
// text is gone from the surface and present in the box once it is opened.
//
// The one exception L36 makes is the sales line on the login: it says what the product is, not
// how the tool works, and it stands the first time only. The state is a fact about the browser,
// never about a person (L4), and a storage that cannot be read shows the line.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { LoginCard } from '../src/account/LoginCard.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const PITCH = /Skapa ditt kortspel, speltesta det på skärmen, beställ hem det/
const NO_PASSWORD = /Länken i mejlet loggar in dig/
const GUEST = /Skanna QR-koden på bordet/

const login = (lead?: string) => render(<LoginCard http="http://server.local" next="/" onNavigate={() => undefined} lead={lead} />)
const ask = () => screen.getByRole('button', { name: 'Hjälp om inloggningen' })
const opened = () => {
  fireEvent.click(ask())
  return screen.getByRole('dialog', { name: 'inloggningen' })
}

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the login card', () => {
  it('keeps one line about what logging in is for, and moves the password and the guest behind the question mark', () => {
    login()
    expect(screen.getByText('Logga in för att komma till dina spel.')).toBeTruthy()
    expect(screen.queryByText(NO_PASSWORD)).toBeNull()
    expect(screen.queryByText(GUEST)).toBeNull()
    const box = opened()
    expect(box.textContent).toMatch(NO_PASSWORD)
    expect(box.textContent).toMatch(GUEST)
    // Kept on the surface: the field and the button the card is for.
    expect(screen.getByLabelText('E-post')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skicka inloggningslänk' })).toBeTruthy()
  })

  it('says what the product is the first time, with the question mark beside it', () => {
    login()
    expect(screen.getByText(PITCH)).toBeTruthy()
    expect(ask()).toBeTruthy()
    expect(opened().textContent).toMatch(PITCH)
  })

  it('drops the sales line for whoever comes back, and keeps it behind the question mark', () => {
    login()
    cleanup()
    login()
    expect(screen.queryByText(PITCH)).toBeNull()
    expect(opened().textContent).toMatch(PITCH)
  })

  it('remembers the visit in the browser, per screen, never in an account', () => {
    login()
    expect(localStorage.getItem('byd.login.pitch-seen')).toBe('1')
    cleanup()
    // Cleared storage is a first visit again.
    localStorage.clear()
    login()
    expect(screen.getByText(PITCH)).toBeTruthy()
  })

  it('shows the sales line when the storage cannot be read', () => {
    login()
    cleanup()
    // jsdom hangs the methods on the storage itself rather than on `Storage.prototype`.
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    login()
    expect(screen.getByText(PITCH)).toBeTruthy()
    expect(ask()).toBeTruthy()
  })

  it('never opens on hover', () => {
    login()
    fireEvent.mouseOver(ask())
    fireEvent.mouseEnter(ask())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('takes the claim’s own lead in place of the sales line, and says in the box what the claim does', () => {
    login('Logga in för att spara bordet till ditt konto.')
    expect(screen.queryByText(PITCH)).toBeNull()
    expect(screen.getByText('Logga in för att spara bordet till ditt konto.')).toBeTruthy()
    // A visitor who came for one thing was not shown the pitch, so the visit is not the pitch's.
    expect(localStorage.getItem('byd.login.pitch-seen')).toBeNull()
    const box = opened()
    expect(within(box).getByText(NO_PASSWORD)).toBeTruthy()
  })
})

// The guided start: one question mark per step, at the step's heading, and never one per
// explanation (L36). The guide is to feel simple, and three question marks on one step are three
// things to relate to where one would stand. The price is owned: the box carries the step's
// explanations as paragraphs.
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { atWidth } from './viewport.js'

const HANDOFF = /Layout, hela leken och CSV-verktyg väntar i editorn/
const BLANK = /utan kort, fält eller mall/
const FIELDS = /Varje fält blir direkt en kontroll/
const CARDS = /hjälper editorn att visa hur fälten faktiskt används/
const FOOTER = /importera CSV och finjustera mallen/

const wizard = (width: number) => {
  atWidth(width)
  history.replaceState(null, '', '/new')
  render(<NewProjectPage onNavigate={() => undefined} />)
}
const asks = () => screen.getAllByRole('button', { name: /^Hjälp om / })
const askOn = (topic: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Hjälp om ${topic}` }))
  return screen.getByRole('dialog', { name: topic })
}
// The question mark stands in the heading's own row, and nowhere else on the step.
const atHeading = (topic: string, heading: RegExp) => {
  const ask = screen.getByRole('button', { name: `Hjälp om ${topic}` })
  const row = ask.closest('.byd-help-row')!
  expect(within(row as HTMLElement).getByRole('heading', { name: heading })).toBeTruthy()
}

describe('the guided start on a desk, where the three steps stand together', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('has exactly one question mark per step, at the step’s heading', () => {
    wizard(1280)
    expect(asks()).toHaveLength(3)
    atHeading('spelet', /Spelet/)
    atHeading('fälten', /Fält/)
    atHeading('korten', /Gör några exempelkort/)
  })

  it('moves the handoff and the blank game’s explanation behind the first step’s question mark', () => {
    wizard(1280)
    expect(screen.queryByText(HANDOFF)).toBeNull()
    expect(screen.queryByText(BLANK)).toBeNull()
    // Kept: the blank door is still named, its title and its button, and a short question.
    expect(screen.getByText('Utan guidad start')).toBeTruthy()
    expect(screen.getByText('Bygg hellre allt själv?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skapa ett tomt spel i editorn' })).toBeTruthy()
    const box = askOn('spelet')
    expect(box.textContent).toMatch(HANDOFF)
    expect(box.textContent).toMatch(BLANK)
  })

  it('keeps one short line under the fields and moves the rest', () => {
    wizard(1280)
    expect(screen.getByText('Fälten på varje kort.')).toBeTruthy()
    expect(screen.queryByText(FIELDS)).toBeNull()
    expect(askOn('fälten').textContent).toMatch(FIELDS)
  })

  it('moves what the example cards are for and what comes after behind the third step’s question mark', () => {
    wizard(1280)
    expect(screen.queryByText(CARDS)).toBeNull()
    expect(screen.queryByText(FOOTER)).toBeNull()
    const box = askOn('korten')
    expect(box.textContent).toMatch(CARDS)
    expect(box.textContent).toMatch(FOOTER)
    // Kept: the button that makes the game.
    expect(screen.getByRole('button', { name: /Skapa spelet/ })).toBeTruthy()
  })
})

describe('the guided start on a phone, one step at a time', () => {
  it('shows one question mark on the open step, and it belongs to that step', () => {
    wizard(390)
    expect(asks()).toHaveLength(1)
    atHeading('spelet', /Spelet/)
    fireEvent.click(screen.getByRole('tab', { name: '2 · Fälten' }))
    expect(asks()).toHaveLength(1)
    atHeading('fälten', /Fält/)
    fireEvent.click(screen.getByRole('tab', { name: '3 · Korten' }))
    expect(asks()).toHaveLength(1)
    expect(askOn('korten').textContent).toMatch(FOOTER)
  })
})
