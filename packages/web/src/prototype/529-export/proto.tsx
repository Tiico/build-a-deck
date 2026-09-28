// PROTOTYPE — throwaway (#529). Ska aldrig till main; bygget grenar från origin/main.
//
// Frågan: hur exporterar och importerar en designer ett spel från Mina spel (G5)? Exporten tar en
// stund (tryck-PDF:erna renderas, 202 med förlopp), importen kan avvisas med skäl.
//
// ?variant=A  I rutnätet: «Exportera» i ⋯, förloppet på spelets kort, nedladdningen går av sig själv.
//             «Importera spel» som en ruta bredvid «＋ Nytt spel»; importen blir en ruta med förlopp.
// ?variant=B  Dialoger: «Exportera…» i ⋯ öppnar en dialog som säger vad som följer med, förbereder,
//             och har «Ladda ner». «Importera spel…» i huvudet öppnar en dialog med filval och fel.
// ?variant=C  Släpp och notis: en zip släpps var som helst på sidan (eller «Importera…» i huvudet),
//             och både export och import säger sitt i en notis längst ner.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { withCredentials } from '../../account/api.js'
import './proto.css'

export type Variant = 'A' | 'B' | 'C'
export const protoVariant = (): Variant | null => {
  const v = new URLSearchParams(location.search).get('variant')
  return v === 'A' || v === 'B' || v === 'C' ? v : null
}

type Game = { id: string; name: string; rev: number }
type Progress = { game: Game; total: number; done: number; state: 'preparing' | 'ready' | 'failed'; error?: string }
type Importing = { name: string; state: 'reading' | 'done' | 'failed'; problems?: string[]; id?: string }

const save = (bytes: Blob, name: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(bytes)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function useExportProto(http: string, onImported: (id: string) => void) {
  const variant = protoVariant()
  const [exporting, setExporting] = useState<Progress | null>(null)
  const [dialog, setDialog] = useState<Game | null>(null)
  const [importing, setImporting] = useState<Importing | null>(null)
  const [importDialog, setImportDialog] = useState(false)
  const [dropping, setDropping] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const zip = useRef<Blob | null>(null)

  const run = async (game: Game, auto: boolean) => {
    setExporting({ game, total: 0, done: 0, state: 'preparing' })
    zip.current = null
    const first = await fetch(`${http}/projects/${game.id}/export`, withCredentials({ method: 'POST' }))
    if (!first.ok) return setExporting({ game, total: 0, done: 0, state: 'failed', error: `${first.status}` })
    for (;;) {
      const res = await fetch(`${http}/projects/${game.id}/export?lang=sv`, withCredentials())
      if (res.status === 200) {
        zip.current = await res.blob()
        setExporting((p) => (p ? { ...p, done: p.total, state: 'ready' } : p))
        if (auto) save(zip.current, `${game.name} rev-${game.rev}.zip`)
        return
      }
      if (res.status !== 202) return setExporting({ game, total: 0, done: 0, state: 'failed', error: `${res.status}` })
      const p = (await res.json()) as { total: number; done: number }
      setExporting({ game, total: p.total, done: p.done, state: 'preparing' })
      await new Promise((r) => setTimeout(r, 700))
    }
  }

  const bring = async (file: File) => {
    setImporting({ name: file.name.replace(/\.zip$/i, ''), state: 'reading' })
    const res = await fetch(`${http}/projects/import`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/zip' }, body: file }))
    if (res.status === 201) {
      const { id } = (await res.json()) as { id: string }
      setImporting((i) => (i ? { ...i, state: 'done', id } : i))
      onImported(id)
      return
    }
    const body = (await res.json().catch(() => ({}))) as { problems?: string[]; error?: string }
    setImporting((i) => (i ? { ...i, state: 'failed', problems: body.problems ?? [body.error ?? `${res.status}`] } : i))
  }

  useEffect(() => {
    if (variant !== 'C') return
    const over = (e: DragEvent) => {
      if (![...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) return
      e.preventDefault()
      setDropping(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropping(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDropping(false)
      const file = e.dataTransfer?.files[0]
      if (file) void bring(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  })

  if (variant === null) return null

  const pct = exporting && exporting.total > 0 ? Math.round((exporting.done / exporting.total) * 100) : 0
  const hiddenPicker = <input ref={picker} type="file" accept=".zip,application/zip" hidden data-proto529-file onChange={(e) => { const f = e.target.files?.[0]; if (f) void bring(f); e.target.value = '' }} />
  const pick = () => picker.current?.click()

  // What goes in each game's ⋯.
  const menuItem = (game: Game, close: () => void): ReactNode => (
    <button
      type="button"
      data-proto529-export
      onClick={() => {
        close()
        if (variant === 'B') setDialog(game)
        else void run(game, true)
      }}
    >
      {variant === 'B' ? 'Exportera…' : 'Exportera'}
    </button>
  )

  // A: the progress on the game's own tile.
  const onCard = (game: Game): ReactNode =>
    variant === 'A' && exporting?.game.id === game.id ? (
      <span className="p529-card-line" role="status">
        {exporting.state === 'preparing' && (
          <>
            Förbereder export · {exporting.done} av {exporting.total || '…'} tryckfiler
            <i className="p529-bar"><b style={{ width: `${pct}%` }} /></i>
          </>
        )}
        {exporting.state === 'ready' && <>Exporten är nedladdad · <button type="button" onClick={() => zip.current && save(zip.current, `${game.name} rev-${game.rev}.zip`)}>Ladda ner igen</button></>}
        {exporting.state === 'failed' && <>Exporten gick inte ({exporting.error})</>}
      </span>
    ) : null

  // A: a tile beside «＋ Nytt spel»; while importing, a tile of its own.
  const tiles: ReactNode =
    variant === 'A' ? (
      <>
        {importing && (
          <div className="byd-home-game p529-importing" role="status" data-proto529-importing>
            <strong>{importing.name}</strong>
            {importing.state === 'reading' && <span className="byd-muted">Importerar…<i className="p529-bar p529-bar-busy"><b /></i></span>}
            {importing.state === 'failed' && (
              <>
                <span className="p529-bad">Kunde inte importeras:</span>
                <ul className="p529-problems">{importing.problems?.slice(0, 4).map((p) => <li key={p}>{p}</li>)}</ul>
                <button type="button" onClick={() => setImporting(null)}>Stäng</button>
              </>
            )}
          </div>
        )}
        <button type="button" className="byd-home-game p529-import-tile" data-proto529-import onClick={pick}>
          ⤓ Importera spel
          <small>en exporterad .zip</small>
        </button>
      </>
    ) : null

  const header: ReactNode =
    variant === 'B' || variant === 'C' ? (
      <button type="button" className="p529-header-import" data-proto529-import onClick={() => (variant === 'B' ? setImportDialog(true) : pick())}>
        {variant === 'B' ? 'Importera spel…' : 'Importera…'}
      </button>
    ) : null

  const overlay: ReactNode = (
    <>
      {hiddenPicker}
      {variant === 'B' && dialog && (
        <div className="p529-scrim" role="presentation">
          <div className="p529-dialog" role="dialog" aria-modal="true" aria-label={`Exportera ${dialog.name}`} data-proto529-dialog>
            <h2>Exportera «{dialog.name}»</h2>
            <p>Hela spelet i en zip som går att öppna utan verktyget:</p>
            <ul>
              <li>varje version av spelet, med datum och namn</li>
              <li>alla bilder och typsnitt spelet använder</li>
              <li>tryckfärdiga PDF:er av version {dialog.rev} och regelhäftet</li>
            </ul>
            <p className="byd-muted">Bordens loggar och enkätsvar följer inte med.</p>
            {exporting?.game.id === dialog.id && exporting.state === 'preparing' && (
              <p role="status">Förbereder tryckfilerna · {exporting.done} av {exporting.total || '…'}<i className="p529-bar"><b style={{ width: `${pct}%` }} /></i></p>
            )}
            <div className="p529-actions">
              {exporting?.game.id === dialog.id && exporting.state === 'ready' ? (
                <button type="button" className="byd-primary" onClick={() => zip.current && save(zip.current, `${dialog.name} rev-${dialog.rev}.zip`)}>Ladda ner</button>
              ) : (
                <button type="button" className="byd-primary" disabled={exporting?.game.id === dialog.id && exporting.state === 'preparing'} onClick={() => void run(dialog, false)}>Förbered export</button>
              )}
              <button type="button" onClick={() => setDialog(null)}>Stäng</button>
            </div>
          </div>
        </div>
      )}
      {variant === 'B' && importDialog && (
        <div className="p529-scrim" role="presentation">
          <div className="p529-dialog" role="dialog" aria-modal="true" aria-label="Importera spel" data-proto529-dialog>
            <h2>Importera spel</h2>
            <p>Välj en .zip som exporterats ur verktyget. Den blir ett nytt spel med hela sin historik; inget spel du har skrivs över.</p>
            {importing?.state === 'reading' && <p role="status">Läser {importing.name}…<i className="p529-bar p529-bar-busy"><b /></i></p>}
            {importing?.state === 'failed' && (
              <div role="alert">
                <p className="p529-bad">«{importing.name}» kunde inte importeras:</p>
                <ul className="p529-problems">{importing.problems?.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            <div className="p529-actions">
              <button type="button" className="byd-primary" onClick={pick}>Välj fil…</button>
              <button type="button" onClick={() => { setImportDialog(false); setImporting(null) }}>Stäng</button>
            </div>
          </div>
        </div>
      )}
      {variant === 'C' && dropping && <div className="p529-drop" data-proto529-drop>Släpp zippen för att importera spelet</div>}
      {variant === 'C' && (exporting || importing) && (
        <div className="p529-toast" role="status" data-proto529-toast>
          {exporting && exporting.state === 'preparing' && <span>Förbereder «{exporting.game.name}» · {exporting.done} av {exporting.total || '…'} tryckfiler <i className="p529-bar"><b style={{ width: `${pct}%` }} /></i></span>}
          {exporting && exporting.state === 'ready' && <span>«{exporting.game.name}» är nedladdad.</span>}
          {importing?.state === 'reading' && <span>Importerar «{importing.name}»…</span>}
          {importing?.state === 'failed' && <span className="p529-bad">«{importing.name}» kunde inte importeras: {importing.problems?.[0]}{(importing.problems?.length ?? 0) > 1 ? ` (+${(importing.problems?.length ?? 1) - 1})` : ''}</span>}
          <button type="button" onClick={() => { setExporting(null); setImporting(null) }}>Stäng</button>
        </div>
      )}
      <aside className="p529-panel">
        PROTOTYP #529 · variant {variant}{' '}
        {(['A', 'B', 'C'] as const).map((v) => (
          <a key={v} href={`?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), variant: v })}`} aria-current={v === variant}>{v}</a>
        ))}
      </aside>
    </>
  )
  return { variant, menuItem, onCard, tiles, header, overlay }
}
