import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from 'react'
import { documentTitle, routeOf, type Route, type TitleContext } from './title.js'
import { useT } from '../i18n/index.js'

// One writer for `document.title` (#12). The route is known here; the room, the game and the
// state are known by the page, so the page reports them and this is what writes them down.
// A second writer would race with the first, and React runs a child's effect before its
// parent's — so the parent has to be the one that owns the value.
//
// The report writes the tab at once, in the commit that put the state on the page (#1216). It
// used to land in this component's state and be written by an effect of the render after: one
// render and two flushes of effects behind the page, which under load was seconds of a tab
// saying «Tittar på rum …» over a page that said «Frånkopplad».
const Report = createContext<((ctx: TitleContext) => void) | null>(null)

export function DocumentTitle({ route = routeOf(location.pathname), children }: { route?: Route; children: ReactNode }) {
  const t = useT()
  const ctx = useRef<TitleContext>({})
  // What this component knows, as of its last commit. A page's report in the same commit runs
  // first and writes with the previous route; the effect below writes again, so the commit ends
  // with both halves current.
  const own = useRef({ route, t })
  // Written only when it says something else, so a page that reports on every commit (below)
  // never rewrites the tab with what it already says.
  const write = useCallback(() => {
    const title = documentTitle(own.current.route, ctx.current, own.current.t)
    if (document.title !== title) document.title = title
  }, [])
  useLayoutEffect(() => {
    own.current = { route, t }
    write()
  }, [route, t, write])
  const report = useCallback(
    (next: TitleContext) => {
      ctx.current = next
      write()
    },
    [write],
  )
  return <Report.Provider value={report}>{children}</Report.Provider>
}

// What this page is about, and what is wrong with it, from a layout effect so that the tab
// changes in the same commit as the page.
//
// On every commit, and not only when what is reported changes (#1395). A live page reads its state
// off the clock while it renders, so a render can see a state that no update asked for; when
// nothing the page holds has changed, React throws that render away and keeps the effect's new
// dependencies without running it. The render that then puts the state on the page found nothing
// changed and reported nothing, and the tab said «Tittar på rum …» over «Frånkopplad» for as long
// as anyone waited. What a commit shows is what it reports; `write` leaves a tab that already
// says it alone.
export function usePageTitle(ctx: TitleContext): void {
  const report = useContext(Report)
  const { state = null, room = null, game = null, route = null, part = null, turn = null } = ctx
  useLayoutEffect(() => {
    report?.({ state, room, game, route, part, turn })
  })
}
