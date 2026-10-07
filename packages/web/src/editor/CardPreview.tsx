import { useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile, fitInDocument, type FaceTemplate, type Motif, type Row, type Warning } from '@byd/template'
import { arrivingIn, holdIcons, resolveAssetFace, resolveAssetRow } from './assets.js'
import { holdFonts } from './fonts.js'
import { Arriving } from './AssetImage.js'

export type CardPreviewProps = {
  face: FaceTemplate
  row: Row
  icons: Record<string, string>
  // The fonts the version is pinned to (B3), already resolved to something the page can load.
  fonts?: Record<string, { stack: string; src?: string }> | undefined
  // A unique id per mounted card; the compiled CSS is scoped to it.
  id: string
  scale?: number
  selectedElement?: string | null
  onSelectElement?(id: string): void
  onWarnings?(warnings: Warning[]): void
  // The size every text on the card ended up at once E6 had fitted it, for the texts that hold
  // any words: what the card really carries, which the eyes read to say how it reads on a screen
  // (#512). An empty box is no text at all.
  onFitted?(sizes: { element: string; sizePt: number }[]): void
  // Drawn over the card, in the card's own coordinates: the editor's handles and guides (#18).
  // It shows no card content — the compiler above is still the only thing that renders a card.
  overlay?: ReactNode
  // Where the project's images are served from (E1): rows that point at assets are resolved here.
  assetBase?: string | undefined
  // What is drawn inside each picture (E1), keyed by the URL the resolved row carries. An image
  // element told to trim fits the motif rather than the file; one whose file nothing has measured
  // is fitted as a file, as every picture was before there was anything to measure.
  motifs?: Record<string, Motif> | undefined
  // What the game's meanings are painted in (E4): a symbol written `{namn|roll}` reaches the card
  // as its own shape with this colour behind it.
  palette?: Record<string, string> | undefined
}

// One card through the real compiler and the real DOM fitting — the same code the renderer runs,
// so what the editor shows is what the table and the print get (E2).
export function CardPreview({ face, row, icons, fonts, id, scale = 1, selectedElement, onSelectElement, onWarnings, onFitted, overlay, assetBase, motifs, palette }: CardPreviewProps) {
  // The face's own pictures resolved once per face (#320), for the same reason the icons are
  // resolved once per document: a fresh face every render is a fresh compile every render.
  const drawnFace = useMemo(() => (assetBase ? resolveAssetFace(face, assetBase) : face), [face, assetBase])
  const drawnRow = useMemo(() => (assetBase ? resolveAssetRow(row, assetBase) : row), [row, assetBase])
  const draw = useCallback(
    (f: FaceTemplate, r: Row, i: Record<string, string>, fs: CardPreviewProps['fonts']) =>
      compile({
        type: CARD_STANDARD_63x88,
        face: f,
        row: r,
        icons: i,
        scope: `#${id}`,
        ...(fs ? { fonts: fs } : {}),
        ...(motifs ? { motifs } : {}),
        ...(palette ? { palette } : {}),
      }),
    [id, motifs, palette],
  )
  // The card as it is once every byte it names has landed. Compiling is pure and asks nothing of
  // the service; only the markup put into the page does.
  const whole = useMemo(() => draw(drawnFace, drawnRow, icons, fonts), [draw, drawnFace, drawnRow, icons, fonts])
  // What this card names whose bytes are still on their way (#907, #959): a picture in a cell or
  // on the face, a symbol, a face's file. Such a card is drawn without them — an empty picture, a
  // symbol that draws nothing, the fallback type — because a browser that asks early gets a 404
  // and keeps it. Held as words, so only a card that names such an asset is compiled again, and
  // when they land it goes back to the card above without compiling at all.
  const arriving = useContext(Arriving)
  const held = arriving.size === 0 ? '' : arrivingIn(whole.html + whole.css, arriving)
  const out = useMemo(() => {
    if (held === '') return whole
    const early = new Set(held.split(' '))
    return draw(
      assetBase ? resolveAssetFace(face, assetBase, early) : face,
      assetBase ? resolveAssetRow(row, assetBase, early) : row,
      holdIcons(icons, early),
      fonts && holdFonts(fonts, early),
    )
  }, [draw, whole, held, face, row, assetBase, icons, fonts])
  const ref = useRef<HTMLDivElement | null>(null)
  // Held by identity, not just by value: React writes `innerHTML` again whenever this object is a
  // new one, whatever it holds. A fresh object every render rebuilds every card in the DOM on
  // every render — the fitting is redone, and a card is replaced under the pointer that is
  // clicking it.
  const inner = useMemo(() => ({ __html: out.html }), [out.html])
  // Whoever is told about the fitting is held by a ref, for the same reason (#661): a caller hands
  // a fresh function every render — the wall says which card it is about in an arrow per card —
  // and a fresh function in the effect's dependencies refitted every card on every render of the
  // wall, a layout per text per half point at every band scrolled past. Being told is not a reason
  // to measure again; a card whose markup has not changed has nothing new to say.
  const tell = useRef({ onWarnings, onFitted })
  tell.current = { onWarnings, onFitted }
  // The DOM measures for real; the compiler's text warnings are an estimate for headless use.
  // What the editor reports is what the browser saw: overflow after fitting, plus the
  // compiler's non-text warnings (icons and the like).
  //
  // And it measures again whenever a face lands (#688). A family starts loading only once a text
  // stands in it, so the first fitting of a new text is of the fallback's measurements: the
  // guided start set nine lines of Krönika in 8.5 pt by the fallback and clipped the ninth when
  // Merriweather arrived, where the editor and the print — which waits for its faces — set them in
  // 7.5 pt and whole. The renderer waits; a live preview cannot, so it answers the arrival instead.
  useLayoutEffect(() => {
    const fit = () => {
      if (!ref.current) return
      const report = fitInDocument(ref.current)
      const fromDom: Warning[] = report
        .filter((r) => r.overflow)
        // The compiler's own warnings are counted, never read out: their detail is a note for
        // whoever is debugging, in the language the rest of the compiler speaks (A4).
        .map((r) => ({ element: r.element, code: 'text-too-small', detail: `the text does not fit even at ${r.sizePt}pt` }))
      tell.current.onWarnings?.([...out.warnings.filter((w) => w.code !== 'text-too-small' && w.code !== 'text-overflow'), ...fromDom])
      tell.current.onFitted?.(report.filter((r) => !r.empty).map((r) => ({ element: r.element, sizePt: r.sizePt })))
    }
    fit()
    // jsdom has no font set, and lays nothing out to measure again.
    const faces = typeof document === 'undefined' ? undefined : (document.fonts as FontFaceSet | undefined)
    faces?.addEventListener('loadingdone', fit)
    return () => faces?.removeEventListener('loadingdone', fit)
  }, [out.html, out.css, out.warnings])
  const highlight = selectedElement ? `#${id} [data-element="${selectedElement}"]{outline:0.6mm solid var(--byd-editor-primary-mark);outline-offset:0.3mm}` : ''
  return (
    <div id={id} className="byd-preview" style={{ zoom: scale }}>
      <style>{out.css}</style>
      <style>{highlight}</style>
      <div
        ref={ref}
        dangerouslySetInnerHTML={inner}
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
