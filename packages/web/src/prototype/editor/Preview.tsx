// PROTOTYPE — one card rendered through the real compiler and the real DOM fitting.
// Scoped by a per-card id so many cards can share a page (finding: the compiler needs a `scope`).
import { useLayoutEffect, useMemo, useRef } from 'react'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, fitInDocument, type FaceTemplate, type Row, type Warning } from '@byd/template'
import { ICONS } from './data.js'

export type Selected = { element: string | null; onSelect?(id: string): void }

export function Preview({ face, row, scale, id, selected, onWarnings }: { face: FaceTemplate; row: Row; scale: number; id: string; selected?: Selected; onWarnings?(w: Warning[]): void }) {
  const out = useMemo(() => compile({ type: CARD_STANDARD_63x88, face, row, icons: ICONS }), [face, row])
  const ref = useRef<HTMLDivElement | null>(null)
  const scoped = useMemo(
    () => out.css.replace(/\[data-card\]/g, `#${id} [data-card]`).replace(/(^|\n|\})\[data-element/g, `$1#${id} [data-element`),
    [out.css, id],
  )
  useLayoutEffect(() => {
    if (ref.current) fitInDocument(ref.current)
  }, [out.html, scoped])
  useLayoutEffect(() => {
    onWarnings?.(out.warnings)
  }, [out.warnings])
  const sel = selected?.element
  return (
    <div id={id} style={{ zoom: scale, position: 'relative', lineHeight: 1 }}>
      <style>{scoped}</style>
      <style>{sel ? `#${id} [data-element="${sel}"]{outline:0.6mm solid #3c8ce7;outline-offset:0.3mm}` : ''}</style>
      <div
        ref={ref}
        dangerouslySetInnerHTML={{ __html: out.html }}
        onClick={(e) => {
          const el = (e.target as HTMLElement).closest('[data-element]') as HTMLElement | null
          if (el && selected?.onSelect) selected.onSelect(el.dataset['element'] ?? '')
        }}
      />
    </div>
  )
}
