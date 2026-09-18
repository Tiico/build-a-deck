// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '@byd/server'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openSymbols(): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Symboler' }))
}
const tile = (name: string) => screen.getByRole('button', { name: `Ta in ${name}` })

describe('the symbol library in the editor (E4)', () => {
  it('searches the library, narrows to a category, and says what a symbol is licensed under', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openSymbols()
    expect(tile('sköld')).toBeTruthy()
    expect(tile('sköld').textContent).toContain('CC0-1.0')

    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: 'försvar' } })
    expect(screen.getAllByRole('button', { name: /^Ta in / })).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: '' } })
    // Since #128 the categories live in a named box in the panel's crown, which says which one is
    // chosen before it is opened.
    expect(screen.getByRole('button', { name: /^Kategori/ }).textContent).toContain('Alla')
    fireEvent.click(screen.getByRole('button', { name: /^Kategori/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Platshållare' }))
    expect(screen.getByRole('button', { name: /^Kategori/ }).textContent).toContain('Platshållare')
    expect(screen.queryByRole('button', { name: 'Ta in sköld' })).toBeNull()
    expect(screen.getByRole('button', { name: /Ta in ram-tunn/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Sök symbol'), { target: { value: 'ingenting alls' } })
    expect(screen.getByText(/Inget med det namnet/)).toBeTruthy()
  })

  it('takes a symbol into the game, shows it in the set with what to write, renames and removes it, and saves the licence with the project', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openSymbols()
    expect(screen.getByText(/Inga symboler ännu/)).toBeTruthy()

    fireEvent.click(tile('sköld'))
    const set = await screen.findByRole('list', { name: 'Symboler i spelet' })
    await waitFor(() => expect(within(set).getByText('{sköld}')).toBeTruthy())
    expect(within(set).getByText(/CC0-1\.0/)).toBeTruthy()

    const rename = within(set).getByLabelText('Namn för sköld')
    fireEvent.change(rename, { target: { value: 'försvar' } })
    fireEvent.blur(rename)
    await waitFor(() => expect(within(set).getByText('{försvar}')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    const stored = await run.projects.load(run.projectId)
    expect(stored?.icons['försvar']).toMatch(/^asset:[0-9a-f]{64}$/)
    expect(stored?.credits?.['försvar']).toMatchObject({ licence: 'CC0-1.0', source: 'skold' })

    fireEvent.click(within(set).getByRole('button', { name: 'Ta bort försvar' }))
    await waitFor(() => expect(screen.getByText(/Inga symboler ännu/)).toBeTruthy())
  })

  it('draws a symbol on the cards it is written into, and says which cards use it', async () => {
    const doc = projectDoc()
    doc.rows[0]!.fields['body'] = 'Flygande. {sköld}'
    await run.projects.create(run.projectId, doc)
    history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    render(<EditorPage />)
    await screen.findByText('Skogens herrar')
    // Before the symbol is taken in, the card says the name is unknown rather than nothing (L2).
    // Read on the card wall and no longer on the symbol tab: since #178 a game with no symbol at
    // all draws no deck there, so this state has no cards on that tab to read it off. The wall
    // draws every card whatever the game has, which is what this half of the test needs.
    fireEvent.click(screen.getByRole('tab', { name: 'Kortvägg' }))
    await waitFor(() => expect(document.querySelector('[data-card-ref="dragon"] .byd-icon-missing')).toBeTruthy())

    fireEvent.click(screen.getByRole('tab', { name: 'Symboler' }))
    fireEvent.click(tile('sköld'))
    await waitFor(() => expect(document.querySelector('[data-card-ref="dragon"] img.byd-icon')).toBeTruthy())
    const set = await screen.findByRole('list', { name: 'Symboler i spelet' })
    expect(within(set).getByText('1 kort')).toBeTruthy()
  })
})

// The deck the symbol tab draws under the library (#178). It used to draw every card in the game,
// always, whatever was asked — a deck of 308 was 10 132 px of compiled cards under a line that
// said "no symbols yet", each one of them through the card renderer. The tab is about symbols and
// where they are said, so the deck it shows is the cards that say the symbol in hand.
//
// The count is what makes this a reading and not an impression: a wall that is merely shorter is
// still a wall nobody asked for.
const withIcons = (): ProjectDoc => {
  const doc = projectDoc()
  return {
    ...doc,
    icons: { guld: 'asset:aaa', sköld: 'asset:bbb' },
    rows: [
      { id: 'dragon', fields: { title: 'Drake', body: 'Kostar {guld}.', antal: 1 } },
      { id: 'knight', fields: { title: 'Riddare', body: 'Bär {sköld} och {guld}.', antal: 1 } },
      { id: 'wizard', fields: { title: 'Trollkarl', body: 'Ingen symbol alls.', antal: 1 } },
    ],
  }
}

const drawn = () => document.querySelectorAll('.byd-symbols-main .byd-wall-card').length
const chip = (name: string | RegExp) => screen.getByRole('button', { name })

describe('the deck the symbol tab draws (#178)', () => {
  it('draws no cards at all when the game has no symbol, and says what to do instead', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openSymbols()
    // The fixture deck has rows and no icons. Every one of them used to be compiled here.
    expect(drawn()).toBe(0)
    expect(screen.getByText(/Inga symboler ännu/)).toBeTruthy()
  })

  it('shows the cards that say the symbol in hand, and says how many say each', async () => {
    await run.projects.create(run.projectId, withIcons())
    await openSymbols()
    // A symbol is the choice the tab opens on, not the whole deck.
    await waitFor(() => expect(chip(/^guld/)).toBeTruthy())
    expect(chip(/^guld/).textContent).toContain('2')
    expect(chip(/^sköld/).textContent).toContain('1')
    expect(drawn()).toBe(2)
    expect(document.querySelector('[data-card-ref="wizard"]')).toBeNull()

    fireEvent.click(chip(/^sköld/))
    await waitFor(() => expect(drawn()).toBe(1))
    expect(document.querySelector('[data-card-ref="knight"]')).toBeTruthy()
  })

  it('keeps the whole deck as a choice of its own, and never as the default', async () => {
    await run.projects.create(run.projectId, withIcons())
    await openSymbols()
    await waitFor(() => expect(chip('Hela leken')).toBeTruthy())
    expect(chip('Hela leken').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chip('Hela leken'))
    await waitFor(() => expect(drawn()).toBe(3))
  })

  it('says so when nothing says the symbol in hand, and offers the whole deck', async () => {
    const doc = withIcons()
    await run.projects.create(run.projectId, { ...doc, icons: { ...doc.icons, ensam: 'asset:ccc' } })
    await openSymbols()
    fireEvent.click(chip(/^ensam/))
    await waitFor(() => expect(screen.getByText(/Inget kort säger den här än/)).toBeTruthy())
    expect(drawn()).toBe(0)
    // The offer is a way on and not a sentence: pressing it shows the deck.
    fireEvent.click(chip('Hela leken'))
    await waitFor(() => expect(drawn()).toBe(3))
  })
})

// A symbol can reach a card without a single row naming it: the template paints it, an `icons`
// element bound to a literal (#213). The count measures cards that *say* the symbol, so it stays
// 0 — the owner's decision of 2026-09-18 — and the two places that count have to say why instead
// of showing a bare zero that reads as a fault. Whatever they say, they say the same thing.
const mark = (literal: string, id: string) => ({ kind: 'icons' as const, id, x: 50, y: 76, w: 8, h: 8, bind: { literal }, iconMm: 8, gapMm: 0 })

// The template paints `svärd` and `guld` on every card. No row says `svärd`, one row says `guld`,
// and `ensam` is neither said nor painted — so the deck holds all three cases at once, and the
// middle one is the reason the explanation replaces a zero rather than replacing the number.
const withPainted = (): ProjectDoc => {
  const doc = projectDoc()
  const front = doc.template.faces['front']!
  return {
    ...doc,
    icons: { svärd: 'asset:aaa', guld: 'asset:bbb', ensam: 'asset:ccc' },
    rows: [
      { id: 'dragon', fields: { title: 'Drake', body: 'Kostar {guld}.', antal: 1 } },
      { id: 'knight', fields: { title: 'Riddare', body: 'Ingen symbol alls.', antal: 1 } },
      { id: 'wizard', fields: { title: 'Trollkarl', body: 'Ingen symbol alls.', antal: 1 } },
    ],
    template: { ...doc.template, faces: { ...doc.template.faces, front: { ...front, base: [...front.base, mark('svärd guld', 'mark')] } } },
  }
}

// The same deck with a symbol only one variant paints: on the cards wearing that variant and on
// no others, so what is said about it may never promise the whole deck.
const paintedByVariant = (): ProjectDoc => {
  const doc = withPainted()
  const front = doc.template.faces['front']!
  return {
    ...doc,
    icons: { ...doc.icons, krona: 'asset:ddd' },
    template: {
      ...doc.template,
      faces: { ...doc.template.faces, front: { ...front, variants: { hjälte: { override: [mark('krona', 'crown')] } }, variantBy: 'sort' } },
    },
  }
}

describe('a symbol the template paints and no card says (#213)', () => {
  const inSet = (name: string) => document.querySelector(`.byd-symbols-set [data-icon="${name}"]`)?.textContent ?? ''
  // What a chip says where a number would be — the whole of the chip minus the symbol's own name.
  const measure = (name: string) => chip(new RegExp(`^${name}`)).querySelector('small')?.textContent?.trim() ?? ''

  it('says the template paints it, beside the library, instead of a bare zero', async () => {
    await run.projects.create(run.projectId, withPainted())
    await openSymbols()
    await screen.findByRole('list', { name: 'Symboler i spelet' })
    expect(inSet('svärd')).toContain('målas av mallen')
    expect(inSet('svärd')).not.toContain('0 kort')
  })

  it('says the template paints it on the chip too, in the few words a chip has room for', async () => {
    // Both painted symbols at once — the one on every card and the one a variant paints — because
    // the long form of the second is the seven-word one that sent this back to be cut.
    await run.projects.create(run.projectId, paintedByVariant())
    await openSymbols()
    await waitFor(() => expect(chip(/^svärd/)).toBeTruthy())
    expect(chip(/^svärd/).textContent).toContain('målas')
    expect(chip(/^svärd/).textContent).not.toContain('0')
    // The chip stands in a row where every other chip is a name and a number — `guld 12` — so the
    // sentence beside the library cannot be the one that stands here: at 1440 px it drew a chip
    // four times the width of its neighbours and the row stopped reading as a row of counts. The
    // whole of the fact is a finger away, in the set above and in the line under the chips, so
    // what the chip carries is the short form of it. Two words is the room there is.
    expect(measure('svärd').split(/\s+/).length).toBeLessThanOrEqual(2)
    expect(measure('krona').split(/\s+/).length).toBeLessThanOrEqual(2)
  })

  it('agrees with the set about which symbols the template paints, name for name', async () => {
    // The constraint the issue leaves standing however the words are cut: a symbol the set calls
    // painted is painted on the chip as well, and one it does not is not. Both readings come off
    // `iconsPainted`, and this is what would catch them coming off anything else.
    await run.projects.create(run.projectId, paintedByVariant())
    await openSymbols()
    await waitFor(() => expect(chip(/^krona/)).toBeTruthy())
    const says = Object.fromEntries(['svärd', 'krona', 'guld', 'ensam'].map((n) => [n, { set: inSet(n).includes('målas'), chip: measure(n).includes('målas') }]))
    expect(says).toEqual({
      svärd: { set: true, chip: true },
      krona: { set: true, chip: true },
      guld: { set: false, chip: false },
      ensam: { set: false, chip: false },
    })
  })

  it('lists no cards for it and says why, rather than reading as a deck that lost its cards', async () => {
    await run.projects.create(run.projectId, withPainted())
    await openSymbols()
    await waitFor(() => expect(chip(/^svärd/)).toBeTruthy())
    expect(drawn()).toBe(0)
    expect(screen.getByText(/Mallen målar den på varje kort den ritar/)).toBeTruthy()
    // And not the line for a symbol nobody has written yet, which would be an instruction to do
    // something the deck has already had done for it.
    expect(screen.queryByText(/Inget kort säger den här än/)).toBeNull()
  })

  it('leaves a symbol the cards do say, and one nothing uses at all, exactly as they were', async () => {
    await run.projects.create(run.projectId, withPainted())
    await openSymbols()
    await waitFor(() => expect(chip(/^guld/)).toBeTruthy())
    // The template paints `guld` too, but a card says it — so the number is not a zero that
    // needs explaining, and a count is worth more than a sentence about the template.
    expect(inSet('guld')).toContain('1 kort')
    expect(inSet('guld')).not.toContain('mallen')
    expect(chip(/^guld/).textContent).toContain('1')
    fireEvent.click(chip(/^guld/))
    await waitFor(() => expect(drawn()).toBe(1))

    // Nothing paints `ensam` and nothing says it, so there is nothing to explain: it keeps the
    // zero and the line that says what to write.
    expect(inSet('ensam')).toContain('0 kort')
    fireEvent.click(chip(/^ensam/))
    await waitFor(() => expect(screen.getByText(/Inget kort säger den här än/)).toBeTruthy())
    expect(drawn()).toBe(0)
  })

  it('promises only some cards when a variant, and not the base, is what paints it', async () => {
    // A symbol one variant paints is on the cards wearing that variant and on no others. The
    // count is 0 either way, but a message that said "every card it draws" here would be a
    // sentence the template does not back up.
    await run.projects.create(run.projectId, paintedByVariant())
    await openSymbols()
    await waitFor(() => expect(chip(/^krona/)).toBeTruthy())
    expect(inSet('krona')).toContain('målas av mallen på vissa kort')
    // The chip keeps the difference in its own short form: it says painted without saying every.
    expect(measure('krona')).toBe('målas ibland')
    expect(measure('svärd')).toBe('målas')
    fireEvent.click(chip(/^krona/))
    await waitFor(() => expect(screen.getByText(/Mallen målar den på vissa kort/)).toBeTruthy())
    // And the symbol the base paints is still on every card, beside it in the same set.
    expect(inSet('svärd')).toContain('målas av mallen')
    expect(inSet('svärd')).not.toContain('vissa kort')
  })
})
