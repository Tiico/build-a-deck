// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { guestAddress, takeGuestToken } from '../src/guestAddress.js'

// A guest's token and name never travel in an address (#1278). The token lives in the page's
// fragment, which the browser sends nowhere; the name is the admission's, told by the table. An old
// link with either in its query still opens the same place, and leaves a history entry without them.
afterEach(() => {
  history.replaceState(null, '', '/')
})

describe('the guest’s address (#1278)', () => {
  it('puts the token in the fragment, and the table and seat in the query', () => {
    const at = new URL(guestAddress('/play', new URLSearchParams({ session: 's1', code: 'ABCDEF', seat: 'A' }), 'tok-en_1'), 'http://x.invalid')
    expect(at.pathname).toBe('/play')
    expect([...at.searchParams.keys()]).toEqual(['session', 'code', 'seat'])
    expect(at.hash).toBe('#token=tok-en_1')
  })

  it('reads the token from the fragment and leaves the address alone', () => {
    history.replaceState(null, '', '/play?session=s1&seat=A#token=T1')
    const before = history.length
    expect(takeGuestToken()).toBe('T1')
    expect(location.search).toBe('?session=s1&seat=A')
    expect(location.hash).toBe('#token=T1')
    expect(history.length).toBe(before)
  })

  it('moves an old link’s token to the fragment and drops its name, in the same history entry', () => {
    history.replaceState({ kept: 1 }, '', '/play?session=s1&seat=A&name=Ada&token=T1&server=ws%3A%2F%2Fapi')
    const before = history.length
    expect(takeGuestToken()).toBe('T1')
    expect(location.pathname).toBe('/play')
    expect(new URLSearchParams(location.search).toString()).toBe('session=s1&seat=A&server=ws%3A%2F%2Fapi')
    expect(location.hash).toBe('#token=T1')
    expect(history.length, 'replaced, not pushed').toBe(before)
    expect(history.state).toEqual({ kept: 1 })
  })
})
