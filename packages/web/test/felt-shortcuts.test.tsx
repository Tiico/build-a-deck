// @vitest-environment jsdom
// The table’s shortcuts (#224). Everything here goes through the same intents the ring already
// sends — no new verbs — and every command acts on whatever the pointer is pointing at.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Intent, Snapshot } from '@byd/protocol'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { useFeltKeyboard } from '../src/table/useFeltKeyboard.js'
import { besidePile } from '../src/table/drop.js'
import { buildScene } from './scene.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The felt as it is really mounted: the ring’s pointer track and the keyboard track on the same
// table, as on `/table` and `/online`. The commands belong in the existing track, so they are
// tried through it.
function Felt({ view, act }: { view: Snapshot; act(intents: Intent[]): void }) {
  const felt = useFeltKeyboard(view, true, {
    act: (intents) => {
      act(intents)
      return Promise.resolve({ ok: true as const, seqs: [] })
    },
  })
  return (
    <>
      <TableRenderer view={view} mode="tv" scale={1} onAct={act} keyboard={felt.keyboard} />
      {felt.panel}
    </>
  )
}

const client = (mmX: number, mmY: number) => ({ clientX: mmX + 500, clientY: mmY + 300, pointerId: 1, isPrimary: true, button: 0 })

const had = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform')
const on = (platform: string) => Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true })
afterEach(() => {
  if (had) Object.defineProperty(Navigator.prototype, 'platform', had)
})

describe('a modifier click flips whatever the pointer is standing on (#224)', () => {
  it('Cmd + click on a Mac flips the card, and does nothing else on the way', () => {
    on('MacIntel')
    const { view, faceUp } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card, { ...client(-390, -240), metaKey: true })
    fireEvent.pointerUp(card, { ...client(-390, -240), metaKey: true })
    expect(onAct.mock.calls).toEqual([[[{ v: 'flip', component: faceUp, face: 'back' }]]])
    expect(document.querySelector('[data-radial]')).toBeNull()
  })

  it('Ctrl + click is the same command on Windows and Linux, and is not one on a Mac', () => {
    const { view, faceUp } = buildScene()
    const onAct = vi.fn()
    on('Win32')
    const { unmount } = render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const card = () => document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card(), { ...client(-390, -240), ctrlKey: true })
    expect(onAct.mock.calls).toEqual([[[{ v: 'flip', component: faceUp, face: 'back' }]]])
    unmount()

    // On a Mac, Ctrl + click is the system's secondary click: the page never gets a `click` at
    // all, and reading it as "flip" would be building a command nobody can carry out (measured
    // finding, #224).
    onAct.mockClear()
    on('MacIntel')
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    fireEvent.pointerDown(card(), { ...client(-390, -240), ctrlKey: true })
    fireEvent.pointerUp(card(), { ...client(-390, -240), ctrlKey: true })
    expect(onAct).not.toHaveBeenCalled()
    // It is an ordinary press instead, answered by the ring — not a silent gesture.
    expect(document.querySelector('[data-radial]')).toBeTruthy()
  })

  it('flips the pile’s top card when the pointer stands on a pile — the same command means the same thing everywhere', () => {
    on('MacIntel')
    const { view } = buildScene()
    const onAct = vi.fn()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={onAct} />)
    const top = document.querySelector('[data-zone="draw"] .byd-pile-top')!
    fireEvent.pointerDown(top, { ...client(-200, 0), metaKey: true })
    // The pile is hidden, so the top card is named by the pile and not by its own id (K15).
    expect(onAct.mock.calls).toEqual([[[{ v: 'flip', component: { top: 'draw' }, face: 'front' }]]])

    onAct.mockClear()
    const label = document.querySelector('[data-zone="draw"] .byd-pile-count')!
    fireEvent.pointerDown(label, { ...client(-200, 50), metaKey: true })
    expect(onAct.mock.calls).toEqual([[[{ v: 'flip', component: { top: 'draw' }, face: 'front' }]]])
  })
})

describe('D and S act on the pile under the pointer (#224)', () => {
  it('D draws the top card off the pile the pointer stands on, to where the ring’s Dra 1 puts it', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    const sent: Intent[][] = []
    render(<Felt view={snapshot} act={(i) => sent.push(i)} />)

    fireEvent.pointerEnter(document.querySelector('[data-zone="draw"]')!)
    fireEvent.keyDown(window, { key: 'd' })

    const draw = snapshot.zones.find((z) => z.id === 'draw')!
    expect(sent).toEqual([[{ v: 'split', pile: 'draw', at: 1, ...besidePile(draw.geometry, 1, draw.beside) }]])
  })

  it('S shuffles that same pile, and neither of them does anything when the pointer is on no pile', () => {
    const { view } = buildScene()
    const sent: Intent[][] = []
    render(<Felt view={view(null)} act={(i) => sent.push(i)} />)

    const pile = document.querySelector('[data-zone="discard"]')!
    fireEvent.pointerEnter(pile)
    fireEvent.keyDown(window, { key: 's' })
    expect(sent).toEqual([[{ v: 'shuffle', pile: 'discard' }]])

    // Once the pointer leaves the pile there is nothing to shuffle: the command is tied to the
    // pointer and not to a selection, and a key pressed over the felt must not land on the pile
    // that was touched last.
    fireEvent.pointerLeave(pile)
    fireEvent.keyDown(window, { key: 'd' })
    fireEvent.keyDown(window, { key: 's' })
    expect(sent).toHaveLength(1)
  })
})

describe('F flips what the pointer is standing on (#258)', () => {
  it('flips the card the pointer stands on, exactly as the modifier click does', () => {
    const { view, faceUp } = buildScene()
    const sent: Intent[][] = []
    render(<Felt view={view(null)} act={(i) => sent.push(i)} />)

    fireEvent.pointerEnter(document.querySelector(`[data-component="${faceUp}"]`)!)
    fireEvent.keyDown(window, { key: 'f' })

    expect(sent).toEqual([[{ v: 'flip', component: faceUp, face: 'back' }]])
  })

  it('flips the pile’s top when the pointer stands on a pile, named through the pile (K15)', () => {
    const { view } = buildScene()
    const sent: Intent[][] = []
    render(<Felt view={view(null)} act={(i) => sent.push(i)} />)

    fireEvent.pointerEnter(document.querySelector('[data-zone="draw"]')!)
    fireEvent.keyDown(window, { key: 'f' })

    expect(sent).toEqual([[{ v: 'flip', component: { top: 'draw' }, face: 'front' }]])
  })

  it('flips nothing on bare felt — it follows the pointer, not the card that was touched last', () => {
    const { view, faceUp } = buildScene()
    const sent: Intent[][] = []
    render(<Felt view={view(null)} act={(i) => sent.push(i)} />)

    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerEnter(card)
    fireEvent.pointerLeave(card)
    fireEvent.keyDown(window, { key: 'f' })

    expect(sent).toEqual([])
  })

  it('belongs to a text field while one is being typed in, pointer or no pointer', () => {
    const { view, faceUp } = buildScene()
    const sent: Intent[][] = []
    render(
      <>
        <Felt view={view(null)} act={(i) => sent.push(i)} />
        <input aria-label="Namn" />
      </>,
    )

    // The hand rests on a card while the other one types: the key is the field's all the same.
    fireEvent.pointerEnter(document.querySelector(`[data-component="${faceUp}"]`)!)
    const field = screen.getByRole('textbox', { name: 'Namn' })
    field.focus()

    // `fireEvent` answers false when the handler called `preventDefault`, which is what would
    // swallow the letter before the field ever saw it.
    expect(fireEvent.keyDown(field, { key: 'f' })).toBe(true)
    expect(sent).toEqual([])
  })
})

describe('a double click flips too (#224)', () => {
  // The way without a modifier, for whoever cannot hold two keys down. The second press never
  // reaches the card — the ring the first one opened lies over it — so the gesture is read on the
  // frame, which is where the browser puts its `dblclick` when the two presses have different
  // targets.
  it('two presses on the same card flip it, and close the ring the first one opened', () => {
    const { view, faceUp } = buildScene()
    const sent: Intent[][] = []
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={(i) => sent.push(i)} />)
    const card = document.querySelector(`[data-component="${faceUp}"]`)!
    fireEvent.pointerDown(card, client(-390, -240))
    fireEvent.pointerUp(card, client(-390, -240))
    const backdrop = document.querySelector('.byd-radial-backdrop')!
    fireEvent.pointerDown(backdrop, client(-390, -240))
    fireEvent.pointerUp(backdrop, client(-390, -240))
    fireEvent.doubleClick(document.querySelector('.byd-table-frame')!, client(-390, -240))

    expect(sent).toEqual([[{ v: 'flip', component: faceUp, face: 'back' }]])
    expect(document.querySelector('[data-radial]')).toBeNull()
  })

  it('a double click on bare felt flips nothing', () => {
    const { view } = buildScene()
    const sent: Intent[][] = []
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={(i) => sent.push(i)} />)
    fireEvent.pointerDown(document.querySelector('[data-table]')!, client(400, 240))
    fireEvent.doubleClick(document.querySelector('.byd-table-frame')!, client(400, 240))
    expect(sent).toEqual([])
  })
})

// The reservation the owner wanted said out loud (#224): a command that acts on "the pile under
// the pointer" is of no use without a pointer. That makes it a shortcut and not a way in — and it
// only holds if the ring's actions stay, the whole way, for whoever plays without a mouse.
describe('the ring’s actions are still there for a keyboard (#224)', () => {
  const ring = (snapshot: Snapshot, label: string): Intent[] => {
    const sent: Intent[][] = []
    const { unmount } = render(<TableRenderer view={snapshot} mode="tv" scale={1} onAct={(i) => sent.push(i)} />)
    const at = document.querySelector('[data-zone="draw"] .byd-pile-count')!
    fireEvent.pointerDown(at, client(-200, 50))
    fireEvent.pointerUp(at, client(-200, 50))
    fireEvent.click(screen.getByRole('button', { name: label }))
    unmount()
    return sent.flat()
  }
  const panel = (snapshot: Snapshot, label: string): Intent[] => {
    const sent: Intent[][] = []
    const { unmount } = render(<Felt view={snapshot} act={(i) => sent.push(i)} />)
    const node = document.querySelector('[data-kbd="pile:draw"]') as HTMLElement
    node.focus()
    fireEvent.keyDown(node, { key: 'Enter' })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(`^${label}`) }))
    unmount()
    return sent.flat()
  }

  it('gives the same answer to Dra 1 and Blanda whether they are reached with the pointer or with the keyboard', () => {
    const { view } = buildScene()
    const snapshot = view(null)
    expect(panel(snapshot, 'Dra 1')).toEqual(ring(snapshot, 'Dra 1'))
    expect(panel(snapshot, 'Blanda')).toEqual(ring(snapshot, 'Blanda'))
  })
})

describe('the discreet help (#224)', () => {
  it('always stands on a felt that can be played on, and opens that very surface’s commands', () => {
    on('MacIntel')
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={vi.fn()} />)

    const opener = screen.getByRole('button', { name: 'Snabbkommandon på bordet' })
    expect(opener.textContent).toBe('?')
    expect(opener.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(opener)
    const help = screen.getByRole('dialog', { name: 'Snabbkommandon på bordet' })
    // `F` stands with the two grips that mean the same thing (#258): one action, three ways to
    // ask for it, and one sentence — not the same sentence read three times.
    expect([...help.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Cmd + klick', 'Dubbelklick', 'F', 'D', 'S', 'Esc', '?'])
    // And says what all three of them act on. A key has no target of its own the way a click has,
    // so the row that carries one has to name the pointer, as «Dra» and «Blanda» already do.
    expect(help.textContent).toContain('Vänd kortet, eller högens översta, under pekaren')
    expect(help.textContent).toContain('Blanda högen under pekaren')
    expect(opener.getAttribute('aria-expanded')).toBe('true')
  })

  // Kameran står i listan där den går att köra (#325). Tangentbordet når allt den gör, och en
  // väg som inte står någonstans är ingen väg.
  it('lägger kamerans rader i listan på en filt som har en kamera, och lovar dem ingen annanstans', () => {
    on('MacIntel')
    const { view } = buildScene()
    const { unmount } = render(<TableRenderer view={view(null)} mode="tv" camera="follow" size={{ w: 1000, h: 500 }} glideMs={0} onAct={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Snabbkommandon på bordet' }))
    const help = screen.getByRole('dialog', { name: 'Snabbkommandon på bordet' })
    expect([...help.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual([
      'Cmd + klick',
      'Dubbelklick',
      'F',
      'D',
      'S',
      'Hjul',
      '+',
      '−',
      'Mitten + drag',
      'Space + drag',
      'Skift + piltangent',
      'Esc',
      '?',
    ])
    expect(help.textContent).toContain('Zooma in och ut kring pekaren; vyn står kvar')
    expect(help.textContent).toContain('Panorera vyn')
    // Och Escape säger vad den numera också gör.
    expect(help.textContent).toContain('visa hela bordet')
    unmount()

    // Filten på `/online` har ingen kamera, och lovar därför ingen.
    render(<TableRenderer view={view(null)} mode="table" scale={1} onAct={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Snabbkommandon på bordet' }))
    expect(screen.getByRole('dialog').textContent).not.toContain('Panorera vyn')
  })

  it('says Ctrl where the command is Ctrl', () => {
    on('Win32')
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Snabbkommandon på bordet' }))
    expect(screen.getByRole('dialog').querySelector('kbd')!.textContent).toBe('Ctrl + klick')
  })

  it('is not on a felt that is only shown: a button promising commands where there are none promises nothing', () => {
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="table" scale={2} />)
    expect(screen.queryAllByRole('button')).toEqual([])
  })
})

describe('the help’s ways in and out (#133, #152, #224)', () => {
  const helpOn = () => {
    const { view } = buildScene()
    render(<TableRenderer view={view(null)} mode="tv" scale={1} onAct={vi.fn()} />)
    return screen.getByRole('button', { name: 'Snabbkommandon på bordet' })
  }

  it('opens with `?`, is read where it stands, and Escape hands focus back to the button', () => {
    const opener = helpOn()
    // The button is a button: it stands in the tab order like every other way in.
    expect(opener.tabIndex).toBe(0)
    expect(opener.closest('[aria-hidden="true"]')).toBeNull()

    fireEvent.keyDown(window, { key: '?', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('dialog'))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('closes on a press outside it, but not on a press inside itself', () => {
    const opener = helpOn()
    fireEvent.click(opener)
    const help = screen.getByRole('dialog')

    fireEvent.pointerDown(help)
    expect(screen.queryByRole('dialog')).toBeTruthy()

    fireEvent.pointerDown(document.querySelector('[data-table]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
