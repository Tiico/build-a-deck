// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { guestAddress, landingWith, takeGuestToken } from '../src/guestAddress.js'

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

  // The designer's own seat in the editor's links (`owner=1`) has no admission: the name is hers,
  // and the only one the server has for her.
  it('keeps the name of the owner’s own seat, which has no admission to be told it from', () => {
    history.replaceState(null, '', '/online?session=s1&seat=A&name=Bo&owner=1')
    expect(takeGuestToken()).toBeUndefined()
    expect(new URLSearchParams(location.search).get('name')).toBe('Bo')
  })

  // An old claim link carries the token twice: its own, and the one in the page it goes back to.
  it('cleans the page an old claim link goes back to as well', () => {
    const next = '/play?session=s1&seat=A&name=Ada&token=T1'
    history.replaceState(null, '', `/claim?${new URLSearchParams({ token: 'T1', next }).toString()}`)
    expect(takeGuestToken()).toBe('T1')
    expect(location.search).not.toContain('T1')
    expect(location.search).not.toContain('Ada')
    expect(new URLSearchParams(location.search).get('next')).toBe('/play?session=s1&seat=A')
    expect(location.hash).toBe('#token=T1')
  })

  it('takes the token from the page a claim link goes back to when the link has none of its own', () => {
    history.replaceState(null, '', `/claim?${new URLSearchParams({ next: '/play?session=s1&seat=A&token=T2' }).toString()}`)
    expect(takeGuestToken()).toBe('T2')
    expect(location.hash).toBe('#token=T2')
  })

  // Where a claim or a login lands: its query gains what it is told, and the fragment it is
  // carried with is its own.
  it('lands on a page with a mark in its query and the fragment after', () => {
    expect(landingWith('/play?session=s1&seat=A', { saved: '1' }, '#token=T1')).toBe('/play?session=s1&seat=A&saved=1#token=T1')
    expect(landingWith('/play', { saved: '1' }, '')).toBe('/play?saved=1')
    expect(landingWith('/login?next=%2F', {}, '#token=T1')).toBe('/login?next=%2F#token=T1')
  })
})
