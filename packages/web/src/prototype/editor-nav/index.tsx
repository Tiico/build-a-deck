// PROTOTYPE — getting from the editor to a table, on /prototype/editor-nav?variant=A|B|C.
// Question: where in the editor does the designer see her running tables and reach them — as the
// TV, as a player, as an observer? Static; nothing is live.
import { useState } from 'react'
import { Switcher } from './Switcher.js'
import '../../editor/editor.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Bord-flik bredvid Kortvägg, Mall, Tabell' },
  { key: 'B', name: 'Delad knapp: Uppdatera ▾ med öppna som…' },
  { key: 'C', name: 'Statusrad längst ner med bordets miniatyr' },
]
const TABLES = [
  { id: 'c7ed…4120', code: 'KX7P', version: 'rev 12', players: ['Ada', 'Bo', 'Cy'], observers: ['Eva'], seq: 214, since: 'startat 19:02, senast drag 19:41', stale: false },
  { id: '8a1f…90bc', code: 'MAL-7', version: 'rev 9', players: ['Ada'], observers: [], seq: 12, since: 'startat i går', stale: true },
]

export function EditorNavPrototype() {
  const [variant, setVariant] = useState(new URLSearchParams(location.search).get('variant') ?? 'A')
  const [mode, setMode] = useState<'wall' | 'tables'>(variant === 'A' ? 'tables' : 'wall')
  const [menu, setMenu] = useState(true) // open from the start so the prototype shows its answer
  const change = (k: string) => { setVariant(k); setMode(k === 'A' ? 'tables' : 'wall'); setMenu(false); const q = new URLSearchParams(location.search); q.set('variant', k); history.replaceState(null, '', `?${q}`) }
  return (
    <div className="byd-editor pn-stage" data-mode={mode}>
      <header>
        <strong>Skogens herrar</strong>
        <span className="byd-editor-rev">rev 12</span>
        <nav role="tablist">
          <button role="tab" type="button" aria-selected={mode === 'wall'} onClick={() => setMode('wall')}>Kortvägg</button>
          <button role="tab" type="button" aria-selected="false">Mall</button>
          <button role="tab" type="button" aria-selected="false">Tabell</button>
          {variant === 'A' && (
            <button role="tab" type="button" aria-selected={mode === 'tables'} onClick={() => setMode('tables')} className="pn-tab-tables">
              Bord <span className="pn-live">● 1 spelas</span>
            </button>
          )}
        </nav>
        <span className="byd-editor-spacer" />
        <button type="button">Spara</button>
        {variant === 'B' ? (
          <span className="pn-split">
            <button type="button" className="byd-editor-primary">Uppdatera bordet</button>
            <button type="button" className="byd-editor-primary pn-caret" aria-label="fler val" onClick={() => setMenu((m) => !m)}>▾</button>
            {menu && (
              <div className="pn-menu" role="menu">
                <div className="pn-menu-head">Bordet KX7P · rev 12 · Ada, Bo, Cy spelar · Eva tittar</div>
                <button role="menuitem">Öppna TV-vyn</button>
                <button role="menuitem">Öppna bordsläget</button>
                <button role="menuitem">Spela från den här skärmen…</button>
                <button role="menuitem">Titta på (observatör)</button>
                <button role="menuitem">Visa QR för telefoner</button>
                <hr />
                <button role="menuitem">Nytt bord</button>
                <button role="menuitem">Bord MAL-7 (i går) …</button>
              </div>
            )}
          </span>
        ) : (
          <>
            <button type="button">Nytt bord</button>
            <button type="button" className="byd-editor-primary">Uppdatera bordet</button>
          </>
        )}
      </header>
      <div />
      {mode === 'tables' && variant === 'A' ? <TablesTab /> : <Wall />}
      {variant === 'C' && <StatusBar />}
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

function Wall() {
  return (
    <div className="pn-wall">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="pn-card"><b>{['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa'][i]}</b><span>×{1 + (i % 3)}</span></div>
      ))}
    </div>
  )
}

// ---------- A — a Bord tab: every table this project has, live, with the ways in ----------
function TablesTab() {
  return (
    <div className="pn-tables">
      <h1>Bord</h1>
      <p className="pn-muted">Varje bord är en session från det här spelet. Ett bord överlever att alla kopplar ner; det avslutas uttryckligen eller efter ett dygn.</p>
      {TABLES.map((t) => (
        <div key={t.id} className="pn-table" data-stale={t.stale}>
          <div className="pn-table-mini">
            <i /><i /><i />
            <span>{t.code}</span>
          </div>
          <div className="pn-table-info">
            <strong>{t.code} · {t.version}{t.version !== 'rev 12' && <em> · bordet ligger efter, uppdatera</em>}</strong>
            <span>{t.players.join(', ')} spelar{t.observers.length > 0 ? ` · ${t.observers.join(', ')} tittar` : ''} · {t.seq} rader · {t.since}</span>
            <div className="pn-ways">
              <button type="button" className="byd-editor-primary">Öppna TV-vyn</button>
              <button type="button">Bordsläge</button>
              <button type="button">Spela härifrån</button>
              <button type="button">Titta på</button>
              <button type="button">QR för telefoner</button>
              <span className="byd-editor-spacer" />
              <button type="button" data-kind="quiet">Avsluta bordet…</button>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="pn-new">+ Nytt bord från rev 12</button>
    </div>
  )
}

// ---------- C — a status bar at the bottom, always there while a table runs ----------
function StatusBar() {
  const t = TABLES[0]!
  return (
    <div className="pn-status" role="status">
      <div className="pn-table-mini small"><i /><i /><i /></div>
      <span><strong>Bordet {t.code}</strong> spelas nu på rev 12 · {t.players.join(', ')} · Eva tittar · {t.seq} rader</span>
      <span className="byd-editor-spacer" />
      <a href="#">Öppna TV-vyn</a>
      <a href="#">Spela härifrån</a>
      <a href="#">Titta på</a>
      <a href="#">QR</a>
      <a href="#" className="pn-more">1 äldre bord</a>
    </div>
  )
}
