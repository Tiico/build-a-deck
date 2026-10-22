import { describe, expect, it } from 'vitest'
import { documentTitle, routeOf } from '../src/status/title.js'

// Every main route says which page it is (#12). The name comes first because a tab is clipped
// from the right, and the app's own separator is the one already used across the product.
describe('which route a path is', () => {
  it.each([
    ['/', 'home'],
    ['/login', 'login'],
    ['/new', 'new'],
    ['/claim', 'claim'],
    ['/editor', 'editor'],
    ['/table', 'table'],
    ['/join', 'join'],
    ['/play', 'play'],
    ['/online', 'online'],
    ['/observe', 'observe'],
    ['/profile', 'profile'],
  ])('reads %s as %s', (path, route) => {
    expect(routeOf(path)).toBe(route)
  })

  // The link in an invitation mail is a page of its own (#475), and its tab is not "the page does
  // not exist" while the invitation is being opened.
  it('reads an invitation link as the invitation, whatever its token', () => {
    expect(routeOf('/invites/abc_DEF-123')).toBe('invite')
    expect(documentTitle('invite', {})).toBe('Inbjudan · Deckster')
    expect(routeOf('/invites')).toBe('unknown')
  })

  it('reads a path nothing serves as its own route rather than as the start page', () => {
    expect(routeOf('/spel/4KJ2')).toBe('unknown')
    expect(routeOf('/table/')).toBe('unknown')
  })

  // A prototype is a page that exists but is not the product, so its tab says neither.
  it('reads a prototype as a prototype', () => {
    expect(routeOf('/prototype/groups')).toBe('prototype')
    expect(documentTitle('prototype', {})).toBe('Prototyp · Deckster')
  })
})

describe('the title of a route', () => {
  it.each([
    ['home', {}, 'Mina spel · Deckster'],
    ['landing', {}, 'Bygg ditt kortspel · Deckster'],
    ['login', {}, 'Logga in · Deckster'],
    ['new', {}, 'Nytt spel · Deckster'],
    ['claim', {}, 'Spara bordet · Deckster'],
    ['profile', {}, 'Profil · Deckster'],
    ['editor', { game: 'Skogens herrar' }, 'Skogens herrar · Editor · Deckster'],
    ['table', { room: '4KJ2' }, 'Bordet · Rum 4KJ2 · Deckster'],
    ['join', { room: '4KJ2' }, 'Gå med i rum 4KJ2 · Deckster'],
    ['play', { room: '4KJ2' }, 'Din hand · Rum 4KJ2 · Deckster'],
    // An ended table is not «Din hand» any more (#483): the phone is showing the survey.
    ['play', { room: '4KJ2', part: 'Bordet är avslutat' }, 'Bordet är avslutat · Rum 4KJ2 · Deckster'],
    ['online', { room: '4KJ2' }, 'Spela · Rum 4KJ2 · Deckster'],
    ['observe', { room: '4KJ2' }, 'Tittar på rum 4KJ2 · Deckster'],
    ['unknown', {}, 'Sidan finns inte · Deckster'],
  ] as const)('titles %s', (route, opts, expected) => {
    expect(documentTitle(route, opts)).toBe(expected)
  })

  // Seven tabs of the same editor used to be seven browser tabs with the same name (#477): the
  // part of the editor that is open stands where the word «Editor» stood.
  it('names the part of the editor that is open', () => {
    expect(documentTitle('editor', { game: 'Skogens herrar', part: 'Tabell' })).toBe('Skogens herrar · Tabell · Deckster')
  })

  // A guest is never told the code (DRIFT §9); the game's name is what they know the table by (#759).
  it.each([
    ['observe', 'Tittar på Skogens herrar · Deckster'],
    ['play', 'Din hand · Skogens herrar · Deckster'],
    ['online', 'Spela · Skogens herrar · Deckster'],
    ['table', 'Bordet · Skogens herrar · Deckster'],
  ] as const)('names %s by the game when there is no code', (route, expected) => {
    expect(documentTitle(route, { game: 'Skogens herrar' })).toBe(expected)
  })

  it('names the room by its code when there is one, even with the game known', () => {
    expect(documentTitle('observe', { room: '4KJ2', game: 'Skogens herrar' })).toBe('Tittar på rum 4KJ2 · Deckster')
  })

  // D5: every state its own title; the TV kept «Bordet · Rum …» over its summary (#717).
  it('says the table has ended on the table screen too', () => {
    expect(documentTitle('table', { room: 'Q6RN2C', part: 'Bordet är avslutat' })).toBe('Bordet är avslutat · Rum Q6RN2C · Deckster')
  })

  it('says the game on an ended phone without a code', () => {
    expect(documentTitle('play', { game: "Sal's Saloon", part: 'Bordet är avslutat' })).toBe("Bordet är avslutat · Sal's Saloon · Deckster")
  })

  it('leaves out the room and the game rather than writing an empty gap', () => {
    expect(documentTitle('table', {})).toBe('Bordet · Deckster')
    expect(documentTitle('editor', {})).toBe('Editor · Deckster')
  })
})

// The tab has to say the truth about a screen nobody is looking at, so the state wins over the
// route while there is one.
describe('the title while something is wrong', () => {
  it.each([
    ['loading', 'table', 'Laddar · Deckster'],
    ['slow', 'table', 'Laddar · Deckster'],
    ['connecting', 'table', 'Ansluter · Deckster'],
    ['missing', 'editor', 'Spelet finns inte · Deckster'],
    // The glossary calls the surface people play on `bordet` (A4); the tab had kept `rummet`.
    ['missing', 'play', 'Bordet finns inte · Deckster'],
    ['missing', 'home', 'Sidan finns inte · Deckster'],
    ['forbidden', 'editor', 'Ingen åtkomst · Deckster'],
    ['offline', 'play', 'Ingen anslutning · Deckster'],
    ['dropped', 'play', 'Frånkopplad · Deckster'],
  ] as const)('says %s on %s', (state, route, expected) => {
    expect(documentTitle(route, { state, room: '4KJ2', game: 'Skogens herrar' })).toBe(expected)
  })

  it('leaves the route s own title alone for the two states that change nothing about the page', () => {
    expect(documentTitle('play', { state: 'resumed', room: '4KJ2' })).toBe('Din hand · Rum 4KJ2 · Deckster')
    expect(documentTitle('play', { state: 'refused', room: '4KJ2' })).toBe('Din hand · Rum 4KJ2 · Deckster')
  })

  it('never puts the word fel in the tab; that belongs in the view and in the live region', () => {
    expect(documentTitle('play', { state: 'offline', room: '4KJ2' })).not.toMatch(/fel/i)
  })
})
