import { useEffect, useMemo, useState } from 'react'
import { DeckWall } from './DeckWall.js'
import { TemplateCanvas } from './TemplateCanvas.js'
import { DataTable } from './DataTable.js'
import { useProjectClient } from './useProjectClient.js'
import { useTableClient } from '../table/useTableClient.js'
import { shortcutsOf } from '../player/PlaySheet.js'
import type { ProjectDoc } from './types.js'
import type { ProjectClient, Textures } from './ProjectClient.js'
import { loginUrl } from '../account/api.js'
import './editor.css'

type Mode = 'wall' | 'template' | 'table' | 'zones'

// /editor?project=…&server=http://…
// The editor (L, prototype answer): the deck wall as home, the template canvas for the template,
// the table as a tab. One project, one preview path, and "Uppdatera bordet" starts a table.
export type EditorPageProps = { onNavigate?(url: string): void }

export function EditorPage({ onNavigate = (url) => location.assign(url) }: EditorPageProps = {}) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const projectId = params.get('project')
  const http = params.get('server') ?? location.origin
  const { client, error } = useProjectClient(http, projectId)
  const [mode, setMode] = useState<Mode>('wall')
  const [face] = useState('front')
  const [row, setRow] = useState<string | null>(null)
  const [element, setElement] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // A running table (L5) with what admits people to it (DRIFT §9): the code and the host key.
  const [table, setTable] = useState<{ id: string; version: string; code: string; hostKey: string; kind: 'new' | 'refreshed' } | null>(null)
  // The table's textures (L5): the link opens only when every card can be seen. Polled with a
  // growing pause while anything is still rendering.
  const [textures, setTextures] = useState<Textures | null>(null)
  const [preparing, setPreparing] = useState<Textures | null>(null)
  const [renderError, setRenderError] = useState<number | null>(null)
  useEffect(() => {
    if (!client || !table) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let delay = 100
    const poll = async () => {
      const t = await client.textures(table.id).catch(() => null)
      if (stop) return
      if (t) setTextures(t)
      if (!t || t.done + t.failed.length < t.total) {
        timer = setTimeout(() => void poll(), delay)
        delay = Math.min(1000, delay * 2)
      }
    }
    // A refreshed table keeps what is known until the next answer; another table starts over.
    setTextures((t) => (t && table.kind === 'refreshed' ? t : null))
    void poll()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [client, table?.id, table?.version])

  if (!projectId) return <p>Inget projekt angivet.</p>
  if (error === 'not logged in') {
    // Not logged in (G1): to the login card and back here after.
    onNavigate(loginUrl(location.pathname + location.search, params.get('server')))
    return <p>Loggar in…</p>
  }
  if (error) return <p role="alert">{error}</p>
  if (!client) return <p>Laddar projektet…</p>
  const doc = client.doc

  const save = async () => {
    setSaving(true)
    const result = await client.save()
    setSaving(false)
    setNotice(result.ok ? null : result.reason === 'conflict' ? 'Någon annan har sparat sedan du laddade. Ladda om och gör om ändringen.' : result.reason)
  }
  const startTable = async () => {
    try {
      const started = await client.startTable()
      setTable({ ...started, kind: 'new' })
      setNotice(null)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }
  // Once a table exists, the primary button pushes the current rev to it (C7, L5) — but only
  // after the new textures are rendered, so the switch is atomic for the players: prepare,
  // poll with a growing pause, then refresh.
  const updateTable = async (retryFailed = false) => {
    if (!table) return startTable()
    try {
      setRenderError(null)
      let delay = 100
      let first = true
      for (;;) {
        const t = await client.prepareTable(table.id, retryFailed && first)
        first = false
        setPreparing(t)
        if (t.failed.length > 0) {
          setRenderError(t.failed.length)
          return
        }
        if (t.done >= t.total) break
        await new Promise((r) => setTimeout(r, delay))
        delay = Math.min(1000, delay * 2)
      }
      const { version } = await client.refreshTable(table.id)
      setTable({ ...table, version, kind: 'refreshed' })
      setRenderError(null)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setPreparing(null)
    }
  }
  const wsUrl = (params.get('server') ?? location.origin).replace(/^http/, 'ws')
  // The table's own screen opens with the host key (DRIFT §9).
  const tableUrl = (id: string, hostKey: string) => {
    const q = new URLSearchParams({ session: id, host: hostKey, mode: 'tv' })
    const ws = params.get('server')
    if (ws) q.set('server', ws.replace(/^http/, 'ws'))
    return `/table?${q.toString()}`
  }
  const rotate = async () => {
    if (!table) return
    try {
      const { code } = await client.rotateCode(table.id, table.hostKey)
      setTable({ ...table, code })
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="byd-editor" data-page="editor" data-mode={mode}>
      <header>
        <strong>{doc.name}</strong>
        <span className="byd-editor-rev">rev {client.rev}</span>
        <nav role="tablist" aria-label="Editorlägen">
          {(
            [
              ['wall', 'Kortvägg'],
              ['template', 'Mall'],
              ['table', 'Tabell'],
              ['zones', 'Bord'],
            ] as const
          ).map(([m, label], index, modes) => (
            <button
              key={m}
              id={`editor-tab-${m}`}
              role="tab"
              type="button"
              aria-controls={`editor-panel-${m}`}
              aria-selected={mode === m ? 'true' : 'false'}
              tabIndex={mode === m ? 0 : -1}
              onClick={() => setMode(m)}
              onKeyDown={(event) => {
                let next: number
                if (event.key === 'ArrowRight') next = (index + 1) % modes.length
                else if (event.key === 'ArrowLeft') next = (index - 1 + modes.length) % modes.length
                else if (event.key === 'Home') next = 0
                else if (event.key === 'End') next = modes.length - 1
                else return
                const nextMode = modes[next]?.[0]
                if (!nextMode) return
                event.preventDefault()
                setMode(nextMode)
                event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <span className="byd-editor-spacer" />
        {notice && <span role="status" className="byd-editor-notice">{notice}</span>}
        <button type="button" onClick={() => void save()} disabled={!client.dirty || saving}>
          {saving ? 'Sparar…' : 'Spara'}
        </button>
        {table && (
          <button type="button" onClick={() => void startTable()}>
            Nytt bord
          </button>
        )}
        <button type="button" className="byd-editor-primary" onClick={() => void updateTable()}>
          Uppdatera bordet
        </button>
      </header>
      {table && (
        <div className="byd-editor-table-link" role="status">
          {table.kind === 'new' ? 'Nytt bord startat' : 'Bordet uppdaterat'} på {table.version} —{' '}
          {renderError !== null ? (
            <>
              <span className="byd-editor-warning" role="alert">{renderError} {renderError === 1 ? 'textur kunde' : 'texturer kunde'} inte renderas. Bordet har inte uppdaterats.</span>{' '}
              <button type="button" onClick={() => void updateTable(true)}>Försök igen</button>
            </>
          ) : preparing ? (
            <span className="byd-editor-rendering">renderar kort {preparing.done}/{preparing.total}</span>
          ) : textures && textures.done + textures.failed.length >= textures.total ? (
            <a href={tableUrl(table.id, table.hostKey)} target="_blank" rel="noreferrer">
              öppna bordet
            </a>
          ) : (
            <span className="byd-editor-rendering">renderar kort {textures?.done ?? 0}/{textures?.total ?? '…'}</span>
          )}
          {textures && textures.failed.length > 0 && <span className="byd-editor-warning"> · {textures.failed.length} kort kunde inte renderas</span>}
          <span className="byd-editor-room">
            {' '}· rumskod <strong data-room-code>{table.code}</strong>{' '}
            <button type="button" onClick={() => void rotate()}>Ny kod</button>
          </span>
          <HostSeats client={client} sessionId={table.id} hostKey={table.hostKey} ws={wsUrl} onNotice={setNotice} />
        </div>
      )}
      <main>
        <section id="editor-panel-wall" className="byd-editor-panel" role="tabpanel" aria-labelledby="editor-tab-wall" hidden={mode !== 'wall'}>
          {mode === 'wall' && (
            <DeckWall
              doc={doc}
              face={face}
              selectedRow={row}
              onSelectRow={setRow}
              onSelectElement={(id) => {
                setElement(id)
                setMode('template')
              }}
            />
          )}
        </section>
        <section id="editor-panel-template" className="byd-editor-panel" role="tabpanel" aria-labelledby="editor-tab-template" hidden={mode !== 'template'}>
          {mode === 'template' && (
            <TemplateCanvas doc={doc} face={face} row={row} selectedElement={element} onSelectElement={setElement} onPatch={(id, patch) => client.patchElement(face, id, patch)} />
          )}
        </section>
        <section id="editor-panel-zones" className="byd-editor-panel" role="tabpanel" aria-labelledby="editor-tab-zones" hidden={mode !== 'zones'}>
          {mode === 'zones' && <ZonesPanel doc={doc} onPatch={(id, patch) => client.patchZone(id, patch)} />}
        </section>
        <section id="editor-panel-table" className="byd-editor-panel" role="tabpanel" aria-labelledby="editor-tab-table" hidden={mode !== 'table'}>
          {mode === 'table' && (
            <DataTable
              doc={doc}
              selectedRow={row}
              onSelectRow={setRow}
              onCell={(cardRef, field, value) => client.setCell(cardRef, field, value)}
              onAddRow={(cardRef) => client.addRow(cardRef, { title: '', antal: 1 })}
              onRemoveRow={(cardRef) => client.removeRow(cardRef)}
              onImportRows={(rows) => client.replaceRows(rows)}
            />
          )}
        </section>
      </main>
    </div>
  )
}

// The seats as the lobby sees them (DRIFT §9), each taken one with a kick: the host's control
// over who is at the table, from the screen the host already has open.
function HostSeats({ client, sessionId, hostKey, ws, onNotice }: { client: ProjectClient; sessionId: string; hostKey: string; ws: string; onNotice(text: string | null): void }) {
  const { view } = useTableClient({ url: ws, sessionId, seat: null, lobby: true })
  if (!view) return null
  const taken = view.seats.filter((s) => s.name !== null)
  if (taken.length === 0) return null
  return (
    <span className="byd-editor-seats">
      {' '}· vid bordet:{' '}
      {taken.map((s) => (
        <span key={s.id} data-host-seat={s.id}>
          {s.name}{' '}
          <button type="button" onClick={() => void client.kick(sessionId, hostKey, s.id).catch((err: unknown) => onNotice(err instanceof Error ? err.message : String(err)))}>
            Sparka {s.name}
          </button>{' '}
        </span>
      ))}
    </span>
  )
}

// The table's zones (C4): the name the table shows, and the verb the phone shows with where a
// card goes — next to a preview of the phone's sheet, so a designer sees the buttons players get
// without seeing the table. Hands are not targets and are not listed.
function ZonesPanel({ doc, onPatch }: { doc: ProjectDoc; onPatch(id: string, patch: { name?: string; shortcut?: { label: string; at: 'top' | 'bottom' } | undefined }): void }) {
  const zones = doc.setup.zones.filter((z) => z.kind !== 'hand')
  const preview = shortcutsOf(doc.setup.zones, doc.setup.floor)
  return (
    <div className="byd-zones">
      <div className="byd-zones-list">
        <h2>Zoner</h2>
        <p>Namnet syns på bordet. Genvägen är knappen på telefonen; utan genväg visar telefonen namnet.</p>
        {zones.map((z) => (
          <div key={z.id} className="byd-zones-row" data-zone-row={z.id}>
            <span className="byd-zones-kind">{z.id === doc.setup.floor ? 'golv' : z.kind === 'pile' ? 'hög' : 'area'}</span>
            <input aria-label={`Namn för ${z.name}`} value={z.name} onChange={(e) => onPatch(z.id, { name: e.target.value })} />
            {z.id !== doc.setup.floor && (
              <>
                <input
                  aria-label={`Genväg för ${z.name}`}
                  placeholder={z.name}
                  value={z.shortcut?.label ?? ''}
                  onChange={(e) => onPatch(z.id, { shortcut: e.target.value ? { label: e.target.value, at: z.shortcut?.at ?? 'top' } : undefined })}
                />
                {z.kind === 'pile' && (
                  <select aria-label={`Placering för ${z.name}`} value={z.shortcut?.at ?? 'top'} onChange={(e) => onPatch(z.id, { shortcut: { label: z.shortcut?.label ?? z.name, at: e.target.value === 'bottom' ? 'bottom' : 'top' } })}>
                    <option value="top">överst</option>
                    <option value="bottom">underst</option>
                  </select>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="byd-zones-preview" data-sheet-preview>
        <h2>Så ser spelaren det</h2>
        <p>Spela <strong>ett kort</strong> till</p>
        <div className="byd-sheet-targets">
          {preview.map((t) => (
            <div key={t.id} role="presentation">
              <span>{t.label}</span>
              <small>{t.kind === 'pile' ? `${t.at === 'bottom' ? 'underst' : 'överst'} i ${t.name}` : 'lägg fritt'}</small>
            </div>
          ))}
          <div role="presentation">
            <span>Bordet</span>
            <small>lägg fritt</small>
          </div>
        </div>
      </div>
    </div>
  )
}
