// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { project, projectActivity } from '@byd/engine'
import { userEvent } from '@testing-library/user-event'
import { TvChrome } from '../src/table/TvChrome.js'
import { seatColor } from '../src/table/seatColor.js'
import { SHOW_MS, type Shown } from '../src/table/presence.js'
import { useShowing } from '../src/table/useShowing.js'
import { buildScene, registry } from './scene.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

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
    // Most recent first, and three lines (#482 fynd 6, beslut B): the rest of the history is on
    // every phone. The draws and the claim before them have gone off the television.
    // The card turned face up on the table is one the television may see, so the line names it
    // (#507 fynd 6) rather than saying «ett kort».
    expect(lines[0]).toMatch(/Bordet vände (?!ett kort)\S/)
    expect(lines).toHaveLength(3)
    expect(lines).not.toContainEqual(expect.stringMatching(/satte sig/))
    expect(lines).not.toContainEqual(expect.stringMatching(/Bordet drog 2 kort från Draghög/))
  })
})

// The same box on the table screen (L32's addendum, #305): the line beside the code is four
// words, and what a joined phone becomes is the rest of it.
describe('the table screen’s own help (L32, #305)', () => {
  it('keeps the code on the surface and what joining means behind a question mark', async () => {
    const { view, log } = buildScene()
    render(
      <TvChrome view={view(null)} activity={log.map(projectActivity)} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    const ask = screen.getByRole('button', { name: 'Hjälp om att ansluta' })
    expect(screen.queryByRole('dialog', { name: 'Hjälp om att ansluta' })).toBeNull()
    fireEvent.pointerEnter(ask)
    expect(screen.queryByRole('dialog', { name: 'Hjälp om att ansluta' })).toBeNull()

    fireEvent.click(ask)
    expect((await screen.findByRole('dialog', { name: 'Hjälp om att ansluta' })).textContent).toMatch(/rumskoden/i)
    // The code itself is what the room reads from across it, and it stays where it stands.
    expect(screen.getByText('KX7P')).toBeTruthy()
  })

  // The observer's screen is the same chrome without a code to join by, so it carries no help
  // about joining: a question mark about something that is not on the screen is worse than none.
  it('says nothing about joining on a screen that is not joined from', () => {
    const { view, log } = buildScene()
    render(
      <TvChrome view={view(null)} activity={log.map(projectActivity)}>
        <div />
      </TvChrome>,
    )
    expect(screen.queryByRole('button', { name: 'Hjälp om att ansluta' })).toBeNull()
  })
})

// A table that has ended takes nobody in: the code on its screen led to «Bordet är slut» (#717).
describe('the table screen after the end', () => {
  it('says the table has ended where the invitation stood, and offers no code or square', () => {
    const { view, log } = buildScene()
    render(
      <TvChrome view={{ ...view(null), ended: true }} activity={log.map(projectActivity)} roomCode="KX7P" joinUrl="http://example.test/join?code=KX7P">
        <div />
      </TvChrome>,
    )
    expect(screen.queryByText('KX7P')).toBeNull()
    expect(screen.queryByRole('img', { name: /example\.test\/join/ })).toBeNull()
    expect(screen.queryByText('anslut med telefon')).toBeNull()
    expect(screen.getByText('Bordet är avslutat')).toBeTruthy()
  })

  it('closes the help about joining when the summary takes the screen', async () => {
    const { view, log } = buildScene()
    const at = (ended: boolean) => (
      <TvChrome view={{ ...view(null), ended }} activity={log.map(projectActivity)} roomCode="KX7P">
        <div />
      </TvChrome>
    )
    const { rerender } = render(at(false))
    fireEvent.click(screen.getByRole('button', { name: 'Hjälp om att ansluta' }))
    await screen.findByRole('dialog', { name: 'Hjälp om att ansluta' })
    rerender(at(true))
    expect(screen.queryByRole('dialog', { name: 'Hjälp om att ansluta' })).toBeNull()
  })
})

describe('QR to join', () => {
  // A reader hears what the picture is for and which room before the address (#560 P-21), and the
  // address is still there to type for someone without a camera (K9).
  it('renders a QR image for the join URL, named for what it does and the room, and still carrying the address', async () => {
    const { view, log } = buildScene()
    render(
      <TvChrome view={view(null)} activity={log.map(projectActivity)} roomCode="KX7P" joinUrl="http://example.test/join?session=s1">
        <div />
      </TvChrome>,
    )
    const img = (await screen.findByRole('img', { name: /example\.test\/join/ })) as HTMLImageElement
    expect(img.src.startsWith('data:image/')).toBe(true)
    expect(img.alt).toBe('QR-kod: anslut med telefonen, rum KX7P (http://example.test/join?session=s1)')
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
  // «Lords of the Forest rev-» on one line and «1» alone on the next (#717): a version is one word.
  it('never breaks the version across lines', () => {
    const css = document.createElement('style')
    css.textContent = readFileSync('src/table/table.css', 'utf8')
    document.head.append(css)
    try {
      const { view, log } = buildScene()
      render(
        <TvChrome view={view(null)} activity={log.map(projectActivity)} title="Lords of the Forest" version="rev-1">
          <div />
        </TvChrome>,
      )
      expect(getComputedStyle(screen.getByRole('heading', { level: 1 }).querySelector('em')!).whiteSpace).toBe('nowrap')
    } finally {
      css.remove()
    }
  })

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
    // A table nothing has been done to yet: the panel has no card of its own to hold, so the
    // only way to fill it is to point. What it holds once something has happened is its own
    // rule, and is measured below.
    const { rerender } = render(
      <TvChrome view={snapshot} activity={[]} roomCode="KX7P">
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

describe('the inspection panel fills itself (K8, C)', () => {
  // Pointing is a good way in and a bad requirement: on a screen a whole room is watching, nobody
  // wants to keep a pointer moving to find out what was just played. So the panel's resting state
  // is the card the last line is about, and the pointer only overrides it.
  it('holds the card the latest line is about until somebody points at another', () => {
    const { view, log, faceUp } = buildScene()
    const snapshot = view(null)
    const lines = log.map(projectActivity)
    const panel = () => screen.getByRole('region', { name: /inspektion/i })

    const { rerender } = render(
      <TvChrome view={snapshot} activity={lines} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    // The scene ends by turning the discard's cards face up, so the last line is about one card.
    const last = lines.at(-1)!.intent as { component: string }
    expect(panel().querySelector(`[data-inspect="${last.component}"]`)).toBeTruthy()
    expect(panel().textContent).not.toMatch(/peka på ett kort/)

    // A pointer beats it, and nothing about the pointer's card is guessed from the feed.
    const pointed = snapshot.components.find((c) => c.id === faceUp)!
    rerender(
      <TvChrome view={snapshot} activity={lines} roomCode="KX7P" inspecting={pointed}>
        <div />
      </TvChrome>,
    )
    expect(panel().querySelector(`[data-inspect="${pointed.id}"]`)).toBeTruthy()
  })

  it('still asks to be pointed at when nothing that happened was about a card', () => {
    const { view, log } = buildScene()
    // Sitting down, shuffling, dealing: lines that name no card this screen could hold up.
    const lines = log.map(projectActivity).filter((l) => ['seat.claim', 'shuffle', 'deal'].includes(l.intent.v))
    expect(lines.length).toBeGreaterThan(0)
    render(
      <TvChrome view={view(null)} activity={lines} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    expect(screen.getByRole('region', { name: /inspektion/i }).textContent).toMatch(/peka på ett kort/)
  })
})

describe('the feed before anything has happened (UX-16)', () => {
  it('says what will fill it, and gives the heading its lines back as soon as the table is touched', () => {
    const { view, log } = buildScene()
    const snapshot = view(null)
    const { rerender } = render(
      <TvChrome view={snapshot} activity={[]} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    const said = screen.getByText(/Inget hänt ännu/)
    expect(said.textContent).toBe('Inget hänt ännu. Det som spelas vid bordet hamnar här.')
    // Under the heading it belongs to, not floating somewhere else on the screen.
    expect(said.closest('.byd-tv-feed')!.querySelector('h2')!.textContent).toBe('Senast')

    rerender(
      <TvChrome view={snapshot} activity={log.map(projectActivity)} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    expect(screen.queryByText(/Inget hänt ännu/)).toBeNull()
    expect(within(screen.getByRole('list', { name: /senast/i })).getAllByRole('listitem').length).toBeGreaterThan(0)
  })
})

describe('the feed is numbered and coloured (C)', () => {
  it('gives every line its seq and the colour of the seat that made it', () => {
    const { view, log } = buildScene()
    const snapshot = view(null)
    // The same log, with one line made by the seat that sits at A.
    // The first three, which is all the television keeps (#482 fynd 6).
    const lines = log.map(projectActivity).slice(0, 3).map((l) => (l.seq === 2 ? { ...l, by: 'A' } : l))
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
    expect(ada.textContent).toMatch(/Ada drog 2 kort från Draghög/)
    // A seat that has done nothing says so in words, never with a dash (UX-41, #86): from across
    // a room "—" reads as a missing value, "Inget ännu" as a state.
    expect(free.textContent).toMatch(/Inget ännu/)
    expect(free.textContent).not.toMatch(/—/)
  })
})

// The box the room reads the pointed-at card from writes its name, so it writes the title and not
// the row id (#412). The word beside the picture is the same word every other surface says.
describe('the inspect box names the card by its title (#412)', () => {
  const shownWith = (card: { cardRef: string; title?: string }) => {
    const { view, log } = buildScene()
    const table = view(null)
    const faceUpCard = table.components.find((c) => c.cardRef !== null)!
    const { container } = render(
      <TvChrome view={table} activity={log.map(projectActivity)} roomCode="KX7P" inspecting={{ ...faceUpCard, ...card }}>
        <div />
      </TvChrome>,
    )
    return container.querySelector('.byd-tv-inspect [data-inspect] span')!.textContent
  }

  it('writes «Björnen» for the row `bjornen`, and the id for a row with no title', () => {
    expect(shownWith({ cardRef: 'bjornen', title: 'Björnen' })).toBe('Björnen')
    expect(shownWith({ cardRef: 'bjornen' })).toBe('bjornen')
  })
})

// The observer's «Platser» is the way to the cards for a screen reader and for a thumb (#551, beslut A,
// P-2, P-17): each hand and each zone a list that opens, a card per row, and a card opens the reader.
describe('the observer’s seats open into lists of cards (#551)', () => {
  const observed = () => {
    const scene = buildScene()
    const cards = Object.values(scene.state.components).map((c) => c.cardRef)
    const titles = Object.fromEntries(cards.map((ref) => [ref, `Kort ${ref}`]))
    return { scene, view: project(scene.state, registry, null, { titles }, undefined, true) }
  }
  const mount = (onRead = vi.fn()) => {
    const { scene, view } = observed()
    render(
      <TvChrome view={view} activity={scene.log.map(projectActivity)} onRead={onRead}>
        <div />
      </TvChrome>,
    )
    return { view, onRead }
  }

  it('makes a seat holding cards a button that opens its hand, a card per row, named where it lies', async () => {
    const { view, onRead } = mount()
    const ada = screen.getByRole('button', { name: /Ada.*2 kort på hand/ })
    expect(ada.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: /i Adas hand/ })).toBeNull()
    // A seat with nothing in its hand has nothing to open.
    expect(screen.queryByRole('button', { name: /^B/ })).toBeNull()

    await userEvent.click(ada)
    expect(ada.getAttribute('aria-expanded')).toBe('true')
    const hand = view.components.filter((c) => c.zone === 'hand:A')
    const rows = screen.getAllByRole('button', { name: /i Adas hand$/ })
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(hand.map((c) => `${c.title}, i Adas hand`))

    // Enter on a card opens the reader, with the rest of the hand to walk.
    rows[1]!.focus()
    await userEvent.keyboard('{Enter}')
    expect(onRead).toHaveBeenCalledWith(hand[1], hand)
  })

  // Two lines for the eye are two blocks side by side for a screen reader, and nothing stood between
  // them: «Draw pilepile, 3 cards» (#745). The row's name says its parts with a comma between.
  it('names a row by its parts with a separator between them, and not its avatar’s initial', () => {
    const { view } = mount()
    const discard = view.zones.find((z) => z.id === 'discard')!
    const top = view.components.find((c) => discard.mode === 'order' && c.id === discard.order[0])!
    expect(screen.getByRole('button', { name: /^Ada, 2 kort på hand, \S/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: `Kasthög, hög, 3 kort, överst ${top.title}` })).toBeTruthy()
  })

  it('lists what lies on the table, zone by zone: a pile by its top, a face-down card said as such', async () => {
    const { view } = mount()
    const onTable = screen.getByRole('list', { name: 'På bordet' })
    const discard = view.zones.find((z) => z.id === 'discard')!
    const top = view.components.find((c) => discard.mode === 'order' && c.id === discard.order[0])!
    const pile = within(onTable).getByRole('button', { name: new RegExp(`Kasthög.*hög, 3 kort, överst ${top.title}`) })
    await userEvent.click(pile)
    expect(within(onTable).getAllByRole('button', { name: /, i Kasthög$/ }).map((b) => b.getAttribute('aria-label'))).toEqual([`${top.title}, i Kasthög`])

    await userEvent.click(within(onTable).getByRole('button', { name: /Spelyta.*2 kort/ }))
    const down = view.components.find((c) => c.zone === 'table' && c.face === 'back')!
    expect(within(onTable).getByRole('button', { name: `${down.title}, nedvänt, i Spelyta` }).textContent).toBe(`${down.title} (nedvänt)`)
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
    const four = { ...view(null), seats: [{ id: 'A', name: 'Ada', edge: 'S' as const }, { id: 'B', name: 'Bo', edge: 'N' as const }, { id: 'C', name: 'Cy', edge: 'E' as const }, { id: 'D', name: 'Di', edge: 'W' as const }] }
    render(
      <TvChrome view={four} activity={log.map(projectActivity)} roomCode="KX7P">
        <div />
      </TvChrome>,
    )
    const dock = within(screen.getByRole('list', { name: /platser/i })).getAllByRole('listitem')
    expect(dock.map((li) => li.style.getPropertyValue('--seat'))).toEqual(['#e05a4f', '#3c8ce7', '#3aa76d', '#d99a1f'])
  })
})

// «Visa för alla» (#508, beslut B): a card somebody holds up is drawn over the felt, large enough
// to read from the sofa (K26), and says who is showing it. The column beside it is left as it
// was: the card is shown over the table, not instead of the dock.
describe('a card shown for everyone stands over the felt (K8, K26, #508)', () => {
  const scene = () => {
    const { view, log } = buildScene()
    const table = view(null)
    const card = { ...table.components.find((c) => c.zone === 'table' && c.cardRef !== null)!, title: 'Björnen' }
    return { table, activity: log.map(projectActivity), card }
  }

  it('draws the card inside the felt’s box, with who is showing it and the card’s name', () => {
    const { table, activity, card } = scene()
    const { container } = render(
      <TvChrome view={table} activity={activity} roomCode="KX7P" showing={{ card, by: 'Ada', at: 1 }}>
        <div data-testid="felt" />
      </TvChrome>,
    )
    const shown = screen.getByRole('status', { name: /Ada visar/ })
    expect(shown.closest('[data-tv] > main')).toBeTruthy()
    expect(shown.textContent).toMatch(/Ada visar.*Björnen/)
    expect(shown.querySelector(`[data-tv-show="${card.id}"]`)).toBeTruthy()
    // The felt is still there under it, and the column is untouched.
    expect(screen.getByTestId('felt')).toBeTruthy()
    expect(container.querySelector('aside [data-tv-show]')).toBeNull()
  })

  it('says the table is showing it when nobody at a seat did', () => {
    const { table, activity, card } = scene()
    render(
      <TvChrome view={table} activity={activity} showing={{ card, by: null, at: 1 }}>
        <div />
      </TvChrome>,
    )
    expect(screen.getByRole('status', { name: /Bordet visar/ })).toBeTruthy()
  })

  it('draws nothing over the felt when nothing is shown, and is taken down by a press on it', () => {
    const { table, activity, card } = scene()
    const { container, rerender } = render(
      <TvChrome view={table} activity={activity}>
        <div />
      </TvChrome>,
    )
    expect(container.querySelector('[data-tv-show]')).toBeNull()
    const down = vi.fn()
    rerender(
      <TvChrome view={table} activity={activity} showing={{ card, by: 'Ada', at: 1 }} onDismiss={down}>
        <div />
      </TvChrome>,
    )
    fireEvent.click(screen.getByRole('status', { name: /Ada visar/ }))
    expect(down).toHaveBeenCalledOnce()
  })
})

// What the TV holds up, and for how long (#508): the room's `show`, or the table's own keyboard
// asking «Titta» on a card. The newest wins, each goes by itself, and Escape takes it down until
// somebody shows something again.
describe('which shown card the TV draws (#508)', () => {
  const setup = () => {
    const { view } = buildScene()
    const table = view(null)
    const [one, two] = table.components.filter((c) => c.cardRef !== null && c.counter === undefined)
    return { table, one: one!, two: two! }
  }
  const from = (component: string, at: number, seat: string | null = 'A'): Shown => ({ component, seat, name: seat === 'A' ? 'Ada' : 'bordet', at })

  it('draws what the room shows, by the name of whoever showed it', () => {
    const { table, one } = setup()
    const { result } = renderHook(() => useShowing(table, from(one.id, 1000)))
    expect(result.current.showing).toMatchObject({ card: { id: one.id }, by: 'Ada', at: 1000 })
  })

  it('draws the table’s own «Titta» as the table showing it, and lets it go after its time', () => {
    vi.useFakeTimers()
    try {
      const { table, one } = setup()
      const { result } = renderHook(() => useShowing(table, null))
      act(() => result.current.show(one))
      expect(result.current.showing).toMatchObject({ card: { id: one.id }, by: null })
      act(() => vi.advanceTimersByTime(SHOW_MS))
      expect(result.current.showing).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the newer of the two, and a dismissed card down until another is shown', () => {
    const { table, one, two } = setup()
    const { result, rerender } = renderHook(({ shown }) => useShowing(table, shown), { initialProps: { shown: from(one.id, Date.now() + 10) } })
    act(() => result.current.dismiss())
    expect(result.current.showing).toBeNull()
    rerender({ shown: from(two.id, Date.now() + 20) })
    expect(result.current.showing).toMatchObject({ card: { id: two.id } })
  })

  it('draws nothing for a card this screen does not see face up', () => {
    const { table } = setup()
    const down = table.components.find((c) => c.cardRef === null)!
    const { result } = renderHook(() => useShowing(table, from(down.id, 1000)))
    expect(result.current.showing).toBeNull()
  })
})
