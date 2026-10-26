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
import { markPitchSeen } from '../src/account/pitch.js'

// What the product does during the beta, and that print is on its way (#743): ordering is phase 5,
// and a line that promised it sent a beta tester looking for something that was not there.
const PITCH = /Skapa ditt eget kortspel och speltesta det på skärmen\. Tryck kommer senare\./
const NO_PASSWORD = /Du loggar in med länken i mejlet/
const GUEST = /Skanna QR-koden på TV:n/

const login = (lead?: string) => render(<LoginCard http="http://server.local" next="/" onNavigate={() => undefined} lead={lead} />)
const ask = () => screen.getByRole('button', { name: 'Hjälp om inloggningen' })
// The box travels when it is asked for (#304), so it is waited for.
const opened = async () => {
  fireEvent.click(ask())
  return screen.findByRole('dialog', { name: 'Hjälp om inloggningen' })
}

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the login card', () => {
  it('keeps one line about what logging in is for, and moves the password and the guest behind the question mark', async () => {
    login()
    cleanup()
    login()
    expect(screen.getByText('Logga in för att komma till dina spel.')).toBeTruthy()
    expect(screen.queryByText(NO_PASSWORD)).toBeNull()
    expect(screen.queryByText(GUEST)).toBeNull()
    const box = await opened()
    expect(box.textContent).toMatch(NO_PASSWORD)
    expect(box.textContent).toMatch(GUEST)
    // Kept on the surface: the field and the button the card is for.
    expect(screen.getByLabelText('E-post')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skicka inloggningslänk' })).toBeTruthy()
  })

  it('says what the product is the first time, with the question mark beside it', async () => {
    login()
    expect(screen.getByText(PITCH)).toBeTruthy()
    expect(ask()).toBeTruthy()
    expect((await opened()).textContent).toMatch(PITCH)
  })

  // The one line under the pitch spoke only to whoever already had an account (#691, beslut
  // 2026-10-06): the first visit says that the same address both logs in and makes the account.
  it('tells the first visit that the link in the mail makes the account too', () => {
    login()
    expect(screen.getByText('Logga in eller skapa konto med din e‑post. Du får en länk i mejlet.')).toBeTruthy()
    expect(screen.queryByText('Logga in för att komma till dina spel.')).toBeNull()
    cleanup()
    login()
    expect(screen.queryByText(/skapa konto med din e\u2011post/)).toBeNull()
    expect(screen.getByText('Logga in för att komma till dina spel.')).toBeTruthy()
  })

  // The landing page counts as the sales line having been seen (L36), and the first visit's line is
  // another thing: it says that the link makes the account, which the landing page never says. A
  // newcomer who goes in by the landing page is told it all the same (#1358).
  it('tells the first visit its line when the landing page has already been seen', () => {
    markPitchSeen()
    login()
    expect(screen.queryByText(PITCH)).toBeNull()
    expect(screen.getByText('Logga in eller skapa konto med din e‑post. Du får en länk i mejlet.')).toBeTruthy()
    cleanup()
    login()
    expect(screen.getByText('Logga in för att komma till dina spel.')).toBeTruthy()
  })

  it('drops the sales line for whoever comes back, and keeps it behind the question mark', async () => {
    login()
    cleanup()
    login()
    expect(screen.queryByText(PITCH)).toBeNull()
    expect((await opened()).textContent).toMatch(PITCH)
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

  it('takes the claim’s own lead in place of the sales line, and says in the box what the claim does', async () => {
    login('Logga in för att spara bordet till ditt konto.')
    expect(screen.queryByText(PITCH)).toBeNull()
    expect(screen.getByText('Logga in för att spara bordet till ditt konto.')).toBeTruthy()
    // A visitor who came for one thing was not shown the pitch, so the visit is not the pitch's.
    expect(localStorage.getItem('byd.login.pitch-seen')).toBeNull()
    const box = await opened()
    expect(within(box).getByText(NO_PASSWORD)).toBeTruthy()
  })
})

// The guided start: one question mark per step, at the step's heading, and never one per
// explanation (L36). The guide is to feel simple, and three question marks on one step are three
// things to relate to where one would stand. The price is owned: the box carries the step's
// explanations as paragraphs.
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { atWidth } from './viewport.js'
import { throughTheDoor } from './wizard-door.js'

const HANDOFF = /Layout, resten av korten och CSV-import gör du i editorn/
const BLANK = /utan kort, fält eller mall/
const FIELDS = /Varje fält blir en ruta/
const CARDS = /visar hur fälten används/
const FOOTER = /CSV-import och mallen gör du i editorn/

// The crossroads before the guide (L79) has one question mark, at its question; the guide behind
// its first door has one per step.
const crossroads = (width: number) => {
  atWidth(width)
  history.replaceState(null, '', '/new')
  render(<NewProjectPage onNavigate={() => undefined} />)
}
const wizard = (width: number) => {
  crossroads(width)
  throughTheDoor()
}
const asks = () => screen.getAllByRole('button', { name: /^Hjälp om / })
const askOn = async (topic: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Hjälp om ${topic}` }))
  return screen.findByRole('dialog', { name: `Hjälp om ${topic}` })
}
// The question mark stands in the heading's own row, and nowhere else on the step.
const atHeading = (topic: string, heading: RegExp) => {
  const ask = screen.getByRole('button', { name: `Hjälp om ${topic}` })
  const row = ask.closest('.byd-help-row')!
  expect(within(row as HTMLElement).getByRole('heading', { name: heading })).toBeTruthy()
}

describe('the guided start on a desk, where the two steps stand together', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('has exactly one question mark per step, at the step’s heading', () => {
    crossroads(1280)
    expect(asks()).toHaveLength(1)
    atHeading('spelet', /Hur vill du börja/)
    cleanup()
    wizard(1280)
    expect(asks()).toHaveLength(2)
    atHeading('fälten', /Fält/)
    atHeading('korten', /Lägg till några exempelkort/)
  })

  it('moves the handoff and the blank game’s explanation behind the crossroads’ question mark', async () => {
    crossroads(1280)
    expect(screen.queryByText(HANDOFF)).toBeNull()
    expect(screen.queryByText(BLANK)).toBeNull()
    // Kept: the blank door is still named and says in a sentence what it gives.
    expect(screen.getByRole('button', { name: 'Tomt spel' })).toBeTruthy()
    expect(screen.getByText('Bara namnet och spelarna. Fälten, mallen och korten gör du i editorn.')).toBeTruthy()
    const box = await askOn('spelet')
    expect(box.textContent).toMatch(HANDOFF)
    expect(box.textContent).toMatch(BLANK)
  })

  it('uses short field headings and keeps extra guidance in the existing help', async () => {
    wizard(1280)
    expect(screen.queryByText('Fälten på varje kort.')).toBeNull()
    expect(screen.queryByText('Allt går att ändra i Speltema.')).toBeNull()
    expect(screen.getByRole('group', { name: 'Ram' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Tema' })).toBeTruthy()
    expect(screen.queryByText(FIELDS)).toBeNull()
    const help = await askOn('fälten')
    expect(help.textContent).toMatch(FIELDS)
    expect(help.textContent).toContain('Allt går att ändra i Speltema.')
  })

  it('moves what the example cards are for and what comes after behind the cards’ question mark', async () => {
    wizard(1280)
    expect(screen.queryByText(CARDS)).toBeNull()
    expect(screen.queryByText(FOOTER)).toBeNull()
    const box = await askOn('korten')
    expect(box.textContent).toMatch(CARDS)
    expect(box.textContent).toMatch(FOOTER)
    // Kept: the button that makes the game.
    expect(screen.getByRole('button', { name: /Skapa spelet/ })).toBeTruthy()
  })
})

describe('the guided start on a phone, one step at a time', () => {
  it('shows one question mark on the open step, and it belongs to that step', async () => {
    wizard(390)
    expect(asks()).toHaveLength(1)
    atHeading('fälten', /Fält/)
    fireEvent.click(screen.getByRole('tab', { name: '2 · Korten' }))
    expect(asks()).toHaveLength(1)
    expect((await askOn('korten')).textContent).toMatch(FOOTER)
  })
})

// Neither language promises an order the product cannot take yet (#743).
describe('the pitch during the beta', () => {
  it('promises no ordering in Swedish or English', async () => {
    const { translate } = await import('../src/i18n/index.js')
    expect(translate('sv', 'login.pitch')).toBe('Skapa ditt eget kortspel och speltesta det på skärmen. Tryck kommer senare.')
    expect(translate('en', 'login.pitch')).toBe('Build your own card game and playtest it on screen. Print is coming later.')
    for (const lang of ['sv', 'en'] as const) expect(translate(lang, 'login.pitch')).not.toMatch(/beställ|order/i)
  })
})
