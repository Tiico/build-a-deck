import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, fitInDocument, type FaceTemplate, type Row, type Warning } from '@byd/template'

export type CardPreviewProps = {
  face: FaceTemplate
  row: Row
  icons: Record<string, string>
  // A unique id per mounted card; the compiled CSS is scoped to it.
  id: string
  scale?: number
  selectedElement?: string | null
  onSelectElement?(id: string): void
  onWarnings?(warnings: Warning[]): void
  // Drawn over the card, in the card's own coordinates: the editor's handles and guides (#18).
  // It shows no card content — the compiler above is still the only thing that renders a card.
  overlay?: ReactNode
}

// One card through the real compiler and the real DOM fitting — the same code the renderer runs,
// so what the editor shows is what the table and the print get (E2).
export function CardPreview({ face, row, icons, id, scale = 1, selectedElement, onSelectElement, onWarnings, overlay }: CardPreviewProps) {
  const out = useMemo(() => compile({ type: CARD_STANDARD_63x88, face, row, icons, scope: `#${id}` }), [face, row, icons, id])
  const ref = useRef<HTMLDivElement | null>(null)
  // The DOM measures for real; the compiler's text warnings are an estimate for headless use.
  // What the editor reports is what the browser saw: overflow after fitting, plus the
  // compiler's non-text warnings (icons and the like).
  useLayoutEffect(() => {
    if (!ref.current) return
    const report = fitInDocument(ref.current)
    const fromDom: Warning[] = report
      .filter((r) => r.overflow)
      .map((r) => ({ element: r.element, code: 'text-too-small', detail: `texten ryms inte ens vid ${r.sizePt}pt` }))
    onWarnings?.([...out.warnings.filter((w) => w.code !== 'text-too-small' && w.code !== 'text-overflow'), ...fromDom])
  }, [out.html, out.css, out.warnings, onWarnings])
  const highlight = selectedElement ? `#${id} [data-element="${selectedElement}"]{outline:0.6mm solid #3c8ce7;outline-offset:0.3mm}` : ''
  return (
    <div id={id} className="byd-preview" style={{ zoom: scale }}>
      <style>{out.css}</style>
      <style>{highlight}</style>
      <div
        ref={ref}
        dangerouslySetInnerHTML={{ __html: out.html }}
        onClick={(e) => {
          const el = (e.target as HTMLElement).closest('[data-element]')
          if (el instanceof HTMLElement && onSelectElement) {
            e.stopPropagation()
            onSelectElement(el.dataset['element'] ?? '')
          }
        }}
      />
      {overlay}
    </div>
  )
}
