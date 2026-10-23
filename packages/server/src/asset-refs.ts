// Which assets a document names, and nothing else: no store, no renderer, no imports, so that the
// project model — which the web app bundles through `@byd/server/doc` — can ask it without pulling
// the asset store and its Chromium in behind it.

const ASSET_REF = /^asset:([0-9a-f]{64})$/

// Every asset a document uses (G5, #527): what its export carries, and — summed over every version
// of every game an account owns — what the account's storage is (#1197, #1192 question 4). It walks
// the whole document rather than knowing its fields, so a place a picture can be put that is added
// later is exported and counted without anyone remembering to: a string that is an `asset:<hash>`
// reference is one, wherever it stands. A picture's own entry is keyed by its bare hash, and it is
// only a use of the asset when that entry is in `pictures`. The box asks the same of a stored
// version in SQL when it rebuilds `project_assets` (001-init.sql).
export function assetHashesOf(doc: unknown): string[] {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      const m = ASSET_REF.exec(value)
      if (m?.[1]) found.add(m[1])
    } else if (Array.isArray(value)) for (const v of value) walk(v)
    else if (value && typeof value === 'object') for (const v of Object.values(value)) walk(v)
  }
  walk(doc)
  const pictures = (doc as { pictures?: Record<string, unknown> } | null)?.pictures
  for (const hash of Object.keys(pictures ?? {})) if (/^[0-9a-f]{64}$/.test(hash)) found.add(hash)
  return [...found].sort()
}
