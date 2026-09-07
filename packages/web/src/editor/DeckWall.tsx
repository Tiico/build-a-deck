import { useCallback, useState } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { Warning } from '@byd/template'
import { CardPreview } from './CardPreview.js'

export type DeckWallProps = {
  doc: ProjectDoc
  face: string
  selectedRow: string | null
  onSelectRow(cardRef: string): void
  onSelectElement(id: string): void
  scale?: number
  assetBase?: string | undefined
}

// The deck as a wall (K-editor answer, C): every row as a card, copies and warnings on each,
// the whole deck visible at once — a balance change on forty cards is seen as one thing.
export function DeckWall({ doc, face, selectedRow, onSelectRow, onSelectElement, scale = 0.6, assetBase }: DeckWallProps) {
  const faceTemplate = doc.template.faces[face]
  const [warnings, setWarnings] = useState<Record<string, number>>({})
  const onWarnings = useCallback((cardRef: string, w: Warning[]) => {
    setWarnings((m) => (m[cardRef] === w.length ? m : { ...m, [cardRef]: w.length }))
  }, [])
  if (!faceTemplate) return <p>Mallen saknar sidan {face}.</p>
  return (
    <div className="byd-wall" role="list">
      {doc.rows.map(({ id: cardRef, fields: row }) => {
        const copies = Number(row['antal'] ?? 1)
        const count = warnings[cardRef] ?? 0
        return (
          <div
            key={cardRef}
            role="listitem"
            className="byd-wall-card"
            data-card-ref={cardRef}
            aria-selected={selectedRow === cardRef ? 'true' : 'false'}
            onClick={() => onSelectRow(cardRef)}
          >
            <CardPreview
              id={`wall-${cardRef}`}
              face={faceTemplate}
              row={row}
              icons={doc.icons}
              scale={scale}
              assetBase={assetBase}
              onSelectElement={onSelectElement}
              onWarnings={(w) => onWarnings(cardRef, w)}
            />
            {copies > 1 && <span className="byd-wall-copies" data-copies>×{copies}</span>}
            {count > 0 && <span className="byd-wall-warnings" data-warnings>{count}</span>}
          </div>
        )
      })}
    </div>
  )
}
