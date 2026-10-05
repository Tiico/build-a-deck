import { useEffect, useRef, type ReactNode } from 'react'
import './game-menu.css'

// A game's own menu (G1), and every way out of it (#475, L32): Escape gives the focus back to the
// ⋯ it hangs from, and a press outside it or the focus walking out of it closes it where the
// reader is — the press and the walk are already somewhere else, so the focus stays with them.
// The first choice takes the focus when it opens, so the keys land in the menu and not behind it.
// The ⋯ itself does not count as outside: pressing it is how the menu is closed on purpose, and a
// menu that shut on the press would open again on the click that follows.
export function GameMenu({ label, more, onClose, children }: { label: string; more: HTMLButtonElement | null; onClose(back: boolean): void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    // Its first choice, a link to a running table (#724) as much as a button.
    box.current?.querySelector<HTMLElement>('button, a[href]')?.focus()
    const away = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && (box.current?.contains(target) || more?.contains(target))) return
      close.current(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [more])
  return (
    <div
      ref={box}
      className="byd-game-menu"
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        onClose(true)
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null
        if (next && !event.currentTarget.contains(next) && next !== more) onClose(false)
      }}
    >
      {children}
    </div>
  )
}
