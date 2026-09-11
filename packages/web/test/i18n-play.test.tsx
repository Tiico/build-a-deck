// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { projectActivity } from '@byd/engine'
import { Language } from '../src/i18n/index.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { PlaySheet } from '../src/player/PlaySheet.js'
import { EndSheet, ExitSheet, FlagSheet } from '../src/player/SessionSheets.js'
import { SessionButtons } from '../src/player/SessionOverlays.js'
import { Survey } from '../src/player/Survey.js'
import { TableSummary } from '../src/player/TableSummary.js'
import { buildScene } from './scene.js'

const english = (ui: React.ReactNode) => render(<Language lang="en">{ui}</Language>)
const swedish = (ui: React.ReactNode) => render(<Language lang="sv">{ui}</Language>)

// The row's controls only ever open a sheet in these tests; nothing is sent.
const idle = { send: async () => undefined } as unknown as Parameters<typeof SessionButtons>[0]['client']

describe('the play surfaces in the reader\'s own language (A4)', () => {
  it('says the table screen in English: its headings, its seats, and what just happened', () => {
    const { view, log } = buildScene()
    english(
      <TvChrome view={view(null)} activity={log.map(projectActivity)} roomCode="KX7P">
        <div data-testid="table" />
      </TvChrome>,
    )
    expect(screen.getByText(/join with your phone/i)).toBeTruthy()
    expect(screen.getByRole('region', { name: /inspection/i })).toBeTruthy()
    expect(screen.getByText(/point at a card/i)).toBeTruthy()

    const dock = screen.getByRole('list', { name: /seats/i })
    expect(within(dock).getAllByRole('listitem').map((s) => s.textContent)).toEqual([
      expect.stringMatching(/Ada.*2 cards in hand/),
      expect.stringMatching(/B.*0 cards in hand/),
    ])

    const feed = screen.getByRole('list', { name: /latest/i })
    const lines = within(feed).getAllByRole('listitem').map((l) => l.textContent)
    expect(lines).toContainEqual(expect.stringMatching(/The table flipped a card/))
    // The zone is the designer's word and stays theirs, in either language.
    expect(lines).toContainEqual(expect.stringMatching(/The table drew 2 from Draghög/))
  })

  it('says the phone in English, and leaves the designer\'s zone names and shortcuts alone', () => {
    const { view } = buildScene()
    english(<PlaySheet view={view('A')} count={2} label="dragon" onPlay={() => undefined} onClose={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Play to' })).toBeTruthy()
    expect(screen.getByText('2 cards')).toBeTruthy()
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual([
      expect.stringMatching(/^Kasta3 cards · on top of Kasthög$/),
      expect.stringMatching(/^Lägg underst3 cards · at the bottom of Draghög$/),
      expect.stringMatching(/^The table.*anywhere$/),
    ])
  })

  it('says the table summary and the session sheets in English', () => {
    const { view, log } = buildScene()
    const { unmount } = english(<TableSummary view={view('A')} activity={log.map(projectActivity)} />)
    expect(screen.getByRole('list', { name: /latest/i })).toBeTruthy()
    // The counts are the tool's, the zone names beside them the designer's.
    expect(screen.getAllByText('3 cards').length).toBe(2)
    expect(screen.getByText('Kasthög')).toBeTruthy()
    unmount()

    const flag = english(<FlagSheet onFlag={() => undefined} onClose={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Flag this moment' })).toBeTruthy()
    expect(screen.getByPlaceholderText(/What happened/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    flag.unmount()

    const end = english(<EndSheet version="v1" onEnd={() => undefined} onClose={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'End the table?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeTruthy()
    end.unmount()

    // The way out (#31), in English: both exits named, and both consequences said — including the
    // one the whole wording exists for, that losing the connection is not this.
    english(<ExitSheet onLeave={() => undefined} onEnd={() => undefined} onClose={() => undefined} />)
    const exit = screen.getByRole('dialog', { name: 'On your way out?' })
    expect(within(exit).getAllByRole('button').map((b) => b.textContent)).toEqual(['Leave the table', 'End the table for everyone', 'Stay'])
    expect(exit.textContent).toMatch(/Lose the connection instead and your seat stands/)
    expect(exit.textContent).toMatch(/We ask once more before that happens/)
  })

  // The phone's row is read by two senses at once. The eye gets three controls that fit on one
  // line at 375 px, which is why the way out is written as short as it is (#31); the ear gets a
  // name, and a name has no width to run out of. So the way out says where it leads, and says it
  // beginning with the very word on the button, which is what WCAG 2.5.3 asks of a label that is
  // also spoken (#48).
  it('names the way out by where it leads without lengthening the button, in both languages', () => {
    const { view } = buildScene()
    const row = <SessionButtons client={idle} view={view('A')} sheet={null} onSheet={() => undefined} />

    const sv = swedish(row)
    const svExit = screen.getByRole('button', { name: 'Ut… ur bordet' })
    expect(svExit.textContent).toBe('Ut…')
    expect(screen.getByRole('button', { name: '↶ Ångra' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '⚑ Flagga' })).toBeTruthy()
    sv.unmount()

    english(row)
    const enExit = screen.getByRole('button', { name: 'Exit… the table' })
    expect(enExit.textContent).toBe('Exit…')
    expect(screen.getByRole('button', { name: '↶ Undo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '⚑ Flag' })).toBeTruthy()
  })

  it('asks the survey in English', () => {
    english(<Survey who="Ada" version="v1" onSubmit={async () => undefined} />)
    expect(screen.getByRole('heading', { name: 'This table has ended' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /How much fun/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
  })
})
