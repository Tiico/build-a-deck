import { useEffect, useState } from 'react'

// The shortest side a window must have before a board is drawn in it at all (C2's revision of
// 2026-09-16, #99).
//
// The short side and not the width, because a phone turned over is still a phone: 844 × 390 puts
// four hands on the same little felt as 390 × 844 does, which is exactly why "ask for a landscape
// window" was rejected as an answer rather than chosen as one.
//
// Six hundred is the smallest short side the audit measures a board in — 1024 × 600, the netbook
// `online-column.test.tsx` holds the hand's column to.
export const BOARD_FLOOR = 600

// The narrowest upright window that gets a board (#484 fynd 9, beslut A). An upright felt is bound
// by the window's width, and its card reaches K9's 45 px only here: measured on the painted card's
// short side in Chromium, 27 px at 600 × 900, 36 at 768 × 1024, 45 at 960 × 1280. A felt whose card
// cannot be played is the 16 px of #99 at a larger size, so the window below it gets the player's own
// surface, as a phone does (C2). Landscape windows keep `BOARD_FLOOR` alone.
export const UPRIGHT_BOARD_FLOOR = 960

// The window `/play` draws its desk in (#1310, beslut A i #1308): the hand along the foot and the
// places to play to over it, instead of the phone's four tabs. The border is C2's for `/online`,
// the window that is given a board there, and on purpose the same one: a window that holds a felt
// holds the targets a felt stands for, and a window that does not is a phone's (C4, #1147). A
// browser's `orientation: portrait` is a window at least as tall as it is wide, which is C2's
// «not landscape» to the pixel.
export const DESK_QUERY = `(orientation: landscape) and (min-width: ${BOARD_FLOOR}px) and (min-height: ${BOARD_FLOOR}px), (orientation: portrait) and (min-width: ${UPRIGHT_BOARD_FLOOR}px)`

// Whether this window is a desk, kept in step with it: a window dragged narrower goes back to the
// tabs without a reload. Where there is no window to ask, it is a phone's page, which is who opens
// `/play` nearly always.
export function useDesk(): boolean {
  const ask = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DESK_QUERY).matches
  const [desk, setDesk] = useState(ask)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(DESK_QUERY)
    const answer = () => setDesk(query.matches)
    query.addEventListener('change', answer)
    answer()
    return () => query.removeEventListener('change', answer)
  }, [])
  return desk
}
