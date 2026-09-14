// PROTOTYP — kastas. Frågan: hur ändrar formgivaren en kolumns bredd, och kolumnernas ordning?
//
// Idag bestämmer innehållet bredden (#46, variant B) och ordningen kommer ur dokumentet: vad
// mallen ritar, i mallens ordning, sedan vad korten bär, och `antal` sist (L4). Ingendera går att
// röra. Tre varianter på /prototype/columns?variant=A|B|C, med en avskalad kopia av DataTable som
// bär editor.css egna klasser, så varianterna bedöms i riktig täthet och inte i vakuum.
//
// Mätningen här är `fitColumns` med ett tillägg: en kolumn formgivaren själv har satt en bredd på
// är låst, tar exakt den bredden och varken ger eller tar av överskottet. Det är just den
// ändringen implementationen skulle behöva, så prototypen visar vad den kostar de andra
// kolumnerna — vilket är hela frågan bredden ställer.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import '../../editor/editor.css'

// ── Leken ────────────────────────────────────────────────────────────────────────────────────
// Samma lek som #46 mättes på: sex kort över `art`, `title`, `body`, `cost` och `antal`. `title`
// och `body` är båda text, och det är de som skiljer en mätt layout från en som läser typen.
type Row = { id: string; fields: Record<string, string | number> }

const DECK: Row[] = [
  { id: 'k1', fields: { art: 'Fälla', title: 'Stöld', body: 'Stjäl ett kort från motståndaren', cost: 3, antal: 2 } },
  { id: 'k2', fields: { art: 'Varelse', title: 'Vakt', body: 'Blockerar nästa anfall mot dig', cost: 2, antal: 4 } },
  { id: 'k3', fields: { art: 'Plats', title: 'Marknad', body: 'Dra två kort, lägg sedan tillbaka ett av dem underst i draghögen', cost: 5, antal: 1 } },
  { id: 'k4', fields: { art: 'Plats', title: 'Gruva', body: 'Ge 2 mynt', cost: 1, antal: 3 } },
  { id: 'k5', fields: { art: 'Varelse', title: 'Spion', body: 'Titta på motståndarens hand och välj ett kort som kastas', cost: 4, antal: 2 } },
  { id: 'k6', fields: { art: 'Fälla', title: 'Eld', body: 'Förstör en varelse med kostnad 3 eller mindre', cost: 2, antal: 1 } },
]

// Kolumnerna formgivaren äger. `id` står först och `antal` sist och är ingens att flytta (L4);
// prototypen visar dem för täthetens skull men de ligger utanför ordningen.
const OWN = ['art', 'title', 'body', 'cost']
const KIND: Record<string, 'text' | 'number'> = { art: 'text', title: 'text', body: 'text', cost: 'number' }
const MIN = 64

// ── Mätningen, med låsta kolumner ────────────────────────────────────────────────────────────
// `fitColumns` ur editorn, med ett enda tillägg: `locked` är bredder formgivaren själv har satt.
// En låst kolumn tar sin bredd och står utanför utdelningen; resten delar det som blir kvar,
// precis som förut. Det är därför en låst bred `body` kan tränga ihop `title` — och det är den
// verkan prototypen finns för att visa.
function fit(box: HTMLElement, deck: Record<string, string[]>, locked: Record<string, number>): void {
  const table = box.querySelector('table.byd-data') as HTMLTableElement | null
  if (!table) return
  const cols = Array.from(table.querySelectorAll('colgroup > col')) as HTMLTableColElement[]
  const room = box.clientWidth
  if (cols.length === 0 || room <= 0) return

  const tap = parseFloat(getComputedStyle(table).getPropertyValue('--byd-tap')) || 44
  const probe = table.querySelector('tbody input:not([type=checkbox])') as HTMLElement | null
  const ink = probe ? getComputedStyle(probe) : null
  const font = ink ? `${ink.fontStyle} ${ink.fontWeight} ${ink.fontSize} ${ink.fontFamily}` : '12px system-ui, sans-serif'
  const sides = (ink ? parseFloat(ink.paddingLeft) + parseFloat(ink.paddingRight) : 20) + 3
  const paper = document.createElement('canvas').getContext('2d')
  const need = (text: string): number => {
    if (!paper) return text.length * 7 + sides
    paper.font = font
    return Math.ceil(paper.measureText(text).width + sides)
  }

  const heads = Array.from(table.querySelectorAll('thead > tr > *')) as HTMLElement[]
  const headNeed = (i: number): number => {
    const th = heads[i]
    if (!th) return tap
    const own = getComputedStyle(th)
    let flow = 0
    for (const child of Array.from(th.children) as HTMLElement[]) {
      const how = getComputedStyle(child)
      if (how.position === 'absolute' || how.position === 'fixed' || how.display === 'none') continue
      flow += Math.max(child.getBoundingClientRect().width, child.scrollWidth, parseFloat(how.minWidth) || 0) + parseFloat(how.marginLeft) + parseFloat(how.marginRight)
    }
    return Math.ceil(flow + parseFloat(own.paddingLeft) + parseFloat(own.paddingRight))
  }

  type Track = { col: HTMLTableColElement; floor: number; asked: number; gives: boolean; width: number }
  const tracks: Track[] = cols.map((col, i) => {
    const kind = col.getAttribute('data-kind') ?? 'text'
    if (kind === 'tap') return { col, floor: tap, asked: tap, gives: false, width: tap }
    const under = headNeed(i)
    const name = col.getAttribute('data-col')
    // Låst: formgivarens egen bredd, och den varken ger eller tar.
    const own = name ? locked[name] : undefined
    if (own !== undefined) return { col, floor: own, asked: own, gives: false, width: own }
    let widest = 0
    for (const value of (name && deck[name]) || []) widest = Math.max(widest, need(value))
    const asked = Math.max(under, widest)
    return { col, floor: under, asked, gives: kind === 'text', width: asked }
  })

  const gives = tracks.filter((t) => t.gives)
  let left = room - tracks.reduce((sum, t) => sum + t.asked, 0)
  let pool = gives.reduce((sum, t) => sum + t.asked, 0)
  if (pool > 0 && left !== 0) {
    for (const track of [...gives].sort((a, b) => a.asked - b.asked)) {
      track.width = Math.max(track.floor, track.asked + Math.round((left * track.asked) / pool))
      left -= track.width - track.asked
      pool -= track.asked
    }
  }

  let total = 0
  for (const track of tracks) {
    track.col.style.width = `${track.width}px`
    total += track.width
  }
  table.style.tableLayout = 'fixed'
  table.style.width = `${total}px`
  table.style.minWidth = '0'
}

const deckValues = (): Record<string, string[]> => {
  const out: Record<string, string[]> = { id: DECK.map((r) => r.id) }
  for (const field of [...OWN, 'antal']) out[field] = DECK.map((r) => String(r.fields[field] ?? ''))
  return out
}

// ── Sidan ────────────────────────────────────────────────────────────────────────────────────
const VARIANTS = ['A', 'B', 'C'] as const
type Variant = (typeof VARIANTS)[number]
const NAMES: Record<Variant, string> = {
  A: 'Rubriken är handtaget',
  B: 'Rubrikmenyn',
  C: 'Kolumnlådan',
}
const SAYS: Record<Variant, string> = {
  A: 'Dra i kanten för bredd, dra i rubriken för ordning — kalkylarkets egen gest, ingen ny yta.',
  B: 'En ▾ i rubriken öppnar allt kolumnen kan: sortera, flytta, bredd, ta bort. Inget drag någonstans.',
  C: 'En låda vid sidan om listar kolumnerna: dra raden för ordning, ett tal för bredd. Tabellen rörs inte.',
}

export function ColumnsPrototype() {
  const [variant, setVariant] = useState<Variant>(() => {
    const asked = new URLSearchParams(location.search).get('variant')?.toUpperCase()
    return (VARIANTS as readonly string[]).includes(asked ?? '') ? (asked as Variant) : 'A'
  })
  const [order, setOrder] = useState<string[]>(OWN)
  const [locked, setLocked] = useState<Record<string, number>>({})
  const [sort, setSort] = useState<string | null>(null)
  const [said, setSaid] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  const go = (next: Variant) => {
    setVariant(next)
    const url = new URL(location.href)
    url.searchParams.set('variant', next)
    history.replaceState(null, '', url)
  }
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const at = VARIANTS.indexOf(variant)
      go(VARIANTS[(at + (e.key === 'ArrowRight' ? 1 : VARIANTS.length - 1)) % VARIANTS.length]!)
    }
    addEventListener('keydown', keys)
    return () => removeEventListener('keydown', keys)
  }, [variant])

  // Mät om när ordningen, låsningarna eller fönstret ändras — aldrig under ett drag i sidled,
  // där bredden sätts direkt på `<col>` för att handen ska se den följa med.
  const remeasure = () => {
    const box = boxRef.current
    if (box) fit(box, deckValues(), locked)
  }
  useLayoutEffect(remeasure)
  useEffect(() => {
    const again = () => remeasure()
    addEventListener('resize', again)
    return () => removeEventListener('resize', again)
  })

  const move = (field: string, step: number) => {
    setOrder((now) => {
      const at = now.indexOf(field)
      const to = Math.min(now.length - 1, Math.max(0, at + step))
      if (at < 0 || at === to) return now
      const next = [...now]
      next.splice(at, 1)
      next.splice(to, 0, field)
      setSaid(`${field} är kolumn ${to + 1} av ${next.length}`)
      return next
    })
  }
  const moveTo = (field: string, before: string) => {
    setOrder((now) => {
      const next = now.filter((f) => f !== field)
      const at = next.indexOf(before)
      next.splice(at < 0 ? next.length : at, 0, field)
      setSaid(`${field} är kolumn ${next.indexOf(field) + 1} av ${next.length}`)
      return next
    })
  }
  const setWidth = (field: string, px: number | null) => {
    setLocked((now) => {
      if (px === null) {
        const { [field]: gone, ...rest } = now
        void gone
        setSaid(`${field} följer innehållet igen`)
        return rest
      }
      setSaid(`${field} är ${Math.max(MIN, Math.round(px))} px bred`)
      return { ...now, [field]: Math.max(MIN, Math.round(px)) }
    })
  }

  const shared: Shared = { order, locked, sort, setSort, move, moveTo, setWidth, said }

  return (
    // Samma lådor som editorn: `main` scrollar, och det är den egenskapen som hindrar en mätt
    // tabell från att skjuta hela dokumentet i sidled (#46). Utan den rinner prototypen ut åt
    // höger så fort kolumnlådan tar 250 px av bredden.
    <div className="byd-editor" data-page="editor" data-mode="table" style={{ minHeight: '100vh', background: '#14161c', color: '#dce3f2' }}>
      <main style={{ overflow: 'auto', minHeight: 0, height: '100vh' }}>
      <div className="byd-table-wrap">
        <p style={{ margin: '0 0 4px', color: '#868ea3', fontSize: 12 }}>
          PROTOTYP · kolumnbredd och kolumnordning · variant {variant} — {NAMES[variant]}
        </p>
        <p style={{ margin: '0 0 12px', color: '#6f778a', fontSize: 11 }}>{SAYS[variant]} · ← → byter variant</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {VARIANTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => go(v)}
              style={{
                border: `1px solid ${v === variant ? '#7dd3a0' : '#3b414e'}`,
                borderRadius: 8,
                padding: '6px 12px',
                background: v === variant ? 'rgba(125,211,160,0.12)' : 'transparent',
                color: v === variant ? '#dce3f2' : '#9aa3b8',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              {v} · {NAMES[v]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOrder(OWN)
              setLocked({})
              setSaid('Tillbaka till mallens ordning och mätta bredder')
            }}
            style={{ marginLeft: 'auto', border: '1px solid #3b414e', borderRadius: 8, padding: '6px 12px', background: 'transparent', color: '#9aa3b8', font: 'inherit', cursor: 'pointer' }}
          >
            Börja om
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minHeight: 0 }}>
          {variant === 'C' && <ColumnBox {...shared} />}
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <Table variant={variant} boxRef={boxRef} remeasure={remeasure} {...shared} />
          </div>
        </div>

        <p aria-live="polite" style={{ margin: '10px 0 0', color: '#7dd3a0', fontSize: 12, minHeight: 18 }}>{said}</p>
        <Cost variant={variant} locked={locked} order={order} />
      </div>
      </main>
    </div>
  )
}

type Shared = {
  order: string[]
  locked: Record<string, number>
  sort: string | null
  setSort(field: string | null): void
  move(field: string, step: number): void
  moveTo(field: string, before: string): void
  setWidth(field: string, px: number | null): void
  said: string
}

// ── Tabellen ─────────────────────────────────────────────────────────────────────────────────
function Table({ variant, boxRef, remeasure, order, locked, sort, setSort, move, moveTo, setWidth }: Shared & { variant: Variant; boxRef: RefObject<HTMLDivElement | null>; remeasure(): void }) {
  // Vad som händer just nu i variant A: en kolumn som bärs, och rubriken den skulle hamna före.
  const [carrying, setCarrying] = useState<string | null>(null)
  const [before, setBefore] = useState<string | null>(null)
  const landing = useRef<string | null>(null)
  const dragged = useRef(false)

  // Dra i rubriken (A): ett drag börjar först efter sex pixlar, så ett klick är fortfarande ett
  // klick och rubriken sorterar som förut.
  const carry = (event: React.PointerEvent, field: string) => {
    if (event.button !== 0 || variant !== 'A') return
    const from = event.clientX
    let moving = false
    dragged.current = false
    landing.current = null
    const onMove = (e: PointerEvent) => {
      if (!moving && Math.abs(e.clientX - from) < 6) return
      moving = true
      dragged.current = true
      setCarrying(field)
      const heads = Array.from(document.querySelectorAll('thead th[data-col]')) as HTMLElement[]
      const over = heads.find((th) => {
        const seen = th.getBoundingClientRect()
        return e.clientX >= seen.left && e.clientX <= seen.right
      })
      const name = over?.getAttribute('data-col') ?? null
      const target = name && name !== field && order.includes(name) ? name : null
      landing.current = target
      setBefore(target)
    }
    const onUp = () => {
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      const target = landing.current
      if (moving && target && target !== field) moveTo(field, target)
      setCarrying(null)
      setBefore(null)
    }
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
  }

  // Dra i kanten (A): bredden skrivs rakt på `<col>` medan handen håller i den, så den följer
  // med utan att hela leken mäts om per bildruta; först när handen släpper blir den ett tillstånd.
  const pull = (event: React.PointerEvent, field: string) => {
    event.stopPropagation()
    event.preventDefault()
    const th = (event.target as HTMLElement).closest('th') as HTMLElement
    const from = event.clientX
    const was = th.getBoundingClientRect().width
    const col = document.querySelector(`col[data-col="${field}"]`) as HTMLElement | null
    const table = th.closest('table') as HTMLElement
    const onMove = (e: PointerEvent) => {
      const now = Math.max(MIN, Math.round(was + (e.clientX - from)))
      if (col) col.style.width = `${now}px`
      table.style.width = ''
    }
    const onUp = (e: PointerEvent) => {
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      setWidth(field, Math.max(MIN, Math.round(was + (e.clientX - from))))
    }
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
  }

  return (
    <div className="byd-data-scroll" ref={boxRef} style={{ maxHeight: '54vh' }}>
      <table className="byd-data">
        <colgroup>
          <col data-kind="tap" />
          <col data-col="id" data-kind="key" />
          {order.map((f) => (
            <col key={f} data-col={f} data-kind={KIND[f] ?? 'text'} />
          ))}
          <col data-col="antal" data-kind="number" />
          <col data-kind="tap" />
        </colgroup>
        <thead>
          <tr>
            <th className="byd-data-check">
              <label className="byd-data-tick">
                <input type="checkbox" aria-label="Markera alla" />
              </label>
            </th>
            <th data-col="id">
              <button type="button">id <span aria-hidden="true">↕</span></button>
              <Padlock />
            </th>
            {order.map((f) => (
              <th
                key={f}
                data-col={f}
                onPointerDown={(e) => carry(e, f)}
                style={{
                  ...(carrying === f ? { opacity: 0.45 } : null),
                  ...(before === f && carrying ? { boxShadow: 'inset 3px 0 0 #7dd3a0' } : null),
                  ...(variant === 'A' ? { cursor: carrying ? 'grabbing' : 'grab' } : null),
                }}
              >
                <button
                  type="button"
                  data-active={sort === f}
                  onClick={() => {
                    if (dragged.current) return
                    setSort(sort === f ? null : f)
                  }}
                >
                  {f} <span aria-hidden="true">{sort === f ? '↑' : '↕'}</span>
                </button>
                {locked[f] !== undefined && (
                  <span title={`Bredd satt till ${locked[f]} px`} style={{ marginLeft: 6, color: '#7dd3a0', fontSize: 10 }}>
                    {locked[f]}
                  </span>
                )}
                {variant === 'B' && <Menu field={f} order={order} locked={locked} move={move} setWidth={setWidth} />}
                <button type="button" className="byd-data-dropfield" aria-label={`Ta bort kolumnen ${f}`}>
                  ×
                </button>
                {variant === 'A' && (
                  <span
                    role="separator"
                    aria-label={`Bredd på ${f}`}
                    onPointerDown={(e) => pull(e, f)}
                    onDoubleClick={() => {
                      setWidth(f, null)
                      remeasure()
                    }}
                    // Helt innanför rubriken, inte över kanten: `.byd-data th` klipper sitt eget spill (#46), så
                    // ett handtag som sträcker sig ut över gränsen försvinner till hälften och den halvan tar
                    // grannens rubrik i stället — ett drag i bredden blev ett drag i ordningen.
                    style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 10, cursor: 'col-resize', zIndex: 3 }}
                  />
                )}
              </th>
            ))}
            <th data-col="antal">
              <button type="button">antal <span aria-hidden="true">↕</span></button>
              <Padlock />
            </th>
            <th className="byd-data-remove" aria-label="Ta bort kort">
              <button type="button" aria-label="Ny kolumn">
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {DECK.map((row) => (
            <tr key={row.id}>
              <td className="byd-data-check">
                <label className="byd-data-tick">
                  <input type="checkbox" aria-label={`Markera ${row.id}`} />
                </label>
              </td>
              <td className="byd-data-id" data-col="id">{row.id}</td>
              {order.map((f) => (
                <td key={f} data-col={f}>
                  <input defaultValue={String(row.fields[f] ?? '')} aria-label={`${f} på ${row.id}`} />
                </td>
              ))}
              <td data-col="antal">
                <input defaultValue={String(row.fields.antal ?? 1)} aria-label={`antal på ${row.id}`} />
              </td>
              <td className="byd-data-remove">
                <button type="button" aria-label={`Ta bort ${row.id}`}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Padlock = () => (
  <span className="byd-data-system" title="Tabellens egen kolumn">
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M3.4 5V3.6a2.6 2.6 0 0 1 5.2 0V5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.2" y="5" width="7.6" height="5.6" rx="1.2" fill="currentColor" />
    </svg>
  </span>
)

// ── Variant B: rubrikmenyn ───────────────────────────────────────────────────────────────────
function Menu({ field, order, locked, move, setWidth }: { field: string; order: string[]; locked: Record<string, number>; move(field: string, step: number): void; setWidth(field: string, px: number | null): void }) {
  // Var menyn hamnar. `position: fixed` och inte `absolute`, och det är en upplysning och ingen
  // detalj: `.byd-data th` klipper sitt eget spill (#46), så en meny som hänger i rubriken syns
  // inte alls — den enda rubrik som får spilla är huvudets sista cell, där formen för en ny
  // kolumn hänger. En riktig implementation skulle behöva samma sak: menyn ritad utanför cellen.
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null)
  const at = order.indexOf(field)
  const own = locked[field]
  const row = (label: string, act: () => void, off = false) => (
    <button
      key={label}
      type="button"
      disabled={off}
      onClick={(e) => {
        e.stopPropagation()
        act()
        setOpen(null)
      }}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', minHeight: 36, border: 0, background: 'transparent', color: off ? '#5d6476' : '#dce3f2', font: 'inherit', fontWeight: 400, cursor: off ? 'default' : 'pointer' }}
    >
      {label}
    </button>
  )
  return (
    <>
      <button
        type="button"
        aria-label={`Vad ${field} kan`}
        aria-expanded={open !== null}
        onClick={(e) => {
          e.stopPropagation()
          const seen = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setOpen(open ? null : { x: seen.left, y: seen.bottom })
        }}
        style={{ position: 'absolute', right: 40, top: 0, bottom: 0, width: 26, display: 'grid', placeItems: 'center', padding: 0, color: '#9aa3b8', zIndex: 2 }}
      >
        ▾
      </button>
      {open && (
        <div style={{ position: 'fixed', top: open.y, left: open.x - 170, zIndex: 8, width: 210, padding: 4, border: '1px solid #3b4358', borderRadius: 10, background: '#20232b', boxShadow: '0 12px 30px rgb(0 0 0 / 50%)', whiteSpace: 'normal', textAlign: 'left' }}>
          {row('Flytta vänster', () => move(field, -1), at <= 0)}
          {row('Flytta höger', () => move(field, 1), at < 0 || at >= order.length - 1)}
          <hr style={{ border: 0, borderTop: '1px solid #2f333d', margin: '4px 0' }} />
          {row('Bredd: efter innehållet', () => setWidth(field, null), own === undefined)}
          {row('Smalare', () => setWidth(field, (own ?? currentWidth(field)) - 40))}
          {row('Bredare', () => setWidth(field, (own ?? currentWidth(field)) + 40))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', color: '#9aa3b8', fontWeight: 400 }}>
            <label htmlFor={`w-${field}`}>Exakt</label>
            <input
              id={`w-${field}`}
              type="number"
              min={MIN}
              defaultValue={Math.round(own ?? currentWidth(field))}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setWidth(field, Number(e.target.value))}
              style={{ width: 72, border: '1px solid #3b414e', borderRadius: 6, padding: '4px 6px', background: '#1b1d23', color: '#e6ecfa', font: 'inherit' }}
            />
            <span>px</span>
          </div>
        </div>
      )}
    </>
  )
}

const currentWidth = (field: string): number => {
  const th = document.querySelector(`th[data-col="${field}"]`)
  return th ? Math.round(th.getBoundingClientRect().width) : 160
}

// ── Variant C: kolumnlådan ───────────────────────────────────────────────────────────────────
function ColumnBox({ order, locked, move, moveTo, setWidth }: Shared) {
  const [carrying, setCarrying] = useState<string | null>(null)
  return (
    <div style={{ flex: '0 0 250px', border: '1px solid #3b4358', borderRadius: 10, background: '#20232b', padding: 10 }}>
      <p style={{ margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#868ea3' }}>Kolumner</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {order.map((f, i) => (
          <li
            key={f}
            draggable
            onDragStart={() => setCarrying(f)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (carrying && carrying !== f) moveTo(carrying, f)
              setCarrying(null)
            }}
            style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 6, padding: '4px 6px', border: '1px solid #2f333d', borderRadius: 8, background: carrying === f ? '#2a3140' : '#1b1d23', cursor: 'grab' }}
          >
            <span aria-hidden="true" style={{ color: '#5d6476' }}>⠿</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
            <input
              type="number"
              min={MIN}
              aria-label={`Bredd på ${f}`}
              value={locked[f] ?? ''}
              placeholder="auto"
              onChange={(e) => setWidth(f, e.target.value === '' ? null : Number(e.target.value))}
              style={{ width: 62, border: '1px solid #3b414e', borderRadius: 6, padding: '4px 6px', background: '#14161c', color: '#e6ecfa', font: 'inherit', fontSize: 12 }}
            />
            <span style={{ display: 'flex' }}>
              <button type="button" aria-label={`Flytta ${f} uppåt`} disabled={i === 0} onClick={() => move(f, -1)} style={{ padding: 0, lineHeight: 1, background: 'transparent', border: 0, color: i === 0 ? '#3b414e' : '#9aa3b8', cursor: 'pointer' }}>
                ▴
              </button>
              <button type="button" aria-label={`Flytta ${f} nedåt`} disabled={i === order.length - 1} onClick={() => move(f, 1)} style={{ padding: 0, lineHeight: 1, background: 'transparent', border: 0, color: i === order.length - 1 ? '#3b414e' : '#9aa3b8', cursor: 'pointer' }}>
                ▾
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#6f778a' }}>Tomt breddfält = kolumnen följer innehållet (#46).</p>
    </div>
  )
}

// ── Vad varianten kostar ─────────────────────────────────────────────────────────────────────
function Cost({ variant, locked, order }: { variant: Variant; locked: Record<string, number>; order: string[] }) {
  const notes: Record<Variant, string[]> = {
    A: [
      'Gesten är kalkylarkets egen, och ingen ny yta tillkommer i editorn.',
      'Handtaget måste ligga helt innanför rubriken: en rubrik klipper sitt eget spill (#46), så ett handtag över gränsen försvann till hälften och den halvan tog grannens rubrik — ett drag i bredden blev ett drag i ordningen. Uppmätt i prototypen.',
      'Altså: dragfältet tar 10 px ur ×:ets egna 44, i en rubrik som redan delar ut dem i tur och ordning.',
      'Ett drag är ingen tangentbordsgest. Utan en väg till samma sak från tangentbordet bryter varianten mot editorns egna tabb-tester.',
      'Sex pixlars tröskel skiljer klicket från draget; under den sorterar rubriken som förut.',
    ],
    B: [
      'Allt kolumnen kan ligger bakom en dörr: sortering, ordning, bredd, borttagning — och samma dörr fungerar med tangentbord och på pekskärm.',
      'Kostnaden är en kontroll till i rubriken (▾, 26 px), i en rubrik som redan delar ut sina 44 px i tur och ordning (#46).',
      'Menyn måste ritas utanför cellen: en rubrik klipper sitt spill, så den första versionen syntes inte alls. Här `position: fixed`; i verkligheten en portal eller `popover`.',
      'Bredden blir tal och inte gest: "bredare" i steg om 40 px, eller ett exakt tal. Ingen direkt känsla av kanten.',
    ],
    C: [
      'Tabellens rubrik rörs inte alls — ingen ny kontroll i den kant som redan är trång.',
      'Kostnaden är en yta till i editorn, och 250 px av bredden som tabellen annars mäter sig mot.',
      'Ordning och bredd står samlade och läsbara; men handen är inte på kolumnen den ändrar.',
    ],
  }
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #2f333d', paddingTop: 10, color: '#868ea3', fontSize: 12 }}>
      <p style={{ margin: '0 0 6px' }}>
        <strong style={{ color: '#dce3f2' }}>Vad variant {variant} kostar</strong>
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        {notes[variant].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p style={{ margin: '10px 0 0', color: '#6f778a' }}>
        Ordning nu: <code>{['id', ...order, 'antal'].join(' · ')}</code>
        {Object.keys(locked).length > 0 && (
          <>
            {' · '}låsta bredder: <code>{Object.entries(locked).map(([f, w]) => `${f}=${w}`).join(' · ')}</code>
          </>
        )}
      </p>
      <p style={{ margin: '6px 0 0', color: '#6f778a' }}>
        Gemensam fråga till alla tre: var bor svaret? En bredd är en vy (som sortering och filter, L4) och kan ligga i
        webbläsaren; en ordning syns i CSV-exporten och i vad alla andra ser, och hör då hemma i dokumentet — vilket är
        en ny lista fält i <code>ProjectDoc</code> och ett nytt verb i <code>edits.ts</code>, alltså ett beslut att
        skriva ned.
      </p>
    </div>
  )
}
