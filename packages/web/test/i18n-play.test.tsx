// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { projectActivity } from '@byd/engine'
import { Language } from '../src/i18n/index.js'
import { TvChrome } from '../src/table/TvChrome.js'
import { PlaySheet } from '../src/player/PlaySheet.js'
import { EndSheet, ExitSheet, FlagSheet } from '../src/player/SessionSheets.js'
import { Survey } from '../src/player/Survey.js'
import { TableSummary } from '../src/player/TableSummary.js'
import { buildScene } from './scene.js'

const english = (ui: React.ReactNode) => render(<Language lang="en">{ui}</Language>)

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

  it('asks the survey in English', () => {
    english(<Survey who="Ada" version="v1" onSubmit={async () => undefined} />)
    expect(screen.getByRole('heading', { name: 'This table has ended' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /How much fun/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
  })
})
