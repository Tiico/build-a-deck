import { useId, useState } from 'react'
import type { RenderedBlock } from '@byd/template'
import { useT } from '../i18n/index.js'

// The setup in the book, wherever the book is read (B5's follow-on, B7, #270).
//
// This is the one module that draws a setup block. The editor's page and the table's drawer both
// reach for it, and the only thing either of them says about it is which heading rank it stands
// at — exactly as they already differ over the book's own headings. The rule is the card
// templates' rule and it is here for their reason: two paths that draw the same words drift, and
// then the book says different things depending on where it is read.
//
// The form is the one approved on 2026-09-20: a collapsible, grouped list. What stands on the
// table for everybody first, then one seat at a time behind a labelled picker. It is a zone
// overview and never a map of the felt — where a zone lies is the table's question, and a map in
// the book would be a second truth about the table that drifts from it at once.
//
// It stands folded when the book opens, on every surface. The book is read by somebody looking
// for a rule; whoever wants to see the table asks for it with one press, and 45 zones would
// otherwise be the first thing between her and the text.
export type SetupBlock = Extract<RenderedBlock, { kind: 'setup' }>

// Which rank the two group headings stand at. The book's own sections are `h2` in the editor and
// `h3` in the drawer, so the zone groups follow one step below whichever book they are in: a rank
// skipped is a rank a screen reader reads as a missing section (L12).
//
// `onCaption` is the surface where the book is *written*. The editor opens a block by clicking it,
// and since this one carries controls of its own the figure cannot be one big control any more —
// a control inside a control is invalid and a screen reader never reaches the inner one (UX-37,
// #82). So the way into the block is its caption, which is also the only thing about a setup a
// designer writes; an unwritten one says so and is still a way in. The table's book passes
// nothing and the caption is a caption there, as it always was.
export type SetupOverviewProps = { block: SetupBlock; level: 3 | 4; onCaption?: (() => void) | undefined }

export function SetupOverview({ block, level, onCaption }: SetupOverviewProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // Which seat is being looked at. It is the reader's own glance and not part of the book, so it
  // is held here and written nowhere — not in the document, not in the browser. Holding it here
  // is also what makes it survive the folding: the zones leave the page, the choice does not.
  const [chosen, setChosen] = useState<string | null>(null)
  const inside = useId()
  const seats = block.seats
  const seat = seats.find((s) => s.id === chosen) ?? seats[0] ?? null
  const Group = `h${level}` as 'h3' | 'h4'
  const Seat = `h${level + 1}` as 'h4' | 'h5'
  const written = block.caption === undefined || block.caption === '' ? null : block.caption
  const caption = onCaption ? (
    <figcaption>
      <button type="button" className="byd-rules-caption byd-rules-caption-edit" onClick={onCaption}>
        {written ?? t('rules.caption.placeholder')}
      </button>
    </figcaption>
  ) : written === null ? null : (
    <figcaption className="byd-rules-caption">{written}</figcaption>
  )
  // A book rendered with no game behind it — a fragment, a test — has no table to show, and a
  // control that opens on nothing is worse than no control.
  if (block.common.length === 0 && seats.length === 0) return caption && <figure className="byd-rules-setup">{caption}</figure>
  return (
    <figure className="byd-rules-setup">
      {/* The platform's own button, so that a pointer and a keyboard reach it on the same terms.
          `aria-expanded` says which way it stands; the word on it says what pressing it does. */}
      <button type="button" className="byd-rules-setup-toggle" aria-expanded={open} {...(open ? { 'aria-controls': inside } : {})} onClick={() => setOpen((o) => !o)}>
        {t(open ? 'rules.setup.hide' : 'rules.setup.show')}
      </button>
      {open && (
        <div id={inside} className="byd-rules-setup-groups">
          {block.common.length > 0 && (
            <section>
              <Group>{t('rules.setup.common')}</Group>
              <ZoneList zones={block.common} label={t('rules.setup.common.zones')} />
            </section>
          )}
          {seat && (
            <section>
              <Group>{t('rules.setup.seats')}</Group>
              <p className="byd-rules-setup-hint">{t(seats.length === 1 ? 'rules.setup.count.one' : 'rules.setup.count.other', { n: seats.length })}</p>
              {/* One seat at a time is what lets a long name stand whole at 320 px, and the
                  picker is what makes the other seats reachable rather than hidden. */}
              <label className="byd-rules-setup-pick">
                {t('rules.setup.pick')}
                <select value={seat.id} onChange={(e) => setChosen(e.target.value)}>
                  {seats.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t('rules.setup.seat', { seat: s.id })}
                    </option>
                  ))}
                </select>
              </label>
              <div className="byd-rules-setup-seat">
                <Seat>{t('rules.setup.seat', { seat: seat.id })}</Seat>
                {seat.zones.length > 0 ? (
                  <ZoneList zones={seat.zones} label={t('rules.setup.seat.zones', { seat: seat.id })} />
                ) : (
                  <p className="byd-rules-setup-hint">{t('rules.setup.seat.empty')}</p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
      {caption}
    </figure>
  )
}

// A zone stands under the name the designer gave it, whole: a name cut short is a name the reader
// cannot match against the table in front of her. The list carries its own name, so that what the
// zones under it belong to is said and not only laid out (L12).
function ZoneList({ zones, label }: { zones: readonly { id: string; name: string }[]; label: string }) {
  return (
    <ul className="byd-rules-setup-list" aria-label={label}>
      {zones.map((zone) => (
        <li key={zone.id} data-setup-zone={zone.id}>
          {zone.name}
        </li>
      ))}
    </ul>
  )
}
