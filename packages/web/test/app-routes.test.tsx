// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { App, loadPage } from '../src/App.js'

// The address asks for Swedish, because that is what these expectations are written in. Before
// #27 it made no difference: the tab and the 404 were Swedish whoever was reading. Now they are
// not, so a test that wants Swedish has to be a Swedish reader.
async function open(path: string) {
  history.replaceState(null, '', `${path}${path.includes('?') ? '&' : '?'}lang=sv`)
  render(<App Page={await loadPage()} />)
}

// Until #12 an unknown path fell through to the start page, so a mistyped link showed someone
// else's games and said nothing at all about the page not existing.
describe('a path nothing serves', () => {
  it('says the page does not exist instead of quietly showing the start page', async () => {
    await open('/spel/4KJ2')
    expect(await screen.findByRole('heading', { name: /hittar inte|finns inte/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Mina spel' })).toBeNull()
  })

  // To the start page, which is what `/` is for whoever is not known to be signed in (#475).
  it('offers a way home without reloading anything', async () => {
    await open('/spel/4KJ2')
    const home = await screen.findByRole('link', { name: /till startsidan/i })
    expect(home.getAttribute('href')).toBe('/')
  })

  it('names the page in the tab', async () => {
    await open('/spel/4KJ2')
    await waitFor(() => expect(document.title).toBe('Sidan finns inte · Deckster'))
  })
})

describe('every main route names itself in the tab', () => {
  it.each([
    ['/login', 'Logga in · Deckster'],
    ['/new', 'Nytt spel · Deckster'],
    // The guide behind the crossroads' first door has an address of its own (L79).
    ['/new/guided', 'Nytt spel · Deckster'],
    // A report of a picture once said the page did not exist (#1351).
    ['/villkor/anmal', 'Anmäl en bild · Deckster'],
    ['/survey', 'Enkäten · Deckster'],
  ])('titles %s', async (path, title) => {
    await open(path)
    await waitFor(() => expect(document.title).toBe(title))
  })

  it('titles the report page in English for an English reader (#1351)', async () => {
    history.replaceState(null, '', '/villkor/anmal?lang=en')
    render(<App Page={await loadPage()} />)
    await waitFor(() => expect(document.title).toBe('Report a picture · Deckster'))
  })

  // What the room's own title looks like once it is up is proved against a real server in
  // `status-routes.test.tsx`; here the point is that the state wins over the route while there
  // is one, so a tab never claims to hold a room it has not reached.
  it('lets the state of a session route win over the route while it is still connecting', async () => {
    await open('/table?session=4KJ2')
    await waitFor(() => expect(document.title).toBe('Ansluter · Deckster'))
  })
})
