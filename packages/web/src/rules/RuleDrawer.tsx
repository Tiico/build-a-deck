import { createContext, useContext, useEffect, useState, type Ref } from 'react'
import { ruleEm, type RenderedBlock, type RenderedNode, type RenderedRules } from '@byd/template'
import { zoneTally, type ZoneTally } from '@byd/engine'
import type { ZoneView } from '@byd/protocol'
import { findRules } from './search.js'
import { useT } from '../i18n/index.js'
import type { Key } from '../i18n/sv.js'
import './rules.css'

// The table the book is being read at, or nothing (#226). It is a *reader's own* view of the
// table — the projection, never the state — so what the book is able to say is whatever that
// reader was already told. A book read with no table under it gets nothing here, which is the
// same thing the editor's own page is: the tag falls back on the name it stands for.
//
// It travels as a context rather than down every block and every span, because the one place
// that reads it is the innermost one, and a prop through six components is six chances for a
// surface to pass a table the reader is not sitting at.
export type LiveTable = { zones: readonly ZoneView[] }
const LiveTableContext = createContext<LiveTable | null>(null)

// The rules at the table (B7): the rulebook a session hands out, rendered against the version it
// was locked to at start. From the prototype: a drawer from the edge holding the whole book for
// whoever has never played, with the question on top for whoever is mid-turn and wants one rule.
// A game with no rulebook offers nothing at all.
// Where the press lives: over the felt, in a header (a TV's, #30), or in the phone's own row.
export type RuleDrawerProps = {
  http: string
  sessionId: string
  placement: 'table' | 'tv' | 'phone'
  // This reader's own view of the table, for the living number (#226). It is passed in rather
  // than fetched: the surfaces that show the drawer already hold the snapshot and already follow
  // the patch stream, so the number is live for nothing and there is no second subscription that
  // could disagree with the felt beside it.
  live?: LiveTable | null | undefined
}

export function RuleDrawer({ http, sessionId, placement, live: table }: RuleDrawerProps) {
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
  return <RuleShelf rules={rules} assets={http} placement={placement} live={table} />
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
  // The table this reader is at, for the living number (#226). Nothing is the ordinary case: the
  // editor writes the book without a table, and the book is read that way far more often than not.
  live?: LiveTable | null | undefined
}

export function RuleShelf({ rules, assets, placement, startOpen, body, live }: RuleShelfProps) {
  const t = useT()
  const [open, setOpen] = useState(startOpen ?? false)
  const [query, setQuery] = useState('')
  const hits = rules ? findRules(rules, query) : []
  return (
    <LiveTableContext.Provider value={live ?? null}>
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
    </LiveTableContext.Provider>
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
  const live = useContext(LiveTableContext)
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          // Plain text stands as plain text, with no element around it (#286). The element was
          // there for nothing but a React key, and a string in a list needs none — only elements
          // do. What it cost was the reading: the name of an element is trimmed before it is
          // joined to what stands beside it, so `Om ` + `Draghög` was read as `OmDraghög`, with
          // the space shut inside a wrapper nobody asked for.
          case 'text':
            return n.text
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
          case 'ref': {
            const stands = n.name ?? `${t(n.of === 'zone' ? 'rules.drawer.ref.zone' : 'rules.drawer.ref.card')}:${n.id}`
            // The living number the reader's own projection allows beside this tag (#226).
            const tally = n.of === 'zone' ? zoneTally(live, n.id) : null
            return (
              <i
                key={i}
                className="byd-rules-ref"
                data-ref={n.id}
                {...(n.name ? {} : { 'data-missing': 'true' })}
                // With a badge the tag is read as one thing and in form A's words, which is what
                // the decision gave B in exchange for not showing them: «Draghögen, 18 kort,
                // ordningen dold». `img` is the one role that puts a name in place of the
                // contents, and without a badge there is no role and no name — a tag then reads
                // as the letters it always did.
                {...(tally ? { role: 'img', 'aria-label': t(tallyKey(tally), { name: stands, n: tally.count }) } : {})}
              >
                {stands}
                {tally && (
                  <b className="byd-rules-tally" data-tally={tally.known ? 'read' : 'counted'}>
                    {tally.count}
                  </b>
                )}
              </i>
            )
          }
        }
      })}
    </>
  )
}

// The living number beside a tag (#226, decided 2026-09-20): form B, the badge.
//
// Filled means the book can read what lies there; hollow means the count is the whole of what
// there is to know. The difference is a shape rather than a sentence, which is what let it cost
// 1,5 % of the book's height where the suffix «Draghögen: 18 kort» cost 14,6 % of the drawer's.
// The sentence is not lost: it is the tag's accessible name, and the ear hears exactly the words
// form A would have shown.
//
// Three things the badge does not do, each of them a decision and not an omission:
//
//  * A card reference never gets one. `zoneTally` answers for zones and cannot be asked about a
//    card, because the only living thing a book could say about one is where it lies — which for
//    a card in a hidden pile is exactly what K15 forbids. A layer that cannot say it needs no
//    guarding.
//  * A tag in a hidden pile and a tag in a book with no table under it are drawn identically,
//    and that identity is load-bearing. Were hidden given a mark of its own, the *absence* of a
//    number would become a message and a reader could tell from the marks which cards lie hidden.
//  * The number is not in the book's own `text`, so it is not searchable. `plainOf` is what the
//    question box reads, and a living number in it would make the index move under the hand.
const tallyKey = (tally: ZoneTally): Key =>
  tally.known ? (tally.count === 1 ? 'rules.tally.read.one' : 'rules.tally.read.other') : tally.count === 1 ? 'rules.tally.counted.one' : 'rules.tally.counted.other'
