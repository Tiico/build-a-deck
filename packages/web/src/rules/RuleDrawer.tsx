import { useEffect, useState, type Ref } from 'react'
import { ruleEm, type RenderedBlock, type RenderedNode, type RenderedRules } from '@byd/template'
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
  const [rules, setRules] = useState<RenderedRules | null | 'none'>(null)
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
  return <RuleShelf rules={rules} assets={http} placement={placement} />
}

// The drawer itself, given a book — everything about the rules at the table except where the book
// came from. The editor's rules tab hands it the book it is writing, so that the mode called «as
// at the table» is the table and not a drawing of one (#227): one code path for the book's words,
// one for the question on top of them, and one for the drawer they are read in.
export type RuleShelfProps = {
  rules: RenderedRules | null
  assets?: string | undefined
  placement: 'table' | 'tv' | 'phone'
  // Whether the drawer starts open. At a table it does not: a player opens it. Where the drawer
  // is what is being looked at, it does.
  startOpen?: boolean | undefined
  // The scrolling area the book is read in, for whoever has to put a reader back where she was.
  body?: Ref<HTMLDivElement> | undefined
}

export function RuleShelf({ rules, assets, placement, startOpen, body }: RuleShelfProps) {
  const t = useT()
  const [open, setOpen] = useState(startOpen ?? false)
  const [query, setQuery] = useState('')
  const hits = rules ? findRules(rules, query) : []
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
          <div className="byd-rules-body" ref={body}>
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
                {/* Each block says which one it is, so that a reader's place in the book can be
                    carried between two boxes of different widths (#227). It is the same mark the
                    editor's own page carries, and the only thing the two books have in common
                    once their measures differ. */}
                {rules.blocks.map((b) => (
                  <div key={b.id} data-block={b.id}>
                    <RuleBlockView block={b} assets={assets} />
                  </div>
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
// the server resolved them against the version this table plays (B7). A picture is the one thing
// that is not: it arrives as `asset:<hash>`, the project's own way of naming a picture, and is
// resolved against wherever this table's assets are served from — the same resolution a card's
// image gets in the editor (E1).
export function RuleBlockView({ block, assets }: { block: RenderedBlock; assets?: string | undefined }) {
  switch (block.kind) {
    // A heading holds the same nodes a paragraph does (#272), so a reference in it is drawn as
    // the reference it is — the name the game has right now, and a missing one saying so.
    case 'heading':
      return block.level === 1 ? (
        <h3>
          <RuleSpan nodes={block.children} />
        </h3>
      ) : (
        <h4>
          <RuleSpan nodes={block.children} />
        </h4>
      )
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
    // A5 sets how big a picture may be drawn and the table and the phone draw it inside that same
    // frame (#173): the stylesheet holds the frame, so all three surfaces say it once.
    //
    // The width is the picture's own measurement, worked out once in `renderRules` against the
    // printed page and said here in the book's own type — a screen has no millimetres it can be
    // held to, and what carries across is the picture's size beside the words. A picture smaller
    // than the column at 300 DPI therefore stands in its own size instead of being pulled out to
    // the column and turning to gruel, on this surface exactly as on the press.
    //
    // `alt` is what the picture says about itself. Empty means decorative, and a decorative
    // picture has no role at all for a screen reader — which is the cost the decision of
    // 2026-09-17 accepted, and why the import counts them where they can be found again. The
    // caption is the other line, read beside the picture by whoever can see it; the two are
    // written for two readers and never stand in for one another.
    case 'image':
      return (
        <figure className="byd-rules-figure">
          <img className="byd-rules-image" src={assetUrl(block.asset, assets)} alt={block.alt} style={{ width: `${ruleEm(block.mm.w)}em` }} />
          {block.caption && <figcaption className="byd-rules-caption">{block.caption}</figcaption>}
        </figure>
      )
  }
}

// Where the picture's bytes are (E1): the project's assets, served by the table's own server. A
// reference the server is not known for is left as it stands rather than guessed at.
const assetUrl = (asset: string, base: string | undefined): string => (base ? `${base}/assets/${asset.slice('asset:'.length)}` : asset)

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
