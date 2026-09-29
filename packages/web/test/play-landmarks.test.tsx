// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TablePage } from '../src/table/TablePage.js'
import { PlayerPage } from '../src/player/PlayerPage.js'
import { OnlinePage } from '../src/online/OnlinePage.js'
import { admit, createSession, recipeSetup, roomOf, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Where a screen reader lands and what it can jump by (#560 P-20, WCAG 1.3.1 and 2.4.6): every
// playing surface has its main content marked as such and a heading that names the page, and the
// phone's folds and the zones in them are named, so a reader can move by them rather than read
// every line to find the saloon.
let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('the playing surfaces’ landmarks (#560 P-20)', () => {
  it('/online has its main content and a heading that names the page', async () => {
    const id = await createSession(run)
    const token = await admit(run, id, 'A', 'Ada')
    history.replaceState(null, '', `/online?session=${id}&seat=A&name=Ada&token=${token}&code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    render(<OnlinePage />)
    const main = await screen.findByRole('main')
    expect(main.querySelector('.byd-online-felt')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).not.toBe('')
  })

  it('/table has its main content, around the felt', async () => {
    const id = await createSession(run)
    history.replaceState(null, '', `/table?session=${id}&host=${encodeURIComponent(roomOf(id).hostKey)}&mode=table&server=${encodeURIComponent(run.url)}`)
    render(<TablePage />)
    const main = await screen.findByRole('main')
    expect(main.querySelector('.byd-table-frame')).toBeTruthy()
  })

  it('/play names each fold after its summary, and heads each area in the table fold by its name', async () => {
    // The recipe's table, which has an area in front of each seat to head.
    const id = await createSession(run, 's1', undefined, recipeSetup(2))
    const token = await admit(run, id, 'A', 'Ada')
    history.replaceState(null, '', `/play?session=${id}&seat=A&name=Ada&token=${token}&code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
    render(<PlayerPage />)
    await screen.findByRole('main')
    const folds = [...document.querySelectorAll('details')]
    expect(folds.length).toBeGreaterThan(0)
    for (const fold of folds) {
      const summary = fold.querySelector('summary')!.textContent!.trim()
      expect(screen.getByRole('group', { name: summary })).toBe(fold)
    }
    const table = document.querySelector('[data-phone-table]') as HTMLElement
    const areas = [...table.querySelectorAll('[data-zone-summary]:not(button)')]
    expect(areas.length).toBeGreaterThan(0)
    for (const area of areas) expect(within(area as HTMLElement).getByRole('heading').textContent?.trim()).not.toBe('')
  })
})
