import { useEffect, useRef, useState } from 'react'
import { PROJECT_NAME_MAX } from '@byd/server/doc'
import { useFocusTrap } from '../editor/focusTrap.js'
import { useT, type Key } from '../i18n/index.js'
import { importGame, readExport, startExport, type ImportProblem } from './api.js'
import './game-dialogs.css'

// Taking a game out and bringing it back (G5, #529, beställarens beslut B efter prototypen).
//
// Both are windows and not strips: they say what they are about before anything happens — what
// goes with a game and what does not, what an import makes of a zip — which is the whole of what
// G5 promises and the thing a designer will want to read once. They are modal while they stand
// (the list behind is not what is being asked about), and Escape and «Stäng» close them.

// How often the window asks how far the print files have come.
const POLL_MS = 700

const save = (zip: Blob, name: string) => {
  const a = document.createElement('a')
  const url = URL.createObjectURL(zip)
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Game = { id: string; name: string; rev: number }
type Exporting = { state: 'idle' } | { state: 'preparing'; total: number; done: number } | { state: 'ready'; zip: Blob; name: string } | { state: 'refused'; status: number } | { state: 'offline' }

// What a refusal means, in words (A4, #542): the number is the server's and not the reader's.
const refusal = (status: number): Key => (status === 401 ? 'home.export.refused.login' : status === 403 ? 'home.export.refused.forbidden' : status === 503 ? 'home.export.refused.unavailable' : 'home.export.refused')

export function ExportDialog({ http, game, onClose }: { http: string; game: Game; onClose(): void }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box, { onEscape: onClose })
  const [now, setNow] = useState<Exporting>({ state: 'idle' })
  const live = useRef(true)
  // Where the keys go while the window works (WCAG 2.4.3): the pressed button goes still while the
  // print files are made, and a still button lets the focus fall to the page behind the window. So
  // the waiting itself holds it, and what was waited for takes it when it is there.
  const waiting = useRef<HTMLDivElement>(null)
  const download = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const at = document.activeElement
    const lost = !box.current?.contains(at) || (at instanceof HTMLButtonElement && at.disabled)
    if (now.state === 'preparing' && lost) waiting.current?.focus()
    if (now.state === 'ready') download.current?.focus()
  }, [now.state])
  useEffect(
    () => () => {
      live.current = false
    },
    [],
  )
  // A server that cannot be reached is said, and the export can be asked for again (#542).
  const prepare = async () => {
    try {
      let at = await startExport(http, game.id)
      while (live.current) {
        if (at.state !== 'preparing') break
        setNow(at)
        await new Promise((r) => setTimeout(r, POLL_MS))
        at = await readExport(http, game.id)
      }
      if (live.current) setNow(at)
    } catch {
      if (live.current) setNow({ state: 'offline' })
    }
  }
  return (
    <div className="byd-game-scrim" role="presentation">
      <div ref={box} className="byd-game-dialog" role="dialog" aria-modal="true" aria-label={t('home.export.title', { name: game.name })}>
        <h2>{t('home.export.title', { name: game.name })}</h2>
        <p>{t('home.export.lead')}</p>
        <ul>
          <li>{t('home.export.versions')}</li>
          <li>{t('home.export.assets')}</li>
          <li>{t('home.export.print', { rev: game.rev })}</li>
        </ul>
        <p className="byd-muted">{t('home.export.not')}</p>
        {now.state === 'preparing' && (
          <div ref={waiting} className="byd-game-progress" tabIndex={-1}>
            <span aria-hidden="true">{t('home.export.progress', { done: now.done, total: now.total })}</span>
            <progress aria-label={t('home.export.progress.label')} max={Math.max(1, now.total)} value={now.done} aria-valuemin={0} aria-valuemax={Math.max(1, now.total)} aria-valuenow={now.done} />
          </div>
        )}
        {/* One status region from the start, so a screen reader hears its text change (4.1.3, #555). */}
        <p role="status" className={now.state === 'ready' ? undefined : 'byd-offscreen'}>
          {now.state === 'preparing' ? t('home.export.progress', { done: now.done, total: now.total }) : now.state === 'ready' ? t('home.export.ready') : ''}
        </p>
        {now.state === 'refused' && <p role="alert">{t(refusal(now.status))}</p>}
        {now.state === 'offline' && <p role="alert">{t('home.export.offline')}</p>}
        <div className="byd-game-dialog-actions">
          {now.state === 'ready' ? (
            <button ref={download} type="button" className="byd-primary" onClick={() => save(now.zip, now.name)}>
              {t('home.export.download')}
            </button>
          ) : (
            <button type="button" className="byd-primary" disabled={now.state === 'preparing'} onClick={() => void prepare()}>
              {t('home.export.prepare')}
            </button>
          )}
          <button type="button" className="byd-secondary" onClick={onClose}>
            {t('home.dialog.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

// A game's name, changed from its ⋯ (#738). The same window as the export's, holding one field: the
// name as it stands, chosen whole so that typing replaces it. A name of nothing but spaces is no
// name (#476), so the answer that would give it stands still; the limit is the one every door a
// name comes in by keeps.
export function RenameDialog({ game, onRename, onClose }: { game: { name: string }; onRename(name: string): void; onClose(): void }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  useFocusTrap(box, { onEscape: onClose, initial: () => field.current })
  const [name, setName] = useState(game.name)
  useEffect(() => field.current?.select(), [])
  const wanted = name.trim()
  return (
    <div className="byd-game-scrim" role="presentation">
      <div ref={box} className="byd-game-dialog" role="dialog" aria-modal="true" aria-label={t('home.rename.title', { name: game.name })}>
        <h2>{t('home.rename.title', { name: game.name })}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (wanted && wanted !== game.name) onRename(wanted)
            else if (wanted) onClose()
          }}
        >
          <label className="byd-game-field">
            {t('home.rename.field')}
            <input ref={field} type="text" value={name} maxLength={PROJECT_NAME_MAX} aria-required="true" onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="byd-game-dialog-actions">
            <button type="submit" className="byd-primary" disabled={!wanted}>
              {t('home.rename.confirm')}
            </button>
            <button type="button" className="byd-secondary" onClick={onClose}>
              {t('home.rename.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

type Importing ={ state: 'idle' } | { state: 'reading'; name: string } | { state: 'failed'; name: string; problems: ImportProblem[] } | { state: 'done'; id: string; name: string }

// A refusal said in the reader's words (A4): the server names what is wrong, the catalogue says it.
// A code this page does not know yet — a newer server — is said as a refusal with its code.
const PROBLEMS = ['network', 'not-zip', 'no-manifest', 'not-json', 'not-export', 'newer-format', 'manifest', 'history', 'current-rev', 'asset-missing-file', 'asset-hash', 'asset-too-big', 'asset-format', 'asset-unknown', 'unplayable', 'too-big', 'refused'] as const
const problemKey = (code: string): Key | null => ((PROBLEMS as readonly string[]).includes(code) ? (`home.import.problem.${code}` as Key) : null)

export function ImportDialog({ http, onClose, onImported, onOpen, nameOf }: { http: string; onClose(): void; onImported(id: string): Promise<void>; onOpen(id: string): void; nameOf(id: string): string | undefined }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  useFocusTrap(box, { onEscape: onClose })
  const [now, setNow] = useState<Importing>({ state: 'idle' })
  // The next thing to do is where the keys are (WCAG 2.4.3): another file after a refusal, the
  // game after it came in, and the words about the reading while it reads.
  const choose = useRef<HTMLButtonElement>(null)
  const open = useRef<HTMLButtonElement>(null)
  const reading = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (now.state === 'reading') reading.current?.focus()
    if (now.state === 'failed') choose.current?.focus()
    if (now.state === 'done') open.current?.focus()
  }, [now.state])
  const bring = async (file: File) => {
    const name = file.name.replace(/\.zip$/i, '').replace(/ rev-\d+$/, '')
    setNow({ state: 'reading', name })
    let got: Awaited<ReturnType<typeof importGame>>
    try {
      got = await importGame(http, file)
    } catch {
      return setNow({ state: 'failed', name, problems: [{ code: 'network' }] })
    }
    if (!got.ok) return setNow({ state: 'failed', name, problems: got.problems })
    // The game is made; a list that cannot be read again this moment does not unmake it (#542).
    await onImported(got.id).catch(() => undefined)
    setNow({ state: 'done', id: got.id, name })
  }
  const said = (p: ImportProblem) => {
    const key = problemKey(p.code)
    return key ? t(key, p.values ?? {}) : t('home.import.problem.refused')
  }
  return (
    <div className="byd-game-scrim" role="presentation">
      <div ref={box} className="byd-game-dialog" role="dialog" aria-modal="true" aria-label={t('home.import.title')}>
        <h2>{t('home.import.title')}</h2>
        <p>{t('home.import.lead')}</p>
        <input
          ref={picker}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void bring(file)
          }}
        />
        {now.state === 'reading' && (
          <p ref={reading} className="byd-game-progress" tabIndex={-1}>
            {t('home.import.reading', { name: now.name })}
            <progress aria-label={t('home.import.reading', { name: now.name })} />
          </p>
        )}
        {now.state === 'failed' && (
          <div role="alert">
            <p className="byd-game-bad">{t('home.import.failed', { name: now.name })}</p>
            <ul className="byd-game-problems">
              {now.problems.map((p, i) => (
                <li key={i}>{said(p)}</li>
              ))}
            </ul>
          </div>
        )}
        <p role="status" className={now.state === 'done' ? undefined : 'byd-offscreen'}>
          {now.state === 'done' ? t('home.import.done', { name: nameOf(now.id) ?? now.name }) : ''}
        </p>
        <div className="byd-game-dialog-actions">
          {now.state === 'done' ? (
            <button ref={open} type="button" className="byd-primary" onClick={() => onOpen(now.id)}>
              {t('home.import.open-game')}
            </button>
          ) : (
            <button ref={choose} type="button" className="byd-primary" disabled={now.state === 'reading'} onClick={() => picker.current?.click()}>
              {t('home.import.choose')}
            </button>
          )}
          <button type="button" className="byd-secondary" onClick={onClose}>
            {t('home.dialog.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
