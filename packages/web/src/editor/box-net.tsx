import type { BoxNet, NetFlap } from '@byd/engine'

// The tuckbox's net as lines (#1413, #1418): what the Låda tab draws round the faces it edits, and
// what the print package draws round the faces it shows. Its own module, so the print package's page
// takes these lines without the editor's canvas.

// How the net looks, the same in the Låda tab and in the print package (#1434): the sheet, the
// flaps, the cut, the folds and the faces laid on it. The net carries these rules into the page it is
// drawn in, as «Visa upp» carries `BOX_SCENE_CSS`, so neither page has a copy of its own and /editor
// fetches no second sheet for them (#186, felt-font.spec). What a page does with the net beyond this
// (the editor's chosen face, its fades, the print package's well) stays in that page's own sheet.
// Flaps in board grey, the cut drawn whole and the folds dashed in a grey that reads on a dark face
// and a light one alike, as a tuckbox's net is drawn (#1406). The lines are a pixel at every scale.
// The lid stands upside down on the sheet, as it is printed (#1406).
export const BOX_NET_CSS = [
  '.byd-box-net{position:relative;flex:none}',
  '.byd-box-lines{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}',
  '.byd-box-flap{fill:#d9d4c7;stroke:#222;stroke-width:1px;vector-effect:non-scaling-stroke}',
  '.byd-box-flap-glue{fill:url(#byd-box-glue)}',
  '.byd-box-glue-ground{fill:#d9d4c7}',
  '.byd-box-glue{stroke:#7a7f8c;stroke-width:0.8}',
  '.byd-box-cut{fill:none;stroke:#222;stroke-width:1px;vector-effect:non-scaling-stroke}',
  '.byd-box-fold{stroke:#8a91a2;stroke-width:1px;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}',
  '.byd-box-panel{position:absolute;cursor:default}',
  '.byd-box-panel[data-turned]>.byd-preview{transform:rotate(180deg)}',
].join('')

// The net's own lines, in its own millimetres (#1406 variant A): the flaps, the cut round the sheet
// and the folds dashed. None of it is a face, so none of it is the renderer's: it is folded in and
// never printed.
// The flaps lie under the faces, and the cut and the folds over them, where the eye finds the edges.
export function NetLines({ net, px, part }: { net: BoxNet; px: number; part: 'flaps' | 'lines' }) {
  const row = net.panels.filter((p) => !p.turned && (p.face === 'left' || p.face === 'right' || p.face === 'front' || p.face === 'back'))
  const left = Math.min(...row.map((p) => p.x))
  const right = Math.max(...row.map((p) => p.x + p.width))
  const top = row[0]?.y ?? 0
  const height = row[0]?.height ?? 0
  return (
    <svg className="byd-box-lines" data-part={part} viewBox={`0 0 ${net.width} ${net.height}`} width={net.width * px} height={net.height * px} aria-hidden="true">
      {part === 'flaps' && (
      <>
      {/* Once a net: the flaps are the layer every net is drawn with first. */}
      <style>{BOX_NET_CSS}</style>
      <defs>
        <pattern id="byd-box-glue" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect className="byd-box-glue-ground" width="3" height="3" />
          <line className="byd-box-glue" x1="0" y1="0" x2="0" y2="3" />
        </pattern>
      </defs>
      {net.flaps.map((flap, i) => (
        <Flap key={i} flap={flap} />
      ))}
      </>
      )}
      {part === 'lines' && (
        <>
          <rect className="byd-box-cut" x={left} y={top} width={right - left} height={height} />
          {net.folds.map(([x1, y1, x2, y2], i) => (
            <line key={i} className="byd-box-fold" x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </>
      )}
    </svg>
  )
}

// A tuck flap's free corners are rounded, as a tuckbox's are, by this much.
const TUCK_ROUND_MM = 6
function Flap({ flap }: { flap: NetFlap }) {
  if (flap.kind !== 'tuck') {
    return <polygon className={flap.kind === 'glue' ? 'byd-box-flap byd-box-flap-glue' : 'byd-box-flap'} points={flap.points.map(([x, y]) => `${x},${y}`).join(' ')} />
  }
  const { x, y, width: w, height: h } = flap
  const r = Math.min(TUCK_ROUND_MM, h / 2, w / 2)
  const d =
    flap.opens === 'up'
      ? `M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h}`
      : `M${x} ${y} V${y + h - r} Q${x} ${y + h} ${x + r} ${y + h} H${x + w - r} Q${x + w} ${y + h} ${x + w} ${y + h - r} V${y}`
  return <path className="byd-box-flap" d={d} />
}
