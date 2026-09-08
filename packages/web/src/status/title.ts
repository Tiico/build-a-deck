import type { StatusKey } from './notice.js'

// Until #12 there was one title for the whole product: the static line in index.html. A tab is
// a place too, and a tab that says nothing is a tab nobody can find their way back to.
export const APP = 'build-your-deck'

export const ROUTES = ['home', 'login', 'new', 'claim', 'editor', 'table', 'join', 'play', 'online', 'observe', 'prototype', 'unknown'] as const
export type Route = (typeof ROUTES)[number]

const PATHS: Record<string, Route> = {
  '/': 'home',
  '/login': 'login',
  '/new': 'new',
  '/claim': 'claim',
  '/editor': 'editor',
  '/table': 'table',
  '/join': 'join',
  '/play': 'play',
  '/online': 'online',
  '/observe': 'observe',
}

// A path nothing serves is its own route. Before this it fell through to the start page, so a
// mistyped link quietly showed someone else's games instead of saying the page does not exist.
// A prototype is a page that does exist, so it is not that; it is throwaway, so it is not a
// product page either (CLAUDE.md).
export function routeOf(pathname: string): Route {
  if (pathname.startsWith('/prototype/')) return 'prototype'
  return PATHS[pathname] ?? 'unknown'
}

// Which room a session route is about is not always a code: only the TV is given one, so the
// session id stands in for it everywhere else.
export type TitleContext = { state?: StatusKey | null; room?: string | null; game?: string | null }

// The name of the page first, because a tab is clipped from the right, and `·` because that is
// already the app's separator.
function nameOf(route: Route, ctx: TitleContext): string[] {
  const room = ctx.room ? `Rum ${ctx.room}` : null
  switch (route) {
    case 'home':
      return ['Mina spel']
    case 'login':
      return ['Logga in']
    case 'new':
      return ['Nytt spel']
    case 'claim':
      return ['Spara bordet']
    case 'editor':
      return [ctx.game ?? null, 'Editor'].filter((s): s is string => s !== null)
    case 'table':
      return ['Bordet', room].filter((s): s is string => s !== null)
    case 'join':
      return [ctx.room ? `Gå med i rum ${ctx.room}` : 'Gå med i ett rum']
    case 'play':
      return ['Din hand', room].filter((s): s is string => s !== null)
    case 'online':
      return ['Spela', room].filter((s): s is string => s !== null)
    case 'observe':
      return [ctx.room ? `Tittar på rum ${ctx.room}` : 'Tittar på']
    case 'prototype':
      return ['Prototyp']
    case 'unknown':
      return ['Sidan finns inte']
  }
}

// The state wins over the route while there is one, so a tab in the background says the truth.
// The title is not a message, though: whoever needs the word "fel" gets it in the view and in
// the live region, not in the tab.
function stateName(state: StatusKey, route: Route): string | null {
  switch (state) {
    case 'loading':
    case 'slow':
      return 'Laddar'
    case 'connecting':
      return 'Ansluter'
    case 'missing':
      return route === 'editor' ? 'Spelet finns inte' : route === 'home' || route === 'unknown' ? 'Sidan finns inte' : 'Rummet finns inte'
    case 'forbidden':
      return 'Ingen tillgång'
    case 'offline':
      return 'Ingen kontakt'
    case 'dropped':
      return 'Frånkopplad'
    case 'resumed':
    case 'refused':
      return null
  }
}

export function documentTitle(route: Route, ctx: TitleContext = {}): string {
  const override = ctx.state ? stateName(ctx.state, route) : null
  return [...(override !== null ? [override] : nameOf(route, ctx)), APP].join(' · ')
}
