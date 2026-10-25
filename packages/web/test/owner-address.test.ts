// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { TABLE_PROTOCOL } from '@byd/protocol'
import { onlineUrl, tvUrl } from '../src/editor/tableLinks.js'
import { takeHostKey } from '../src/table/hostKey.js'
import { TableClient, setWebSocketImplementation, type WebSocketCtor } from '../src/client.js'
import { dropOwnerName, hostSeatAt, rememberHostSeat } from '../src/hostSeat.js'

// The host key and the owner's name in no address (#1306, DRIFT §9), as the guest's token since
// #1278. The table's screen is opened with its key in the fragment, which the browser sends nowhere,
// and its socket hands the key over in `Sec-WebSocket-Protocol`. The owner's own seat has no name in
// its address: the browser that started the table remembers it, and else the table tells her.
afterEach(() => {
  history.replaceState(null, '', '/')
  localStorage.clear()
  setWebSocketImplementation(null)
})

describe('the ways to the table (#1306)', () => {
  it('puts the host key in the television’s fragment, never in its query', () => {
    const at = new URL(tvUrl('s1', null, 'K3y_-z', false, 'en'), 'http://x.invalid')
    expect(at.searchParams.has('host')).toBe(false)
    expect(at.search).not.toContain('K3y_-z')
    expect(at.hash).toBe('#host=K3y_-z')
    expect(at.searchParams.get('lang')).toBe('en')
  })

  it('names nobody in the owner’s own seat’s address', () => {
    const at = new URL(onlineUrl('s1', null, 'A', true, 'sv', { code: 'ABCDEF' }), 'http://x.invalid')
    expect([...at.searchParams.keys()].sort()).toEqual(['code', 'lang', 'owner', 'seat', 'session'])
    expect(at.hash).toBe('')
  })
})

describe('the television takes its key out of the address (#1306)', () => {
  it('reads the key from the fragment and leaves neither it nor the fragment behind', () => {
    history.replaceState({ kept: 1 }, '', '/table?session=s1&mode=tv#host=K1')
    const before = history.length
    expect(takeHostKey('s1')).toBe('K1')
    expect(location.search).toBe('?session=s1&mode=tv')
    expect(location.hash).toBe('')
    expect(history.length, 'replaced, not pushed').toBe(before)
    expect(history.state).toEqual({ kept: 1 })
    // Kept in the tab: a reload, whose address holds no key, still has it.
    expect(takeHostKey('s1')).toBe('K1')
  })

  it('still takes a key from an old link’s query', () => {
    history.replaceState(null, '', '/table?session=s1&host=K0&mode=tv')
    expect(takeHostKey('s1')).toBe('K0')
    expect(location.search).toBe('?session=s1&mode=tv')
  })
})

describe('the table’s socket says no secret in its address (#1306)', () => {
  const opened: { url: string; protocols: string[] | undefined }[] = []
  class Recording {
    readonly readyState = 0
    readonly OPEN = 1
    constructor(url: string, protocols?: string[]) {
      opened.push({ url, protocols })
    }
    // Never opened: the address and the protocols are all this socket is asked for.
    send = (): undefined => undefined
    close = (): undefined => undefined
    addEventListener = (): undefined => undefined
  }
  afterEach(() => {
    opened.length = 0
  })

  it('hands the host key over in the protocol header', () => {
    setWebSocketImplementation(Recording as unknown as WebSocketCtor)
    TableClient.connect({ url: 'ws://box', sessionId: 's1', seat: null, host: 'K3y' }).close()
    expect(opened).toHaveLength(1)
    expect(opened[0]?.url).toBe('ws://box/sessions/s1')
    expect(opened[0]?.protocols).toEqual([TABLE_PROTOCOL, 'deckster.host.K3y'])
  })

  it('offers the table’s protocol from the owner’s own seat, and no name', () => {
    setWebSocketImplementation(Recording as unknown as WebSocketCtor)
    TableClient.connect({ url: 'ws://box', sessionId: 's1', seat: 'A', owner: true }).close()
    expect(opened[0]?.url).toBe('ws://box/sessions/s1?seat=A&owner=1')
    expect(opened[0]?.protocols).toEqual([TABLE_PROTOCOL])
  })
})

describe('the owner’s own seat (#1306)', () => {
  it('drops a name an old link carried, in the same history entry', () => {
    history.replaceState({ kept: 1 }, '', '/online?session=s1&seat=A&name=Vera&owner=1&code=ABCDEF')
    const before = history.length
    dropOwnerName()
    expect(new URLSearchParams(location.search).toString()).toBe('session=s1&seat=A&owner=1&code=ABCDEF')
    expect(history.length).toBe(before)
    expect(history.state).toEqual({ kept: 1 })
  })

  it('remembers the name she sat down under, by table', () => {
    rememberHostSeat('s1', { seat: 'A', name: 'Vera' })
    expect(hostSeatAt('s1')).toEqual({ seat: 'A', name: 'Vera' })
    expect(hostSeatAt('s2')).toBeNull()
  })
})
