// PROTOTYPE — grouping cards and letting a group rule design on both faces, including the back,
// on /prototype/groups?variant=A|B|C. Question: how does a designer say "traps look like this,
// front and back; shop cards like that; everything else like the base"? Real compiler, real
// variants (L3, L7); in memory.
import { useState } from 'react'
import type { FaceTemplate, Template } from '@byd/template'
import { CardPreview } from '../../editor/CardPreview.js'
import { Switcher } from './Switcher.js'
import '../../editor/editor.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Gruppkolumn + variantflikar på duken' },
  { key: 'B', name: 'Grupper som regler med fram- och baksida' },
  { key: 'C', name: 'Baksida och stil väljs per rad i tabellen' },
]

type Row = { id: string; typ: string; title: string; body: string; kostnad: string }
const ROWS: Row[] = [
  { id: 'drake', typ: 'varelse', title: 'Drake', body: 'Flygande. Gör 2 skada.', kostnad: '5' },
  { id: 'riddare', typ: 'varelse', title: 'Riddare', body: 'Sköld 1.', kostnad: '3' },
  { id: 'fallgrop', typ: 'fälla', title: 'Fallgrop', body: 'Spelas dolt. När en varelse anfaller: den faller.', kostnad: '2' },
  { id: 'snara', typ: 'fälla', title: 'Snara', body: 'Spelas dolt. Stoppa ett drag.', kostnad: '1' },
  { id: 'smed', typ: 'butik', title: 'Smedjan', body: 'Köp: +1 sköld på en varelse.', kostnad: '4' },
  { id: 'krog', typ: 'butik', title: 'Krogen', body: 'Köp: dra två kort.', kostnad: '3' },
]
const GROUPS = ['varelse', 'fälla', 'butik']

// The template as the compiler takes it: a base and named variants chosen by the `typ` column,
// on both faces (L3, L7). What the three variants of this prototype differ in is how the designer
// sees and edits exactly this.
const front: FaceTemplate = {
  variantBy: 'typ',
  base: [
    { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#6b5b3e', strokeMm: 0.6, radiusMm: 3 },
    { kind: 'shape', id: 'art', x: 5, y: 5, w: 53, h: 30, shape: 'rect', fill: '#cfc6b3', radiusMm: 2 },
    { kind: 'shape', id: 'cost-bg', x: 50, y: 4, w: 10, h: 10, shape: 'circle', fill: '#7a2e2e' },
    { kind: 'text', id: 'cost', x: 50, y: 5.2, w: 10, h: 8, bind: { field: 'kostnad' }, font: { family: 'sans-serif', sizePt: 12, weight: 800, align: 'center' }, color: '#fff' },
    { kind: 'text', id: 'title', x: 5, y: 38, w: 53, h: 8, bind: { field: 'title' }, font: { family: 'serif', sizePt: 13, weight: 700 }, color: '#1c1c1c' },
    { kind: 'text', id: 'typ', x: 5, y: 46, w: 53, h: 5, bind: { field: 'typ' }, font: { family: 'sans-serif', sizePt: 6 }, color: '#6b5b3e' },
    { kind: 'text', id: 'body', x: 5, y: 53, w: 53, h: 30, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 8 }, color: '#222', fit: 'shrink' },
  ],
  variants: {
    fälla: {
      override: [
        { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#2b1d1f', stroke: '#c0392b', strokeMm: 1, radiusMm: 3 },
        { kind: 'text', id: 'title', x: 5, y: 38, w: 53, h: 8, bind: { field: 'title' }, font: { family: 'serif', sizePt: 13, weight: 700 }, color: '#ffd1cc' },
        { kind: 'text', id: 'typ', x: 5, y: 46, w: 53, h: 5, bind: { literal: 'FÄLLA · spelas dolt' }, font: { family: 'sans-serif', sizePt: 6, weight: 700 }, color: '#e74c3c' },
        { kind: 'text', id: 'body', x: 5, y: 53, w: 53, h: 30, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 8 }, color: '#f1e0dc', fit: 'shrink' },
      ],
    },
    butik: {
      override: [
        { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#fff6d6', stroke: '#c9a227', strokeMm: 1.2, radiusMm: 3 },
        { kind: 'shape', id: 'cost-bg', x: 50, y: 4, w: 10, h: 10, shape: 'circle', fill: '#c9a227' },
        { kind: 'text', id: 'typ', x: 5, y: 46, w: 53, h: 5, bind: { literal: 'BUTIK · köp för kostnaden' }, font: { family: 'sans-serif', sizePt: 6, weight: 700 }, color: '#8a6d12' },
      ],
    },
  },
}
const back: FaceTemplate = {
  variantBy: 'typ',
  base: [
    { kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' },
    { kind: 'shape', id: 'ring', x: 11.5, y: 24, w: 40, h: 40, shape: 'circle', stroke: '#9fb3e0', strokeMm: 1.2 },
    { kind: 'text', id: 'name', x: 4, y: 40, w: 55, h: 8, bind: { literal: 'Skogens herrar' }, font: { family: 'serif', sizePt: 10, weight: 700, align: 'center' }, color: '#e6eefc' },
  ],
  variants: {
    fälla: {
      override: [
        { kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#3a1c1c' },
        { kind: 'shape', id: 'ring', x: 11.5, y: 24, w: 40, h: 40, shape: 'circle', stroke: '#e74c3c', strokeMm: 1.6 },
        { kind: 'text', id: 'name', x: 4, y: 40, w: 55, h: 8, bind: { literal: 'FÄLLA' }, font: { family: 'sans-serif', sizePt: 12, weight: 800, align: 'center' }, color: '#ffb3ab' },
      ],
    },
    butik: {
      override: [
        { kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#f2e3b0' },
        { kind: 'shape', id: 'ring', x: 11.5, y: 24, w: 40, h: 40, shape: 'circle', stroke: '#c9a227', strokeMm: 1.6 },
        { kind: 'text', id: 'name', x: 4, y: 40, w: 55, h: 8, bind: { literal: 'BUTIK' }, font: { family: 'sans-serif', sizePt: 12, weight: 800, align: 'center' }, color: '#6b4f00' },
      ],
    },
  },
}
const template: Template = { faces: { front, back } }
const colour = (g: string) => (g === 'fälla' ? '#e74c3c' : g === 'butik' ? '#c9a227' : '#7dd3a0')

export function GroupsPrototype() {
  const [variant, setVariant] = useState(new URLSearchParams(location.search).get('variant') ?? 'A')
  const change = (k: string) => { setVariant(k); const q = new URLSearchParams(location.search); q.set('variant', k); history.replaceState(null, '', `?${q}`) }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  return (
    <div className="byd-editor pg-stage" data-mode="template">
      <header>
        <strong>Skogens herrar</strong>
        <span className="byd-editor-rev">rev 12</span>
        <nav role="tablist">
          <button role="tab" type="button" aria-selected="false">Kortvägg</button>
          <button role="tab" type="button" aria-selected={variant !== 'C'}>Mall</button>
          <button role="tab" type="button" aria-selected={variant === 'C'}>Tabell</button>
          {variant === 'B' && <button role="tab" type="button" aria-selected="true">Grupper</button>}
        </nav>
        <span className="byd-editor-spacer" />
        <button type="button">Spara</button>
        <button type="button" className="byd-editor-primary">Uppdatera bordet</button>
      </header>
      <div />
      <V />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

function Pair({ row, scale = 1.3 }: { row: Row; scale?: number }) {
  return (
    <div className="pg-pair">
      <CardPreview id={`f-${row.id}`} face={front} row={row} icons={{}} scale={scale} />
      <CardPreview id={`b-${row.id}`} face={back} row={row} icons={{}} scale={scale} />
    </div>
  )
}

// ---------- A — the group is a column; the canvas has a variant tab per group, per face ----------
function VariantA() {
  const [group, setGroup] = useState<'bas' | 'fälla' | 'butik'>('fälla')
  const [face, setFace] = useState<'front' | 'back'>('front')
  const row = ROWS.find((r) => r.typ === (group === 'bas' ? 'varelse' : group))!
  const f = face === 'front' ? front : back
  const overridden = new Set(group === 'bas' ? [] : (f.variants[group]?.override ?? []).map((e) => e.id))
  return (
    <div className="pg-a">
      <aside className="pg-side">
        <h2>Grupperas av kolumnen</h2>
        <select defaultValue="typ"><option>typ</option><option>kostnad</option><option>— ingen —</option></select>
        <p className="pg-muted">Värdena i kolumnen blir grupper. En grupp ärver basen och skriver över det du ändrar när dess flik är vald.</p>
        <h2>Lager · {face === 'front' ? 'framsida' : 'baksida'}</h2>
        <ul className="pg-layers">
          {[...f.base].reverse().map((e) => (
            <li key={e.id} data-overridden={overridden.has(e.id)}>
              <span className="byd-layer-kind">{e.kind}</span> {e.id}
              {overridden.has(e.id) && <em style={{ color: colour(group) }}>· {group}</em>}
            </li>
          ))}
        </ul>
      </aside>
      <main className="pg-canvas">
        <div className="pg-tabs" role="tablist">
          {(['bas', 'fälla', 'butik'] as const).map((g) => (
            <button key={g} role="tab" aria-selected={group === g} onClick={() => setGroup(g)} style={{ ['--c' as string]: g === 'bas' ? '#9aa3b8' : colour(g) }}>
              {g === 'bas' ? 'Bas (alla)' : `typ = ${g}`}
            </button>
          ))}
          <span className="byd-editor-spacer" />
          <button role="tab" aria-selected={face === 'front'} onClick={() => setFace('front')}>Framsida</button>
          <button role="tab" aria-selected={face === 'back'} onClick={() => setFace('back')}>Baksida</button>
        </div>
        <div className="pg-stage-card">
          <CardPreview id="canvas" face={f} row={row} icons={{}} scale={1.9} />
          <p className="pg-muted">Visar {row.title}. Ändringar här gäller {group === 'bas' ? 'alla kort' : `korten med typ = ${group}`}.</p>
        </div>
      </main>
      <aside className="pg-side">
        <h2>Hela leken</h2>
        <div className="pg-thumbs">{ROWS.map((r) => <Pair key={r.id} row={r} scale={0.55} />)}</div>
      </aside>
    </div>
  )
}

// ---------- B — groups as rules with both faces, in their own tab ----------
function VariantB() {
  return (
    <div className="pg-b">
      <div className="pg-rules">
        <h1>Grupper</h1>
        <p className="pg-muted">En grupp är en regel på en kolumn. Kort som matchar får gruppens fram- och baksida ovanpå basen. Första matchande regeln vinner; alla andra kort får basen.</p>
        {[
          { name: 'Fällor', rule: 'typ = fälla', g: 'fälla', changes: ['ram: mörkröd, röd kant', 'typrad: FÄLLA · spelas dolt', 'baksida: röd ring, FÄLLA'] },
          { name: 'Butik', rule: 'typ = butik', g: 'butik', changes: ['ram: guldkant', 'kostnad: guld', 'baksida: ljus, BUTIK'] },
        ].map((x) => (
          <div key={x.name} className="pg-rule" style={{ ['--c' as string]: colour(x.g) }}>
            <div className="pg-rule-head">
              <strong>{x.name}</strong>
              <code>{x.rule}</code>
              <span className="byd-editor-spacer" />
              <button type="button">Redigera framsida</button>
              <button type="button">Redigera baksida</button>
            </div>
            <ul>{x.changes.map((c) => <li key={c}>{c}</li>)}</ul>
            <Pair row={ROWS.find((r) => r.typ === x.g)!} />
          </div>
        ))}
        <div className="pg-rule" style={{ ['--c' as string]: '#9aa3b8' }}>
          <div className="pg-rule-head"><strong>Alla andra</strong><code>basen</code><span className="byd-editor-spacer" /><button type="button">Redigera framsida</button><button type="button">Redigera baksida</button></div>
          <Pair row={ROWS[0]!} />
        </div>
        <button type="button" className="pg-new">+ Ny grupp: när <select><option>typ</option><option>kostnad</option></select> <select><option>=</option><option>≥</option><option>innehåller</option></select> <input placeholder="värde" /></button>
      </div>
    </div>
  )
}

// ---------- C — per row in the table: a back column and a style column ----------
function VariantC() {
  const [rows, setRows] = useState(ROWS.map((r) => ({ ...r, baksida: r.typ === 'varelse' ? 'standard' : r.typ, stil: r.typ === 'varelse' ? 'standard' : r.typ })))
  const set = (id: string, k: 'baksida' | 'stil', v: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)))
  return (
    <div className="pg-c">
      <div className="byd-table-wrap">
        <table className="byd-data">
          <thead><tr><th>id</th><th>typ</th><th>title</th><th>kostnad</th><th>stil (framsida)</th><th>baksida</th><th>förhandsvisning</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="byd-data-id">{r.id}</td>
                <td><input defaultValue={r.typ} /></td>
                <td><input defaultValue={r.title} /></td>
                <td><input type="number" defaultValue={r.kostnad} /></td>
                <td><select value={r.stil} onChange={(e) => set(r.id, 'stil', e.target.value)}><option>standard</option><option>fälla</option><option>butik</option></select></td>
                <td><select value={r.baksida} onChange={(e) => set(r.id, 'baksida', e.target.value)}><option>standard</option><option>fälla</option><option>butik</option></select></td>
                <td><Pair row={{ ...r, typ: r.stil === 'standard' ? 'varelse' : r.stil }} scale={0.45} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pg-muted">Här väljs stil och baksida kort för kort. Snabbt för undantag, men tjugo fällor kräver tjugo val, och ett nytt kort minns inte att det är en fälla.</p>
        <div className="pg-c-defaults">
          <strong>Standardbaksida</strong> <CardPreview id="std-back" face={back} row={{ typ: 'varelse' }} icons={{}} scale={0.6} /> <button type="button">Redigera</button>
          <strong>Fler baksidor</strong> <CardPreview id="tb" face={back} row={{ typ: 'fälla' }} icons={{}} scale={0.6} /> <CardPreview id="bb" face={back} row={{ typ: 'butik' }} icons={{}} scale={0.6} /> <button type="button">+ Ny baksida</button>
        </div>
      </div>
    </div>
  )
}
