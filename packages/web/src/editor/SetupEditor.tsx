import { useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import type { ProjectDoc } from '@byd/server'
import { shortcutsOf } from '../player/PlaySheet.js'
import { TableRenderer, type FeltFit, type TableHandle } from '../table/TableRenderer.js'
import { previewOf } from '../setup/preview.js'
import { isRecipeZone, MAX_PLAYERS, type Counter, type Geometry, type Zone } from '@byd/server/doc'
import type { ProjectClient } from './ProjectClient.js'
import type { ZonePatch } from '@byd/server/doc'

// The setup editor (B5, K2), from the prototype: the recipe's knobs on the left lay the table
// out; the table itself is the workspace, where every zone is a handle to drag, resize and name;
// and the phone's sheet beside it shows what a player gets. The table is the real renderer fed
// by the setup, so what the designer sees is what the screen will show.
export type SetupEditorProps = { doc: ProjectDoc; client: ProjectClient }

const PILE_MM = { w: 63, h: 88 }
const SNAP_MM = 5
const NUDGE_MM = 10
const MIN_MM = 40

export function SetupEditor({ doc, client }: SetupEditorProps) {
  const setup = doc.setup
  const [selected, setSelected] = useState<string | null>(null)
  const view = previewOf(setup)
  const sel = setup.zones.find((z) => z.id === selected) ?? null
  const add = (kind: 'area' | 'pile') => setSelected(client.addZone(kind))
  return (
    <div className="byd-setup" data-setup-editor>
      <div className="byd-setup-side">
        <RecipePanel client={client} />
        <SheetPreview zones={setup.zones} floor={setup.floor} />
      </div>
      <div className="byd-setup-canvas">
        <div className="byd-setup-tools">
          <button type="button" onClick={() => add('area')}>＋ Yta</button>
          <button type="button" onClick={() => add('pile')}>＋ Hög</button>
          <span>Dra en zon för att flytta den, hörnet för att ändra storlek; klicka för att namnge. Piltangenterna knuffar den valda zonen.</span>
        </div>
        {view ? (
          <Felt view={view} zones={setup.zones} floor={setup.floor} selected={selected} onSelect={setSelected} onGeometry={(id, geometry) => client.patchZone(id, { geometry })} />
        ) : (
          <p role="alert" className="byd-setup-invalid">Bordet går inte att bygga av den här setupen: varje hand behöver en ägare och en hög att återlämna till, och varje ägare måste vara en plats.</p>
        )}
        {sel && (
          <ZoneProps
            zone={sel}
            setup={setup}
            onPatch={(patch) => client.patchZone(sel.id, patch)}
            onRemove={() => {
              client.removeZone(sel.id)
              setSelected(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

// C: the knobs. The hand and the draw pile every game has; the rest is on or off, and the
// counters are a list.
function RecipePanel({ client }: { client: ProjectClient }) {
  const recipe = client.recipe
  const turn = (patch: Partial<typeof recipe>) => client.setRecipe({ ...recipe, ...patch })
  const setCounter = (i: number, patch: Partial<Counter>) => turn({ counters: recipe.counters.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  return (
    <aside className="byd-setup-recipe">
      <section>
        <h2 id="byd-setup-players">Spelare</h2>
        <div className="byd-setup-players" role="group" aria-labelledby="byd-setup-players">
          {Array.from({ length: Math.min(6, MAX_PLAYERS) }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" aria-pressed={recipe.players === n} onClick={() => turn({ players: n })}>
              {n}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Varje spelare har</h2>
        <label>
          <input type="checkbox" checked readOnly disabled /> en hand
        </label>
        <label>
          <input type="checkbox" checked={recipe.mine} onChange={(e) => turn({ mine: e.target.checked })} /> en yta framför sig, bara för egna ögon
        </label>
        <div className="byd-setup-counters">
          <span>Räknare</span>
          {recipe.counters.map((c, i) => (
            <div key={i} className="byd-setup-counter">
              <input aria-label={`Namn för räknare ${i + 1}`} value={c.name} onChange={(e) => setCounter(i, { name: e.target.value })} />
              <span>från</span>
              <input aria-label={`Startvärde för räknare ${i + 1}`} type="number" value={c.start} onChange={(e) => setCounter(i, { start: Math.trunc(Number(e.target.value) || 0) })} />
              <button type="button" aria-label={`Ta bort räknare ${i + 1}`} onClick={() => turn({ counters: recipe.counters.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => turn({ counters: [...recipe.counters, recipe.counters.length === 0 ? { name: 'Poäng', start: 0 } : { name: 'Liv', start: 20 }] })}>
            ＋ Räknare
          </button>
        </div>
      </section>
      <section>
        <h2>Gemensamt på bordet</h2>
        <label>
          <input type="checkbox" checked readOnly disabled /> en dold draghög
        </label>
        <label>
          <input type="checkbox" checked={recipe.discard} onChange={(e) => turn({ discard: e.target.checked })} /> en öppen kasthög
        </label>
        <label>
          <input type="checkbox" checked={recipe.market} onChange={(e) => turn({ market: e.target.checked })} /> en marknad, öppen yta i mitten
        </label>
      </section>
      <p className="byd-setup-hint">Byte av antal spelare lägger ut händer, ytor och räknare på nytt. Egna zoner står kvar.</p>
    </aside>
  )
}

// B: the felt with a handle on every zone but the floor. Dragging moves, the corner resizes,
// both in whole millimetres snapped to a small grid; the arrow keys nudge the focused one.
type Drag = { id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; geometry: Geometry }
function Felt({ view, zones, floor, selected, onSelect, onGeometry }: { view: NonNullable<ReturnType<typeof previewOf>>; zones: readonly Zone[]; floor: string; selected: string | null; onSelect(id: string | null): void; onGeometry(id: string, geometry: Geometry): void }) {
  const table = useRef<TableHandle | null>(null)
  const drag = useRef<Drag | null>(null)
  const toMm = (e: RPointerEvent) => table.current?.toTable(e.clientX, e.clientY) ?? { x: 0, y: 0 }
  const down = (e: RPointerEvent, z: Zone, mode: Drag['mode']) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    drag.current = { id: z.id, mode, start: toMm(e), geometry: { ...z.geometry } }
    onSelect(z.id)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toMm(e)
    const dx = snap(p.x - d.start.x)
    const dy = snap(p.y - d.start.y)
    const g = d.geometry
    onGeometry(d.id, d.mode === 'move' ? { ...g, x: g.x + dx, y: g.y + dy } : { ...g, w: Math.max(MIN_MM, g.w + dx), h: Math.max(MIN_MM, g.h + dy) })
  }
  const up = () => {
    drag.current = null
  }
  const nudge = (e: RKeyboardEvent, z: Zone) => {
    const step = e.shiftKey ? NUDGE_MM * 5 : NUDGE_MM
    const d = e.key === 'ArrowLeft' ? { x: -step, y: 0 } : e.key === 'ArrowRight' ? { x: step, y: 0 } : e.key === 'ArrowUp' ? { x: 0, y: -step } : e.key === 'ArrowDown' ? { x: 0, y: step } : null
    if (!d) return
    e.preventDefault()
    onGeometry(z.id, { ...z.geometry, x: z.geometry.x + d.x, y: z.geometry.y + d.y })
  }
  const overlay = (fit: FeltFit) =>
    zones
      .filter((z) => z.id !== floor)
      .map((z) => {
        const box = boxOf(z)
        return (
          <div
            key={z.id}
            className="byd-setup-handle"
            role="button"
            tabIndex={0}
            aria-label={`Zon ${z.name}`}
            aria-pressed={selected === z.id}
            data-zone-handle={z.id}
            data-kind={z.kind}
            style={{ left: fit.left(box.x), top: fit.top(box.y), width: fit.px(box.w), height: fit.px(box.h) }}
            onPointerDown={(e) => down(e, z, 'move')}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onClick={() => onSelect(z.id)}
            onKeyDown={(e) => nudge(e, z)}
            onFocus={() => onSelect(z.id)}
          >
            <span>
              {z.name}
              {z.owner ? ` · ${z.owner}` : ''}
            </span>
            {z.kind !== 'pile' && <i className="byd-setup-corner" data-resize={z.id} onPointerDown={(e) => down(e, z, 'resize')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />}
          </div>
        )
      })
  return (
    <div className="byd-setup-felt">
      <TableRenderer ref={table} view={view} mode="tv" overlay={overlay} />
    </div>
  )
}

// A pile is a point; its handle is a card's outline around it.
function boxOf(z: Zone): { x: number; y: number; w: number; h: number } {
  const g = z.geometry
  return z.kind === 'pile' ? { x: g.x - PILE_MM.w / 2, y: g.y - PILE_MM.h / 2, w: PILE_MM.w, h: PILE_MM.h } : { x: g.x, y: g.y, w: g.w, h: g.h }
}
const snap = (mm: number) => Math.round(mm / SNAP_MM) * SNAP_MM

// The selected zone's properties. Recipe zones keep their owner and visibility — the recipe
// decides those — and only the designer's own zones can go.
function ZoneProps({ zone, setup, onPatch, onRemove }: { zone: Zone; setup: ProjectDoc['setup']; onPatch(patch: ZonePatch): void; onRemove(): void }) {
  const own = !isRecipeZone(zone.id, setup)
  const floor = zone.id === setup.floor
  const kind = floor ? 'Golv' : zone.kind === 'pile' ? 'Hög' : zone.kind === 'hand' ? 'Hand' : 'Yta'
  const g = zone.geometry
  return (
    <div className="byd-setup-props" data-zone-props={zone.id}>
      <strong>{kind}</strong>
      <label>
        Namn
        <input aria-label={`Namn för ${zone.name}`} value={zone.name} onChange={(e) => onPatch({ name: e.target.value })} />
      </label>
      {!floor && zone.kind !== 'hand' && (
        <label>
          Genväg på telefonen
          <input aria-label={`Genväg för ${zone.name}`} placeholder={zone.name} value={zone.shortcut?.label ?? ''} onChange={(e) => onPatch({ shortcut: e.target.value ? { label: e.target.value, at: zone.shortcut?.at ?? 'top' } : undefined })} />
        </label>
      )}
      {zone.kind === 'pile' && (
        <label>
          Placering
          <select aria-label={`Placering för ${zone.name}`} value={zone.shortcut?.at ?? 'top'} onChange={(e) => onPatch({ shortcut: { label: zone.shortcut?.label ?? zone.name, at: e.target.value === 'bottom' ? 'bottom' : 'top' } })}>
            <option value="top">överst</option>
            <option value="bottom">underst</option>
          </select>
        </label>
      )}
      {own && (
        <>
          <label>
            Ägare
            <select aria-label={`Ägare för ${zone.name}`} value={zone.owner ?? ''} onChange={(e) => onPatch({ owner: e.target.value || undefined })}>
              <option value="">ingen</option>
              {setup.seats.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Syns för
            <select aria-label={`Syns för ${zone.name}`} value={zone.visibility} onChange={(e) => onPatch({ visibility: e.target.value === 'owner' ? 'owner' : e.target.value === 'none' ? 'none' : 'all' })}>
              <option value="all">alla</option>
              <option value="owner">ägaren</option>
              <option value="none">ingen</option>
            </select>
          </label>
        </>
      )}
      <span className="byd-setup-where" data-zone-where>
        {Math.round(g.x)}, {Math.round(g.y)}
        {zone.kind !== 'pile' ? ` · ${Math.round(g.w)} × ${Math.round(g.h)} mm` : ' mm'}
      </span>
      {own && (
        <button type="button" onClick={onRemove}>
          Ta bort zonen
        </button>
      )}
    </div>
  )
}

// What the phone shows (C4): every target with its verb, the floor last.
function SheetPreview({ zones, floor }: { zones: readonly Zone[]; floor: string }) {
  const preview = shortcutsOf(zones, floor)
  return (
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
  )
}
