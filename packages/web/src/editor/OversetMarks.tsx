import { Fragment, type CSSProperties } from 'react'
import type { Overset } from '@byd/template'
import { useLang, useT } from '../i18n/index.js'
import { PX_PER_MM } from './canvas.js'
import { oversetWords, SHORT_BELOW_PX } from './overset.js'
import './mark.css'

// The mark round a text that does not fit even shrunk (#808, beställarens beslut 2026-10-17,
// variant A «Kanten och brickan»): the box framed in amber over a dark ring, 4 px outside it so it
// never touches a letter, and a dark tag hanging under it that says how much is lost — «▲ Ryms inte
// · 4 rader till», or «▲ +4 rader» under a box too narrow for that. It is #802's form, the dashed
// frame and the word in a dark tag, in the warning's amber (`mark.css`).
//
// It is drawn over the card and never in it: what it is drawn from is what the fitting measured and
// where the template says the box stands, and the compiler is not asked (E2). The guided start, Mall
// and the wall draw the same thing.
//
// The layer stands on the card's own corner, in the card's own millimetres. `zoomed` is a layer
// inside the card's preview, which is already drawn at its zoom; otherwise the layer is put over
// the card from outside — on the wall, where the card's paper is cut to its corners and a frame
// round a box near the edge would be cut with it — and draws itself at the card's zoom. The tag
// carries the whole sentence as its name, so the card it stands in is named with it.
export function OversetMarks({ found, scale, zoomed = false }: { found: readonly Overset[]; scale: number; zoomed?: boolean }) {
  const t = useT()
  const { lang } = useLang()
  if (found.length === 0) return null
  const style = { ...(zoomed ? {} : { zoom: scale }), '--byd-canvas-scale': String(scale) } as CSSProperties
  const px = (n: number) => `${n}px / var(--byd-canvas-scale, 1)`
  return (
    <span className="byd-overset" style={style}>
      {found.map((o) => {
        const words = oversetWords(o, t, lang)
        const short = o.w * PX_PER_MM * scale < SHORT_BELOW_PX
        return (
          <Fragment key={o.element}>
            <span
              className="byd-mark byd-overset-frame"
              data-overset={o.element}
              style={{ left: `calc(${o.x}mm - ${px(4)})`, top: `calc(${o.y}mm - ${px(4)})`, width: `calc(${o.w}mm + ${px(8)})`, height: `calc(${o.h}mm + ${px(8)})` }}
            />
            <span className="byd-mark-tag byd-overset-tag" role="img" aria-label={words.sentence} title={words.sentence} style={{ left: `${o.x + o.w / 2}mm`, top: `calc(${o.y + o.h}mm + ${px(5)})` }}>
              <i aria-hidden="true">▲</i>
              <span>{short ? words.short : words.long}</span>
            </span>
          </Fragment>
        )
      })}
    </span>
  )
}
