import { translate, type T } from '../i18n/index.js'
import type { StatusKey } from './notice.js'

const swedish: T = (key, params) => translate('sv', key, params)

// Until #12 there was one title for the whole product: the static line in index.html. A tab is
// a place too, and a tab that says nothing is a tab nobody can find their way back to.
export const APP = 'build-your-deck'

export const ROUTES = ['home', 'login', 'new', 'claim', 'invite', 'editor', 'table', 'join', 'play', 'online', 'observe', 'prototype', 'unknown'] as const
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
  if (/^\/invites\/[^/]+$/.test(pathname)) return 'invite'
  return PATHS[pathname] ?? 'unknown'
}

// Which room a session route is about is not always a code: only the TV is given one (DRIFT §9).
// Without it the game's name stands in, because that is what a guest knows the table by; the
// session id did once, and «Tittar på rum a25d7f3b-0c…» is nobody's name for anything (#759). And `route` is what the page is showing rather
// than where it stands: `/` is the games for whoever is logged in and the login card for whoever
// is not, and a tab that says "Mina spel" over the second one names a page that is not there.
// Only a page with two shapes reports it, and the address decides for every other one.
// `part` is which part of a page with parts is open — the editor's tab (#477) — in the reader's words.
export type TitleContext = { state?: StatusKey | null; room?: string | null; game?: string | null; route?: Route | null; part?: string | null }

// The name of the page first, because a tab is clipped from the right, and `·` because that is
// already the app's separator.
function nameOf(route: Route, ctx: TitleContext, t: T): string[] {
  const room = ctx.room ? t('title.room', { code: ctx.room }) : (ctx.game ?? null)
  switch (route) {
    case 'home':
      return [t('title.home')]
    case 'login':
      return [t('title.login')]
    case 'new':
      return [t('title.new')]
    case 'claim':
      return [t('title.claim')]
    case 'invite':
      return [t('title.invite')]
    case 'editor':
      // The game's own name is the designer's and is never translated (A4); only the word beside
      // it is the tool's. The tab that is open stands in for the word «Editor» (#477): seven tabs of
      // one editor were seven browser tabs with the same name.
      return [ctx.game ?? null, ctx.part ?? t('title.editor')].filter((s): s is string => s !== null)
    case 'table':
      return [ctx.part ?? t('title.table'), room].filter((s): s is string => s !== null)
    case 'join':
      return [ctx.room ? t('title.join', { code: ctx.room }) : t('title.join.any')]
    case 'play':
      return [ctx.part ?? t('title.play'), room].filter((s): s is string => s !== null)
    case 'online':
      return [t('title.online'), room].filter((s): s is string => s !== null)
    case 'observe':
      return [ctx.room ? t('title.observe', { code: ctx.room }) : ctx.game ? t('title.observe.game', { game: ctx.game }) : t('title.observe.any')]
    case 'prototype':
      return [t('title.prototype')]
    case 'unknown':
      return [t('title.unknown')]
  }
}

// The state wins over the route while there is one, so a tab in the background says the truth.
// The title is not a message, though: whoever needs the word "fel" gets it in the view and in
// the live region, not in the tab.
function stateName(state: StatusKey, route: Route, t: T): string | null {
  switch (state) {
    case 'loading':
    case 'slow':
      return t('title.state.loading')
    case 'connecting':
      return t('title.state.connecting')
    case 'missing':
      return t(route === 'editor' ? 'title.state.missing.game' : route === 'home' || route === 'unknown' ? 'title.unknown' : 'title.state.missing.table')
    case 'forbidden':
      return t('title.state.forbidden')
    case 'offline':
      return t('title.state.offline')
    case 'dropped':
      return t('title.state.dropped')
    case 'resumed':
    case 'refused':
      return null
  }
}

export function documentTitle(route: Route, ctx: TitleContext = {}, t: T = swedish): string {
  const here = ctx.route ?? route
  const override = ctx.state ? stateName(ctx.state, here, t) : null
  return [...(override !== null ? [override] : nameOf(here, ctx, t)), APP].join(' · ')
}
