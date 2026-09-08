import { useCallback, useState } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { Warning } from '@byd/template'
import { CardPreview } from './CardPreview.js'
import { deckIssues, groupIssues, ISSUE_WORDS } from './checks.js'

export type DeckWallProps = {
  doc: ProjectDoc
  face: string
  selectedRow: string | null
  onSelectRow(cardRef: string): void
  onSelectElement(id: string): void
  scale?: number
  assetBase?: string | undefined
}

// The eyes a card is read with (E5). The simulations are the transforms the check uses, applied
// to the real cards: colour blindness is not something a sentence can convey.
const EYES = [
  { key: 'normal', name: 'Som du ser det' },
  { key: 'deuteranopia', name: 'Deuteranopi' },
  { key: 'protanopia', name: 'Protanopi' },
  { key: 'tritanopia', name: 'Tritanopi' },
  { key: 'gray', name: 'Gråskala' },
] as const
const MATRICES: Record<string, string> = {
  protanopia: '0.11238 0.88762 0 0 0  0.11238 0.88762 0 0 0  0.00401 -0.00401 1 0 0  0 0 0 1 0',
  deuteranopia: '0.29275 0.70725 0 0 0  0.29275 0.70725 0 0 0  -0.02234 0.02234 1 0 0  0 0 0 1 0',
  tritanopia: '1 0.14461 -0.14461 0 0  0 0.85924 0.14076 0 0  0 0.85924 0.14076 0 0  0 0 0 1 0',
}
// A card at arm's length is the cheapest check of all, and needs no validation at all.
const ARM_SCALE = 0.34

// The deck as a wall (C as the home view): every row as a card, copies and faults on each, the
// whole deck visible at once — a balance change on forty cards is seen as one thing. Beside it
// the physical checks (E5), gathered by kind, and the eyes to read the deck with.
export function DeckWall({ doc, face, selectedRow, onSelectRow, onSelectElement, scale = 0.6, assetBase }: DeckWallProps) {
  const faceTemplate = doc.template.faces[face]
  const [warnings, setWarnings] = useState<Record<string, number>>({})
  const [eye, setEye] = useState<string>('normal')
  const [trim, setTrim] = useState(false)
  const [arm, setArm] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const onWarnings = useCallback((cardRef: string, w: Warning[]) => {
    setWarnings((m) => (m[cardRef] === w.length ? m : { ...m, [cardRef]: w.length }))
  }, [])
  const found = deckIssues(doc)
  const groups = groupIssues(found)
  const errors = groups.filter((g) => g.severity === 'error')
  const open = groups.find((g) => g.code === openGroup)
  const marked = new Set(open?.cards ?? [])
  if (!faceTemplate) return <p>Mallen saknar sidan {face}.</p>
  return (
    <div className="byd-wall-view">
      <EyeFilters />
      <div className="byd-wall-tools">
        <div role="group" aria-label="Ögon">
          {EYES.map((e) => (
            <button key={e.key} type="button" aria-pressed={eye === e.key} onClick={() => setEye(e.key)}>
              {e.name}
            </button>
          ))}
        </div>
        <label>
          <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} /> snitt och skyddsmarginal
        </label>
        <label>
          <input type="checkbox" checked={arm} onChange={(e) => setArm(e.target.checked)} /> på armlängds avstånd
        </label>
      </div>
      <div className="byd-wall" role="list" data-wall data-eye={eye} {...(trim ? { 'data-trim': 'true' } : {})} {...(arm ? { 'data-arm': 'true' } : {})}>
        {doc.rows.map(({ id: cardRef, fields: row }) => {
          const copies = Number(row['antal'] ?? 1)
          // The badge stays this card's own trouble — an unknown icon, text that will not fit.
          // A physical fault is nearly always the template's, and saying it on every card would
          // be forty red badges for one mistake; the report beside says it once.
          const count = warnings[cardRef] ?? 0
          return (
            <div
              key={cardRef}
              role="listitem"
              className="byd-wall-card"
              data-card-ref={cardRef}
              aria-selected={selectedRow === cardRef ? 'true' : 'false'}
              {...(marked.has(cardRef) ? { 'data-marked': 'true' } : {})}
              onClick={() => onSelectRow(cardRef)}
            >
              <CardPreview
                id={`wall-${cardRef}`}
                face={faceTemplate}
                row={row}
                icons={doc.icons}
                scale={arm ? ARM_SCALE : scale}
                assetBase={assetBase}
                onSelectElement={onSelectElement}
                onWarnings={(w) => onWarnings(cardRef, w)}
              />
              {copies > 1 && <span className="byd-wall-copies" data-copies>×{copies}</span>}
              {count > 0 && (
                <span className="byd-wall-warnings" data-warnings>
                  {count}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <aside className="byd-wall-checks">
        <h2>Fysisk kontroll</h2>
        {groups.length === 0 ? (
          <p className="byd-wall-ok">Leken klarar kontrollen. Inget stoppar en order.</p>
        ) : (
          <>
            <p className="byd-wall-lead">
              {errors.length > 0 ? `${errors.length === 1 ? 'Ett slags fel' : `${errors.length} slags fel`} stoppar en order.` : 'Bara varningar. Inget stoppar en order.'}
            </p>
            <ul aria-label="Fysisk kontroll">
              {groups.map((g) => (
                <li key={g.code} data-severity={g.severity} data-check={g.code}>
                  <button type="button" aria-expanded={openGroup === g.code} onClick={() => setOpenGroup(openGroup === g.code ? null : g.code)}>
                    <b>{ISSUE_WORDS[g.code]}</b>
                    <span>{g.cards.length} kort</span>
                    <small>{g.severity === 'error' ? 'fel' : 'varning'}</small>
                  </button>
                  {openGroup === g.code && (
                    <div className="byd-wall-check-detail">
                      <p>{g.detail}</p>
                      <span>
                        {g.elements.join(', ')} · {g.faces.join(', ')}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="byd-wall-lead">En anmärkning är oftast mallens, inte kortets: den syns på varje kort som ärver elementet.</p>
          </>
        )}
      </aside>
    </div>
  )
}

// The dichromatic simulations as filters, defined once for the page.
function EyeFilters() {
  return (
    <svg className="byd-eye-filters" aria-hidden="true">
      <defs>
        {Object.entries(MATRICES).map(([id, values]) => (
          <filter key={id} id={`byd-eye-${id}`} colorInterpolationFilters="linearRGB">
            <feColorMatrix type="matrix" values={values} />
          </filter>
        ))}
      </defs>
    </svg>
  )
}
