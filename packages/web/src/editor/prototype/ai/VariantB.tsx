// PROTOTYP — kastas (#940). Variant B — Riktade handlingar: inget samtal. AI-hjälpen erbjuds där
// arbetet redan sker — på kortväggen, i tabellens huvud och på duken — och öppnar en liten ruta med
// en rad för instruktionen och chips som säger vad som skickas. Svaret öppnas på samma ställe.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { contextOf, type Ask } from './fake.js'
import { KeyBox } from './KeyBox.js'
import { Context, Decide, FailureNote, Into, ProposalCards, Stream, Verdict, useSlots } from './parts.js'
import type { Shared } from './AiPrototype.js'

type Errand = { kind: 'kort' } | { kind: 'urval'; ids: string[] } | { kind: 'kolumn'; field: string } | { kind: 'mall' }

const TITLE = (e: Errand) => (e.kind === 'kort' ? 'Föreslå kort' : e.kind === 'urval' ? (e.ids.length === 1 ? `Ändra ${e.ids[0]}` : `Ändra ${e.ids.length} markerade kort`) : e.kind === 'kolumn' ? `Fyll kolumnen ${e.field}` : 'Föreslå mall för framsidan')
const DEFAULT = (e: Errand) =>
  e.kind === 'kort' ? 'Sju nya fällkort för saloonen, och mildra de tre hårdaste' : e.kind === 'urval' ? 'Gör dem mildare' : e.kind === 'kolumn' ? (e.field === 'antal' ? 'Låt antalet följa rariteten' : `Fyll tomma ${e.field}`) : 'Kostnad uppe till vänster, namn, en bildyta och effekttext'

export function VariantB(p: Shared) {
  const { s } = p
  const [errand, setErrand] = useState<Errand | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const crown = useSlots('.byd-wall-view > .byd-crown', 'before-end')
  const tools = useSlots('.byd-data-tools')
  const heads = useSlots('.byd-data-scroll thead th[data-col]:not([data-col="id"])')
  const strip = useSlots('.byd-canvas-strip')
  const chosen = [...new Set([...(p.row ? [p.row] : []), ...p.marked])]
  const open = (e: Errand, from: HTMLElement) => {
    setErrand(e)
    setAnchor(from)
    // Det som en gång frågats om står kvar tills det avgjorts; en ny handling börjar om.
    if (s.current && !s.current.verdict && (s.current.ask.kind !== e.kind || e.kind === 'kolumn')) s.reset()
  }
  const button = (e: Errand, label: string, extra?: string) => (
    <button type="button" className={`byd-secondary ux-ai-act${extra ? ` ${extra}` : ''}`} aria-haspopup="dialog" aria-expanded={errand !== null && TITLE(errand) === TITLE(e)} onClick={(ev) => open(e, ev.currentTarget)}>
      <span aria-hidden="true">✦</span> {label}
    </button>
  )
  return (
    <>
      <Into slot={crown[0]}>
        {chosen.length > 0 ? button({ kind: 'urval', ids: chosen }, chosen.length === 1 ? 'Ändra kortet…' : `Ändra ${chosen.length} markerade…`) : button({ kind: 'kort' }, 'Föreslå kort…')}
      </Into>
      <Into slot={tools[0]}>
        {p.marked.length > 0 ? button({ kind: 'urval', ids: [...p.marked] }, `Ändra ${p.marked.length} markerade…`) : button({ kind: 'kort' }, 'Föreslå kort…')}
      </Into>
      {heads.map((slot) => {
        const field = slot.dataset['host'] ?? ''
        return (
          <Into key={field} slot={slot}>
            <button type="button" className="ux-ai-head" aria-haspopup="dialog" aria-label={`Fyll kolumnen ${field} med AI…`} title={`Fyll kolumnen ${field}…`} onClick={(ev) => open({ kind: 'kolumn', field }, ev.currentTarget)}>
              ✦
            </button>
          </Into>
        )
      })}
      <Into slot={strip[0]}>{button({ kind: 'mall' }, 'Föreslå mall…')}</Into>
      {errand && anchor && <Pop p={p} errand={errand} anchor={anchor} onClose={() => setErrand(null)} />}
    </>
  )
}

function Pop({ p, errand, anchor, onClose }: { p: Shared; errand: Errand; anchor: HTMLElement; onClose(): void }) {
  const { s } = p
  const [text, setText] = useState(DEFAULT(errand))
  const [place, setPlace] = useState<{ top: number; left: number; maxHeight: number }>({ top: 0, left: 0, maxHeight: 400 })
  const box = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLInputElement>(null)
  const turn = s.current
  const width = errand.kind === 'mall' ? 400 : 460
  useLayoutEffect(() => {
    const at = () => {
      const r = anchor.getBoundingClientRect()
      // Under knappen, och inåt när skärmkanten är i vägen (L32:s regel för en låda).
      const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12))
      const top = Math.min(r.bottom + 6, window.innerHeight - 220)
      setPlace({ top, left, maxHeight: window.innerHeight - top - 12 })
    }
    at()
    window.addEventListener('resize', at)
    return () => window.removeEventListener('resize', at)
  }, [anchor, width])
  useEffect(() => {
    first.current?.focus()
    first.current?.select()
    return () => {
      if (anchor.isConnected) anchor.focus()
    }
  }, [anchor])
  useEffect(() => {
    if (errand.kind === 'mall') p.onStage('canvas')
  }, [errand.kind])
  const ask = (said: string): Ask =>
    errand.kind === 'kort' ? { kind: 'kort', prompt: said } : errand.kind === 'urval' ? { kind: 'urval', prompt: said, ids: errand.ids } : errand.kind === 'kolumn' ? { kind: 'kolumn', prompt: said, field: errand.field } : { kind: 'mall', prompt: said }
  const asked = turn !== null
  const busy = s.streaming
  const shown = turn?.proposal ?? (busy ? s.showing : null)
  return (
    <div
      ref={box}
      className="ux-ai-pop"
      role="dialog"
      aria-label={TITLE(errand)}
      style={{ top: place.top, left: place.left, width, maxHeight: place.maxHeight }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        if (busy) s.cancel()
        else onClose()
      }}
    >
      <div className="ux-ai-pop-head">
        <h2>
          <span aria-hidden="true">✦</span> {TITLE(errand)}
        </h2>
        <button type="button" className="ux-ai-icon" aria-label="Stäng" onClick={onClose}>
          ×
        </button>
      </div>
      {!p.saved ? (
        <KeyBox saved={null} onSave={p.setSaved} onRemove={() => p.setSaved(null)} heading="h3" compact />
      ) : (
        <>
          <form
            className="ux-ai-ask"
            onSubmit={(e) => {
              e.preventDefault()
              if (busy || !text.trim()) return
              if (s.open) s.refine(text.trim())
              else s.ask(text.trim(), ask(text.trim()))
            }}
          >
            <input ref={first} aria-label={s.open ? 'Förfina förslaget' : 'Vad ska AI:n göra?'} value={s.open && text === DEFAULT(errand) ? '' : text} placeholder={s.open ? 'Förfina: «gör dem mildare», «färre kort»…' : DEFAULT(errand)} onChange={(e) => setText(e.target.value)} />
            {busy ? (
              <button type="button" className="byd-secondary" onClick={s.cancel}>
                Avbryt
              </button>
            ) : (
              <button type="submit" className={s.open ? 'byd-secondary' : 'byd-primary'}>
                {s.open ? 'Förfina' : 'Föreslå'}
              </button>
            )}
          </form>
          <Context parts={contextOf(p.doc, { kind: errand.kind, ...(errand.kind === 'urval' ? { ids: errand.ids } : {}), ...(errand.kind === 'kolumn' ? { field: errand.field } : {}) })} provider={p.saved.provider} />
          {asked && turn && (
            <div className="ux-ai-pop-body">
              <div className="ux-ai-pop-scroll">
                <Stream turn={turn} compact />
                {turn.failure && <FailureNote failure={turn.failure} onKey={p.openKey} onAgain={() => s.ask(turn.said, turn.ask)} />}
                {shown && turn.state !== 'avbruten' && !turn.verdict && (
                  <>
                    {errand.kind === 'mall' && <p className="ux-ai-quiet">Förslaget ritas på duken bakom rutan.</p>}
                    <ProposalCards doc={p.doc} http={p.http} proposal={shown} session={s} choose={turn.proposal !== null} width={errand.kind === 'mall' ? 104 : 76} />
                  </>
                )}
              </div>
              {turn.proposal && !turn.verdict && <Decide session={s} proposal={turn.proposal} />}
              <Verdict turn={turn} session={s} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
