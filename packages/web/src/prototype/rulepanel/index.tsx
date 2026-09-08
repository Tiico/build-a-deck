// PROTOTYPE — the rules at the table (B7): /prototype/rulepanel?variant=A|B|C. Question: how does
// a player look a rule up mid-game, on the screen and on the phone, without the designer there?
// All three read the same rendered rulebook a session hands out.
import { useState } from 'react'
import type { InlineNode, RenderedBlock, RenderedRules } from '@byd/template'
import { Switcher } from './Switcher.js'
import { findRules, names, rendered, suggestions, type Hit } from './model.js'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'En lucka som dras in från kanten' },
  { key: 'B', name: 'Boken ligger på bordet' },
  { key: 'C', name: 'Fråga, få en regel' },
]
type Ctx = { rules: RenderedRules }

export function RulePanelPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const rules = rendered()
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  return (
    <div className="rp-stage">
      <div className="rp-state">
        <span>
          reglerna kommer från sessionens egen version · {rules.blocks.length} block · referenserna är redan namn, inte id
        </span>
      </div>
      <V rules={rules} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

// The felt, roughly: enough table to judge what a panel does to it.
function Table({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rp-tv">
      <div className="rp-felt">
        <span className="rp-pile" style={{ left: '30%' }}>Draghög</span>
        <span className="rp-pile" style={{ left: '58%' }}>Kasthög</span>
        <span className="rp-area">Marknad</span>
        <span className="rp-hand">Hand · Ada</span>
      </div>
      {children}
    </div>
  )
}

function Phone({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rp-phone">
      <div className="rp-phone-top">Ada · Skogens herrar</div>
      <div className="rp-phone-body">{children}</div>
      <div className="rp-phone-hand">
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}

function Book({ rules }: { rules: RenderedRules }) {
  return (
    <article className="rp-book">
      <h1>{rules.title}</h1>
      {rules.blocks.map((b) => (
        <Block key={b.id} block={b} />
      ))}
    </article>
  )
}

function Block({ block }: { block: RenderedBlock }) {
  switch (block.kind) {
    case 'heading':
      return block.level === 1 ? <h2>{block.text}</h2> : <h3>{block.text}</h3>
    case 'text':
      return (
        <>
          {block.paragraphs.map((p, i) => (
            <p key={i}>
              <Span nodes={p.children} />
            </p>
          ))}
        </>
      )
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i}>
          <Span nodes={item} />
        </li>
      ))
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
    }
    case 'setup':
      return null
  }
}

function Span({ nodes }: { nodes: readonly InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text':
            return <span key={i}>{n.text}</span>
          case 'bold':
            return (
              <strong key={i}>
                <Span nodes={n.children} />
              </strong>
            )
          case 'italic':
            return (
              <em key={i}>
                <Span nodes={n.children} />
              </em>
            )
          case 'icon':
            return (
              <b key={i} className="rp-pip">
                {n.name}
              </b>
            )
          case 'ref': {
            const found = (n.of === 'zone' ? names.zones : names.cards)[n.id]
            return (
              <i key={i} className="rp-ref">
                {found ?? n.id}
              </i>
            )
          }
        }
      })}
    </>
  )
}

// ---------- A — a drawer from the edge ----------
// A button in the corner; the book slides in over the table and can be scrolled. The same drawer
// on the phone, over the hand.
function VariantA({ rules }: Ctx) {
  const [open, setOpen] = useState(true)
  const [phoneOpen, setPhoneOpen] = useState(true)
  return (
    <div className="rp-a">
      <Table>
        <button type="button" className="rp-tab-button" onClick={() => setOpen((o) => !o)}>
          {open ? 'Stäng reglerna' : 'Regler'}
        </button>
        <aside className="rp-drawer" data-open={open ? 'true' : undefined}>
          <Book rules={rules} />
        </aside>
      </Table>
      <Phone>
        <button type="button" className="rp-phone-button" onClick={() => setPhoneOpen((o) => !o)}>
          {phoneOpen ? 'Tillbaka till spelet' : 'Regler'}
        </button>
        {phoneOpen && (
          <div className="rp-phone-sheet">
            <Book rules={rules} />
          </div>
        )}
      </Phone>
      <p className="rp-foot">A · en lucka från kanten · hela boken, att bläddra i, över bordet respektive handen</p>
    </div>
  )
}

// ---------- B — the book lies on the table ----------
// The rulebook is an object in the room: it lies on the felt, is picked up to be read, and put
// back down. On the phone it is a tab beside the hand, always one tap away.
function VariantB({ rules }: Ctx) {
  const [held, setHeld] = useState(false)
  const [tab, setTab] = useState<'hand' | 'rules'>('rules')
  return (
    <div className="rp-b">
      <Table>
        <button type="button" className="rp-object" onClick={() => setHeld(true)} aria-label="Ta upp regelboken">
          <b>Regler</b>
          <span>Skogens herrar</span>
        </button>
        {held && (
          <div className="rp-held" onClick={() => setHeld(false)}>
            <Book rules={rules} />
            <span className="rp-held-hint">Klicka för att lägga tillbaka boken</span>
          </div>
        )}
      </Table>
      <Phone>
        <div className="rp-phone-tabs">
          <button type="button" aria-pressed={tab === 'hand'} onClick={() => setTab('hand')}>
            Hand
          </button>
          <button type="button" aria-pressed={tab === 'rules'} onClick={() => setTab('rules')}>
            Regler
          </button>
        </div>
        {tab === 'rules' ? (
          <div className="rp-phone-sheet">
            <Book rules={rules} />
          </div>
        ) : (
          <p className="rp-phone-empty">Korten på handen ligger nedanför.</p>
        )}
      </Phone>
      <p className="rp-foot">B · boken är ett föremål i rummet · den tas upp, läses och läggs tillbaka</p>
    </div>
  )
}

// ---------- C — ask, get a rule ----------
// No book to read: a question, and the paragraphs that answer it. What the game has is offered
// as ready-made questions, since that is what people ask about.
function VariantC({ rules }: Ctx) {
  const [query, setQuery] = useState('kasthög')
  const hits: Hit[] = findRules(rules, query)
  const ask = (
    <>
      <input type="search" aria-label="Fråga om en regel" placeholder="Vad undrar du?" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="rp-chips">
        {suggestions(names).map((s) => (
          <button key={s} type="button" onClick={() => setQuery(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="rp-hits">
        {query && hits.length === 0 && <p className="rp-none">Ingen regel nämner det. Fråga den som gjorde spelet.</p>}
        {hits.map((h) => (
          <article key={h.id}>
            <h3>{h.heading}</h3>
            <p>{h.text}</p>
          </article>
        ))}
      </div>
    </>
  )
  return (
    <div className="rp-c">
      <Table>
        <aside className="rp-ask">{ask}</aside>
      </Table>
      <Phone>
        <div className="rp-phone-ask">{ask}</div>
      </Phone>
      <p className="rp-foot">C · ingen bok att läsa · en fråga, och de stycken som svarar på den</p>
    </div>
  )
}
