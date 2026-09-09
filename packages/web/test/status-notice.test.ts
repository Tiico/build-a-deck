import { describe, expect, it } from 'vitest'
import { STATUS_KEYS, blocksView, noticeFor, refusal, refusalText, VOICES } from '../src/status/notice.js'

// One model, nine states, three voices (#12, #7). The model is what every route shares; the
// wording is what each route is allowed to change.
describe('the family of states', () => {
  it('names exactly the nine states the two issues describe between them', () => {
    expect(STATUS_KEYS).toEqual(['loading', 'slow', 'missing', 'forbidden', 'offline', 'connecting', 'dropped', 'resumed', 'refused'])
  })

  it('separates the three states that happen on top of a view from the six that replace one', () => {
    const over = STATUS_KEYS.filter((k) => !blocksView(k))
    expect(over).toEqual(['dropped', 'resumed', 'refused'])
  })
})

describe('one tone per state, whichever route asks', () => {
  it.each(VOICES)('says every state in Swedish with no server text in it (%s)', (voice) => {
    for (const state of STATUS_KEYS) {
      const notice = noticeFor(state, voice)
      expect({ state, heading: notice.heading.length > 0 }).toEqual({ state, heading: true })
      // Nothing in the family may leak an English sentence from a server or a stack.
      expect(`${notice.heading} ${notice.text}`).not.toMatch(/unknown |could not |not logged in|Error|undefined/)
    }
  })

  it.each(VOICES)('keeps assertive for what stopped being true and polite for what is merely waiting (%s)', (voice) => {
    const live = Object.fromEntries(STATUS_KEYS.map((state) => [state, noticeFor(state, voice).live]))
    expect(live).toEqual({
      loading: 'polite',
      slow: 'polite',
      connecting: 'polite',
      resumed: 'polite',
      missing: 'assertive',
      forbidden: 'assertive',
      offline: 'assertive',
      dropped: 'assertive',
      refused: 'assertive',
    })
  })

  it.each(VOICES)('retries only what waiting can fix; a 404 done again is still a 404 (%s)', (voice) => {
    const retryable = STATUS_KEYS.filter((state) => noticeFor(state, voice).retryable)
    expect(retryable).toEqual(['loading', 'slow', 'offline', 'connecting', 'dropped'])
  })
})

describe('the way out of a state', () => {
  it.each(VOICES)('never offers a reload, only a retry, a login or a way home (%s)', (voice) => {
    for (const state of STATUS_KEYS) {
      for (const action of noticeFor(state, voice).actions) {
        expect({ state, kind: action.kind }).toEqual({ state, kind: expect.stringMatching(/^(retry|login|home|rescan)$/) })
        expect(action.label).not.toMatch(/ladda om|uppdatera sidan/i)
      }
    }
  })

  it.each(VOICES)('offers a login and a way on when the thing exists but is not yours (%s)', (voice) => {
    expect(noticeFor('forbidden', voice).actions.map((a) => a.kind)).toContain('login')
  })

  it.each(VOICES)('always leaves a way out of a state a person has to decide about (%s)', (voice) => {
    for (const state of ['missing', 'forbidden', 'offline', 'slow'] as const) {
      const kinds = noticeFor(state, voice).actions.map((a) => a.kind)
      expect({ state, out: kinds.some((k) => k === 'home' || k === 'rescan') }).toEqual({ state, out: true })
    }
  })

  it('never offers a way out of a state that is about to fix itself', () => {
    for (const voice of VOICES) {
      expect(noticeFor('loading', voice).actions).toEqual([])
      expect(noticeFor('connecting', voice).actions).toEqual([])
      expect(noticeFor('resumed', voice).actions).toEqual([])
    }
  })
})

describe('each route says the same state in its own words', () => {
  it('names what is missing rather than what a route is', () => {
    expect(noticeFor('missing', 'editor').heading).toMatch(/spelet/i)
    // The glossary's word for the surface people play on is `bordet` (A4); `rummet` was the
    // code's own vocabulary and went out with #38, which these two voices had not yet heard.
    expect(noticeFor('missing', 'table').heading).toMatch(/bordet/i)
    expect(noticeFor('missing', 'phone').heading).toMatch(/bordet/i)
    // The QR on the TV is the phone's real way back in, and it is a thing to do rather than a
    // link to press, so it is said in the sentence and not offered as a control.
    expect(noticeFor('missing', 'phone').text).toMatch(/QR-koden/)
    expect(noticeFor('forbidden', 'phone').actions.map((a) => a.kind)).toContain('rescan')
  })

  it('tells the reader what is safe while the line is down, in the terms of that route', () => {
    expect(noticeFor('dropped', 'editor').text).toMatch(/osparat|sparat/i)
    expect(noticeFor('dropped', 'phone').text).toMatch(/frånkopplad|kommer fram|handen/i)
  })
})

// The server answers a refused envelope with a developer's sentence in English. It is a fact
// about an intent, not a message to a person, so it never reaches the screen as it stands.
describe('a refusal in the reader s language', () => {
  it.each([
    ['not connected', /uppkopplad/i],
    ['connection lost', /anslutningen bröts/i],
    ['session has ended', /avslutat/i],
    ['an observer can only flag', /observatör/i],
    ['envelope seat does not match connection seat', /annan plats/i],
    ['pile draw is empty', /tom/i],
    ['zone draw has fewer than 5 components', /så många kort/i],
    ['card-standard-63x88 cannot be flipped', /vändas/i],
    ['unknown component c9', /finns inte/i],
  ])('says %s as a Swedish sentence', (reason, expected) => {
    expect(refusalText(reason)).toMatch(expected)
  })

  it('falls back to a sentence of its own rather than repeating a reason it does not know', () => {
    const said = refusalText('validated undo.self but no target')
    expect(said).not.toContain('undo.self')
    expect(said).toMatch(/^[A-ZÅÄÖ]/)
  })

  it('carries the reason into the refused notice so a control can show it where it happened', () => {
    expect(refusal('session has ended', 'phone').text).toMatch(/avslutat/i)
    expect(refusal('session has ended', 'phone').live).toBe('assertive')
  })
})
