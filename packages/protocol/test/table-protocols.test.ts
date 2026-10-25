import { describe, expect, it } from 'vitest'
import { TABLE_PROTOCOL, guestProtocols, hostKeyOfProtocols, offersTableProtocol, tableProtocols, tokenOfProtocols } from '../src/index.js'

// The secrets a table's socket carries ride in `Sec-WebSocket-Protocol` and not in its address
// (#1278, #1306, DRIFT §9): beside the table's own protocol, as `deckster.token.<…>` for a guest and
// `deckster.host.<…>` for the table's screen.
describe('the table’s protocols (#1306)', () => {
  it('offers the table’s own protocol, and each secret beside it', () => {
    expect(tableProtocols()).toEqual([TABLE_PROTOCOL])
    expect(tableProtocols({ host: 'K3y_-z' })).toEqual([TABLE_PROTOCOL, 'deckster.host.K3y_-z'])
    expect(guestProtocols('T0k')).toEqual([TABLE_PROTOCOL, 'deckster.token.T0k'])
  })

  // A protocol name the browser cannot say makes `new WebSocket` throw; such a key is not the
  // table's anyway, and the door says the key is wanted.
  it('leaves out a secret that is no protocol name', () => {
    expect(tableProtocols({ host: 'two words' })).toEqual([TABLE_PROTOCOL])
    expect(tableProtocols({ host: '' })).toEqual([TABLE_PROTOCOL])
  })

  it('reads each secret back from the header as a server is given it', () => {
    const header = tableProtocols({ token: 'T0k', host: 'K3y' }).join(', ')
    expect(tokenOfProtocols(header)).toBe('T0k')
    expect(hostKeyOfProtocols(header)).toBe('K3y')
    expect(hostKeyOfProtocols('deckster, deckster.host.')).toBeNull()
    expect(hostKeyOfProtocols(undefined)).toBeNull()
  })

  it('tells a client that speaks the protocol from one loaded before it', () => {
    expect(offersTableProtocol('deckster')).toBe(true)
    expect(offersTableProtocol(undefined)).toBe(false)
    expect(offersTableProtocol('deckster.host.K3y')).toBe(false)
  })
})
