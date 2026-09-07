// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { projectActivity } from '@byd/engine'
import { TvChrome } from '../src/table/TvChrome.js'
import { seatColor } from '../src/table/seatColor.js'
import { buildScene } from './scene.js'

describe('TvChrome (C as the TV surroundings)', () => {
  it('shows the room code, a dock with every seat and its hand count, and the recent activity in words', () => {
    const { view, log } = buildScene()
    render(
      <TvChrome view={view(null)} activity={log.map(projectActivity)} roomCode="KX7P">
        <div data-testid="table" />
      </TvChrome>,
    )
    expect(screen.getByText('KX7P')).toBeTruthy()
    expect(screen.getByTestId('table')).toBeTruthy()

    const dock = screen.getByRole('list', { name: /platser/i })
    const seats = within(dock).getAllByRole('listitem')
    expect(seats.map((s) => s.textContent)).toEqual([expect.stringMatching(/Ada.*2 kort/), expect.stringMatching(/B.*0 kort/)])

    const feed = screen.getByRole('list', { name: /senast/i })
    const lines = within(feed).getAllByRole('listitem').map((l) => l.textContent)
    // Most recent first, at most nine lines: the first claim has scrolled off.
    expect(lines[0]).toMatch(/Bordet vände ett kort/)
    expect(lines.length).toBeLessThanOrEqual(9)
    expect(lines).not.toContainEqual(expect.stringMatching(/satte sig/))
    expect(lines).toContainEqual(expect.stringMatching(/Bordet drog 2 från Draghög/))
    expect(lines).toContainEqual(expect.stringMatching(/Bordet vände ett kort/))
  })
})

describe('QR to join', () => {
  it('renders a QR image for the join URL, labelled with the URL so a reader can type it', async () => {
    const { view, log } = buildScene()
    render(
      <TvChrome view={view(null)} activity={log.map(projectActivity)} roomCode="KX7P" joinUrl="http://example.test/join?session=s1">
        <div />
      </TvChrome>,
    )
    const img = (await screen.findByRole('img', { name: /example\.test\/join/ })) as HTMLImageElement
    expect(img.src.startsWith('data:image/')).toBe(true)
  })
})

describe('the observer is never invisible (C8)', () => {
  it('shows who is watching, and that they see everything', () => {
    const { view, log } = buildScene()
    render(
      <TvChrome view={view(null)} activity={log.map(projectActivity)} roomCode="KX7P" observers={[{ id: 'o1', name: 'Eva' }]}>
        <div />
      </TvChrome>,
    )
    expect(screen.getByText(/Eva/).closest('[data-observers]')!.textContent).toMatch(/ser allt/)
  })
})

describe('the header names the game (C)', () => {
  it('titles the screen with the game and its version, and never prints the join URL as running text', async () => {
    const { view, log } = buildScene()
    render(
      <TvChrome
        view={view(null)}
        activity={log.map(projectActivity)}
        roomCode="KX7P"
        title="Skogens herrar"
        version="v0.7"
        joinUrl="http://example.test/join?session=s1"
      >
        <div />
      </TvChrome>,
    )
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toBe('Skogens herrar v0.7')
    // The URL lives in the QR code's alt text, which a reader can still type; nowhere else.
    expect(screen.queryByText(/example\.test\/join/)).toBeNull()
    expect(await screen.findByRole('img', { name: /example\.test\/join/ })).toBeTruthy()
  })
})

describe('the inspection panel (C)', () => {
  it('asks to be pointed at until a card is, and then shows that card', () => {
    const { view, log, faceUp } = buildScene()
    const snapshot = view(null)
    const { rerender } = render(
      <TvChrome view={snapshot} activity={log.map(projectActivity)} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    const panel = () => screen.getByRole('region', { name: /inspektion/i })
    expect(panel().textContent).toMatch(/peka på ett kort/)

    const card = snapshot.components.find((c) => c.id === faceUp)!
    rerender(
      <TvChrome view={snapshot} activity={log.map(projectActivity)} roomCode="KX7P" inspecting={card}>
        <div />
      </TvChrome>,
    )
    expect(panel().textContent).toMatch(new RegExp(card.cardRef!))
    expect(panel().querySelector(`[data-inspect="${card.id}"]`)).toBeTruthy()

    // A card whose face this screen may not see is named as what it is, not guessed at.
    const hidden = snapshot.components.find((c) => c.cardRef === null)!
    rerender(
      <TvChrome view={snapshot} activity={log.map(projectActivity)} roomCode="KX7P" inspecting={hidden}>
        <div />
      </TvChrome>,
    )
    expect(panel().textContent).toMatch(/dolt kort/)
  })
})

describe('the feed is numbered and coloured (C)', () => {
  it('gives every line its seq and the colour of the seat that made it', () => {
    const { view, log } = buildScene()
    const snapshot = view(null)
    // The same log, with one line made by the seat that sits at A.
    const lines = log.map(projectActivity).map((l) => (l.seq === 2 ? { ...l, by: 'A' } : l))
    render(
      <TvChrome view={snapshot} activity={lines} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    const rows = within(screen.getByRole('list', { name: /senast/i })).getAllByRole('listitem')
    const byA = rows.find((r) => r.textContent?.startsWith('2'))!
    expect(byA.style.getPropertyValue('--seat')).toBe(seatColor(0))
    expect(rows.every((r) => /^\d+/.test(r.textContent ?? ''))).toBe(true)
    // A line the table itself made belongs to no seat and takes no seat's colour.
    expect(rows.find((r) => r.textContent?.startsWith('3'))!.style.getPropertyValue('--seat')).toBe('')
  })
})

describe('the seat dock (C)', () => {
  it('gives every seat an initial, how many cards it holds, and what that seat last did', () => {
    const { view, log } = buildScene()
    const snapshot = view(null)
    const lines = log.map(projectActivity).map((l) => (l.seq === 2 ? { ...l, by: 'A' } : l))
    render(
      <TvChrome view={snapshot} activity={lines} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    const seats = within(screen.getByRole('list', { name: /platser/i })).getAllByRole('listitem')
    const [ada, free] = seats as [HTMLElement, HTMLElement]
    expect(ada.querySelector('[data-avatar]')!.textContent).toBe('A')
    expect(ada.textContent).toMatch(/2 kort på hand/)
    expect(ada.textContent).toMatch(/Ada drog 2 från Draghög/)
    // A seat nobody has claimed has no last action to show.
    expect(free.textContent).toMatch(/—/)
  })
})

describe('seat colours follow the approved prototypes (K9, #20)', () => {
  it('paints the first four seats red, blue, green and yellow, in that order', () => {
    // Prototypes B and C agree on the dock: Ada red, Bo blue, Cy green, Di yellow. The colour is
    // the seat's identity everywhere — hand, cursor, dock, feed — so the order is the decision.
    expect([0, 1, 2, 3].map(seatColor)).toEqual(['#e05a4f', '#3c8ce7', '#3aa76d', '#d99a1f'])
  })

  it('hands the dock those colours in seat order', () => {
    const { view, log } = buildScene()
    const four = { ...view(null), seats: [{ id: 'A', name: 'Ada' }, { id: 'B', name: 'Bo' }, { id: 'C', name: 'Cy' }, { id: 'D', name: 'Di' }] }
    render(
      <TvChrome view={four} activity={log.map(projectActivity)} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    const dock = within(screen.getByRole('list', { name: /platser/i })).getAllByRole('listitem')
    expect(dock.map((li) => li.style.getPropertyValue('--seat'))).toEqual(['#e05a4f', '#3c8ce7', '#3aa76d', '#d99a1f'])
  })
})
