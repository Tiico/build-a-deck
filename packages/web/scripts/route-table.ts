// The app's routes, read off `fetchPage` in `src/App.tsx` — the one place that says which module
// draws which address. Two readers need them and must agree: the build, which has the document ask
// for a route's chunks beside the entry (#760, `vite.config.ts`), and the test that holds the room
// codes clear of every word the app answers (#675, `ROUTE_WORDS` in @byd/protocol).
//
// Three forms are read: `path === '/x'` is that address, `path.startsWith('/x/')` everything under
// it, and `codeOfAddress(path)` a room's own address, `/KOD`.
export type Route = { kind: 'exact' | 'prefix' | 'code'; path: string; spec: string }

export function routesOf(app: string): Route[] {
  const routes: Route[] = []
  for (const [, test = '', path = '', spec = ''] of app.matchAll(/path(\.startsWith\(|\s*===\s*)'([^']+)'\)?\)\s*return\s+import\('([^']+)'\)/g)) {
    routes.push({ kind: test.startsWith('.') ? 'prefix' : 'exact', path, spec })
  }
  for (const [, spec = ''] of app.matchAll(/codeOfAddress\(path\)\)\s*return\s+import\('([^']+)'\)/g)) routes.push({ kind: 'code', path: '/KOD', spec })
  return routes
}

// The first word of every address the app draws a page at, besides a room's.
export function pageWords(app: string): string[] {
  const words = new Set<string>()
  for (const [, word = ''] of app.matchAll(/path(?:\s*===\s*|\.startsWith\()'\/([^/']+)/g)) words.add(word)
  return [...words]
}
