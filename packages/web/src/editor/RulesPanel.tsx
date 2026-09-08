import { useState } from 'react'
import { namesOfProject } from '@byd/server/doc'
import type { ProjectDoc, RuleBlock, RuleDoc } from '@byd/server'
import { renderRules, type Names, type RenderedBlock, type RenderedNode } from '@byd/template'
import type { ProjectClient } from './ProjectClient.js'
import { useT, type T } from '../i18n/index.js'

// The rulebook (B7), from the prototype: the page itself is the editor. A block opens where it
// stands and closes when it is left, so what is being written is always what the reader will
// meet — which is the whole point of rules that must work without the designer in the room.
// References are ids: what a rule calls a thing follows what the thing is called.
export type RulesPanelProps = { doc: ProjectDoc; client: ProjectClient }

export function RulesPanel({ doc, client }: RulesPanelProps) {
  const t = useT()
  const [editing, setEditing] = useState<string | null>(null)
  const names = namesOfProject(doc)
  const rules = doc.rules
  if (!rules) {
    return (
      <div className="byd-rules-empty">
        <h2>{t('rules.title')}</h2>
        <p>{t('rules.empty')}</p>
        <button type="button" onClick={() => client.setRules(startingRules(doc.name, t))}>
          {t('rules.start')}
        </button>
      </div>
    )
  }
  const out = renderRules(rules, names)
  const patch = (id: string, next: Partial<RuleBlock>) =>
    client.setRules({ ...rules, blocks: rules.blocks.map((b) => (b.id === id ? ({ ...b, ...next } as RuleBlock) : b)) })
  const addAfter = (id: string) => {
    const at = rules.blocks.findIndex((b) => b.id === id)
    const fresh: RuleBlock = { kind: 'text', id: freeId(rules), text: t('rules.newText') }
    client.setRules({ ...rules, blocks: [...rules.blocks.slice(0, at + 1), fresh, ...rules.blocks.slice(at + 1)] })
    setEditing(fresh.id)
  }
  const remove = (id: string) => {
    client.setRules({ ...rules, blocks: rules.blocks.filter((b) => b.id !== id) })
    setEditing(null)
  }
  return (
    <div className="byd-rules">
      <div className="byd-rules-bar">
        <h2>{t('rules.title')}</h2>
        <Booklet client={client} />
        <span>{t('rules.hint')}</span>
        {out.warnings.length > 0 && (
          <span className="byd-rules-warn" role="status">
            {t(out.warnings.length === 1 ? 'rules.warnings.one' : 'rules.warnings.other', { n: out.warnings.length })}
          </span>
        )}
      </div>
      <article className="byd-rulebook" data-rulebook>
        <h1>{out.title}</h1>
        {out.blocks.map((b) => {
          const source = rules.blocks.find((x) => x.id === b.id)
          return (
            <div key={b.id} className="byd-rules-block" data-block={b.id} data-open={editing === b.id ? 'true' : undefined}>
              {editing === b.id && source ? (
                <Editing block={source} names={names} onPatch={(next) => patch(b.id, next)} onClose={() => setEditing(null)} onRemove={() => remove(b.id)} />
              ) : (
                <div role="button" tabIndex={0} onClick={() => setEditing(b.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setEditing(b.id)}>
                  <Block block={b} names={names} />
                </div>
              )}
              <button type="button" className="byd-rules-add" aria-label={t('rules.addAfter', { id: b.id })} onClick={() => addAfter(b.id)}>
                ＋
              </button>
            </div>
          )
        })}
      </article>
    </div>
  )
}

// The rulebook as a booklet for print (B7): one rendering of the rules as they stand, through
// the same worker that renders every card. The link is offered only once there is a file.
function Booklet({ client }: { client: ProjectClient }) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'working' | { hash: string } | { error: string }>('idle')
  const order = async () => {
    setState('working')
    try {
      const hash = await client.orderBooklet(t)
      for (let i = 0; i < 120; i++) {
        if (await client.rendered(hash)) return setState({ hash })
        await new Promise((r) => setTimeout(r, 250))
      }
      setState({ error: t('rules.booklet.failed') })
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) })
    }
  }
  if (typeof state === 'object' && 'hash' in state) {
    return (
      <a className="byd-rules-booklet" href={client.bookletUrl(state.hash)} target="_blank" rel="noreferrer">
        {t('rules.booklet.open')}
      </a>
    )
  }
  return (
    <>
      <button type="button" className="byd-rules-booklet" disabled={state === 'working'} onClick={() => void order()}>
        {t('rules.booklet')}
      </button>
      {state === 'working' && <span role="status">{t('rules.booklet.rendering')}</span>}
      {typeof state === 'object' && 'error' in state && <span role="alert">{state.error}</span>}
    </>
  )
}

// One block open for writing, with the things the game has to hand.
function Editing({ block, names, onPatch, onClose, onRemove }: { block: RuleBlock; names: Names; onPatch(next: Partial<RuleBlock>): void; onClose(): void; onRemove(): void }) {
  const t = useT()
  const insert = (ref: string) => {
    if (block.kind === 'text' || block.kind === 'heading') onPatch({ text: `${block.text} ${ref}` })
    else if (block.kind === 'list') onPatch({ items: [...block.items.slice(0, -1), `${block.items[block.items.length - 1] ?? ''} ${ref}`] })
  }
  return (
    <div className="byd-rules-edit">
      {block.kind === 'text' && <textarea autoFocus rows={4} aria-label={t('rules.block.text', { id: block.id })} value={block.text} onChange={(e) => onPatch({ text: e.target.value })} onBlur={onClose} />}
      {block.kind === 'heading' && (
        <div className="byd-rules-row">
          <input autoFocus aria-label={t('rules.block.heading', { id: block.id })} value={block.text} onChange={(e) => onPatch({ text: e.target.value })} onBlur={onClose} />
          <select aria-label={t('rules.block.level', { id: block.id })} value={block.level} onChange={(e) => onPatch({ level: e.target.value === '1' ? 1 : 2 })}>
            <option value="1">{t('rules.level.1')}</option>
            <option value="2">{t('rules.level.2')}</option>
          </select>
        </div>
      )}
      {block.kind === 'list' && (
        <>
          {block.items.map((item, i) => (
            <input
              key={i}
              {...(i === 0 ? { autoFocus: true } : {})}
              aria-label={t('rules.block.item', { n: i + 1, id: block.id })}
              value={item}
              onChange={(e) => onPatch({ items: block.items.map((x, j) => (j === i ? e.target.value : x)) })}
            />
          ))}
          <button type="button" onClick={() => onPatch({ items: [...block.items, ''] })}>
            {t('rules.addItem')}
          </button>
        </>
      )}
      {block.kind === 'setup' && <input autoFocus aria-label={t('rules.block.caption', { id: block.id })} placeholder={t('rules.caption.placeholder')} value={block.caption ?? ''} onChange={(e) => onPatch({ caption: e.target.value })} onBlur={onClose} />}
      <div className="byd-rules-picker">
        <span>{t('rules.insert')}</span>
        {referables(names).map((r) => (
          <button key={`${r.of}:${r.id}`} type="button" aria-label={t('rules.insert.of', { name: r.name })} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(refFor(r.of, r.id))}>
            {r.name}
          </button>
        ))}
        <button type="button" className="byd-rules-remove" onClick={onRemove}>
          {t('rules.removeBlock')}
        </button>
      </div>
    </div>
  )
}

function Block({ block, names }: { block: RenderedBlock; names: Names }) {
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
      // The setup picture is the game's own zones (B5's follow-on), never a drawing beside them.
      return (
        <figure className="byd-rules-setup">
          <div>
            {Object.entries(names.zones).map(([id, name]) => (
              <span key={id} data-setup-zone={id}>
                {name}
              </span>
            ))}
          </div>
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      )
  }
}

function Span({ nodes }: { nodes: readonly RenderedNode[] }) {
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
              <b key={i} className="byd-rules-pip">
                {n.name}
              </b>
            )
          case 'ref':
            return (
              <i key={i} className="byd-rules-ref" data-ref={n.id} {...(n.name ? {} : { 'data-missing': 'true' })}>
                {n.name ?? `${n.of === 'zone' ? 'zon' : 'kort'}:${n.id}`}
              </i>
            )
        }
      })}
    </>
  )
}

// What a rule can name: everything the game has, by what it is called.
export function referables(names: Names): { of: 'zone' | 'card'; id: string; name: string }[] {
  return [
    ...Object.entries(names.zones).map(([id, name]) => ({ of: 'zone' as const, id, name })),
    ...Object.entries(names.cards).map(([id, name]) => ({ of: 'card' as const, id, name })),
  ]
}
export const refFor = (of: 'zone' | 'card', id: string): string => `[[${of === 'zone' ? 'zon' : 'kort'}:${id}]]`

const freeId = (rules: RuleDoc): string => {
  const taken = new Set(rules.blocks.map((b) => b.id))
  for (let n = 1; ; n++) if (!taken.has(`b${n}`)) return `b${n}`
}

// What a rulebook starts as: the game's name, and the two headings every game needs.
function startingRules(name: string, t: T): RuleDoc {
  return {
    title: name,
    blocks: [
      { kind: 'heading', id: 'b1', level: 1, text: t('rules.starting.how') },
      { kind: 'text', id: 'b2', text: t('rules.starting.howText') },
      { kind: 'heading', id: 'b3', level: 2, text: t('rules.starting.turn') },
      { kind: 'list', id: 'b4', ordered: true, items: [t('rules.starting.turnItem')] },
      { kind: 'setup', id: 'b5', caption: t('rules.starting.setup') },
    ],
  }
}
