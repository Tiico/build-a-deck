import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { documentTitle, routeOf, type Route, type TitleContext } from './title.js'
import { useT } from '../i18n/index.js'

// One writer for `document.title` (#12). The route is known here; the room, the game and the
// state are known by the page, so the page reports them and this is what writes them down.
// A second writer would race with the first, and React runs a child's effect before its
// parent's — so the parent has to be the one that owns the value.
const Report = createContext<((ctx: TitleContext) => void) | null>(null)

export function DocumentTitle({ route = routeOf(location.pathname), children }: { route?: Route; children: ReactNode }) {
  const t = useT()
  const [ctx, setCtx] = useState<TitleContext>({})
  useEffect(() => {
    document.title = documentTitle(route, ctx, t)
  }, [route, ctx, t])
  return <Report.Provider value={setCtx}>{children}</Report.Provider>
}

// What this page is about, and what is wrong with it. Reported as primitives so that a page
// re-rendering for any other reason does not rewrite the tab.
export function usePageTitle(ctx: TitleContext): void {
  const report = useContext(Report)
  const { state = null, room = null, game = null } = ctx
  useEffect(() => {
    report?.({ state, room, game })
  }, [report, state, room, game])
}
