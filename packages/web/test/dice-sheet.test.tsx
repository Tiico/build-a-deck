// @vitest-environment jsdom
// The phone's dice (K28, #1138, variant B): «Tärningar · n» among the counters, and a sheet of
// tiles where a press chooses a die and «Slå» throws every chosen die in one envelope (K3).
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { Activity, Intent, Snapshot } from '@byd/protocol'
import type { SendResult } from '../src/client.js'
import { diceOf, DicePill, DiceSheet } from '../src/player/Dice.js'
import { inFrontOf } from '../src/player/SeatExtras.js'

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const die = (id: string, faces: number, zone: string, value: number) => ({ id, type: { id: `die.d${faces}`, version: 1 }, zone, face: 'front', x: 0, y: 0, rot: 0, cardRef: `d${faces}`, counter: value })

function table(components: unknown[]): Snapshot {
  return {
    seq: 1,
    seat: 'A',
    floor: 'table',
    seats: [
      { id: 'A', name: 'Ada', edge: 'S' },
      { id: 'B', name: 'Bo', edge: 'N' },
    ],
    zones: [
      { mode: 'order', id: 'table', kind: 'area', name: 'Spelyta', geometry: rect(-600, -400, 1200, 800), dynamic: false, order: [] },
      { mode: 'order', id: 'front:A', kind: 'area', name: 'Framför A', owner: 'A', geometry: rect(-250, 230, 500, 100), dynamic: false, order: [] },
      { mode: 'order', id: 'front:B', kind: 'area', name: 'Framför B', owner: 'B', geometry: rect(-250, -330, 500, 100), dynamic: false, order: [] },
    ],
    components,
    rewind: null,
    undo: null,
    ended: false,
    played: false,
    version: 'v1',
  } as unknown as Snapshot
}

describe('the dice a seat reaches (#1138)', () => {
  it('are the dice on the shared table and in the seat’s own areas, never another seat’s', () => {
    const view = table([die('a', 6, 'table', 1), die('b', 20, 'front:A', 1), die('c', 6, 'front:B', 1), { ...die('k', 6, 'table', 0), type: { id: 'card.standard.63x88', version: 1 } }])
    expect(diceOf(view).map((d) => d.id)).toEqual(['a', 'b'])
  })

  // A die is thrown from its sheet and is not a card: in the strip of what lies in front of the
  // seat it was a tile called «d20» that held up nothing.
  it('are not cards in front of the seat', () => {
    const view = table([die('b', 20, 'front:A', 1), { ...die('k', 6, 'front:A', 0), type: { id: 'card.standard.63x88', version: 1 }, cardRef: 'Varg' }])
    expect(inFrontOf(view).map((c) => c.id)).toEqual(['k'])
  })
})

describe('the dice pill (#1138)', () => {
  it('says how many dice the seat reaches, and is not there without any', () => {
    const { rerender } = render(<DicePill view={table([die('a', 6, 'table', 1), die('b', 6, 'table', 1)])} open={false} onOpen={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Tärningar · 2' })).toBeTruthy()
    rerender(<DicePill view={table([])} open={false} onOpen={() => undefined} />)
    expect(screen.queryByRole('button', { name: /Tärningar/ })).toBeNull()
  })
})

// The sheet on a table that answers: every envelope is kept, and a roll lands on the value the
// test hands it, as a line in the log the way the server would tell it (#1136).
function Table({ values }: { values: number[] }) {
  const [view, setView] = useState(() => table([die('a', 6, 'table', 1), die('b', 6, 'table', 1), die('c', 20, 'front:A', 1)]))
  const [activity, setActivity] = useState<Activity[]>([])
  const [open, setOpen] = useState(false)
  const send = async (...intents: Intent[]): Promise<SendResult> => {
    sent.push(intents)
    const batch = `A-${sent.length}`
    const lines = intents.map((it, i) => ({ seq: activity.length + i + 1, batch, by: 'A', at: '2026-10-23T00:00:00.000Z', intent: it, rolled: values[i] }) as Activity)
    setView((v) => ({ ...v, components: v.components.map((c) => { const at = intents.findIndex((it) => it.v === 'roll' && it.component === c.id); return at < 0 ? c : { ...c, counter: values[at] } }) }))
    setActivity((a) => [...a, ...lines])
    return { ok: true, seqs: lines.map((l) => l.seq) }
  }
  return (
    <>
      <DicePill view={view} open={open} onOpen={() => setOpen(true)} />
      {open && <DiceSheet view={view} activity={activity} send={send} onClose={() => setOpen(false)} />}
    </>
  )
}
let sent: Intent[][] = []

describe('the dice sheet (#1138)', () => {
  it('names each die by its kind and the side it shows, and chooses it with a press', async () => {
    sent = []
    const user = userEvent.setup()
    render(<Table values={[3, 5]} />)
    await user.click(screen.getByRole('button', { name: 'Tärningar · 3' }))
    const sheet = await screen.findByRole('dialog', { name: 'Tärningar' })
    const tiles = within(sheet).getAllByRole('button', { name: /^d\d+, visar \d+$/ })
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual(['d6, visar 1', 'd6, visar 1', 'd20, visar 1'])
    expect(tiles.map((t) => t.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false'])
    const roll = within(sheet).getByRole('button', { name: 'Välj tärningar att slå' })
    expect((roll as HTMLButtonElement).disabled).toBe(true)
    await user.click(tiles[0]!)
    expect(tiles[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(within(sheet).getByRole('button', { name: 'Slå tärningen' })).toBeTruthy()
    await user.click(tiles[1]!)
    expect(within(sheet).getByRole('button', { name: 'Slå 2 tärningar' })).toBeTruthy()
    await user.click(tiles[1]!)
    expect(tiles[1]!.getAttribute('aria-pressed')).toBe('false')
  })

  it('chooses all and none', async () => {
    sent = []
    const user = userEvent.setup()
    render(<Table values={[1, 2, 3]} />)
    await user.click(screen.getByRole('button', { name: 'Tärningar · 3' }))
    const sheet = await screen.findByRole('dialog', { name: 'Tärningar' })
    await user.click(within(sheet).getByRole('button', { name: 'Välj alla' }))
    expect(within(sheet).getByRole('button', { name: 'Slå 3 tärningar' })).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Välj ingen' }))
    expect(within(sheet).getByRole('button', { name: 'Välj tärningar att slå' })).toBeTruthy()
  })

  it('throws the chosen dice in one envelope and shows what they came to, with the sum, without a second voice', async () => {
    sent = []
    const user = userEvent.setup()
    render(<Table values={[3, 5]} />)
    await user.click(screen.getByRole('button', { name: 'Tärningar · 3' }))
    const sheet = await screen.findByRole('dialog', { name: 'Tärningar' })
    const tiles = within(sheet).getAllByRole('button', { name: /^d\d+, visar \d+$/ })
    await user.click(tiles[0]!)
    await user.click(tiles[1]!)
    await user.click(within(sheet).getByRole('button', { name: 'Slå 2 tärningar' }))
    expect(sent).toEqual([[{ v: 'roll', component: 'a' }, { v: 'roll', component: 'b' }]])
    await waitFor(() => expect(within(sheet).getByText('Du slog 2d6: 3 + 5 = 8')).toBeTruthy())
    // The phone's activity channel already says one's own throw at once (`useActivityLive`), and
    // everything that speaks on a screen speaks through StatusLive's two regions: a live region in
    // the sheet would read the same sentence a second time.
    expect(sheet.querySelectorAll('[role="status"], [role="alert"], [aria-live]')).toHaveLength(0)
    expect(within(sheet).getAllByRole('button', { name: /^d\d+, visar \d+$/ }).map((t) => t.getAttribute('aria-label'))).toEqual(['d6, visar 3', 'd6, visar 5', 'd20, visar 1'])
  })

  it('closes on «Stäng» and on Escape, and hands the focus back to the pill', async () => {
    const user = userEvent.setup()
    render(<Table values={[]} />)
    const pill = screen.getByRole('button', { name: 'Tärningar · 3' })
    await user.click(pill)
    const sheet = await screen.findByRole('dialog', { name: 'Tärningar' })
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true))
    await user.click(within(sheet).getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(pill)
    await user.click(pill)
    await screen.findByRole('dialog', { name: 'Tärningar' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(pill)
  })
})
