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
  ])('reads %s as %s', (path, route) => {
    expect(routeOf(path)).toBe(route)
  })

  it('reads a path nothing serves as its own route rather than as the start page', () => {
    expect(routeOf('/spel/4KJ2')).toBe('unknown')
    expect(routeOf('/table/')).toBe('unknown')
  })

  // A prototype is a page that exists but is not the product, so its tab says neither.
  it('reads a prototype as a prototype', () => {
    expect(routeOf('/prototype/groups')).toBe('prototype')
    expect(documentTitle('prototype', {})).toBe('Prototyp · build-your-deck')
  })
})

describe('the title of a route', () => {
  it.each([
    ['home', {}, 'Mina spel · build-your-deck'],
    ['login', {}, 'Logga in · build-your-deck'],
    ['new', {}, 'Nytt spel · build-your-deck'],
    ['claim', {}, 'Spara bordet · build-your-deck'],
    ['editor', { game: 'Skogens herrar' }, 'Skogens herrar · Editor · build-your-deck'],
    ['table', { room: '4KJ2' }, 'Bordet · Rum 4KJ2 · build-your-deck'],
    ['join', { room: '4KJ2' }, 'Gå med i rum 4KJ2 · build-your-deck'],
    ['play', { room: '4KJ2' }, 'Din hand · Rum 4KJ2 · build-your-deck'],
    ['online', { room: '4KJ2' }, 'Spela · Rum 4KJ2 · build-your-deck'],
    ['observe', { room: '4KJ2' }, 'Tittar på rum 4KJ2 · build-your-deck'],
    ['unknown', {}, 'Sidan finns inte · build-your-deck'],
  ] as const)('titles %s', (route, opts, expected) => {
    expect(documentTitle(route, opts)).toBe(expected)
  })

  it('leaves out the room and the game rather than writing an empty gap', () => {
    expect(documentTitle('table', {})).toBe('Bordet · build-your-deck')
    expect(documentTitle('editor', {})).toBe('Editor · build-your-deck')
  })
})

// The tab has to say the truth about a screen nobody is looking at, so the state wins over the
// route while there is one.
describe('the title while something is wrong', () => {
  it.each([
    ['loading', 'table', 'Laddar · build-your-deck'],
    ['slow', 'table', 'Laddar · build-your-deck'],
    ['connecting', 'table', 'Ansluter · build-your-deck'],
    ['missing', 'editor', 'Spelet finns inte · build-your-deck'],
    // The glossary calls the surface people play on `bordet` (A4); the tab had kept `rummet`.
    ['missing', 'play', 'Bordet finns inte · build-your-deck'],
    ['missing', 'home', 'Sidan finns inte · build-your-deck'],
    ['forbidden', 'editor', 'Ingen tillgång · build-your-deck'],
    ['offline', 'play', 'Ingen kontakt · build-your-deck'],
    ['dropped', 'play', 'Frånkopplad · build-your-deck'],
  ] as const)('says %s on %s', (state, route, expected) => {
    expect(documentTitle(route, { state, room: '4KJ2', game: 'Skogens herrar' })).toBe(expected)
  })

  it('leaves the route s own title alone for the two states that change nothing about the page', () => {
    expect(documentTitle('play', { state: 'resumed', room: '4KJ2' })).toBe('Din hand · Rum 4KJ2 · build-your-deck')
    expect(documentTitle('play', { state: 'refused', room: '4KJ2' })).toBe('Din hand · Rum 4KJ2 · build-your-deck')
  })

  it('never puts the word fel in the tab; that belongs in the view and in the live region', () => {
    expect(documentTitle('play', { state: 'offline', room: '4KJ2' })).not.toMatch(/fel/i)
  })
})
