import { useEffect, useState } from 'react'
import type { RenderedBlock, RenderedNode, RenderedRules } from '@byd/template'
import { findRules } from './search.js'
import { useT } from '../i18n/index.js'
import './rules.css'

// The rules at the table (B7): the rulebook a session hands out, rendered against the version it
// was locked to at start. From the prototype: a drawer from the edge holding the whole book for
// whoever has never played, with the question on top for whoever is mid-turn and wants one rule.
// A game with no rulebook offers nothing at all.
// Where the press lives: over the felt, in a header (a TV's, #30), or in the phone's own row.
export type RuleDrawerProps = { http: string; sessionId: string; placement: 'table' | 'tv' | 'phone' }

export function RuleDrawer({ http, sessionId, placement }: RuleDrawerProps) {
  const t = useT()
  const [rules, setRules] = useState<RenderedRules | null | 'none'>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The rules of a running table never change under the players, so they are read once.
  useEffect(() => {
    let live = true
    // 204 is the table saying it has no rulebook, which is an answer and not a failure.
    fetch(`${http}/sessions/${encodeURIComponent(sessionId)}/rules`)
      .then(async (res) => (res.ok && res.status !== 204 ? ((await res.json()) as RenderedRules) : 'none'))
      .then((r) => live && setRules(r))
      .catch(() => live && setRules('none'))
    return () => {
      live = false
    }
  }, [http, sessionId])
  if (rules === 'none') return null
  const hits = rules && rules !== null ? findRules(rules, query) : []
  return (
    <div className="byd-rules-drawer" data-placement={placement}>
      <button type="button" className="byd-rules-open" onClick={() => setOpen((o) => !o)}>
        {open ? t('rules.drawer.close') : t('rules.drawer.open')}
      </button>
      {open && (
        <aside className="byd-rules-panel" role="dialog" aria-label={t('rules.drawer.open')}>
          <div className="byd-rules-ask">
            <input type="search" aria-label={t('rules.drawer.ask')} placeholder={t('rules.drawer.ask')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="button" aria-label={t('rules.drawer.close')} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="byd-rules-body">
            {rules === null ? (
              <p>{t('rules.drawer.loading')}</p>
            ) : query.trim() ? (
              hits.length === 0 ? (
                <p className="byd-rules-none">{t('rules.drawer.none')}</p>
              ) : (
                <ol className="byd-rules-hits">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <h3>{h.heading}</h3>
                      <p>{h.text}</p>
                    </li>
                  ))}
                </ol>
              )
            ) : (
              <article className="byd-rules-page">
                <h2>{rules.title}</h2>
                {rules.blocks.map((b) => (
                  <RuleBlockView key={b.id} block={b} />
                ))}
              </article>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

// One block as the reader meets it. References are already names by the time they arrive here:
// the server resolved them against the version this table plays (B7).
export function RuleBlockView({ block }: { block: RenderedBlock }) {
  switch (block.kind) {
    case 'heading':
      return block.level === 1 ? <h3>{block.text}</h3> : <h4>{block.text}</h4>
    case 'text':
      return (
        <>
          {block.paragraphs.map((p, i) => (
            <p key={i}>
              <RuleSpan nodes={p.children} />
            </p>
          ))}
        </>
      )
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i}>
          <RuleSpan nodes={item} />
        </li>
      ))
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
    }
    case 'setup':
      return block.caption ? <p className="byd-rules-caption">{block.caption}</p> : null
  }
}

export function RuleSpan({ nodes }: { nodes: readonly RenderedNode[] }) {
  const t = useT()
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text':
            return <span key={i}>{n.text}</span>
          case 'bold':
            return (
              <strong key={i}>
                <RuleSpan nodes={n.children} />
              </strong>
            )
          case 'italic':
            return (
              <em key={i}>
                <RuleSpan nodes={n.children} />
              </em>
            )
          case 'icon':
            return (
              <b key={i} className="byd-rules-pip">
                {n.name}
              </b>
            )
          // A reference arrives carrying the name it stands for; one the game no longer has
          // says what was written instead of quietly saying nothing.
          case 'ref':
            return (
              <i key={i} className="byd-rules-ref" data-ref={n.id} {...(n.name ? {} : { 'data-missing': 'true' })}>
                {n.name ?? `${t(n.of === 'zone' ? 'rules.drawer.ref.zone' : 'rules.drawer.ref.card')}:${n.id}`}
              </i>
            )
        }
      })}
    </>
  )
}
