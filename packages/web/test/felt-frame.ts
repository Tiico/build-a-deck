// How a page that fits a felt to its own frame is mounted in jsdom and then measured in Chromium
// (#76, #77). Two surfaces need it — the observer's phone and the seat's own window — and the
// trick is the same on both, so it is written once here.
//
// jsdom lays nothing out: the renderer asks its frame how big it is, is told zero, and the felt
// collapses. So the frame's box is read once in Chromium off a page whose felt was told it has no
// room at all, and the page is then mounted again with that box in hand — what is measured is the
// page's own layout and never the felt's size feeding back into it.

import { atWidth } from './viewport.js'

export type Size = { w: number; h: number }

// The window the page is mounted at. A felt's turn is read off the window's shape against the
// table's (#76, #77), so a mounting that only says how wide the window is decides it on jsdom's
// own default height and not on the one Chromium is about to draw at.
export function atWindow(size: Size): void {
  atWidth(size.w)
  for (const [name, value] of [['innerWidth', size.w], ['innerHeight', size.h]] as const) Object.defineProperty(window, name, { value, configurable: true, writable: true })
}

// The box the stylesheet gives the renderer at this window, held for the whole of `body` and not
// only for the first render: the felt does not exist until the table has arrived over the socket,
// so a stub taken down when `render` returns is a stub the renderer never sees.
export async function withFrame<T>(box: Size | null, body: () => Promise<T>): Promise<T> {
  const before = (side: 'Width' | 'Height') => Object.getOwnPropertyDescriptor(HTMLElement.prototype, `client${side}`) ?? ({ get: () => 0, configurable: true } as PropertyDescriptor)
  const had = { Width: before('Width'), Height: before('Height') }
  const hadObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  if (box) {
    for (const [side, size] of [['Width', box.w] as const, ['Height', box.h] as const])
      Object.defineProperty(HTMLElement.prototype, `client${side}`, {
        configurable: true,
        get(this: HTMLElement) {
          return this.classList.contains('byd-table-frame') ? size : 0
        },
      })
    // The renderer asks its frame how big it is and then watches it; jsdom has neither answer,
    // and without the watcher it never asks.
    class Stub {
      observe() {
        return undefined
      }
      disconnect() {
        return undefined
      }
    }
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = Stub
  }
  try {
    return await body()
  } finally {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', had.Width)
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', had.Height)
    if (hadObserver) (globalThis as { ResizeObserver?: unknown }).ResizeObserver = hadObserver
    else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  }
}

// Whether the renderer has measured its frame yet. It draws the felt at life size and keeps it
// hidden until it has, so markup taken a tick early is a felt nobody fitted — and read back in
// Chromium it is either a 1:1 table in a window that cannot hold it or, since the whole frame
// inherits that `visibility: hidden`, a felt with no labels on it at all. Both have been seen: it
// is a race that only shows up under load, which is when the suite runs.
export const feltIsFitted = (): boolean => {
  const el = document.querySelector<HTMLElement>('.byd-table-frame')
  return el !== null && el.style.visibility !== 'hidden'
}
