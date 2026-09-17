import { useEffect, useId, useRef, useState } from 'react'
import { namesOfProject } from '@byd/server/doc'
import type { ProjectDoc, RuleBlock, RuleDoc } from '@byd/server'
import {
  importRules,
  planImport,
  renderRules,
  type Names,
  type RenderedBlock,
  type RenderedNode,
  type RuleImport,
  type RuleImportKind,
  type RulePlan,
  type RulePlanSection,
  type RuleRun,
  renderLine,
} from '@byd/template'
import type { ProjectClient } from './ProjectClient.js'
import { useT, type T } from '../i18n/index.js'
import type { Key } from '../i18n/sv.js'
import { useGesture } from './gesture.js'
import { when } from './HistoryPanel.js'

// The rulebook (B7), from the prototype: the page itself is the editor. A block opens where it
// stands and closes when it is left, so what is being written is always what the reader will
// meet — which is the whole point of rules that must work without the designer in the room.
// References are ids: what a rule calls a thing follows what the thing is called.
export type RulesPanelProps = { doc: ProjectDoc; client: ProjectClient }

export function RulesPanel({ doc, client }: RulesPanelProps) {
  const t = useT()
  const [editing, setEditing] = useState<string | null>(null)
  // A file that has been read but not yet taken in (#131). It stands here and not in the document
  // precisely because it has not been decided: the report is the last thing read before the book.
  const [proposal, setProposal] = useState<(RuleImport & { file: string }) | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const names = namesOfProject(doc)
  const rules = doc.rules
  // An empty tab is not an empty screen: it is the book's own disposition, the template drawn on
  // the very page it would become (#131, variant C). The column that finds the way through a
  // written book is the column that was standing there before a word was written, which is why
  // the two states read as one surface rather than two.
  // What the file would do to the book that is already there (#131, third slice). It is worked out
  // once, here, and everything below is a rendering of it: the band counts it, the book is drawn
  // with its marks, and the column beside the book carries the same marks the book does.
  const plan = rules && proposal ? planImport(rules, proposal.doc) : null
  // A book is being written in only when nothing is lying in it: a proposal is a reading of what
  // the book would become, and a page that can be typed into while it says what it is about to
  // lose would be two things at once.
  const writing = rules !== undefined && proposal === null
  // Everything the reader is shown, which over a book includes what is about to leave it. The book
  // that would be written is `plan.doc` and is a subset of this.
  const shown = plan ? { title: plan.doc.title, blocks: plan.blocks.map((planned) => planned.block) } : (rules ?? proposal?.doc ?? templateRules(doc.name, t))
  const marks = new Map((plan?.blocks ?? []).map((planned) => [planned.block.id, planned]))
  const out = renderRules(shown, names)
  const patch = (id: string, next: Partial<RuleBlock>, gesture?: string) =>
    rules && client.setRules({ ...rules, blocks: rules.blocks.map((b) => (b.id === id ? ({ ...b, ...next } as RuleBlock) : b)) }, gesture)
  const addAfter = (id: string) => {
    if (!rules) return
    const at = rules.blocks.findIndex((b) => b.id === id)
    const fresh: RuleBlock = { kind: 'text', id: freeId(rules), text: t('rules.newText') }
    client.setRules({ ...rules, blocks: [...rules.blocks.slice(0, at + 1), fresh, ...rules.blocks.slice(at + 1)] })
    setEditing(fresh.id)
  }
  // Taking a heading away takes its section away: the heading and everything standing under it
  // until the next one. The template is a proposal and not a form (#131), and a section nobody
  // needs has to go in one act — a heading removed on its own would leave its own question behind.
  const remove = (id: string) => {
    if (!rules) return
    const at = rules.blocks.findIndex((b) => b.id === id)
    const gone = new Set([id])
    if (rules.blocks[at]?.kind === 'heading') {
      for (const under of rules.blocks.slice(at + 1)) {
        if (under.kind === 'heading') break
        gone.add(under.id)
      }
    }
    client.setRules({ ...rules, blocks: rules.blocks.filter((b) => !gone.has(b.id)) })
    setEditing(null)
  }
  // A section of the designer's own, at the end of the book, opened where it lands. It stands at
  // the foot of the column the book is found in, because that is where a reader who has read the
  // disposition notices what it is missing (#131).
  const addSection = () => {
    if (!rules) return
    const head = freeId(rules)
    const body = freeId(rules, [head])
    client.setRules({
      ...rules,
      blocks: [...rules.blocks, { kind: 'heading', id: head, level: 1, text: t('rules.newSection') }, { kind: 'text', id: body, text: '', ask: t('rules.ask.own') }],
    })
    setEditing(head)
  }
  const open = (id: string) => rules && setEditing(id)
  // A file the designer picked, read and laid out as the book it would become — and never taken
  // in on the way past. What it loses is read first (#131).
  const pick = (file: File | undefined) => void lay(file)
  const lay = async (file: File | undefined) => {
    if (!file) return
    const read = importRules(await file.text(), doc.name)
    // A file with nothing in it to make a book of says so, rather than looking as though the
    // press did nothing at all.
    setFailed(read.doc.blocks.length === 0 ? t('rules.import.nothing', { file: file.name }) : null)
    setProposal(read.doc.blocks.length === 0 ? null : { ...read, file: file.name })
  }
  return (
    <div className="byd-rules">
      <div className="byd-rules-bar">
        <h2>{t('rules.title')}</h2>
        {rules && <Booklet client={client} />}
        {/* What the rules are for, as a line above the disposition and never as a box (#131). */}
        <span>{t(rules ? 'rules.hint' : 'rules.empty')}</span>
        {/* Which file the book came out of, and when (#131): text in the document, so it travels
            with the project rather than with the browser the file was picked in. */}
        {rules?.source && <span>{t('rules.source', { file: rules.source.file, when: when(rules.source.at, Date.now(), t) })}</span>}
        {failed && (
          <span role="alert" className="byd-rules-warn">
            {failed}
          </span>
        )}
        {out.warnings.length > 0 && writing && (
          <span className="byd-rules-warn" role="status">
            {t(out.warnings.length === 1 ? 'rules.warnings.one' : 'rules.warnings.other', { n: out.warnings.length })}
          </span>
        )}
        {!rules && !proposal && (
          <div className="byd-rules-ways">
            {/* Three ways in, and each of them does what it says: a control that does nothing yet
                would be a promise nobody kept. */}
            <button type="button" className="byd-secondary" onClick={() => client.setRules(startingRules(doc.name, t))}>
              {t('rules.start')}
            </button>
            <button type="button" className="byd-secondary" onClick={() => client.setRules(templateRules(doc.name, t))}>
              {t('rules.template')}
            </button>
            <PickFile label={t('rules.import')} onPick={pick} />
          </div>
        )}
        {/* Importing over a written book (#131, third slice). The way in that the second slice
            deliberately left out — a control that replaced a whole book without saying what it
            took would have been a promise nobody kept — and the way of working the product owner
            asked to support: write in your own editor, and hand the file over again and again.
            The book remembers which file it came out of, so the control can name it. */}
        {rules && !proposal && (
          <div className="byd-rules-ways">
            <PickFile
              label={rules.source ? t('rules.import.again') : t('rules.import.over')}
              {...(rules.source ? { spoken: t('rules.import.again.of', { file: rules.source.file }) } : {})}
              onPick={pick}
            />
          </div>
        )}
      </div>
      {proposal && (
        <Report
          of={proposal}
          plan={plan}
          onCancel={() => setProposal(null)}
          onMake={() => {
            const made = plan?.doc ?? proposal.doc
            setProposal(null)
            setFailed(null)
            // An import lays a named version rather than writing over anything (#131, B4). It is
            // where the protection matters most: what is being replaced may be a whole book
            // somebody wrote by hand, and fifty steps of undo live in one tab.
            void client.importRules(made, proposal.file, t).catch((err: unknown) => setFailed(whyNotSaved(err, t)))
          }}
        />
      )}
      <div className="byd-rules-spread">
        {/* `proposed` is the mark that says a section has nothing written in it yet. A section
            read out of a file has, so only the template's own disposition carries it. The column
            carries the import's own marks instead when a file is lying in the book (#131). */}
        <Toc
          blocks={out.blocks}
          label={t('rules.toc')}
          {...(plan ? { marks: plan.sections } : {})}
          {...(writing ? { onAdd: addSection } : proposal || rules ? {} : { proposed: true })}
        />
        <article className="byd-rulebook" {...(writing ? { 'data-rulebook': true } : { 'data-proposal': true })}>
          <h1>{out.title}</h1>
          {out.blocks.map((b, i) => {
            const source = shown.blocks.find((x) => x.id === b.id)
            const planned = marks.get(b.id)
            // What is happening to this block, as words in the page and in the order they are read.
            // A strike-through is a decoration and a colour is a colour; neither of them reaches a
            // screen reader, and this is a report that has to be read carefully (L12).
            //
            // Once per section and not once per block. A section that is going is a heading and the
            // paragraphs under it, and saying it four times is saying it worse; but three sections
            // going one after another are three losses, and a reader told once about three of them
            // has also been told worse. So the word stands wherever a section opens, and wherever a
            // run of one mark begins, and nowhere else. The setup says so on its own account,
            // because that it survives is the one thing about this import a reader could not
            // otherwise guess (B5).
            const opensASection = b.kind === 'heading' && b.level === 1
            const saysMark =
              planned !== undefined &&
              (planned.block.kind === 'setup' ? true : planned.mark !== 'kept' && (opensASection || marks.get(out.blocks[i - 1]?.id ?? '')?.mark !== planned.mark))
            return (
              <div key={b.id} className="byd-rules-block" data-block={b.id} data-mark={planned?.mark} data-open={editing === b.id ? 'true' : undefined}>
                {planned && saysMark && (
                  <span className="byd-rules-mark">{t(planned.block.kind === 'setup' ? 'rules.mark.setup' : (`rules.mark.${planned.mark}` as Key))}</span>
                )}
                {editing === b.id && source && writing ? (
                  <Editing block={source} names={names} onPatch={(next, gesture) => patch(b.id, next, gesture)} onClose={() => setEditing(null)} onRemove={() => remove(b.id)} />
                ) : writing ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => open(b.id)}
                    onKeyDown={(e) => {
                      // A `role="button"` promises both keys, and Space promises not to scroll the
                      // page out from under the paragraph it just opened (L12).
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      open(b.id)
                    }}
                  >
                    <Block block={b} source={source} names={names} />
                  </div>
                ) : planned?.runs ? (
                  <Rewritten runs={planned.runs} names={names} />
                ) : (
                  <Block block={b} source={source} names={names} />
                )}
                {writing && (
                  <button type="button" className="byd-rules-add" aria-label={t('rules.addAfter', { id: b.id })} onClick={() => addAfter(b.id)}>
                    ＋
                  </button>
                )}
              </div>
            )
          })}
        </article>
      </div>
    </div>
  )
}

// The file the import asks for. The label is what is drawn, and what is hit: a native file control
// beside two pills is two languages in one row. The input keeps its own focus and its own keyboard
// and is taken off the screen for the eye only — `.byd-offscreen`, not a transparent sheet laid
// over the label. Off the screen it is still focusable, still announced, and still opens the picker
// on Enter or Space; stretched and transparent it was a control that could not be seen at all, and
// this repo has already been bitten once by an invisible box catching a click meant for what was
// under it (#140).
//
// `spoken` is what the control is called when the book remembers a file (#131): the picker itself
// cannot be opened on a name — the web has no such thing short of a file handle, and a handle was
// decided against because it belongs to one browser and one person while the book travels with the
// project — so what is built instead is a control that says which file it means.
function PickFile({ label, spoken, onPick }: { label: string; spoken?: string | undefined; onPick(file: File | undefined): void }) {
  return (
    <label className="byd-secondary">
      {label}
      <input
        className="byd-offscreen"
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        aria-label={spoken ?? label}
        onChange={(e) => {
          const file = e.target.files?.[0]
          // The same file picked twice running is no change at all to an input that still holds it,
          // and the second press would do nothing. It holds nothing afterwards — which is exactly
          // what a designer who imports the same file over and over needs it to do.
          e.target.value = ''
          onPick(file)
        }}
      />
    </label>
  )
}

// Why an import did not go in, in words the designer can do something with (#131).
//
// The collision is the one that will really happen: two tabs on one project, or someone else
// saving from the revision this tab is holding, and then the save behind the import is refused.
// `conflict` is the protocol's word for that and nobody can act on it, so what goes on the screen
// is the state she is actually in — the book is in front of her and it is not on the server —
// together with the one way out of it, which is the editor's own answer to every collision:
// reload, and do it again. Nothing is lost by that; the file is still on her disk.
const whyNotSaved = (err: unknown, t: T): string => {
  const why = err instanceof Error ? err.message : String(err)
  return why === 'conflict' ? t('rules.import.conflict') : t('rules.import.failed', { why })
}

// What the import does with the file, read before the book is made and never after it (#131).
// The rule behind the map is that nothing disappears silently, and this is where it is said: what
// became a block, what changed shape on the way, and what the book cannot hold yet.
//
// It is not a dialog. The book it would make stands under it at its own reading width, so the
// report is read against the thing it describes rather than over it (prototype 8, variant B).
//
// Over a book that is already written it says one thing more, and says it first: what the *book*
// loses. Counting what the file loses is not enough there — a designer who wrote three sections by
// hand and hands over a file with two has to see, before she presses anything, that one of them is
// going away (#131, third slice).
function Report({ of, plan, onCancel, onMake }: { of: RuleImport & { file: string }; plan: RulePlan | null; onCancel(): void; onMake(): void }) {
  const t = useT()
  const heading = useId()
  const here = useRef<HTMLElement>(null)
  // Something that must be read carefully has to be reachable and readable without a mouse (L12):
  // it takes the focus when it appears, so the next Tab is into the report and not past it.
  useEffect(() => here.current?.focus(), [])
  return (
    <section
      className="byd-rules-report"
      ref={here}
      tabIndex={-1}
      role="region"
      aria-labelledby={heading}
      data-over={plan ? 'true' : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onCancel()
      }}
    >
      <b id={heading}>{t(plan ? 'rules.import.report.over' : 'rules.import.report')}</b>
      <span>{t('rules.import.from', { file: of.file })}</span>
      <ul>
        {plan &&
          balance(plan).map((line) => (
            <li key={line.of} data-kind={line.kind}>
              {t(`rules.import.${line.of}.${line.n === 1 ? 'one' : 'other'}` as Key, line.params)}
            </li>
          ))}
        {of.notes.map((note) => (
          <li key={note.of} data-kind={WEIGHT[note.of]}>
            {t(`rules.import.${note.of}.${note.n === 1 ? 'one' : 'other'}` as Key, { n: note.n })}
          </li>
        ))}
      </ul>
      <button type="button" className="byd-editor-primary byd-primary" onClick={onMake}>
        {t('rules.import.make')}
      </button>
      <button type="button" className="byd-secondary" onClick={onCancel}>
        {t('rules.import.cancel')}
      </button>
    </section>
  )
}

// What the book she has is about to lose, gain and have rewritten — the lines that stand first in
// the report, because from the third slice on they are the main thing and the file's own losses
// are not. A count of nothing is no line at all: a file handed over unchanged has a report with
// nothing in it about the book, which is the whole reason the preview won over the balance sheet.
function balance(plan: RulePlan): { of: 'loses' | 'rewrites' | 'fresh'; kind: string; n: number; params: Record<string, number> }[] {
  const sections = (mark: string) => plan.sections.filter((section) => section.mark === mark).length
  return [
    { of: 'loses' as const, kind: 'going', n: plan.gone.sections, params: { n: plan.gone.sections, words: plan.gone.words } },
    { of: 'rewrites' as const, kind: 'changed', n: sections('changed'), params: { n: sections('changed') } },
    { of: 'fresh' as const, kind: 'added', n: sections('added'), params: { n: sections('added') } },
  ].filter((line) => line.n > 0)
}

// How heavily a line of the report reads. `kept` came in whole, `changed` came in as something
// else — the file's own title among them, which became nothing because the book is called what the
// game is called (#191) — and `later` is the one line that is neither: a picture is not dropped,
// it is not here yet (#173).
const WEIGHT: Record<RuleImportKind, 'kept' | 'changed' | 'later'> = {
  heading: 'kept',
  text: 'kept',
  list: 'kept',
  ref: 'kept',
  title: 'changed',
  folded: 'changed',
  quote: 'changed',
  table: 'changed',
  code: 'changed',
  link: 'changed',
  break: 'changed',
  image: 'later',
}

// Where a section stands, so the column beside the book can point at it.
const anchorOf = (id: string): string => `rule-${id}`

// The column the book is found in (#131). It is the same column in both states: in the empty tab
// it carries the disposition being proposed, in the written book the sections that were kept.
function Toc({
  blocks,
  label,
  onAdd,
  proposed,
  marks,
}: {
  blocks: readonly RenderedBlock[]
  label: string
  onAdd?: (() => void) | undefined
  proposed?: boolean | undefined
  marks?: readonly RulePlanSection[] | undefined
}) {
  const t = useT()
  // The sections of the book, which is what a heading of the first level is. A subheading stands
  // inside a section and is found by reading it, not by a second rank in the column beside it.
  const headings = blocks.filter((b): b is Extract<RenderedBlock, { kind: 'heading' }> => b.kind === 'heading' && b.level === 1)
  const marked = new Map((marks ?? []).map((section) => [section.id, section.mark]))
  if (headings.length === 0) return null
  return (
    <nav className="byd-rules-toc" aria-label={label}>
      <b aria-hidden="true">{label}</b>
      {headings.map((h) => {
        const mark = marked.get(h.id)
        return (
          <a key={h.id} href={`#${anchorOf(h.id)}`} data-mark={mark}>
            {h.text}
            {/* A disposition that has not been taken up yet says so where the reader is looking, so
                a tab that looks like a book is never mistaken for one (#131, variant C). */}
            {proposed && <span>{t('rules.toc.empty')}</span>}
            {/* And an import marks the column with the same marks it puts in the book, in words
                and never in a colour: the section that is going may be the one below the fold, and
                a reader who moves through the column by keyboard has to meet it there (L12). */}
            {mark && mark !== 'kept' && <span>{t(`rules.toc.${mark}` as Key)}</span>}
          </a>
        )
      })}
      {onAdd && (
        <button type="button" className="byd-rules-own" onClick={onAdd}>
          {t('rules.addSection')}
        </button>
      )}
    </nav>
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
function Editing({ block, names, onPatch, onClose, onRemove }: { block: RuleBlock; names: Names; onPatch(next: Partial<RuleBlock>, gesture?: string): void; onClose(): void; onRemove(): void }) {
  const t = useT()
  // Prose is written a letter at a time and the whole book is rewritten for each of them, so a
  // sentence is one step back and the paragraph before it is another (L14). A reference put in
  // from the row of buttons is one press and stays a step of its own.
  const typing = useGesture('rule-field')
  const insert = (ref: string) => {
    if (block.kind === 'text' || block.kind === 'heading') onPatch({ text: `${block.text} ${ref}` })
    else if (block.kind === 'list') onPatch({ items: [...block.items.slice(0, -1), `${block.items[block.items.length - 1] ?? ''} ${ref}`] })
  }
  return (
    <div className="byd-rules-edit">
      {/* A section's question is the field's placeholder and never its value (#131), so it is
          gone at the first character rather than being text to select and type over. */}
      {block.kind === 'text' && (
        <textarea
          autoFocus
          rows={4}
          aria-label={t('rules.block.text', { id: block.id })}
          {...(block.ask ? { placeholder: block.ask } : {})}
          value={block.text}
          {...typing.visit}
          onChange={(e) => onPatch({ text: e.target.value }, typing.token())}
          onBlur={onClose}
        />
      )}
      {block.kind === 'heading' && (
        <div className="byd-rules-row">
          <input autoFocus aria-label={t('rules.block.heading', { id: block.id })} value={block.text} {...typing.visit} onChange={(e) => onPatch({ text: e.target.value }, typing.token())} onBlur={onClose} />
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
              {...typing.visit}
              onChange={(e) => onPatch({ items: block.items.map((x, j) => (j === i ? e.target.value : x)) }, typing.token())}
            />
          ))}
          <button type="button" onClick={() => onPatch({ items: [...block.items, ''] })}>
            {t('rules.addItem')}
          </button>
        </>
      )}
      {block.kind === 'setup' && <input autoFocus aria-label={t('rules.block.caption', { id: block.id })} placeholder={t('rules.caption.placeholder')} value={block.caption ?? ''} {...typing.visit} onChange={(e) => onPatch({ caption: e.target.value }, typing.token())} onBlur={onClose} />}
      <div className="byd-rules-picker">
        <span>{t('rules.insert')}</span>
        {referables(names).map((r) => (
          <button key={`${r.of}:${r.id}`} type="button" aria-label={t('rules.insert.of', { name: r.name })} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(refFor(r.of, r.id))}>
            {r.name}
          </button>
        ))}
        <button type="button" className="byd-rules-remove" onClick={onRemove}>
          {t(block.kind === 'heading' ? 'rules.removeSection' : 'rules.removeBlock')}
        </button>
      </div>
    </div>
  )
}

function Block({ block, source, names }: { block: RenderedBlock; source?: RuleBlock | undefined; names: Names }) {
  switch (block.kind) {
    case 'heading':
      // The heading is where the column beside the book points, so it carries the anchor itself
      // rather than the chrome around it.
      return block.level === 1 ? <h2 id={anchorOf(block.id)}>{block.text}</h2> : <h3 id={anchorOf(block.id)}>{block.text}</h3>
    case 'text': {
      // A section the template laid out asks its question until it is answered (#131). The
      // question is the editor's and not the reader's: it is drawn only while nothing has been
      // written, and `renderRules` never carries it to the table or to the printed booklet.
      const ask = block.paragraphs.length === 0 && source?.kind === 'text' ? source.ask : undefined
      if (ask) return <p data-ask>{ask}</p>
      return (
        <>
          {block.paragraphs.map((p, i) => (
            <p key={i}>
              <Span nodes={p.children} />
            </p>
          ))}
        </>
      )
    }
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

// A paragraph the file rewrote, sentence by sentence (#131). `del` and `ins` are the elements the
// web has for exactly this, so the marking is in the document and not only in the stylesheet — and
// beside them stands the word in `byd-rules-mark`, because neither element is announced reliably
// and a strike-through is a decoration (L12).
function Rewritten({ runs, names }: { runs: readonly RuleRun[]; names: Names }) {
  return (
    <p>
      {runs.map((run, i) => {
        const words = <Span nodes={renderLine(run.text, names)} />
        if (run.mark === 'going') return <del key={i}>{words}</del>
        if (run.mark === 'added') return <ins key={i}>{words}</ins>
        return <span key={i}>{words}</span>
      })}
    </p>
  )
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

// An id the book has not used. A section is two blocks, so what is being handed out in the same
// breath is named too — nothing is in the document yet to say it is spoken for.
const freeId = (rules: RuleDoc, alsoTaken: readonly string[] = []): string => {
  const taken = new Set([...rules.blocks.map((b) => b.id), ...alsoTaken])
  for (let n = 1; ; n++) if (!taken.has(`b${n}`)) return `b${n}`
}

// What each way in leaves behind (#131). Neither leaves an empty page: both write a book with at
// least one section, so the column beside it has something to carry from the first second and the
// tab the designer opened is the tab she keeps. Both are one edit and therefore one step back
// (B4, L14) — whoever picked the wrong way in presses Ctrl+Z and stands in the empty tab again.

// Writing, with no disposition imposed: one section, carrying a question rather than an empty line.
function startingRules(name: string, t: T): RuleDoc {
  return { title: name, blocks: [{ kind: 'heading', id: 'b1', level: 1, text: t('rules.section.overview') }, { kind: 'text', id: 'b2', text: '', ask: t('rules.ask.overview') }] }
}

// The template: the five sections the product owner approved under B7, which are the five
// questions a player asks in the order she asks them — what is this, how do we begin, what do I do
// now, what may I do, when are we done. A book that answers none of them needs the designer in the
// room, which is the whole reason the book exists.
//
// The setup section comes with the setup already in it: it is the game's own zones (B5) and not a
// drawing kept beside them, so it is right from the first second and never has to be drawn.
//
// It is a proposal and not a form: a section can be taken away before a word is written in it, and
// the plus button adds one of the designer's own.
function templateRules(name: string, t: T): RuleDoc {
  return {
    title: name,
    blocks: [
      { kind: 'heading', id: 'b1', level: 1, text: t('rules.section.overview') },
      { kind: 'text', id: 'b2', text: '', ask: t('rules.ask.overview') },
      { kind: 'heading', id: 'b3', level: 1, text: t('rules.section.setup') },
      { kind: 'setup', id: 'b4', caption: t('rules.starting.setup') },
      { kind: 'text', id: 'b5', text: '', ask: t('rules.ask.setup') },
      { kind: 'heading', id: 'b6', level: 1, text: t('rules.section.turn') },
      { kind: 'text', id: 'b7', text: '', ask: t('rules.ask.turn') },
      { kind: 'heading', id: 'b8', level: 1, text: t('rules.section.actions') },
      { kind: 'text', id: 'b9', text: '', ask: t('rules.ask.actions') },
      { kind: 'heading', id: 'b10', level: 1, text: t('rules.section.end') },
      { kind: 'text', id: 'b11', text: '', ask: t('rules.ask.end') },
    ],
  }
}
