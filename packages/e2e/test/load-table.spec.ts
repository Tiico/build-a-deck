import { expect, test } from '@playwright/test'
import { makeTable } from '../support/api.js'
import { playTable } from '../load/table.js'

// The table the memory load test runs, three times over and on the box's stack (#1012). Here it
// runs once and short against the suite's own stack, which is what keeps it honest: a playtest
// whose intents the server had started refusing would still put load on it, and the line in DRIFT
// would be a measurement of a table that was not being played.
test('eight seats, a television and an observer play over real sockets, shuffles and rewinds included, and nothing is refused', async ({ request, baseURL }) => {
  // Twenty cards for eight seats: the draw pile runs out, and the table plays on from the discard
  // the way a group would rather than refusing every draw after it.
  const table = await makeTable(request, { players: 8, cards: 20 })
  const played = await playTable(baseURL ?? '', table, { intents: 60, pauseMs: 0 })
  expect(played.refused).toEqual([])
  expect(played.acked).toBe(60)
  expect(played.shuffles).toBeGreaterThanOrEqual(2)
  expect(played.rewinds).toBeGreaterThanOrEqual(1)
  // Every screen fetches what it is shown, as a browser does: the television the public cards,
  // each phone its own hand.
  expect(played.faces).toBeGreaterThan(0)
})
