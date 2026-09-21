import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { arrangementOf, namesOfProject } from '@byd/server/doc'
import type { ProjectDoc, RuleBlock, RuleDoc } from '@byd/server'
import {
  imagesIn,
  importRules,
  planImport,
  plainOf,
  renderRules,
  ruleEm,
  type Names,
  type RenderedBlock,
  type RenderedNode,
  type RuleImage,
  type RuleImages,
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
import { ASSET_PREFIX, RULE_IMAGE_MAX_BYTES, assetUrl, imageSizeOf, imageTypeOf } from './assets.js'
import { when } from './HistoryPanel.js'
import { RuleShelf } from '../rules/RuleDrawer.js'
import { SetupOverview } from '../rules/SetupOverview.js'
import { readTo, readingIn, sectionOf, type Reading } from '../rules/reading.js'
import { PickList, pickKey, pickOptionId, triggerBehind, writeTrigger } from './picking.js'

// The rulebook (B7), from the prototype: the page itself is the editor. A block opens where it
// stands and closes when it is left, so what is being written is always what the reader will
// meet — which is the whole point of rules that must work without the designer in the room.
// References are ids: what a rule calls a thing follows what the thing is called.
export type RulesPanelProps = { doc: ProjectDoc; client: ProjectClient; assetBase?: string | undefined }

export function RulesPanel({ doc, client, assetBase }: RulesPanelProps) {
  const t = useT()
  const [editing, setEditing] = useState<string | null>(null)
  // Which of the book's two modes is being read (#227). It is a view and never a fact about the
  // game (L4): it is held here, in this tab, for as long as the tab is open and not a moment
  // longer — nothing is written to the document, and nothing is written to the browser either.
  // The rules tab is a writing surface first, and previewing is something one goes to and leaves.
  const [chosen, setChosen] = useState<Mode>('edit')
  // What is said out loud when the mode changes, and where the reader was when it did. The place
  // is a ref and not state: putting a reader back is a thing done to the DOM once, not a thing
  // the page is drawn from — and it has to survive a switch made out of an open list of answers,
  // which has no section of its own to give back (#227).
  const [announced, setAnnounced] = useState('')
  const place = useRef<Reading | null>(null)
  const page = useRef<HTMLDivElement>(null)
  const shelf = useRef<HTMLDivElement>(null)
  // A file that has been read but not yet taken in (#131). It stands here and not in the document
  // precisely because it has not been decided: the report is the last thing read before the book.
  const [proposal, setProposal] = useState<(RuleImport & { file: string }) | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  // Which picture the column beside the book just took her to (#173). It is a mark on the block
  // and not a scroll position: a designer who asked "where are the pictures that say nothing" has
  // to be able to see which one she was taken to, and see it in a word rather than in a ring.
  const [found, setFound] = useState<string | null>(null)
  const foundHere = useRef<HTMLDivElement>(null)
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
  // There is no table to show a book that has not been written, and a proposal is a reading of
  // what the book would become rather than a book anybody is handed. Both fall back to the
  // editable mode rather than offering a preview of something that is not there.
  const mode: Mode = writing ? chosen : 'edit'
  // Everything the reader is shown, which over a book includes what is about to leave it. The book
  // that would be written is `plan.doc` and is a subset of this.
  const shown = plan ? { title: plan.doc.title, blocks: plan.blocks.map((planned) => planned.block) } : (rules ?? proposal?.doc ?? templateRules(doc.name, t))
  const marks = new Map((plan?.blocks ?? []).map((planned) => [planned.block.id, planned]))
  // The book is rendered against this very document, setup and all (#270): what the designer
  // reads is what a table locked to this version would hand its players.
  const out = renderRules(shown, names, arrangementOf(doc))
  // The area the book is read in, whichever mode it is being read in. At the moment the switch is
  // pressed this is still the one being left, which is what makes the reading a reading of it.
  const scroller = (): HTMLElement | null => (mode === 'table' ? shelf.current : page.current)
  const setMode = (next: Mode) => {
    if (next === mode) return
    // A block left open for writing is closed first: a paragraph being typed into has no place at
    // the table, and leaving a field behind under a swapped-out page loses what is in it.
    setEditing(null)
    // An open list of answers has no block in it, so the reading is the last one there was: a
    // reader who asked a question and switched lands where she was reading, never on nothing.
    const area = scroller()
    place.current = (area && readingIn(area)) ?? place.current
    const at = place.current
    setAnnounced(
      at
        ? t('rules.view.said.at', { mode: t(MODE_WORD[next]), section: sectionOf(out.blocks, out.title, at.block) })
        : t('rules.view.said', { mode: t(MODE_WORD[next]) }),
    )
    setChosen(next)
  }
  // The other box has just been given its size by the layout; the reader is put back into it
  // before anything is painted, so the swap is a page turning and never a jump to the top.
  useLayoutEffect(() => {
    const area = mode === 'table' ? shelf.current : page.current
    if (area) readTo(area, place.current)
  }, [mode])
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
  // Going to a picture is going there with the keyboard as well as with the eye: the block takes
  // the focus, so the next key press acts on the picture the count pointed at rather than on
  // whatever the column left behind (L12). `scrollIntoView` is a browser's and not jsdom's.
  useEffect(() => {
    if (!found) return
    const here = foundHere.current
    here?.scrollIntoView?.({ block: 'center' })
    here?.querySelector<HTMLElement>('[role="button"]')?.focus()
  }, [found])
  // A file the designer picked, read and laid out as the book it would become — and never taken
  // in on the way past. What it loses is read first (#131).
  const pick = (files: readonly File[]) => void lay(files)
  const lay = async (files: readonly File[]) => {
    // The book is one file and the pictures stand beside it (#173). Which is which is read from
    // the bytes and the name, never from the order they happen to arrive in.
    const named = files.filter((f) => /\.(md|markdown|txt)$/i.test(f.name))
    const documents = named.length > 0 ? named : files.filter((f) => !f.type.startsWith('image/'))
    // Which of two documents is the book is not the tool's to guess (#293). Reaching for the
    // first would make the answer the order the files happened to arrive in — an order a drop
    // does not even promise — and the other document would be gone without a word.
    if (documents.length > 1) {
      setProposal(null)
      setFailed(t('rules.import.manyBooks', { files: documents.map((f) => f.name).join(', ') }))
      return
    }
    const md = documents[0]
    // Pictures on their own are not a book. A drop makes this reachable in a way the picker
    // never did — she can let go of the folder's images and leave the Markdown behind — and a
    // control that quietly did nothing with them is a control read as broken (#293). Nothing
    // disappears silently (#131), so the files that arrived are named back.
    if (!md) {
      setProposal(null)
      setFailed(files.length === 0 ? null : t('rules.import.noBook', { files: files.map((f) => f.name).join(', ') }))
      return
    }
    const text = await md.text()
    const read = importRules(text, doc.name, await pictures(text, files.filter((f) => f !== md), client, t))
    // A file with nothing in it to make a book of says so, rather than looking as though the
    // press did nothing at all — and it says why, when there is a why. A file whose content was
    // its pictures, and whose own title became nothing because the book is called what the game
    // is called (#191), leaves no block behind; told only that there is nothing in it, the
    // designer would never learn that the pictures were what she failed to hand over. Nothing
    // disappears silently (#131), and that holds where there is no report to hold it.
    const nothing = [t('rules.import.nothing', { file: md.name }), ...read.problems.map((problem) => t(`rules.import.picture.${problem.why}` as Key, { file: problem.file }))]
    setFailed(read.doc.blocks.length === 0 ? nothing.join(' ') : null)
    setProposal(read.doc.blocks.length === 0 ? null : { ...read, file: md.name })
  }
  return (
    <div className="byd-rules">
      <div className="byd-rules-bar">
        <h2>{t('rules.title')}</h2>
        {writing && <Modes mode={mode} onMode={setMode} />}
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
        {/* The tools of a written book, together and apart from the switch (#298). The booklet used
            to stand right beside the switch, where a pill after two pills reads as a third mode of
            the book; it is a thing done with the book, like the import, and the two stand behind a
            divider at the far end of the header. Import and booklet only, because a control that is
            not a tool of the book — the switch, the hint — would make the group the header with a
            name on it, not a group. */}
        {rules && !proposal && (
          <div className="byd-rules-ways byd-rules-tools" role="group" aria-label={t('rules.tools')}>
            <PickFile
              label={rules.source ? t('rules.import.again') : t('rules.import.over')}
              {...(rules.source ? { spoken: t('rules.import.again.of', { file: rules.source.file }) } : {})}
              onPick={pick}
            />
            <Booklet client={client} />
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
        {/* `marks` is both ranks of the plan, because the column lists both ranks (#207). They are
            two lists in the plan and one map in the column: the report counts sections and the
            column points at headings, and neither of them wants the other's list. */}
        <Toc
          blocks={out.blocks}
          label={t('rules.toc')}
          {...(writing ? { silent: silentImages(out.blocks), onFind: setFound } : {})}
          {...(plan ? { marks: [...plan.sections, ...plan.subsections] } : {})}
          {...(writing ? { onAdd: addSection } : proposal || rules ? {} : { proposed: true })}
        />
        {/* The book is read in an area of its own, beside the column's and never inside it (#210).
            Before this the pair shared the tab's single scrolling area and the column hung in it,
            so at the length a rulebook really has its last rows could be read only once the book
            had been scrolled to the bottom — the map waiting on the territory. */}
        {/* And it is the same box in both modes (#227), which is what makes the switch a spread
            that changes rather than two surfaces. In the presented mode the box holds a felt with
            the table's own drawer standing at its edge: a 380 px drawer against the editor's dark
            bottom reads as a narrow panel in a tool, and against a felt it reads as what it is.

            Keyed on the mode, so each mode opens a box of its own rather than inheriting the
            height the other had been scrolled to. Where the reader was is carried as a reading
            and put back deliberately; a scroll left lying in the box would be exactly the number
            this slice exists to avoid, arriving through the back door. */}
        <div className="byd-rules-reading" data-mode={mode} key={mode} ref={page}>
          {mode === 'table' ? (
            <div className="byd-rules-felt">
              <RuleShelf rules={out} assets={assetBase} placement="table" startOpen body={shelf} />
            </div>
          ) : (
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
                  <div
                    key={b.id}
                    className="byd-rules-block"
                    data-block={b.id}
                    data-mark={planned?.mark}
                    data-open={editing === b.id ? 'true' : undefined}
                    {...(found === b.id ? { 'data-found': 'true', ref: foundHere } : {})}
                  >
                    {/* The picture the column took her to says so in a word of the tool's own, never in
                        a ring drawn round it: a decoration is not an answer (L12). It is not a
                        `figcaption`, because a caption is the designer's line and this is not. */}
                    {found === b.id && <span className="byd-rules-found">{t('rules.image.found')}</span>}
                    {planned && saysMark && (
                      <span className="byd-rules-mark">{t(planned.block.kind === 'setup' ? 'rules.mark.setup' : (`rules.mark.${planned.mark}` as Key))}</span>
                    )}
                    {editing === b.id && source && writing ? (
                      <Editing
                        block={source}
                        names={names}
                        assetBase={assetBase}
                        onPatch={(next, gesture) => patch(b.id, next, gesture)}
                        onClose={() => setEditing(null)}
                        onRemove={() => remove(b.id)}
                      />
                    ) : writing && b.kind === 'setup' ? (
                      // The setup carries controls of its own since #270 — the fold and the seat
                      // picker — so the figure cannot also be the one big control that opens the
                      // block: a control inside a control is invalid and unreachable (UX-37, #82).
                      // Its caption is the way in, and the only thing about a setup that is written.
                      <SetupOverview block={b} level={3} onCaption={() => open(b.id)} />
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
                        <Block block={b} source={source} assetBase={assetBase} />
                      </div>
                    ) : planned?.runs ? (
                      <Rewritten runs={planned.runs} names={names} />
                    ) : (
                      <Block block={b} source={source} assetBase={assetBase} />
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
          )}
        </div>
      </div>
      {/* What the switch did, for a reader who cannot see the spread change under her (#227). It
          is polite and it is off the screen: the mode and the section are the two things that
          moved, and neither of them is worth taking the focus for. */}
      <p className="byd-offscreen" role="status" aria-live="polite">
        {announced}
      </p>
    </div>
  )
}

// The files the import asks for: the book, and since #173 the pictures it names, picked in one go.
// The label is what is drawn, and what is hit: a native file control
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
//
// The control is the receiver as well as the picker (#293, #291 variant B): the book and its
// pictures are let go on the thing that takes them, and there is no second box beside it and no
// drop over the whole rulebook. `onPick` already takes a handful of files, so a drop is a second
// way into the one path and never a path of its own — the same reading, report and confirmation.
function PickFile({ label, spoken, onPick }: { label: string; spoken?: string | undefined; onPick(files: readonly File[]): void }) {
  const [over, setOver] = useState(false)
  return (
    <label
      className="byd-secondary"
      data-over={over ? 'true' : undefined}
      onDragOver={(e) => {
        // Both halves are cancelled. A file let go where the page does not catch it is the
        // browser leaving the editor to open the Markdown as a page of its own.
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onPick([...(e.dataTransfer.files ?? [])])
      }}
    >
      {label}
      <input
        className="byd-offscreen"
        type="file"
        // The book and its pictures are picked together (#173): a picture in the book is a file of
        // the designer's, and the web gives no way to read a file a Markdown file merely names.
        // A picture that was not handed over is a line in the report saying exactly that, which is
        // also where the designer learns that she may hand them over at all.
        multiple
        accept=".md,.markdown,text/markdown,text/plain,image/png,image/jpeg,image/webp,image/gif"
        aria-label={spoken ?? label}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          // The same file picked twice running is no change at all to an input that still holds it,
          // and the second press would do nothing. It holds nothing afterwards — which is exactly
          // what a designer who imports the same file over and over needs it to do.
          e.target.value = ''
          onPick(files)
        }}
      />
    </label>
  )
}

// The pictures a file points at, made into what the import can hold (#173). Reading a file,
// checking it and putting it in the project's assets needs the network and the browser, so it is
// done here and the map from file to block stays framework-free.
//
// An uploaded file is untrusted input. What it is called and the type the browser guessed from
// that name are claims, so the bytes decide: a file whose bytes are not one of the four raster
// formats is refused, and the type it is stored and served as is the one that was read out of it —
// so nothing can talk its way into being served as something else. The weight is checked before
// the upload rather than after, so the report can name the picture that was too big.
async function pictures(markdown: string, beside: readonly File[], client: ProjectClient, t: T): Promise<RuleImages> {
  const named = new Map(beside.map((file) => [file.name.toLowerCase(), file]))
  const images: RuleImages = {}
  for (const address of imagesIn(markdown)) {
    images[address] = await taken(named.get(fileOf(address)), client, t)
  }
  return images
}

async function taken(file: File | undefined, client: ProjectClient, t: T): Promise<RuleImage> {
  if (!file) return { why: 'missing' }
  if (file.size > RULE_IMAGE_MAX_BYTES) return { why: 'too-big' }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = imageTypeOf(bytes)
    if (!type) return { why: 'wrong-format' }
    // How big the picture is in its own pixels, read out of the same bytes (#173). It travels with
    // the block because the one measurement in millimetres is worked out from it, on every surface
    // and without going back to the network. A file whose header does not say how big it is cannot
    // be measured, and a picture the press would have to guess at does not come in: the report
    // says the file could not be read, which is what it means.
    const px = imageSizeOf(bytes)
    if (!px) return { why: 'broken' }
    return { asset: `${ASSET_PREFIX}${await client.uploadAsset(new Blob([bytes], { type }), 'image', t)}`, px }
  } catch {
    return { why: 'broken' }
  }
}

// Which of the picked files an address means: the file it names, whatever folder the Markdown put
// it in. A browser hands over names and not paths, so the folder is the one thing about the
// address that cannot be honoured.
const fileOf = (address: string): string => {
  const path = address.split(/[?#]/)[0] ?? ''
  const name = path.split('/').pop() ?? ''
  try {
    return decodeURIComponent(name).toLowerCase()
  } catch {
    return name.toLowerCase()
  }
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
        {/* A picture that could not be taken in (#173). Nothing disappears silently (#131): the
            line stays here with the reason, named after the file it was, and the book is made
            without it. */}
        {of.problems.map((problem) => (
          <li key={problem.file} data-kind="going">
            {t(`rules.import.picture.${problem.why}` as Key, { file: problem.file })}
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

// How heavily a line of the report reads. `kept` came in whole and `changed` came in as something
// else: the file's own title among them, which became nothing because the book is called what the
// game is called (#191), and a picture with no alt text, which is in the book and says nothing —
// a change of shape and not a clean arrival (#173). There is no third weight any more: since a
// picture comes in as a block of its own, nothing in the report is merely waiting.
const WEIGHT: Record<RuleImportKind, 'kept' | 'changed'> = {
  heading: 'kept',
  text: 'kept',
  list: 'kept',
  ref: 'kept',
  image: 'kept',
  title: 'changed',
  folded: 'changed',
  quote: 'changed',
  table: 'changed',
  code: 'changed',
  link: 'changed',
  break: 'changed',
  decorative: 'changed',
}

// The two modes of the same book (#227). `edit` is the page that is its own editor; `table` is
// the drawer the players are handed, drawn by the table's own code.
export type Mode = 'edit' | 'table'
const MODES: readonly Mode[] = ['edit', 'table']
const MODE_WORD: Record<Mode, Key> = { edit: 'rules.view.edit', table: 'rules.view.table' }

// The switch, first in the rules tab's own header and directly after the book's name (#227,
// variant A). Two buttons and not a menu: two modes, one press between them, and both of them
// readable at once — and `.byd-choice` rather than a shape of its own, because one of a set is
// what the button language already has a word for (L13).
function Modes({ mode, onMode }: { mode: Mode; onMode(next: Mode): void }) {
  const t = useT()
  return (
    <span className="byd-rules-modes" role="group" aria-label={t('rules.view')}>
      {MODES.map((m) => (
        <button key={m} type="button" className="byd-choice" aria-pressed={mode === m} onClick={() => onMode(m)}>
          {t(MODE_WORD[m])}
        </button>
      ))}
    </span>
  )
}

// Where a heading stands, so the column beside the book can point at it. Both ranks carry one:
// `Block` has written an anchor on every heading since the book was first rendered.
const anchorOf = (id: string): string => `rule-${id}`

// A heading as the renderer hands it over, which is the only shape the column ever reads.
type Heading = Extract<RenderedBlock, { kind: 'heading' }>

// The pictures the book says nothing about, in the order they stand (#173). A decorative picture is
// one whose alt text is empty, which is HTML's own word for it and therefore the only mark there
// is — see B7 for the cost that default accepts, and this for what keeps it from being silent.
const silentImages = (blocks: readonly RenderedBlock[]): string[] => blocks.filter((b) => b.kind === 'image' && b.alt === '').map((b) => b.id)

// The column the book is found in (#131). It is the same column in both states: in the empty tab
// it carries the disposition being proposed, in the written book the sections that were kept.
function Toc({
  blocks,
  label,
  onAdd,
  proposed,
  marks,
  silent,
  onFind,
}: {
  blocks: readonly RenderedBlock[]
  label: string
  onAdd?: (() => void) | undefined
  proposed?: boolean | undefined
  marks?: readonly RulePlanSection[] | undefined
  silent?: readonly string[] | undefined
  onFind?: ((id: string) => void) | undefined
}) {
  const t = useT()
  // The book as the column lists it: a section per heading of the first level and, under it, the
  // subheadings standing in it (#207). The column used to carry the first rank alone, and a
  // subheading was found by reading its section — a choice #131 made on a byte budget that #186
  // ended. The product owner chose the book's own shape over the shorter column: the price is that
  // this book's 22 sections become 54 rows, and the area of its own the column won in #210 is what
  // that price is paid out of.
  //
  // A subheading standing before the book's first section is in no section and is not listed, which
  // is what happened to every subheading before this. An imported file cannot leave the book that
  // way any more (#202), and a book written by hand that does has a disposition problem the column
  // is the wrong place to report.
  const sections: { heading: Heading; under: Heading[] }[] = []
  for (const b of blocks) {
    if (b.kind !== 'heading') continue
    if (b.level === 1) sections.push({ heading: b, under: [] })
    else sections[sections.length - 1]?.under.push(b)
  }
  const marked = new Map([...(marks ?? [])].map((section) => [section.id, section.mark]))
  const [first] = silent ?? []
  if (sections.length === 0) return null
  // One row, whichever rank it is. What differs is what the row says about itself before it says
  // its own words: a subheading names its rank out loud, because the indent that shows it is worth
  // nothing to a reader who is not looking at it (L12).
  const row = (h: Heading, rank: 1 | 2) => {
    const mark = marked.get(h.id)
    return (
      <a href={`#${anchorOf(h.id)}`} data-mark={mark} data-level={rank}>
        {rank === 2 && <span className="byd-offscreen">{`${t('rules.toc.level2')} `}</span>}
        {/* The row says what the heading says, references and all (#272): the column points at the
            book, so a section named after a pile has to be called in the column what it is called
            in the book — and follow the pile when it is renamed. */}
        <Span nodes={h.children} />
        {/* A disposition that has not been taken up yet says so where the reader is looking, so
            a tab that looks like a book is never mistaken for one (#131, variant C). */}
        {proposed && <span>{t('rules.toc.empty')}</span>}
        {/* And an import marks the column with the same marks it puts in the book, in words
            and never in a colour: the section that is going may be the one below the fold, and
            a reader who moves through the column by keyboard has to meet it there (L12). */}
        {mark && mark !== 'kept' && <span>{t(`rules.toc.${mark}` as Key)}</span>}
      </a>
    )
  }
  return (
    <nav className="byd-rules-toc" aria-label={label}>
      <b aria-hidden="true">{label}</b>
      <ul>
        {sections.map((section) => (
          <li key={section.heading.id}>
            {row(section.heading, 1)}
            {/* The second rank is a list of its own and it is named after the section it belongs
                to, so what the eye reads as an indent is heard as «Underrubriker i Uppställning,
                lista, 3 objekt». A section with nothing under it opens no list: an empty group is
                a promise of rows that are not there.
                The group is named after the section, and a name is a string: a heading carries
                children since #272, so what goes into the label is the book's own plain reading of
                them — the same letters the book's `text` holds for that line. */}
            {section.under.length > 0 && (
              <ul aria-label={t('rules.toc.under', { section: plainOf(section.heading.children) })}>
                {section.under.map((sub) => (
                  <li key={sub.id}>{row(sub, 2)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {/* The pictures nobody has written an alt text for, counted and gone to (#173). It stands in
          the column and not in a band that scrolls past: the import's report is gone by the next
          morning and the silent pictures are not, and this is "nothing disappears silently" said a
          week later rather than only at the moment of the import. A count of nothing is no line at
          all, so the day the last alt text is written the control is simply not there. The arrow is
          drawn and never spoken — what the control is called is the count. */}
      {first !== undefined && onFind && silent && (
        <button type="button" className="byd-rules-silent" onClick={() => onFind(first)}>
          {t(silent.length === 1 ? 'rules.toc.silent.one' : 'rules.toc.silent.other', { n: silent.length })}
          <span aria-hidden="true">→</span>
        </button>
      )}
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
function Editing({
  block,
  names,
  assetBase,
  onPatch,
  onClose,
  onRemove,
}: {
  block: RuleBlock
  names: Names
  assetBase?: string | undefined
  onPatch(next: Partial<RuleBlock>, gesture?: string): void
  onClose(): void
  onRemove(): void
}) {
  const t = useT()
  // Prose is written a letter at a time and the whole book is rewritten for each of them, so a
  // sentence is one step back and the paragraph before it is another (L14).
  const typing = useGesture('rule-field')
  // Where `[[` stands behind the caret, in which of the block's fields, and what has been typed
  // since it (#215, L23). One field of one block is ever being written in, so this is one lookup
  // and not one per field — and which field it is has to be part of it, because a list block is
  // several fields and the list belongs under the one the caret is in.
  const [picking, setPicking] = useState<{ field: string; at: number; query: string } | null>(null)
  const [choice, setChoice] = useState(0)
  // The list's own id, so the field can point at the option the keys are on and two open blocks
  // could never name the same element.
  const listId = useId()
  // The fields themselves, because what is written back is written where the caret is and the
  // caret belongs to the element. A map and not one ref, since a list block is several fields.
  const fields = useRef(new Map<string, HTMLTextAreaElement | HTMLInputElement>())
  const matches = picking ? narrowRefs(referables(names), picking.query) : []
  const active = matches[choice]
  const closeRefs = () => {
    setPicking(null)
    setChoice(0)
  }
  // Read after every keystroke and every move of the caret, since both change what stands behind
  // it. Nothing is set when nothing moved: a caret walked along a sentence would otherwise rewrite
  // this on every press, and the whole book is drawn from it.
  const openRefs = (field: string, el: HTMLTextAreaElement | HTMLInputElement) => {
    const found = triggerBehind(el.value, el.selectionStart ?? el.value.length, REF_MARK, REF_STOPS)
    if (!found) return void (picking && closeRefs())
    if (picking?.field === field && picking.at === found.at && picking.query === found.query) return
    setPicking({ field, ...found })
    setChoice(0)
  }
  // The reference written where the designer is writing — over the `[[` and the letters she typed
  // after it, and nowhere else. The row this replaces could only put one at the end of the field,
  // so a reference could not be put into a sentence at all.
  //
  // It is its own step back, as it was: the keystrokes that opened the list are one doing and the
  // reference is another, so no gesture is carried in (L14).
  const takeRef = (r: Referable, write: (text: string) => void) => {
    const open = picking
    const el = open && fields.current.get(open.field)
    if (!open || !el) return
    const { text, caret } = writeTrigger(el.value, open, REF_MARK, refFor(r.of, r.id))
    closeRefs()
    // The field never loses the focus and the caret lands after what was written: the sentence is
    // still being written, and the next word goes on from there. The element is set first so the
    // caret is already right when React commits the value it is about to be given.
    el.value = text
    el.focus()
    el.setSelectionRange(caret, caret)
    write(text)
  }
  // Everything a field that answers the lookup wears, and none of it is about what the field
  // holds. `write` is the one thing the field knows and this does not: where in the block its own
  // text lives.
  const refField = (field: string, write: (text: string) => void) => ({
    ref: (el: HTMLTextAreaElement | HTMLInputElement | null) => {
      if (el) fields.current.set(field, el)
      else fields.current.delete(field)
    },
    onSelect: (e: { currentTarget: HTMLTextAreaElement | HTMLInputElement }) => openRefs(field, e.currentTarget),
    onKeyDown: (e: { key: string; preventDefault(): void }) => {
      if (picking?.field !== field) return
      const act = pickKey(e.key, matches.length, choice)
      if (!act) return
      // The keys the open list answers are the list's while it is open, and the field's the rest
      // of the time: Enter in a paragraph is a new line and Escape belongs to nothing else here.
      e.preventDefault()
      if (act === 'close') return closeRefs()
      if (act === 'pick') return void (active && takeRef(active, write))
      setChoice(act.active)
    },
    ...(picking?.field === field && active ? { 'aria-controls': listId, 'aria-activedescendant': pickOptionId(listId, refKey(active)) } : {}),
  })
  const refList = (field: string, write: (text: string) => void) =>
    picking?.field === field && (
      <PickList
        id={listId}
        className="byd-rules-refs"
        label={t('rules.refs')}
        options={matches}
        keyOf={refKey}
        active={choice}
        empty={t('rules.refs.none')}
        onPick={(r) => takeRef(r, write)}
      >
        {(r) => (
          <>
            <span>{r.name}</span>
            <small>{t(r.of === 'zone' ? 'rules.ref.zone' : 'rules.ref.card')}</small>
          </>
        )}
      </PickList>
    )
  return (
    <div className="byd-rules-edit">
      {/* A section's question is the field's placeholder and never its value (#131), so it is
          gone at the first character rather than being text to select and type over. Under it
          stands the tool's own notice, on a line of its own and always (#215, the approved form
          «Radad»): the way to a reference is two characters and two characters cannot be seen, so
          the way in has to be said somewhere, and the empty field is the only surface already
          free to say it. The block's question comes first and untouched — it is the block's, and
          the notice is the tool's. A block the designer added herself has no question and carries
          the notice alone.
          Both lines are the same grey, and that is the price: `::placeholder` colours the whole of
          it, so a quieter weight for the tool's line would mean a layer of our own drawn over the
          field and kept in step with its value — which is exactly the kind of thing that drifts. */}
      {block.kind === 'text' && (
        <div className="byd-rules-field">
          <textarea
            autoFocus
            rows={4}
            aria-label={t('rules.block.text', { id: block.id })}
            placeholder={block.ask ? `${block.ask}\n${t('rules.ask.refs')}` : t('rules.ask.refs')}
            value={block.text}
            {...typing.visit}
            onChange={(e) => {
              onPatch({ text: e.target.value }, typing.token())
              openRefs('text', e.target)
            }}
            onBlur={onClose}
            {...refField('text', (text) => onPatch({ text }))}
          />
          {refList('text', (text) => onPatch({ text }))}
        </div>
      )}
      {/* The block closes when the focus leaves the row and not when it leaves the field: tabbing
          from the heading to the chooser beside it is staying, not going. Hung on the field alone,
          as it was, the chooser could never be reached — reaching for it was what closed the
          block (#217). The picture's two fields already answer to this rule; so does this row. */}
      {block.kind === 'heading' && (
        <div
          className="byd-rules-row"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) onClose()
          }}
        >
          {/* The heading is a field like the paragraph is (#272). It was kept outside this surface
              while a reference in a heading would have stayed seven raw characters (#215, and the
              bug that made it so); the heading reads its references now, so the reason is gone and
              the way in is the same two characters here as everywhere else. The list hangs on the
              field's own wrapper and not on the row, so it opens under the words and not under the
              chooser standing beside them. */}
          <div className="byd-rules-field">
            <input
              autoFocus
              aria-label={t('rules.block.heading', { id: block.id })}
              value={block.text}
              {...typing.visit}
              onChange={(e) => {
                onPatch({ text: e.target.value }, typing.token())
                openRefs('heading', e.target)
              }}
              {...refField('heading', (text) => onPatch({ text }))}
            />
            {refList('heading', (text) => onPatch({ text }))}
          </div>
          <select aria-label={t('rules.block.level', { id: block.id })} value={block.level} onChange={(e) => onPatch({ level: e.target.value === '1' ? 1 : 2 })}>
            <option value="1">{t('rules.level.1')}</option>
            <option value="2">{t('rules.level.2')}</option>
          </select>
        </div>
      )}
      {block.kind === 'list' && (
        <>
          {block.items.map((item, i) => {
            // A point of a list is a field like the paragraph is, so the lookup answers in it —
            // and the list belongs under the point the caret is in, never under the block.
            const items = (text: string) => ({ items: block.items.map((x, j) => (j === i ? text : x)) })
            const write = (text: string) => onPatch(items(text))
            return (
              <div className="byd-rules-field" key={i}>
                <input
                  {...(i === 0 ? { autoFocus: true } : {})}
                  aria-label={t('rules.block.item', { n: i + 1, id: block.id })}
                  value={item}
                  {...typing.visit}
                  onChange={(e) => {
                    onPatch(items(e.target.value), typing.token())
                    openRefs(`item:${i}`, e.target)
                  }}
                  {...refField(`item:${i}`, write)}
                />
                {refList(`item:${i}`, write)}
              </div>
            )
          })}
          <button type="button" onClick={() => onPatch({ items: [...block.items, ''] })}>
            {t('rules.addItem')}
          </button>
        </>
      )}
      {/* What the picture says about itself (#173). A picture that came in without alt text is
          decorative and hidden from a screen reader, and this is where that is put right: the
          decision of 2026-09-17 accepted the cost on the condition that it is never hidden, and a
          count in an import report with nowhere to act on it would be exactly that. */}
      {block.kind === 'image' && (
        <>
          {/* The picture stays where it is while its words are written: nobody can say what a
              picture shows while looking at a field where the picture was. */}
          <img className="byd-rules-image" src={assetBase ? assetUrl(assetBase, block.asset.slice(ASSET_PREFIX.length)) : block.asset} alt={block.alt} />
          {/* Two fields and never one worn twice (decided 2026-09-17): the alt text stands for the
              picture for whoever cannot see it, the caption is read beside it by whoever can. An
              imported book has no captions at all, so this is where every one of them is written.
              The block closes when the focus leaves both of them and not when it leaves either:
              tabbing from the one field to the other is staying, not going. */}
          <div
            className="byd-rules-figure-fields"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) onClose()
            }}
          >
            <input
              autoFocus
              aria-label={t('rules.block.alt', { id: block.id })}
              placeholder={t('rules.alt.placeholder')}
              value={block.alt}
              {...typing.visit}
              onChange={(e) => onPatch({ alt: e.target.value }, typing.token())}
            />
            <input
              aria-label={t('rules.block.caption', { id: block.id })}
              placeholder={t('rules.caption.placeholder')}
              value={block.caption ?? ''}
              {...typing.visit}
              onChange={(e) => onPatch({ caption: e.target.value }, typing.token())}
            />
          </div>
        </>
      )}
      {block.kind === 'setup' && <input autoFocus aria-label={t('rules.block.caption', { id: block.id })} placeholder={t('rules.caption.placeholder')} value={block.caption ?? ''} {...typing.visit} onChange={(e) => onPatch({ caption: e.target.value }, typing.token())} onBlur={onClose} />}
      {/* What is left under an open block once the row of references is gone (#215): the one
          control that acts on the block itself. It stands in a row of its own rather than loose
          among the fields, because a block's fields are what is written in it and this is what
          becomes of the block. */}
      <div className="byd-rules-foot">
        <button type="button" className="byd-rules-remove" onClick={onRemove}>
          {t(block.kind === 'heading' ? 'rules.removeSection' : 'rules.removeBlock')}
        </button>
      </div>
    </div>
  )
}

function Block({ block, source, assetBase }: { block: RenderedBlock; source?: RuleBlock | undefined; assetBase?: string | undefined }) {
  const t = useT()
  switch (block.kind) {
    case 'heading':
      // The heading is where the column beside the book points, so it carries the anchor itself
      // rather than the chrome around it. Its words are the same nodes a paragraph's are (#272):
      // what the designer wrote as a reference is drawn as one here too.
      return block.level === 1 ? (
        <h2 id={anchorOf(block.id)}>
          <Span nodes={block.children} />
        </h2>
      ) : (
        <h3 id={anchorOf(block.id)}>
          <Span nodes={block.children} />
        </h3>
      )
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
    // The setup picture is the game's own zones (B5's follow-on), never a drawing beside them.
    // It is grouped and folded since #270, and drawn by the one component the table's drawer
    // draws it with: a designer who reads her setup here is reading the players' own.
    case 'setup':
      return <SetupOverview block={block} level={3} />
    // A picture the designer brought with her (#173). A5 sets how big it may be drawn and the
    // stylesheet holds that frame, so the book in the editor is the book the reader meets.
    //
    // `alt` empty is a decorative picture — no role at all for a screen reader — and the editor is
    // where that can be put right, so the block says so in the page rather than only in the import
    // report it came from (decided 2026-09-17, and the one place B7 weighs against L12).
    case 'image':
      return (
        <figure className="byd-rules-figure">
          <img
            className="byd-rules-image"
            src={assetBase ? assetUrl(assetBase, block.asset.slice(ASSET_PREFIX.length)) : block.asset}
            alt={block.alt}
            style={{ width: `${ruleEm(block.mm.w)}em` }}
          />
          {/* The caption is the book's own line and is read by everyone; the word under a picture
              with no alt text is the tool's and reaches no reader. Both can stand, and they say
              two different things. */}
          {block.caption && <figcaption>{block.caption}</figcaption>}
          {block.alt === '' && <figcaption data-quiet>{t('rules.alt.missing')}</figcaption>}
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
          // Plain text carries no element of its own (#286), exactly as at the table. The wrapper
          // existed for a React key, which a string in a list has never needed, and it shut the
          // space in beside the word: `Om ` + `Draghög` was read out as `OmDraghög`, because an
          // element's name is trimmed before it is joined to what stands beside it.
          case 'text':
            return n.text
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
export type Referable = { of: 'zone' | 'card'; id: string; name: string }
export function referables(names: Names): Referable[] {
  return [
    ...Object.entries(names.zones).map(([id, name]) => ({ of: 'zone' as const, id, name })),
    ...Object.entries(names.cards).map(([id, name]) => ({ of: 'card' as const, id, name })),
  ]
}
export const refFor = (of: 'zone' | 'card', id: string): string => `[[${of === 'zone' ? 'zon' : 'kort'}:${id}]]`
const refKey = (r: Referable): string => `${r.of}-${r.id}`

// What opens the lookup in a rule, and what says it is over rather than unfinished (#215). The
// mark is the reference's own opening, so nothing new has to be learned and nothing is taken from
// the text: `[[` that leads nowhere stays exactly the two characters somebody typed. A closed
// reference is written text, and a line break is the next sentence.
const REF_MARK = '[['
const REF_STOPS = [']', '\n'] as const

// The game's own names, narrowed by what has been written after the mark, and cut where the list
// stops being a list. Eight, as the symbol library is cut: the prototype measured a hundred and
// ten of a hundred and seventy-six references reached on two characters and every one of them
// reachable, so the cut costs nothing a letter more does not pay for.
const REF_ROWS = 8
export function narrowRefs(refs: readonly Referable[], query: string): Referable[] {
  const word = query.trim().toLowerCase()
  return refs.filter((r) => r.name.toLowerCase().includes(word)).slice(0, REF_ROWS)
}

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
