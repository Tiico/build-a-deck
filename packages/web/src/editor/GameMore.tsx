import { useEffect, useRef, useState, type RefObject } from 'react'
import { GameMenu } from '../account/GameMenu.js'
import { ExportDialog, RenameDialog } from '../account/GameDialogs.js'
import { duplicateProject } from '../account/api.js'
import { useT } from '../i18n/index.js'

export type GameMoreProps = {
  http: string
  game: { id: string; name: string; rev: number }
  // The ⋯ itself, for the page that asks a question of its own and gives the keys back here after it.
  more?: RefObject<HTMLButtonElement | null>
  onShare?: () => void
  onRename(name: string): void
  // What happened, said in the editor's own channels: routine news, and a failure that stands.
  onSaid(text: string): void
  onFailed(text: string): void
  // Taking the game away is the owner's alone (D3, #689): without it the choice is not offered.
  onRemove?: () => void
}

// The game's own ⋯ in the editor, beside its name (#542, #529 beslut B): the same menu a game has in
// «Mina spel», holding what is done to the whole game rather than to its cards (#738, beställarens
// beslut 2026-10-06) — its name, a copy of it, the export and taking it away — so the header does
// not grow a button for each of them. It is there only for those who may change the game: the owner
// and the co-editors.
export function GameMore({ http, game, more: given, onShare, onRename, onSaid, onFailed, onRemove }: GameMoreProps) {
  const t = useT()
  const own = useRef<HTMLButtonElement>(null)
  const more = given ?? own
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'export' | 'rename' | null>(null)
  // The keys go back to the ⋯ once a window has closed. The window's own trap hands the focus back
  // to what had it when it opened — the menu's item, which is gone by then — so the ⋯ takes it
  // after the trap has let go, and not before.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !dialog) more.current?.focus()
    wasOpen.current = dialog !== null
  }, [dialog, more])
  const choose = (then: () => void) => () => {
    setOpen(false)
    then()
  }
  const duplicate = async () => {
    more.current?.focus()
    try {
      const copy = await duplicateProject(http, game.id, t)
      onSaid(t('home.duplicated', { name: copy.name }))
    } catch (err) {
      onFailed(err instanceof Error ? err.message : String(err))
    }
  }
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
          {/* The same door as «Dela» in the header (#727, beslut C): where the game's own actions are. */}
          {onShare && (
            <button type="button" onClick={choose(onShare)}>
              {t('share.menu')}
            </button>
          )}
          <button type="button" onClick={choose(() => setDialog('rename'))}>
            {t('home.menu.rename')}
          </button>
          <button type="button" onClick={choose(() => void duplicate())}>
            {t('home.menu.duplicate')}
          </button>
          <button type="button" onClick={choose(() => setDialog('export'))}>
            {t('home.menu.export')}
          </button>
          {onRemove && (
            <button type="button" onClick={choose(onRemove)}>
              {t('home.menu.remove')}
            </button>
          )}
        </GameMenu>
      )}
      {dialog === 'export' && <ExportDialog http={http} game={game} onClose={() => setDialog(null)} />}
      {dialog === 'rename' && (
        <RenameDialog
          game={game}
          onRename={(name) => {
            onRename(name)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </span>
  )
}
