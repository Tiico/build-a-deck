import { drawnAt, frameWindow, type Frame, type Motif, type Nudge } from '@byd/template'
import type { ProjectDoc } from './types.js'
import { framingKey } from '@byd/server/doc'

// The deck's measure as the editor has to talk about it (E1).
//
// The measure itself lives on the image element, because the frame's shape comes from there. What
// the editor adds is the deck's side of it: which pictures the measure governs, and — the point
// of the whole surface — which files cannot answer it however the measure is set. A file
// delivered cropped to its own drawing has no air to give, and no rule can conjure pixels that
// were never drawn. Saying so plainly is the difference between a deck that looks uniform on
// screen and a silver edge on a printed card.

// One picture area the deck draws: where it is, which column it reads, the shape of its frame,
// and the measure it carries — if any, since a spot without one is exactly where a measure is
// given.
export type Spot = { face: string; id: string; field: string; ratio: number; frame: Frame | undefined }

export function measuredSpots(doc: ProjectDoc): Spot[] {
  const out: Spot[] = []
  const walk = (face: string, els: ProjectDoc['template']['faces'][string]['base']) => {
    for (const el of els) {
      if (el.kind === 'image' && 'field' in el.bind && el.h > 0 && !out.some((s) => s.face === face && s.id === el.id)) {
        out.push({ face, id: el.id, field: el.bind.field, ratio: el.w / el.h, frame: el.frame })
      }
      if (el.kind === 'if' || el.kind === 'group') walk(face, el.children)
    }
  }
  for (const [faceId, face] of Object.entries(doc.template.faces)) {
    walk(faceId, face.base)
    for (const v of Object.values(face.variants)) walk(faceId, v.override ?? [])
  }
  return out
}

// What one card's picture has to say about the measure it was given.
export type Objection = { cardRef: string; field: string; code: 'short'; drawnAt: number; to: Nudge }

// The departure that makes a file's window fit inside the file, as a zoom.
//
// The direction is the opposite of what it first looks like: zooming in makes the window smaller,
// so a file that cannot hold the window the measure asked for needs a *larger* zoom, not a
// smaller one. The card then draws its motif bigger than the measure — which is what the file
// forces and what the card will show either way. The fix does not change the picture at all: it
// writes down, as this card's own departure, the size the clamping was already producing, so the
// deck's count stops calling the card uniform and the objection stops standing.
export function zoomThatFits(motif: Motif, frame: Frame, ratio: number, nudge: Nudge = {}): number {
  const win = frameWindow(motif, frame, ratio, nudge)
  if (!win.short) return nudge.zoom ?? 1
  // The window the measure asks for at zoom one, against the one the file can actually give.
  const wanted = Math.max((motif.h - motif.trim.top - motif.trim.bottom) / frame.fill, (motif.w - motif.trim.left - motif.trim.right) / frame.fill / ratio)
  // Rounded up, never down: a hair too little leaves the window a hair too large and the card on
  // the list it was just taken off.
  return Math.ceil((wanted / win.h) * 1e4) / 1e4
}

// Every card whose file cannot answer the measure, in deck order. A card already put right is not
// an objection: the list exists to be emptied, and a fix that stayed on the list would be a
// surface that cannot tell work done from work outstanding.
export function objections(doc: ProjectDoc, motifs: Record<string, Motif>): Objection[] {
  const out: Objection[] = []
  for (const spot of measuredSpots(doc)) {
    const frame = spot.frame
    if (!frame) continue
    for (const row of doc.rows) {
      const value = row.fields[spot.field]
      const motif = typeof value === 'string' ? motifs[value] : undefined
      // A file nobody has measured is fitted as a file, so it is not failing a measure it was
      // never given.
      if (!motif) continue
      const nudge = doc.framing?.[framingKey(row.id, spot.field)] ?? {}
      const win = frameWindow(motif, frame, spot.ratio, nudge)
      if (!win.short) continue
      out.push({ cardRef: row.id, field: spot.field, code: 'short', drawnAt: drawnAt(motif, win), to: { zoom: zoomThatFits(motif, frame, spot.ratio, nudge) } })
    }
  }
  return out
}
