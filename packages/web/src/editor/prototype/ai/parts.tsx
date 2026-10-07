// PROTOTYP — kastas (#940). Delar som alla tre varianterna ritar med: förslagets kort genom den
// riktiga `CardPreview` (E2), strömmen i en artig levande region, felen och kontextraden.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { FaceTemplate } from '@byd/template'
import type { ProjectDoc, ProjectRow } from '../../types.js'
import { CardPreview } from '../../CardPreview.js'
import { previewIcons } from '../../assets.js'
import { previewFonts } from '../../fonts.js'
import type { Failure, Proposal } from './fake.js'
import { partsOf } from './fake.js'
import type { Session, Turn } from './session.js'

const CARD_PX = (63 * 96) / 25.4

export function useLook(doc: ProjectDoc, http: string) {
  const fonts = useMemo(() => previewFonts({ template: doc.template, fonts: doc.fonts }, http), [doc.template, doc.fonts, http])
  const icons = useMemo(() => previewIcons({ icons: doc.icons }, http), [doc.icons, http])
  return { fonts, icons }
}

// Ett kort i en given bredd, ritat av kompilatorn som allt annat.
export function MiniCard({ doc, http, face, row, id, width }: { doc: ProjectDoc; http: string; face?: FaceTemplate | undefined; row: ProjectRow['fields']; id: string; width: number }) {
  const { fonts, icons } = useLook(doc, http)
  const drawn = face ?? doc.template.faces['front']
  if (!drawn) return null
  return (
    <div className="ux-ai-mini" style={{ width, height: width * (88 / 63) }}>
      <CardPreview id={`ux-ai-${id.replace(/[^a-z0-9-]/gi, '-')}`} face={drawn} row={row} icons={icons} fonts={fonts} assetBase={http} palette={doc.palette} scale={width / CARD_PX} />
    </div>
  )
}

// Bara det som skiljer, med några ord omkring: «…Drick 12 → Drick 10». En hel effekttext två
// gånger säger ingenting om vad som ändrades.
export function snippet(from: string, to: string): [string, string] {
  if (!from) return ['—', to.length > 24 ? to.slice(0, 23) + '…' : to]
  let a = 0
  while (a < from.length && a < to.length && from[a] === to[a]) a++
  let b = 0
  while (b < from.length - a && b < to.length - a && from[from.length - 1 - b] === to[to.length - 1 - b]) b++
  const start = Math.max(0, from.lastIndexOf(' ', Math.max(0, a - 8)) + 1)
  const cut = (text: string) => {
    const end = text.length - b
    const stop = text.indexOf(' ', end + 1)
    const piece = text.slice(start, stop === -1 ? text.length : stop)
    return `${start > 0 ? '…' : ''}${piece}${stop === -1 ? '' : '…'}`
  }
  return [cut(from), cut(to)]
}

// Förslagets delar som kort: mallen på tre kort ur leken, nya kort och ändrade kort med sitt
// gamla → nya. `choose` ger varje del en kryssruta (att godta en del av förslaget).
export function ProposalCards({ doc, http, proposal, session, choose, width = 104, limit }: { doc: ProjectDoc; http: string; proposal: Proposal; session: Session; choose: boolean; width?: number; limit?: number }) {
  const items: { key: string; label: string; card: ReactNode; diff?: string[] }[] = []
  if (proposal.face) {
    const types = ['Shopcard', 'Playcard', 'Location']
    const samples = types.map((typ) => doc.rows.find((r) => r.fields['typ'] === typ)).filter((r): r is ProjectRow => r !== undefined)
    const cost = (r: ProjectRow): Record<string, string> => {
      const to = proposal.changes.find((c) => c.id === r.id && c.field === 'kostnad')?.to
      return to === undefined ? {} : { kostnad: to }
    }
    items.push({
      key: 'mall',
      label: 'Ny mall för framsidan',
      card: (
        <span className="ux-ai-fan">
          {samples.map((r) => (
            <MiniCard key={r.id} doc={doc} http={http} face={proposal.face} row={{ ...r.fields, ...cost(r) }} id={`${proposal.id}-mall-${r.id}`} width={width} />
          ))}
        </span>
      ),
      diff: proposal.newFields.length ? [`Nytt fält: ${proposal.newFields.join(', ')}`, `${proposal.changes.length} butikskort får en kostnad`] : [],
    })
  }
  for (const row of proposal.newRows) {
    items.push({ key: row.id, label: String(row.fields['title'] ?? row.id), card: <MiniCard doc={doc} http={http} row={row.fields} id={`${proposal.id}-${row.id}`} width={width} />, diff: ['Nytt kort'] })
  }
  if (!proposal.face) {
    for (const id of new Set(proposal.changes.map((c) => c.id))) {
      const row = doc.rows.find((r) => r.id === id)
      if (!row) continue
      const mine = proposal.changes.filter((c) => c.id === id)
      const after = { ...row.fields }
      for (const c of mine) after[c.field] = c.to
      items.push({ key: id, label: String(row.fields['title'] ?? id), card: <MiniCard doc={doc} http={http} row={after} id={`${proposal.id}-${id}`} width={width} />, diff: mine.map((c) => `${c.field}: ${snippet(String(c.from), String(c.to)).join(' → ')}`) })
    }
  }
  const shown = limit ? items.slice(0, limit) : items
  return (
    <ul className="ux-ai-cards" role="list">
      {shown.map((item) => (
        <li key={item.key} data-left={choose && !session.picked.has(item.key) ? '' : undefined}>
          {choose ? (
            <label className="ux-ai-pick">
              <input type="checkbox" aria-label={`Ta med: ${item.label}`} checked={session.picked.has(item.key)} onChange={() => session.toggle(item.key)} />
              {item.card}
            </label>
          ) : (
            item.card
          )}
          {item.diff?.map((d) => (
            <span key={d} className="ux-ai-diff">
              {d}
            </span>
          ))}
        </li>
      ))}
      {limit && items.length > limit && <li className="ux-ai-more">+{items.length - limit} till</li>}
    </ul>
  )
}

// Det strömmade svaret: en artig levande region, så att en skärmläsare hör det i takt med att det
// kommer utan att avbryta det den läser (L12, PRD 44).
export function Stream({ turn, compact = false }: { turn: Turn; compact?: boolean }) {
  const busy = turn.state === 'tänker' || turn.state === 'skriver'
  return (
    <p className={`ux-ai-stream${compact ? ' ux-ai-stream-compact' : ''}`} aria-live="polite" aria-busy={busy}>
      {turn.state === 'tänker' && !turn.text && <span className="ux-ai-quiet">Läser spelet…</span>}
      {turn.text}
      {busy && turn.text && <span className="ux-ai-caret" aria-hidden="true" />}
      {turn.state === 'avbruten' && <span className="ux-ai-quiet"> — avbrutet. Ingenting ändrades.</span>}
    </p>
  )
}

export function FailureNote({ failure, onKey, onAgain }: { failure: Failure; onKey?(): void; onAgain?(): void }) {
  return (
    <div className="ux-ai-fail" role="alert" data-kind={failure.kind}>
      <strong>{failure.title}</strong>
      <span>{failure.text}</span>
      {failure.action === 'byt-nyckel' && onKey && (
        <button type="button" className="byd-secondary" onClick={onKey}>
          Byt nyckel…
        </button>
      )}
      {failure.action === 'igen' && onAgain && (
        <button type="button" className="byd-secondary" onClick={onAgain}>
          Försök igen
        </button>
      )}
    </div>
  )
}

export function Context({ parts, provider }: { parts: string[]; provider?: string }) {
  return (
    <p className="ux-ai-context">
      <span className="ux-ai-quiet">Skickas{provider ? ` till ${provider}` : ''}:</span>
      {parts.map((p) => (
        <span key={p} className="ux-ai-chip">
          {p}
        </span>
      ))}
    </p>
  )
}

// Vad ett avgjort förslag blev, med vägen tillbaka (PRD 32): «Ångra» är prototypens lokala steg.
export function Verdict({ turn, session }: { turn: Turn; session: Session }) {
  if (!turn.verdict) return null
  if (turn.verdict.kind === 'kastat') return <p className="ux-ai-verdict" role="status">Kastat. Ingenting ändrades.</p>
  const last = session.turns.filter((t) => t.verdict?.kind === 'godtaget').at(-1)?.id === turn.id && session.past.length > 0
  return (
    <p className="ux-ai-verdict" role="status" data-kind="godtaget">
      Godtaget{turn.verdict.parts < turn.verdict.total ? ` — ${turn.verdict.parts} av ${turn.verdict.total} delar` : ''} som en ändring i historiken.
      {last && (
        <button type="button" className="ux-ai-link" onClick={session.undo}>
          Ångra
        </button>
      )}
    </p>
  )
}

export function Decide({ session, proposal, onRefine, refineLabel = 'Förfina', primary = true, choosing = true }: { session: Session; proposal: Proposal; onRefine?(text: string): void; refineLabel?: string; primary?: boolean; choosing?: boolean }) {
  const parts = partsOf(proposal)
  const some = session.picked.size
  const [text, setText] = useState('')
  return (
    <div className="ux-ai-decide">
      <div className="ux-ai-row">
        <button type="button" className={primary ? 'byd-primary' : 'byd-secondary'} onClick={() => session.accept('alla')}>
          {parts.length > 1 ? `Godta alla (${parts.length})` : 'Godta'}
        </button>
        {parts.length > 1 && choosing && (
          <button type="button" className="byd-secondary" aria-disabled={some === 0 || some === parts.length} onClick={() => some > 0 && some < parts.length && session.accept('valda')}>
            Godta markerade ({some})
          </button>
        )}
        <button type="button" className="byd-secondary" onClick={session.discard}>
          Kasta
        </button>
      </div>
      {onRefine && (
        <form
          className="ux-ai-refine"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            onRefine(text.trim())
            setText('')
          }}
        >
          <input aria-label="Förfina förslaget" placeholder="Förfina: «gör dem mildare», «färre kort»…" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="byd-secondary">
            {refineLabel}
          </button>
        </form>
      )}
    </div>
  )
}

// Platser i den riktiga editorns DOM där prototypen hänger in sina knappar. Hittas om varje gång
// sidan ändras, eftersom flikarna monterar och avmonterar sina ytor.
export function useSlots(selector: string, where: 'end' | 'before-end' | 'after-header' = 'end', tag: 'span' | 'div' = 'span'): HTMLElement[] {
  const [slots, setSlots] = useState<HTMLElement[]>([])
  const made = useRef(new Map<Element, HTMLElement>())
  useLayoutEffect(() => {
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const hosts = [...document.querySelectorAll(selector)]
        let changed = false
        for (const [host, slot] of made.current) {
          if (!hosts.includes(host) || !host.isConnected || !slot.isConnected) {
            slot.remove()
            made.current.delete(host)
            changed = true
          }
        }
        for (const host of hosts) {
          if (made.current.has(host)) continue
          const slot = document.createElement(tag)
          slot.className = 'ux-ai-slot'
          // Vem platsen hör till, sparat när den görs: en plats som just lyfts ur sidan har ingen förälder kvar att fråga.
          slot.dataset['host'] = host.getAttribute('data-card-ref') ?? host.getAttribute('data-col') ?? ''
          const end = where === 'before-end' ? host.querySelector(':scope > .byd-crown-end') : where === 'after-header' ? (host.querySelector(':scope > header')?.nextSibling ?? null) : null
          if (end) host.insertBefore(slot, end)
          else host.appendChild(slot)
          made.current.set(host, slot)
          changed = true
        }
        if (changed) setSlots([...made.current.values()])
      })
    }
    sync()
    const observer = new MutationObserver((records) => {
      if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n instanceof HTMLElement && (n.classList.contains('ux-ai-slot') || n.closest?.('.ux-ai-slot'))))) return
      sync()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      for (const slot of made.current.values()) slot.remove()
      made.current.clear()
    }
  }, [selector, where, tag])
  return slots
}

export function Into({ slot, children }: { slot: HTMLElement | undefined; children: ReactNode }) {
  return slot ? createPortal(children, slot) : null
}

// Fokus tillbaka dit den kom ifrån när något som tog den stängs (#8, #133).
export function useReturnFocus(open: boolean) {
  const from = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) from.current = document.activeElement as HTMLElement | null
    else if (from.current?.isConnected) from.current.focus()
  }, [open])
}
