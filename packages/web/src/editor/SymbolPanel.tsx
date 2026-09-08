import { useState } from 'react'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { CATEGORIES, LIBRARY, searchSymbols, symbolPreview, type GameSymbol } from './symbols.js'
import type { ProjectClient } from './ProjectClient.js'

// The symbol library (E4), from the prototype: the library is a surface of its own, with search,
// categories and the licence on every symbol. Taking one in names it in the project's icon set,
// which is what `{namn}` in card text looks up (L2). The set stands beside the library with what
// to write, what each symbol is licensed under, and which cards use it.
export type SymbolPanelProps = { doc: ProjectDoc; client: ProjectClient; assetBase: string }

export function SymbolPanel({ doc, client, assetBase }: SymbolPanelProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const found = searchSymbols(query, category)
  const front = doc.template.faces['front']
  const take = (symbol: GameSymbol) => {
    void client.useSymbol(symbol).catch((err: unknown) => setNotice(err instanceof Error ? err.message : String(err)))
  }
  return (
    <div className="byd-symbols" data-symbol-panel>
      <aside className="byd-symbols-library">
        <h2>Symbolbibliotek</h2>
        <p>Fritt licensierade symboler, platshållarramar och färgblock. Licensen följer med in i trycket.</p>
        <input type="search" aria-label="Sök symbol" placeholder="Sök symbol…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="byd-symbols-cats" role="group" aria-label="Kategorier">
          <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>
            Alla
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {c}
            </button>
          ))}
        </div>
        {found.length === 0 ? (
          <p className="byd-symbols-empty">Inget med det namnet. Sök på vad symbolen är till för, som "försvar" eller "skörd".</p>
        ) : (
          <div className="byd-symbols-grid">
            {found.map((s) => (
              <button key={s.id} type="button" className="byd-symbols-tile" aria-label={`Ta in ${s.name}`} onClick={() => take(s)}>
                <img src={symbolPreview(s)} alt="" />
                <span>{s.name}</span>
                <small>{s.licence}</small>
              </button>
            ))}
          </div>
        )}
        {notice && <p role="alert">{notice}</p>}
      </aside>
      <div className="byd-symbols-main">
        <ProjectSet doc={doc} client={client} assetBase={assetBase} />
        <div className="byd-wall" role="list">
          {front &&
            doc.rows.map((r) => (
              <div key={r.id} role="listitem" className="byd-wall-card" data-card-ref={r.id}>
                <CardPreview id={`sym-${r.id}`} face={front} row={r.fields} icons={doc.icons} assetBase={assetBase} scale={0.55} />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

// The game's own set: what to write, what it is licensed under, and where it is already used.
function ProjectSet({ doc, client, assetBase }: SymbolPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const names = Object.keys(doc.icons)
  const usedBy = (name: string) => doc.rows.filter((r) => Object.values(r.fields).some((v) => typeof v === 'string' && v.includes(`{${name}}`))).length
  if (names.length === 0) return <p className="byd-symbols-empty">Inga symboler ännu. Ta in en ur biblioteket och skriv {'{namn}'} i korttexten.</p>
  return (
    <section className="byd-symbols-set">
      <h2>Symboler i spelet</h2>
      <ul aria-label="Symboler i spelet">
        {names.map((name) => {
          const credit = doc.credits?.[name]
          const used = usedBy(name)
          return (
            <li key={name} data-icon={name}>
              <img src={iconSrc(doc.icons[name] ?? '', assetBase)} alt="" />
              <code>{`{${name}}`}</code>
              <input
                aria-label={`Namn för ${name}`}
                defaultValue={name}
                onBlur={(e) => {
                  const next = e.target.value.trim()
                  if (!next || next === name) return
                  try {
                    client.renameIcon(name, next)
                    setError(null)
                  } catch (err) {
                    e.target.value = name
                    setError(err instanceof Error ? err.message : String(err))
                  }
                }}
              />
              <small>{credit ? `${credit.licence} · ${credit.by}` : 'egen'}</small>
              <small>{used} kort</small>
              <button type="button" aria-label={`Ta bort ${name}`} onClick={() => client.removeIcon(name)}>
                ×
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

// A symbol in the set is one of the project's assets; anything else is a URL as it stands.
const iconSrc = (url: string, assetBase: string): string => (url.startsWith('asset:') ? `${assetBase}/assets/${url.slice('asset:'.length)}` : url)

export const SYMBOL_COUNT = LIBRARY.length
