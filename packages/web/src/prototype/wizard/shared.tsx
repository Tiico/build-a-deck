// PROTOTYPE — pieces every variant needs: the frame gallery, the field list, the data step.
import { CardPreview } from '../../editor/CardPreview.js'
import { DEFAULT_FIELDS, FRAMES, SAMPLE_CSV, parseCsv, type Field, type WizardState } from './data.js'

export const sampleRow = { title: 'Drake', cost: 5, body: 'Flygande. När Drake anfaller: gör 2 skada på alla motståndare.' }

export function FrameGallery({ state, onPick, dark }: { state: WizardState; onPick(id: string): void; dark?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {FRAMES.map((f) => (
        <button key={f.id} onClick={() => onPick(f.id)} style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: state.frame === f.id ? '3px solid #3c8ce7' : `1px solid ${dark ? '#2f333d' : '#ddd'}`, background: dark ? '#1b1d23' : '#fff', color: 'inherit', cursor: 'pointer' }}>
          <div style={{ display: 'grid', placeItems: 'center', padding: 8 }}>
            <CardPreview id={`gallery-${f.id}`} face={f.face(state.fields)} row={state.rows[0] ?? sampleRow} icons={{}} scale={0.9} />
          </div>
          <div style={{ fontWeight: 700, marginTop: 8 }}>{f.name}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{f.blurb}</div>
        </button>
      ))}
    </div>
  )
}

export function FieldList({ fields, onChange, dark }: { fields: Field[]; onChange(fields: Field[]): void; dark?: boolean }) {
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${dark ? '#2f333d' : '#ccc'}`, background: dark ? '#0f1115' : '#fff', color: 'inherit', fontSize: 14 }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {fields.map((f, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px 32px', gap: 8 }}>
          <input value={f.label} onChange={(e) => onChange(fields.map((x, k) => (k === i ? { ...x, label: e.target.value, key: x.key || e.target.value.toLowerCase() } : x)))} style={inp} placeholder="Namn" />
          <input value={f.key} onChange={(e) => onChange(fields.map((x, k) => (k === i ? { ...x, key: e.target.value } : x)))} style={{ ...inp, fontFamily: 'ui-monospace, monospace' }} placeholder="kolumn" />
          <select value={f.kind} onChange={(e) => onChange(fields.map((x, k) => (k === i ? { ...x, kind: e.target.value as Field['kind'] } : x)))} style={inp}>
            <option value="text">text</option><option value="number">tal</option><option value="image">bild</option>
          </select>
          <button onClick={() => onChange(fields.filter((_, k) => k !== i))} style={{ ...inp, cursor: 'pointer' }}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onChange([...fields, { key: '', label: '', kind: 'text' }])} style={{ ...inp, cursor: 'pointer' }}>+ Fält</button>
        <button onClick={() => onChange(DEFAULT_FIELDS)} style={{ ...inp, cursor: 'pointer', opacity: 0.7 }}>Förslag: titel, kostnad, text</button>
      </div>
    </div>
  )
}

export function DataStep({ state, onRows, dark }: { state: WizardState; onRows(rows: WizardState['rows']): void; dark?: boolean }) {
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${dark ? '#2f333d' : '#ccc'}`, background: dark ? '#0f1115' : '#fff', color: 'inherit', fontSize: 13, fontFamily: 'ui-monospace, monospace', width: '100%', boxSizing: 'border-box' }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 13, opacity: 0.75 }}>Klistra in från ditt kalkylblad (första raden är rubriker), eller börja med tomma rader.</div>
      <textarea rows={7} defaultValue="" placeholder={SAMPLE_CSV} onChange={(e) => onRows(parseCsv(e.target.value).rows)} style={inp} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <button onClick={() => onRows(parseCsv(SAMPLE_CSV).rows)} style={{ ...inp, width: 'auto', cursor: 'pointer', fontFamily: 'inherit' }}>Använd exemplet</button>
        <button onClick={() => onRows(Array.from({ length: 5 }, (_, i) => ({ title: `Kort ${i + 1}`, cost: 1, body: '' })))} style={{ ...inp, width: 'auto', cursor: 'pointer', fontFamily: 'inherit' }}>5 tomma rader</button>
        <span style={{ opacity: 0.7 }}>{state.rows.length} kort</span>
      </div>
    </div>
  )
}
