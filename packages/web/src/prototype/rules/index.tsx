// PROTOTYPE — the rulebook in the editor (B7): /prototype/rules?variant=A|B|C. Question: how does
// a designer write rules that know the game they belong to? All three edit the same document and
// render it with the real renderer, so a reference always says what the thing is called now.
import { useState } from 'react'
import type { InlineNode, Paragraph, RenderedBlock } from '@byd/template'
import { Switcher } from './Switcher.js'
import { fromText, names as baseNames, referables, refFor, renderRules, rulebook, toText, type Names, type RuleBlock, type RuleDoc } from './model.js'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Block till vänster, boken till höger' },
  { key: 'B', name: 'Ett fält, boken under' },
  { key: 'C', name: 'Boken själv är redigeraren' },
]
type Ctx = { doc: RuleDoc; setDoc(next: RuleDoc): void; names: Names; rename(): void; renamed: boolean }

export function RulesPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [doc, setDoc] = useState<RuleDoc>(rulebook)
  const [renamed, setRenamed] = useState(false)
  // The point of a reference: renaming the pile rewrites every rule that mentions it.
  const names: Names = renamed ? { ...baseNames, zones: { ...baseNames.zones, discard: 'Påsen' } } : baseNames
  const out = renderRules(doc, names)
  const ctx: Ctx = { doc, setDoc, names, rename: () => setRenamed((r) => !r), renamed }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  return (
    <div className="ru-stage">
      <div className="ru-state">
        <span>
          {doc.blocks.length} block · {out.warnings.length} referenser till något som inte finns · kasthögen heter <b>{names.zones['discard']}</b>
        </span>
        <button type="button" onClick={ctx.rename} style={{ marginLeft: 'auto' }}>
          {renamed ? 'Döp tillbaka kasthögen' : 'Döp om kasthögen till Påsen'}
        </button>
      </div>
      <V {...ctx} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

// The book as the reader meets it: the same rendering the table's panel and the printed booklet
// will use.
function Book({ doc, names }: { doc: RuleDoc; names: Names }) {
  const out = renderRules(doc, names)
  return (
    <article className="ru-book">
      <h1>{out.title}</h1>
      {out.blocks.map((b) => (
        <Block key={b.id} block={b} names={names} />
      ))}
      {out.warnings.length > 0 && (
        <p className="ru-warn" role="status">
          {out.warnings.length} referenser pekar på något spelet inte har.
        </p>
      )}
    </article>
  )
}

function Block({ block, names }: { block: RenderedBlock; names: Names }) {
  switch (block.kind) {
    case 'heading':
      return block.level === 1 ? <h2>{block.text}</h2> : <h3>{block.text}</h3>
    case 'text':
      return (
        <>
          {block.paragraphs.map((p: Paragraph, i: number) => (
            <p key={i}>
              <Span nodes={p.children} names={names} />
            </p>
          ))}
        </>
      )
    case 'list':
      return block.ordered ? (
        <ol>
          {block.items.map((item, i) => (
            <li key={i}>
              <Span nodes={item} names={names} />
            </li>
          ))}
        </ol>
      ) : (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>
              <Span nodes={item} names={names} />
            </li>
          ))}
        </ul>
      )
    case 'setup':
      return (
        <figure className="ru-setup">
          <div className="ru-setup-table">
            {['draw', 'discard', 'market', 'hand:A'].map((id) => (
              <span key={id} data-zone={id}>
                {names.zones[id] ?? id}
              </span>
            ))}
          </div>
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      )
  }
}

function Span({ nodes, names }: { nodes: readonly InlineNode[]; names: Names }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text':
            return <span key={i}>{n.text}</span>
          case 'bold':
            return (
              <strong key={i}>
                <Span nodes={n.children} names={names} />
              </strong>
            )
          case 'italic':
            return (
              <em key={i}>
                <Span nodes={n.children} names={names} />
              </em>
            )
          case 'icon':
            return (
              <b key={i} className="ru-pip">
                {n.name}
              </b>
            )
          case 'ref': {
            const found = (n.of === 'zone' ? names.zones : names.cards)[n.id]
            return (
              <a key={i} className="ru-ref" data-missing={found ? undefined : 'true'} href="#">
                {found ?? `${n.of === 'zone' ? 'zon' : 'kort'}:${n.id}`}
              </a>
            )
          }
        }
      })}
    </>
  )
}

// A picker for what a rule can name, shared by every variant.
function RefPicker({ names, onPick }: { names: Names; onPick(text: string): void }) {
  return (
    <div className="ru-picker">
      <span>Sätt in:</span>
      {referables(names).map((r) => (
        <button key={`${r.of}:${r.id}`} type="button" onClick={() => onPick(refFor(r.of, r.id))}>
          {r.name}
        </button>
      ))}
    </div>
  )
}

// ---------- A — blocks on the left, the book on the right ----------
// The document as a list of blocks, each with its own field and its own kind. The book stands
// beside it and follows every keystroke.
function VariantA({ doc, setDoc, names }: Ctx) {
  const [picked, setPicked] = useState<string | null>(doc.blocks[1]?.id ?? null)
  const patch = (id: string, next: Partial<RuleBlock>) => setDoc({ ...doc, blocks: doc.blocks.map((b) => (b.id === id ? ({ ...b, ...next } as RuleBlock) : b)) })
  const add = (kind: RuleBlock['kind']) => {
    const id = `b${doc.blocks.length + 1}`
    const block: RuleBlock =
      kind === 'heading' ? { kind, id, level: 2, text: 'Ny rubrik' } : kind === 'list' ? { kind, id, ordered: true, items: ['Ett steg.'] } : kind === 'setup' ? { kind, id } : { kind: 'text', id, text: 'Ny text.' }
    setDoc({ ...doc, blocks: [...doc.blocks, block] })
    setPicked(id)
  }
  const insert = (text: string) => {
    const block = doc.blocks.find((b) => b.id === picked)
    if (!block) return
    if (block.kind === 'text') patch(block.id, { text: `${block.text} ${text}` })
    else if (block.kind === 'list') patch(block.id, { items: [...block.items.slice(0, -1), `${block.items[block.items.length - 1] ?? ''} ${text}`] })
  }
  return (
    <div className="ru-a">
      <div className="ru-blocks">
        <h2>Block</h2>
        {doc.blocks.map((b) => (
          <div key={b.id} className="ru-block" data-on={picked === b.id ? 'true' : undefined} onFocus={() => setPicked(b.id)}>
            <span className="ru-kind">{b.kind === 'heading' ? `rubrik ${b.level}` : b.kind === 'list' ? 'lista' : b.kind === 'setup' ? 'uppställning' : 'text'}</span>
            {b.kind === 'heading' && <input aria-label={`Rubrik ${b.id}`} value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })} />}
            {b.kind === 'text' && <textarea rows={3} aria-label={`Text ${b.id}`} value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })} />}
            {b.kind === 'list' &&
              b.items.map((item, i) => (
                <input key={i} aria-label={`Punkt ${i + 1} i ${b.id}`} value={item} onChange={(e) => patch(b.id, { items: b.items.map((x, j) => (j === i ? e.target.value : x)) })} />
              ))}
            {b.kind === 'setup' && <input aria-label={`Bildtext ${b.id}`} placeholder="Bildtext…" value={b.caption ?? ''} onChange={(e) => patch(b.id, { caption: e.target.value })} />}
            <button type="button" className="ru-x" onClick={() => setDoc({ ...doc, blocks: doc.blocks.filter((x) => x.id !== b.id) })}>
              ×
            </button>
          </div>
        ))}
        <div className="ru-add">
          <button type="button" onClick={() => add('heading')}>＋ Rubrik</button>
          <button type="button" onClick={() => add('text')}>＋ Text</button>
          <button type="button" onClick={() => add('list')}>＋ Lista</button>
          <button type="button" onClick={() => add('setup')}>＋ Uppställning</button>
        </div>
        <RefPicker names={names} onPick={insert} />
      </div>
      <Book doc={doc} names={names} />
      <p className="ru-foot">A · ett fält per block, boken bredvid · referenser sätts in i det block som har fokus</p>
    </div>
  )
}

// ---------- B — one field, the book below ----------
// The whole book as one piece of text in a familiar shorthand: # for a heading, - or 1. for a
// list, [[zon:x]] for a reference. Nothing to click; the book below follows.
function VariantB({ doc, setDoc, names }: Ctx) {
  const [text, setText] = useState(() => toText(doc))
  const write = (next: string) => {
    setText(next)
    setDoc(fromText(doc.title, next))
  }
  return (
    <div className="ru-b">
      <div className="ru-editor">
        <h2>Regler</h2>
        <textarea aria-label="Reglerna" value={text} onChange={(e) => write(e.target.value)} spellCheck={false} />
        <RefPicker names={names} onPick={(ref) => write(`${text} ${ref}`)} />
        <p className="ru-hint"># rubrik · ## underrubrik · - eller 1. för listor · **fet** · *kursiv* · {'{2}'} för en pip · [[zon:draw]] och [[kort:drake]] för det spelet har</p>
      </div>
      <Book doc={doc} names={names} />
      <p className="ru-foot">B · ett fält med en välkänd stenografi · boken under, ingen struktur att klicka i</p>
    </div>
  )
}

// ---------- C — the book itself is the editor ----------
// No separate editing surface: the rendered page is what is clicked. A block opens in place,
// closes when it is left, and new blocks are added between the ones already there.
function VariantC({ doc, setDoc, names }: Ctx) {
  const [editing, setEditing] = useState<string | null>(null)
  const out = renderRules(doc, names)
  const patch = (id: string, next: Partial<RuleBlock>) => setDoc({ ...doc, blocks: doc.blocks.map((b) => (b.id === id ? ({ ...b, ...next } as RuleBlock) : b)) })
  const addAfter = (id: string) => {
    const at = doc.blocks.findIndex((b) => b.id === id)
    const fresh: RuleBlock = { kind: 'text', id: `b${Date.now()}`, text: 'Ny text.' }
    setDoc({ ...doc, blocks: [...doc.blocks.slice(0, at + 1), fresh, ...doc.blocks.slice(at + 1)] })
    setEditing(fresh.id)
  }
  return (
    <div className="ru-c">
      <article className="ru-book ru-book-wide">
        <h1>{out.title}</h1>
        {out.blocks.map((b) => {
          const source = doc.blocks.find((x) => x.id === b.id)
          const open = editing === b.id
          return (
            <div key={b.id} className="ru-live" data-open={open ? 'true' : undefined}>
              {open && source ? (
                <div className="ru-live-edit">
                  {source.kind === 'text' && <textarea autoFocus rows={4} aria-label={`Text ${b.id}`} value={source.text} onChange={(e) => patch(b.id, { text: e.target.value })} onBlur={() => setEditing(null)} />}
                  {source.kind === 'heading' && <input autoFocus aria-label={`Rubrik ${b.id}`} value={source.text} onChange={(e) => patch(b.id, { text: e.target.value })} onBlur={() => setEditing(null)} />}
                  {source.kind === 'list' &&
                    source.items.map((item, i) => (
                      <input key={i} aria-label={`Punkt ${i + 1} i ${b.id}`} value={item} onChange={(e) => patch(b.id, { items: source.items.map((x, j) => (j === i ? e.target.value : x)) })} onBlur={() => setEditing(null)} />
                    ))}
                  {source.kind === 'setup' && <input autoFocus aria-label={`Bildtext ${b.id}`} value={source.caption ?? ''} onChange={(e) => patch(b.id, { caption: e.target.value })} onBlur={() => setEditing(null)} />}
                  <RefPicker
                    names={names}
                    onPick={(ref) => {
                      if (source.kind === 'text') patch(b.id, { text: `${source.text} ${ref}` })
                      else if (source.kind === 'heading') patch(b.id, { text: `${source.text} ${ref}` })
                    }}
                  />
                </div>
              ) : (
                <div role="button" tabIndex={0} onClick={() => setEditing(b.id)} onKeyDown={(e) => e.key === 'Enter' && setEditing(b.id)}>
                  <Block block={b} names={names} />
                </div>
              )}
              <button type="button" className="ru-between" aria-label={`Lägg till efter ${b.id}`} onClick={() => addAfter(b.id)}>
                ＋
              </button>
            </div>
          )
        })}
      </article>
      <p className="ru-foot">C · sidan är redigeraren · ett stycke öppnas där det står och stängs när det lämnas</p>
    </div>
  )
}
