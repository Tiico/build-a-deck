import { logIn } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'

// The raw door, `POST /sessions`, on the app as the box runs it (#1194). It made a table out of any
// setup and deck for anybody, and queued its textures for the box's one Chromium: a way for anyone
// at all to put work on the box, and a way round every ceiling on tables and renders (A2). With
// accounts on — and the box always has them — it opens nothing for nobody, and the account that
// knocks bears the table.
test.describe('the raw door (#1194)', () => {
  const body = () => {
    const doc = gameDoc({ players: 2, cards: 4 })
    return { version: 'e2e', setup: setupFromProject(doc), deck: deckFromProject(doc) }
  }

  test('opens no table for nobody', async ({ playwright, baseURL }) => {
    // A context of its own, with no cookie in it: a stranger, and nothing the suite gave her.
    const stranger = await playwright.request.newContext({ baseURL: baseURL! })
    try {
      const res = await stranger.post('/sessions', { data: body() })
      expect(res.status()).toBe(401)
      expect(await res.json()).toEqual({ error: 'log in first' })
    } finally {
      await stranger.dispose()
    }
  })

  test('opens a table for an account, as it always did', async ({ playwright, baseURL }) => {
    const designer = await playwright.request.newContext({ baseURL: baseURL! })
    try {
      await logIn(designer)
      const res = await designer.post('/sessions', { data: body() })
      expect(res.status()).toBe(201)
      const { id, code } = (await res.json()) as { id: string; code: string }
      const room = await designer.get(`/rooms/${code}`)
      expect(room.status()).toBe(200)
      expect(await room.json()).toMatchObject({ session: id })
    } finally {
      await designer.dispose()
    }
  })
})
