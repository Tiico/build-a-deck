// The app's routes, read off `fetchPage` in `src/App.tsx` — the one place that says which module
// draws which address, and which parts of the catalogue it speaks. Three readers need them and must
// agree: the build, which has the document ask for a route's chunks and words beside the entry
// (#760, `vite.config.ts`), the test that holds each route's words to the parts it fetches (#760,
// `language-parts.test.ts`), and the test that holds the room codes clear of every word the app
// answers (#675, `ROUTE_WORDS` in @byd/protocol).
//
// Three forms are read: `path === '/x'` is that address, `path.startsWith('/x/')` everything under
// it, and `codeOfAddress(path)` a room's own address, `/KOD`. Each returns `surface(page, parts)`,
// where the page is either `import('./m.js')` — a chunk of its own, `spec` — or a component
// `App.tsx` already holds, `Promise.resolve(Name)` — `drawn`, with no chunk to ask for.
export type Route = { kind: 'exact' | 'prefix' | 'code'; path: string; spec: string | null; drawn: string | null; parts: string[] }

const SURFACE = /(?:path(\.startsWith\(|\s*===\s*)'([^']+)'\)?|(codeOfAddress)\(path\))\)\s*return\s+surface\((?:import\('([^']+)'\)[^,]*|Promise\.resolve\((\w+)\)),\s*\[([^\]]*)\]\)/g

export function routesOf(app: string): Route[] {
  return [...app.matchAll(SURFACE)].map(([, test = '', path = '', code, spec, drawn, parts = '']) => ({
    kind: code ? 'code' : test.startsWith('.') ? 'prefix' : 'exact',
    path: code ? '/KOD' : path,
    spec: spec ?? null,
    drawn: drawn ?? null,
    parts: [...parts.matchAll(/'([a-z]+)'/g)].map((m) => m[1] ?? ''),
  }))
}

// The first word of every address the app draws a page at, besides a room's.
export function pageWords(app: string): string[] {
  const words = new Set<string>()
  for (const [, word = ''] of app.matchAll(/path(?:\s*===\s*|\.startsWith\()'\/([^/']+)/g)) words.add(word)
  return [...words]
}
