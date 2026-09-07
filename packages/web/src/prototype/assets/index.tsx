// PROTOTYPE — illustrations in the editor (E1, DRIFT §4): /prototype/assets?variant=A|B|C.
// Question: how does a designer put images on the cards, and where do the project's images live
// in the editor? Every variant shares one model: assets by content hash, rows that point at them,
// the real card compiler drawing the result.
import { useState, type DragEvent as RDragEvent } from 'react'
import type { ProjectDoc } from '@byd/server'
import { CardPreview } from '../../editor/CardPreview.js'
import { Switcher } from './Switcher.js'
import { ASSET_PREFIX, assetFromFile, matchByName, resolveRow, sampleAssets, sampleDoc, type Asset } from './model.js'
import '../../editor/editor.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Bildceller i tabellen' },
  { key: 'B', name: 'Släpp på kortet, bilderna i en bricka' },
  { key: 'C', name: 'Bildbiblioteket matchar på namn' },
]
type Ctx = {
  doc: ProjectDoc
  assets: Asset[]
  field: string
  assign(cardRef: string, hash: string | null): void
  add(files: FileList | File[] | null | undefined, onto?: string): Promise<Asset[]>
}
const DRAG_TYPE = 'text/x-byd-asset'

export function AssetsPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [doc, setDoc] = useState<ProjectDoc>(sampleDoc)
  const [assets, setAssets] = useState<Asset[]>(sampleAssets)
  const field = 'art'
  const assign = (cardRef: string, hash: string | null) =>
    setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === cardRef ? { ...r, fields: { ...r.fields, [field]: hash ? `${ASSET_PREFIX}${hash}` : '' } } : r)) }))
  const add = async (files: FileList | File[] | null | undefined, onto?: string) => {
    if (!files) return []
    const made = await Promise.all([...files].filter((f) => f.type.startsWith('image/')).map(assetFromFile))
    setAssets((list) => [...list, ...made.filter((m) => !list.some((a) => a.hash === m.hash))])
    const first = made[0]
    if (onto && first) assign(onto, first.hash)
    return made
  }
  const ctx: Ctx = { doc, assets, field, assign, add }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  const withArt = doc.rows.filter((r) => String(r.fields[field] ?? '').startsWith(ASSET_PREFIX)).length
  return (
    <div className="pa-stage">
      <div className="pa-state">
        <span>bilder i spelet <b>{assets.length}</b> · kort med illustration <b>{withArt}/{doc.rows.length}</b> · en bild lagras en gång, hur många kort den än sitter på</span>
      </div>
      <V {...ctx} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

// The wall, as the editor draws it, with asset references resolved for the compiler.
function Wall({ ctx, decorate }: { ctx: Ctx; decorate?: (cardRef: string) => React.ReactNode }) {
  const face = ctx.doc.template.faces['front']!
  return (
    <div className="pa-wall">
      {ctx.doc.rows.map((r) => (
        <div key={r.id} className="pa-card" data-card-ref={r.id}>
          <CardPreview id={`pa-${r.id}`} face={face} row={resolveRow(r.fields, ctx.assets)} icons={ctx.doc.icons} scale={0.6} />
          {decorate?.(r.id)}
        </div>
      ))}
    </div>
  )
}

const stop = (e: RDragEvent) => {
  e.preventDefault()
  e.stopPropagation()
}
// What a drop carries: files from the desktop, or an asset dragged from inside the editor.
const droppedHash = (e: RDragEvent) => e.dataTransfer.getData(DRAG_TYPE) || null

function Thumb({ asset, draggable = true }: { asset: Asset | undefined; draggable?: boolean }) {
  if (!asset) return <span className="pa-thumb">ingen bild</span>
  return <img className="pa-thumb" src={asset.url} alt={asset.name} title={asset.name} draggable={draggable} onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, asset.hash)} />
}

// ---------- A — image cells in the table ----------
// The table is where the deck is edited (E1); an image field is a cell with a thumbnail. Drop a
// file or one of the game's images on it, or pick one with the button. The wall beside follows.
function VariantA(ctx: Ctx) {
  const [over, setOver] = useState<string | null>(null)
  const fields = ['title', 'cost', 'body', ctx.field, 'antal']
  const assetOf = (r: ProjectDoc['rows'][number]) => ctx.assets.find((a) => `${ASSET_PREFIX}${a.hash}` === r.fields[ctx.field])
  return (
    <div className="pa-a">
      <div>
        <div className="pa-strip">
          <h2 style={{ margin: 0 }}>Bilder i spelet</h2>
          {ctx.assets.map((a) => <Thumb key={a.hash} asset={a} />)}
          <label className="pa-file">
            Ladda upp<input type="file" accept="image/*" multiple onChange={(e) => void ctx.add(e.target.files)} />
          </label>
          <span className="pa-hint">dra en bild till ett korts cell</span>
        </div>
        <table>
          <thead>
            <tr>{fields.map((f) => <th key={f}>{f === ctx.field ? 'illustration' : f}</th>)}</tr>
          </thead>
          <tbody>
            {ctx.doc.rows.map((r) => (
              <tr key={r.id}>
                {fields.map((f) =>
                  f === ctx.field ? (
                    <td key={f}>
                      <div className="pa-imgcell">
                        <div
                          className="pa-drop"
                          data-over={over === r.id ? 'true' : undefined}
                          onDragOver={(e) => { stop(e); setOver(r.id) }}
                          onDragLeave={() => setOver(null)}
                          onDrop={(e) => {
                            stop(e)
                            setOver(null)
                            const hash = droppedHash(e)
                            if (hash) ctx.assign(r.id, hash)
                            else void ctx.add(e.dataTransfer.files, r.id)
                          }}
                        >
                          {assetOf(r) ? <img src={assetOf(r)!.url} alt="" /> : <span>släpp bild här</span>}
                        </div>
                        <label className="pa-file">
                          {assetOf(r) ? 'Byt' : 'Välj'}<input type="file" accept="image/*" onChange={(e) => void ctx.add(e.target.files, r.id)} />
                        </label>
                        {assetOf(r) && <button type="button" className="pa-x" onClick={() => ctx.assign(r.id, null)}>×</button>}
                      </div>
                    </td>
                  ) : (
                    <td key={f}><input value={String(r.fields[f] ?? '')} readOnly /></td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Wall ctx={ctx} />
      <p className="pa-foot">A · bildfältet är en cell med tumnagel · släpp en fil eller en av spelets bilder på cellen · väggen följer</p>
    </div>
  )
}

// ---------- B — drop on the card ----------
// The card itself is the target: its image element is outlined on the wall, drop a file or an
// image from the tray on it, or click it to pick a file. The tray holds the game's images and
// says how many cards each sits on.
function VariantB(ctx: Ctx) {
  const [over, setOver] = useState<string | null>(null)
  const face = ctx.doc.template.faces['front']!
  const el = face.base.find((e) => e.kind === 'image' && 'field' in e.bind && e.bind.field === ctx.field)
  const box = el && el.kind === 'image' ? { x: el.x, y: el.y, w: el.w, h: el.h } : { x: 4, y: 4, w: 55, h: 36 }
  const scale = 0.6
  const mm = (v: number) => `${(v * scale * 96) / 25.4}px`
  const usedBy = (hash: string) => ctx.doc.rows.filter((r) => r.fields[ctx.field] === `${ASSET_PREFIX}${hash}`).length
  const decorate = (cardRef: string) => (
    <label
      className="pa-b-target"
      data-over={over === cardRef ? 'true' : undefined}
      style={{ left: mm(box.x), top: mm(box.y), width: mm(box.w), height: mm(box.h) }}
      onDragOver={(e) => { stop(e); setOver(cardRef) }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        stop(e)
        setOver(null)
        const hash = droppedHash(e)
        if (hash) ctx.assign(cardRef, hash)
        else void ctx.add(e.dataTransfer.files, cardRef)
      }}
    >
      <span>{ctx.doc.rows.find((r) => r.id === cardRef)?.fields[ctx.field] ? '' : 'släpp bild'}</span>
      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void ctx.add(e.target.files, cardRef)} />
    </label>
  )
  return (
    <div className="pa-b">
      <Wall ctx={ctx} decorate={decorate} />
      <div className="pa-tray">
        <h2 style={{ margin: 0 }}>Bilder i spelet</h2>
        {ctx.assets.map((a) => (
          <div key={a.hash} className="pa-tray-item" data-used={usedBy(a.hash)}>
            <Thumb asset={a} />
            <span>{a.name} · {usedBy(a.hash)} kort</span>
          </div>
        ))}
        <label className="pa-file">
          Ladda upp<input type="file" accept="image/*" multiple onChange={(e) => void ctx.add(e.target.files)} />
        </label>
        <span className="pa-hint">dra en bild till ett kort, eller släpp en fil direkt på kortet</span>
      </div>
      <p className="pa-foot">B · kortets bildyta är målet · brickan nederst är spelets bilder och var de sitter</p>
    </div>
  )
}

// ---------- C — the library matches by name ----------
// Upload the whole folder at once. A file named like a card lands on that card; the rest wait
// in the library, where each one can be given a card from a list. The wall shows the outcome.
function VariantC(ctx: Ctx) {
  const [over, setOver] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const cardOf = (hash: string) => ctx.doc.rows.find((r) => r.fields[ctx.field] === `${ASSET_PREFIX}${hash}`)
  const intake = async (files: FileList | null | undefined) => {
    const made = await ctx.add(files)
    const lines: string[] = []
    for (const a of made) {
      const hit = matchByName(a.name, ctx.doc.rows)
      if (hit) {
        ctx.assign(hit, a.hash)
        lines.push(`${a.name} → ${String(ctx.doc.rows.find((r) => r.id === hit)?.fields['title'])}`)
      } else lines.push(`${a.name} väntar i biblioteket`)
    }
    setLog((l) => [...lines, ...l].slice(0, 6))
  }
  const matchAll = () => {
    const lines: string[] = []
    for (const a of ctx.assets) {
      const hit = matchByName(a.name, ctx.doc.rows)
      if (hit && !cardOf(a.hash)) {
        ctx.assign(hit, a.hash)
        lines.push(`${a.name} → ${String(ctx.doc.rows.find((r) => r.id === hit)?.fields['title'])}`)
      }
    }
    setLog((l) => [...(lines.length ? lines : ['inget nytt att matcha']), ...l].slice(0, 6))
  }
  return (
    <div className="pa-c">
      <div className="pa-lib">
        <h2 style={{ margin: 0 }}>Bilder i spelet</h2>
        <div
          className="pa-lib-drop"
          data-over={over ? 'true' : undefined}
          onDragOver={(e) => { stop(e); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { stop(e); setOver(false); void intake(e.dataTransfer.files) }}
        >
          Släpp hela mappen här
          <br />
          <label className="pa-file" style={{ marginTop: 8 }}>
            eller välj filer<input type="file" accept="image/*" multiple onChange={(e) => void intake(e.target.files)} />
          </label>
        </div>
        <div className="pa-lib-grid">
          {ctx.assets.map((a) => {
            const card = cardOf(a.hash)
            return (
              <div key={a.hash} className="pa-lib-item">
                <Thumb asset={a} />
                <span>{a.name}</span>
                <select value={card?.id ?? ''} onChange={(e) => { if (card) ctx.assign(card.id, null); if (e.target.value) ctx.assign(e.target.value, a.hash) }}>
                  <option value="">— inget kort —</option>
                  {ctx.doc.rows.map((r) => <option key={r.id} value={r.id}>{String(r.fields['title'])}</option>)}
                </select>
              </div>
            )
          })}
        </div>
        <button type="button" onClick={matchAll}>Matcha på filnamn</button>
        <span className="pa-hint">drake.png hamnar på kortet Drake; det som inte matchar väntar här</span>
        {log.length > 0 && <ul className="pa-hint" style={{ margin: 0, paddingLeft: 16 }}>{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </div>
      <Wall ctx={ctx} />
      <p className="pa-foot">C · biblioteket tar emot mappen · filnamnet väljer kortet · resten fördelas från listan</p>
    </div>
  )
}
