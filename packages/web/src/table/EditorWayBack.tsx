import { ArrowGlyph } from '../glyphs.js'
import { useT } from '../i18n/index.js'
import { editorWay } from '../ways.js'

// The owner's way from a table back to the game's editor (#1217, L79, prototype A): the game's
// name with an arrow, on every screen the owner opens a table on. It names the editor's tab, so
// it brings that tab out as it stands rather than opening a second editor (`ways.ts`).
//
// Only the owner is shown it. A guest at the table holds the session too, and the session's record
// says which project it came from, but the editor is not hers to open: a way that leads to a
// refusal is not a way. `game` is null until the record has answered, and a table started from no
// project, or whose game is gone, has no editor to go back to.
export function EditorWayBack({ game, server, className }: { game: { project?: string | undefined; name?: string | undefined } | null; server: string | null; className?: string }) {
  const t = useT()
  if (!game?.project || !game.name) return null
  const way = editorWay(game.project, server)
  return (
    <a className={['byd-editor-way', className].filter(Boolean).join(' ')} href={way.href} target={way.target} aria-label={t('way.editor.aria', { game: game.name })} data-editor-way>
      <ArrowGlyph to="left" />
      <span>{game.name}</span>
    </a>
  )
}
