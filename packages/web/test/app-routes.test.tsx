// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { App } from '../src/App.js'

function open(path: string) {
  history.replaceState(null, '', path)
  render(<App />)
}

// Until #12 an unknown path fell through to the start page, so a mistyped link showed someone
// else's games and said nothing at all about the page not existing.
describe('a path nothing serves', () => {
  it('says the page does not exist instead of quietly showing the start page', async () => {
    open('/spel/4KJ2')
    expect(await screen.findByRole('heading', { name: /hittar inte|finns inte/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Mina spel' })).toBeNull()
  })

  it('offers a way home without reloading anything', async () => {
    open('/spel/4KJ2')
    const home = await screen.findByRole('link', { name: /mina spel/i })
    expect(home.getAttribute('href')).toBe('/')
  })

  it('names the page in the tab', async () => {
    open('/spel/4KJ2')
    await waitFor(() => expect(document.title).toBe('Sidan finns inte · build-your-deck'))
  })
})

describe('every main route names itself in the tab', () => {
  it.each([
    ['/login', 'Logga in · build-your-deck'],
    ['/new', 'Nytt spel · build-your-deck'],
  ])('titles %s', async (path, title) => {
    open(path)
    await waitFor(() => expect(document.title).toBe(title))
  })

  // What the room's own title looks like once it is up is proved against a real server in
  // `status-routes.test.tsx`; here the point is that the state wins over the route while there
  // is one, so a tab never claims to hold a room it has not reached.
  it('lets the state of a session route win over the route while it is still connecting', async () => {
    open('/table?session=4KJ2')
    await waitFor(() => expect(document.title).toBe('Ansluter · build-your-deck'))
  })
})
