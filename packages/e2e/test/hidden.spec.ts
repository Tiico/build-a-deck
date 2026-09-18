import { PHONE, TV } from '../support/devices.js'
import { cardsIn, mentions } from '../support/frames.js'
import { expect, test } from '../support/test.js'

// What one player may know about another, checked on the wire.
//
// This is the repo's own rule, and the reason for it is worth restating where the test lives:
// hidden information is verified on the network traffic, not on the screen, and a test that reads
// raw frames is the proof. A card missing from Ada's screen may still have been sent to Ada's
// browser — projected into a store her view does not read, drawn and hidden with CSS, or carried
// in a frame her client ignored. Every one of those passes a test that looks at the screen. Every
// one of them is a leak, because the bytes are on her machine and a console is one keystroke away.
//
// The secret is `cardRef`: which card this is. The projection replaces it with `null` for anyone
// who may not know (`project` in `packages/engine`). A component's own id travels to everybody and
// is a UUID, so "there is a card in that hand" and "that card is the Wolf" are never confused.
test.describe('what the table tells each person', () => {
  test('never sends one hand’s cards to another player, or to the screen the room can see', async ({ tableOf, player, open, host }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const bo = await player(table, { name: 'Bo', seat: 'B', device: PHONE })
    // The big screen is not a player, and it is the screen everyone in the room can see. It gets
    // its own watch, because a hand leaking *there* leaks to the whole room at once.
    const tv = await open(TV, table.tvUrl)

    const table_ = await host(table)
    await table_.send([{ v: 'shuffle', pile: 'draw' }])
    await table_.send([{ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 3 }])

    // Each phone shows three cards, which is how we know the deal landed before anything is
    // measured. Waiting on the screen and then reading the wire is deliberate: it waits for the
    // product to have finished, not for a number of milliseconds.
    await expect(ada.page.locator('[data-hand-card]')).toHaveCount(3)
    await expect(bo.page.locator('[data-hand-card]')).toHaveCount(3)

    const adasCards = cardsIn(ada.wire.received(), 'hand:A')
    const bosCards = cardsIn(bo.wire.received(), 'hand:B')

    // Non-vacuity first, and not as a formality. A leak test that searches for something no frame
    // could ever contain passes for ever and proves nothing, and this repo has shipped exactly
    // that shape before — every jsdom upload test sent the string "[object Blob]" and passed. So:
    // the identities exist, each player knows their own, and the search finds them where they
    // *should* be before it is trusted to say they are absent anywhere else.
    expect(adasCards, 'Ada is told which cards are in her own hand').toHaveLength(3)
    expect(bosCards, 'Bo is told which cards are in his own hand').toHaveLength(3)
    expect(adasCards.filter((c) => bosCards.includes(c)), 'the deal gave them different cards').toHaveLength(0)

    // Now the leak itself, over the whole of each client's traffic rather than over the frames a
    // cleverer test would have picked out. A dumb search is the point: the leaks worth catching
    // are the ones nobody predicted — a field added next month carrying the whole component, a
    // debug echo, a projection that forgot a seat.
    for (const card of bosCards) {
      expect(mentions(ada.wire.received(), card), `Ada was sent ${card}, which is in Bo’s hand`).toHaveLength(0)
      expect(mentions(tv.wire.received(), card), `the big screen was sent ${card}, which is in Bo’s hand`).toHaveLength(0)
    }
    for (const card of adasCards) {
      expect(mentions(bo.wire.received(), card), `Bo was sent ${card}, which is in Ada’s hand`).toHaveLength(0)
      expect(mentions(tv.wire.received(), card), `the big screen was sent ${card}, which is in Ada’s hand`).toHaveLength(0)
    }
  })

  test('never sends the draw pile’s order to anyone', async ({ tableOf, player, open, host }) => {
    // The deck is the other secret, and a different one: a hand is hidden from all but its owner,
    // while the draw pile is hidden from everyone at the table including the table itself. Its
    // zone has `visibility: 'none'`, so what every client may know is how many cards are in it.
    const table = await tableOf({ players: 2, cards: 10 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const tv = await open(TV, table.tvUrl)
    const table_ = await host(table)
    await table_.send([{ v: 'shuffle', pile: 'draw' }])
    await expect(ada.page.locator('[data-page="player"]')).toBeVisible()

    expect(cardsIn(ada.wire.received(), 'draw'), 'a player is told what is in the deck').toHaveLength(0)
    expect(cardsIn(tv.wire.received(), 'draw'), 'the big screen is told what is in the deck').toHaveLength(0)

    // And the count is known, because a deck nobody can count is a different bug — this is what
    // stops the assertion above from being satisfied by a client that was told nothing at all.
    const counted = ada.wire.received().some((f) => f.includes('"id":"draw"') && f.includes('"count"'))
    expect(counted, 'the deck is countable even though it is not readable (K15)').toBe(true)
  })

  test('reveals a card played into the open, and only then', async ({ tableOf, player, host }) => {
    // K11, both halves of it: into a public zone the card turns face-up as a hand would, and into
    // a hidden pile it stays down. The halves are tested together because apart they are each
    // half a fact — a suite that only checked the second could be passed by a table that reveals
    // nothing ever, which would be a game nobody can play rather than a game that keeps secrets.
    //
    // Ada plays the cards herself, from her own phone, because there is no other way it can
    // happen: the first test here proves the table screen is never told what is in a hand, so the
    // table screen cannot reach into one. The rule makes the journey rather than the journey
    // working around the rule.
    const table = await tableOf({ players: 2, cards: 8 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const bo = await player(table, { name: 'Bo', seat: 'B', device: PHONE })
    const table_ = await host(table)
    await table_.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 2 }])
    await expect(ada.page.locator('[data-hand-card]')).toHaveCount(2)

    const held = cardsIn(ada.wire.received(), 'hand:A')
    expect(held, 'Ada holds two cards and knows which').toHaveLength(2)

    // Into the discard, which everyone can read the order of. This is a reveal and not a leak:
    // the card turns over on the way, and being told what it is *is* the point of an open pile.
    await ada.page.locator('[data-hand-card]').first().tap()
    await ada.page.locator('.byd-hand-targets button[data-zone="discard"]').click()
    await expect(ada.page.locator('[data-hand-card]')).toHaveCount(1)
    const revealed = await bo.wire.until((f) => f.includes('"zone":"discard"') && f.includes('"face":"front"'))
    // Matched as the whole JSON string, for the reason `mentions` gives: `kort-1` is a prefix of
    // `kort-12`, and picking the wrong card here would make the next assertion meaningless.
    const shown = held.find((c) => revealed.includes(JSON.stringify(c)))
    expect(shown, 'Bo is told which card was discarded, because it was turned over').toBeDefined()

    // Now the other half. Back underneath the draw pile, which nobody can read — not Bo, not the
    // big screen, not the table itself. The card does not turn over, so nothing about it may
    // travel. This is the move a leak would hide in: it looks like the discard and is its
    // opposite.
    const secret = held.find((c) => c !== shown)!
    const beforeBo = bo.wire.received().length
    await ada.page.locator('[data-hand-card]').first().tap()
    await ada.page.locator('.byd-hand-targets button[data-zone="draw"]').click()
    await expect(ada.page.locator('[data-hand-card]'), 'her hand is empty').toHaveCount(0)

    // Bo is told the deck grew — the count is public (K15) — and told nothing else.
    await expect.poll(() => bo.wire.received().length, { message: 'Bo hears that the deck changed' }).toBeGreaterThan(beforeBo)
    expect(mentions(bo.wire.received(), secret), `Bo was sent ${secret}, which went back into the deck face down`).toHaveLength(0)
    expect(cardsIn(bo.wire.received(), 'draw'), 'nobody reads the deck').toHaveLength(0)
  })
})
