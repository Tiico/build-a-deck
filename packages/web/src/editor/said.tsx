import { createContext, useContext, type ReactNode } from 'react'

// What just happened, for the place a tab says it (#698, beslut B 2026-10-06). The editor holds it
// and says it to a reader through the app's polite channel; this is only what is drawn. It is
// `null` while nothing stands, and while a question does: the question is the present.
const Standing = createContext<string | null>(null)

export function SaidProvider({ text, children }: { text: string | null; children: ReactNode }) {
  return <Standing.Provider value={text}>{children}</Standing.Provider>
}

// The foot's status place. What just happened stands here for its six seconds in the stead of the
// foot's quiet line, which is kept and only not drawn, so a quiet line that is a live region is not
// read out again when it comes back. It lies over nothing and costs the work no height, because the
// foot it stands in is already there.
//
// It is drawn and not spoken: the editor already said it, and a second region saying it would be
// a second reader in the same room.
export function FootSaid({ children }: { children?: ReactNode }) {
  const text = useContext(Standing)
  return (
    <>
      {text !== null && <span className="byd-editor-confirm">{text}</span>}
      {children !== undefined && (
        <div className="byd-foot-quiet" hidden={text !== null}>
          {children}
        </div>
      )}
    </>
  )
}

// A foot for a tab whose work has none of its own (Speltema, Media, Regler, Bord): the work above,
// and under it the line the tab says what just happened in. The work keeps its own frame and its
// own scroll; the foot is a row of the tab and not of the work.
export function Footed({ children }: { children: ReactNode }) {
  return (
    <div className="byd-footed">
      <div className="byd-footed-work">{children}</div>
      <div className="byd-crown-foot byd-footed-foot">
        <FootSaid />
      </div>
    </div>
  )
}
