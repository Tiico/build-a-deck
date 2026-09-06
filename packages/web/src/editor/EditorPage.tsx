import { useMemo, useState } from 'react'
import { DeckWall } from './DeckWall.js'
import { TemplateCanvas } from './TemplateCanvas.js'
import { DataTable } from './DataTable.js'
import { useProjectClient } from './useProjectClient.js'
import './editor.css'

type Mode = 'wall' | 'template' | 'table'

// /editor?project=…&server=http://…
// The editor (L, prototype answer): the deck wall as home, the template canvas for the template,
// the table as a tab. One project, one preview path, and "Uppdatera bordet" starts a table.
export function EditorPage() {
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
  const [table, setTable] = useState<{ id: string; version: string; kind: 'new' | 'refreshed' } | null>(null)

  if (!projectId) return <p>Inget projekt angivet.</p>
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
  // Once a table exists, the primary button pushes the current rev to it (C7, L5).
  const updateTable = async () => {
    if (!table) return startTable()
    try {
      const { version } = await client.refreshTable(table.id)
      setTable({ ...table, version, kind: 'refreshed' })
      setNotice(null)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }
  const tableUrl = (id: string) => {
    const q = new URLSearchParams({ session: id, mode: 'tv' })
    const ws = params.get('server')
    if (ws) q.set('server', ws.replace(/^http/, 'ws'))
    return `/table?${q.toString()}`
  }

  return (
    <div className="byd-editor" data-page="editor" data-mode={mode}>
      <header>
        <strong>{doc.name}</strong>
        <span className="byd-editor-rev">rev {client.rev}</span>
        <nav role="tablist">
          {(
            [
              ['wall', 'Kortvägg'],
              ['template', 'Mall'],
              ['table', 'Tabell'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} role="tab" type="button" aria-selected={mode === m ? 'true' : 'false'} onClick={() => setMode(m)}>
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
          {table.kind === 'new' ? 'Nytt bord startat' : 'Bordet uppdaterat'} på {table.version} — <a href={tableUrl(table.id)} target="_blank" rel="noreferrer">öppna bordet</a>
        </div>
      )}
      <main>
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
        {mode === 'template' && (
          <TemplateCanvas doc={doc} face={face} row={row} selectedElement={element} onSelectElement={setElement} onPatch={(id, patch) => client.patchElement(face, id, patch)} />
        )}
        {mode === 'table' && (
          <DataTable
            doc={doc}
            selectedRow={row}
            onSelectRow={setRow}
            onCell={(cardRef, field, value) => client.setCell(cardRef, field, value)}
            onAddRow={(cardRef) => client.addRow(cardRef, { title: '', antal: 1 })}
            onRemoveRow={(cardRef) => client.removeRow(cardRef)}
          />
        )}
      </main>
    </div>
  )
}
