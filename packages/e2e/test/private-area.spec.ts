import type { APIRequestContext } from '@playwright/test'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf as tableFromSetup, type Table } from '../support/api.js'
import { PHONE, TV } from '../support/devices.js'
import { cardsIn, mentions } from '../support/frames.js'
import { cardTitle, gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// What the area in front of a seat says about itself, and to whom (#414).
//
// Two decisions meet here, and they are not the same decision. The opening table's area is public
// (L48): the phone's primary green button is «Framför mig», and the reasonable expectation after
// playing a card around a television is that the card is seen — so the identity leaves the server
// to every client, which is a real change in what the wire carries and not a drawing. An area the
// designer sets back to `owner` is private as it always was (decision B, #437): the felt draws how
// many and never which.
//
// The half about hidden information is checked where this repo checks hidden information: on the
// raw frames and not on the screen. Both directions are checked, because a leak test that cannot
// find an identity when one is there says nothing when it finds none.

test.describe('the area in front of a seat, on the opening table', () => {
  test('is public: the cards lie face up on the felt and their identities travel to everyone', async ({ tableOf, player, open }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const bo = await player(table, { name: 'Bo', seat: 'B', device: PHONE })
    const tv = await open(TV, table.tvUrl)

    const mine = tv.page.locator('[data-area="mine:A"]')
    await expect(mine).toBeVisible()
    const faceUp = tv.page.locator('.byd-card[data-component][data-face="front"]')

    for (let n = 1; n <= 3; n++) {
      await ada.page.locator('[data-zone-draw="draw"]').click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(1)
      await ada.page.getByRole('button', { name: 'Framför mig' }).click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(0)
      // The television draws the cards themselves, face up. `playIntents` turns them over by
      // itself, because it already had the branch for a public target zone.
      await expect(faceUp).toHaveCount(n)
    }
    // And therefore not the count badge, which is what an area nobody may look into says instead.
    await expect(mine.locator('[data-area-count]')).toHaveCount(0)

    // The wire says the same. Ada is told which cards are hers — non-vacuity, so the searches
    // below are known to be able to find these identities at all — and so is everybody else.
    expect(cardsIn(ada.wire.received(), 'mine:A'), 'Ada is told which cards lie in her own area').toHaveLength(3)
    expect(cardsIn(tv.wire.received(), 'mine:A'), 'the television is told the same three').toHaveLength(3)
    expect(cardsIn(bo.wire.received(), 'mine:A'), 'Bo is told the same three').toHaveLength(3)
    // Not only the identities: the titles ride along, which is what makes the area readable from
    // across the room at all (B6 — the face a seat may fetch and the word it may hear are one
    // question and follow the zone together).
    const named = Array.from({ length: 16 }, (_, i) => cardTitle(i)).filter((title) => mentions(tv.wire.received(), title).length > 0)
    expect(named.length, 'the television is told the titles of the cards lying in the area').toBeGreaterThanOrEqual(3)
  })

  test('stands in another seat’s overview, and is still not somewhere that seat may play', async ({ tableOf, player }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const bo = await player(table, { name: 'Bo', seat: 'B', device: PHONE })

    await ada.page.locator('[data-zone-draw="draw"]').click()
    await expect(ada.page.locator('[data-hand-card]')).toHaveCount(1)
    await ada.page.getByRole('button', { name: 'Framför mig' }).click()
    await expect(ada.page.locator('[data-hand-card]')).toHaveCount(0)

    // Bo's browser has been sent the card, so Bo's screen says so. An area that is public on one
    // screen and absent from another is the state this half of #414 was reopened about. It is in
    // the fold that carries the whole table (C4), reached the way a person reaches it — and by
    // the fold's own marker rather than its heading, which is a translation (A4).
    await bo.page.locator('[data-phone-table] > summary').click()
    // The zone's name is the designer's and is never translated; the count beside it is the
    // reader's language, so it is read as the number it is and not as the sentence around it.
    const tile = bo.page.locator('[data-phone-table] [data-zone-summary="mine:A"]')
    await expect(tile.locator('strong')).toHaveText('Framför A')
    await expect(tile.locator('span')).toHaveText(/^1\b/)
    // Reading it is not playing into it: the sheet offers Bo's own area and never Ada's (C4).
    await expect(bo.page.locator('[data-zone="mine:A"]')).toHaveCount(0)
    await expect(bo.page.locator('[data-zone="mine:B"]')).toHaveCount(1)
  })
})

test.describe('an area the designer keeps private', () => {
  test('says how many cards lie in it, and still never says which', async ({ request, player, open }) => {
    const table = await tableWithPrivateArea(request)
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const bo = await player(table, { name: 'Bo', seat: 'B', device: PHONE })
    const tv = await open(TV, table.tvUrl)

    const mine = tv.page.locator('[data-area="mine:A"]')
    const empty = tv.page.locator('[data-area="mine:B"]')
    await expect(mine).toBeVisible()

    // Before anything is played, the two areas say the same thing — which is the state the issue
    // complained about persisting after three cards had gone in.
    await expect(mine.locator('[data-area-count]')).toHaveCount(0)

    for (let n = 1; n <= 3; n++) {
      await ada.page.locator('[data-zone-draw="draw"]').click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(1)
      await ada.page.getByRole('button', { name: 'Framför mig' }).click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(0)
      // The felt says the new number, and says it on the television without anyone asking.
      await expect(mine.locator('[data-area-count]')).toHaveText(String(n))
    }

    // An area nobody has played into is still silent: the number is a difference, not decoration.
    await expect(empty.locator('[data-area-count]')).toHaveCount(0)
    // And no card of hers is drawn on the big screen at all.
    await expect(tv.page.locator('.byd-card[data-component]')).toHaveCount(0)

    // And the other half (B6). Ada is told which cards are hers, and nobody else ever is.
    const hers = cardsIn(ada.wire.received(), 'mine:A')
    expect(hers, 'Ada is told which cards lie in her own area').toHaveLength(3)
    for (const card of hers) {
      expect(mentions(tv.wire.received(), card), `the big screen was sent ${card}, which lies in Ada’s private area`).toHaveLength(0)
      expect(mentions(bo.wire.received(), card), `Bo was sent ${card}, which lies in Ada’s private area`).toHaveLength(0)
    }
    // Bo's overview leaves it out too: an area Bo may not look into is not a tile on Bo's phone,
    // not even in the fold that carries the whole table.
    await bo.page.locator('[data-phone-table] > summary').click()
    await expect(bo.page.locator('[data-phone-table] [data-zone-summary="mine:B"]')).toHaveCount(1)
    await expect(bo.page.locator('[data-zone-summary="mine:A"]')).toHaveCount(0)
  })
})

/**
 * The opening table with one area taken back: `mine:A` set to `owner`, which is what a designer
 * does in the editor to an area the recipe gave them. Everything else is the recipe's, so the one
 * word the decision is about is the only thing that differs between this table and the one above.
 */
async function tableWithPrivateArea(request: APIRequestContext): Promise<Table> {
  const doc = gameDoc({ players: 4, cards: 16 })
  const kept = { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === 'mine:A' ? { ...z, visibility: 'owner' as const } : z)) } }
  return tableFromSetup(request, setupFromProject(kept), deckFromProject(kept))
}
