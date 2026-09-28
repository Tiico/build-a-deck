import { useEffect, useRef, useState } from 'react'
import { GameMenu } from '../account/GameMenu.js'
import { ExportDialog } from '../account/GameDialogs.js'
import { useT } from '../i18n/index.js'

// The game's own ⋯ in the editor, beside its name (#542, #529 beslut B): the same menu a game has in
// «Mina spel», holding what is done to the whole game rather than to its cards — today the export,
// and the place the next such thing goes, so the header does not grow a button for each of them.
// It is there only for those the server lets export: the owner and the co-editors.
export function GameMore({ http, game }: { http: string; game: { id: string; name: string; rev: number } }) {
  const t = useT()
  const more = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  // The keys go back to the ⋯ once the window has closed. The window's own trap hands the focus
  // back to what had it when it opened — the menu's item, which is gone by then — so the ⋯ takes it
  // after the trap has let go, and not before.
  const wasExporting = useRef(false)
  useEffect(() => {
    if (wasExporting.current && !exporting) more.current?.focus()
    wasExporting.current = exporting
  }, [exporting])
  return (
    <span className="byd-editor-more">
      <button ref={more} type="button" aria-label={t('home.menu.more', { name: game.name })} aria-expanded={open} onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open && (
        <GameMenu
          label={t('home.menu.label', { name: game.name })}
          more={more.current}
          onClose={(back) => {
            setOpen(false)
            if (back) more.current?.focus()
          }}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setExporting(true)
            }}
          >
            {t('home.menu.export')}
          </button>
        </GameMenu>
      )}
      {exporting && (
        <ExportDialog
          http={http}
          game={game}
          onClose={() => setExporting(false)}
        />
      )}
    </span>
  )
}
