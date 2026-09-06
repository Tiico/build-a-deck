// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { projectActivity } from '@byd/engine'
import { TvChrome } from '../src/table/TvChrome.js'
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
    expect(screen.getByText('example.test/join?session=s1')).toBeTruthy()
  })
})
