// THROWAWAY #270: chosen disclosure C, with common zones and one explicit seat at a time.
// Synthetic names only. No server, mutations, or second production renderer.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RenderedRules } from '@byd/template'
import { RuleShelf } from '../RuleDrawer.js'
import './setup-book-prototype.css'

const rules: RenderedRules = {
  title: 'Kvällen på saloonen', warnings: [], text: '',
  blocks: [
    { id: 'intro', kind: 'heading', level: 1, children: [{ type: 'text', text: 'Innan ni börjar' }] },
    { id: 'text', kind: 'text', paragraphs: [{ children: [{ type: 'text', text: 'Lägg fram korten och välj varsin plats. Målet är att ha flest marker när den sista rundan är slut.' }] }] },
    { id: 'heading', kind: 'heading', level: 1, children: [{ type: 'text', text: 'Uppställning' }] },
    { id: 'setup', kind: 'setup', caption: 'Spelets zoner vid start. Ge varje spelare fem kort.' },
    { id: 'turn', kind: 'heading', level: 1, children: [{ type: 'text', text: 'En tur' }] },
    { id: 'turn-text', kind: 'text', paragraphs: [{ children: [{ type: 'text', text: 'Dra ett kort. Spela sedan ett kort framför dig eller kasta ett kort. Nästa spelare tar vid när du är klar.' }] }] },
    { id: 'end', kind: 'heading', level: 1, children: [{ type: 'text', text: 'Spelet tar slut' }] },
    { id: 'end-text', kind: 'text', paragraphs: [{ children: [{ type: 'text', text: 'När draghögen är slut spelar ni klart rundan och räknar era marker.' }] }] },
  ],
}
// Ownership belongs to the fixture data; never infer it from the spelling of a zone name.
type SetupGroup = { seat: string; zones: string[] }
const small = { common: ['Draghög', 'Kasthög'], seats: ['A', 'B'].map(seat => ({ seat, zones: [`Hand ${seat}`, `Framför ${seat}`] })) }
const many = { common: ['Draghög', 'Kasthög', 'Marknaden', 'Kort som lagts åt sidan i rundan', 'Gemensamma marker'], seats: 'ABCDEFGH'.split('').map(seat => ({ seat, zones: [`Hand ${seat}`, `Framför ${seat}`, `Reserv ${seat}`, `Vunna kort ${seat}`, `Kort som väntar på nästa runda ${seat}`] })) }

function ZoneList({ zones, label }: { zones: string[]; label: string }) {
  return <ul className="setup-proto-zone-list" aria-label={label}>{zones.map(name => <li key={name}>{name}</li>)}</ul>
}
function Picture({ common, seats }: { common: string[]; seats: SetupGroup[] }) {
  const [selected, setSelected] = useState('A')
  const group = seats.find(s => s.seat === selected) ?? seats[0]!
  return <details className="setup-proto-picture setup-proto-grouped">
    <summary>Visa uppställningen</summary>
    <div className="setup-proto-arrangement">
      <section aria-labelledby="setup-common">
        <h4 id="setup-common">Gemensamt på bordet</h4>
        <ZoneList zones={common} label="Gemensamma zoner" />
      </section>
      <section aria-labelledby="setup-seats">
        <h4 id="setup-seats">Vid spelarnas platser</h4>
        <p className="setup-proto-hint">{seats.length} platser. Visa en plats i taget.</p>
        <label className="setup-proto-seat-label">Visa plats
          <select value={group.seat} onChange={e => setSelected(e.target.value)}>
            {seats.map(s => <option key={s.seat} value={s.seat}>Plats {s.seat}</option>)}
          </select>
        </label>
        <div className="setup-proto-seat" aria-live="polite" aria-atomic="true">
          <h5>Plats {group.seat}</h5>
          <ZoneList zones={group.zones} label={`Zoner vid plats ${group.seat}`} />
        </div>
      </section>
    </div>
  </details>
}

export default function SetupBookPrototype() {
  const [dense, setDense] = useState(new URLSearchParams(location.search).get('zones') === '45')
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [measure, setMeasure] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const setup = dense ? many : small
  const zoneCount = setup.common.length + setup.seats.reduce((n, s) => n + s.zones.length, 0)
  const placement = location.pathname === '/play' ? 'phone' : location.pathname === '/table' ? 'tv' : 'table'
  // Inject only this throwaway illustration into the actual shelf, preserving its real search,
  // close/open controls, typography and scrolling. Nothing is added to RuleShelf's public API.
  useEffect(() => {
    const root = host.current!
    const attach = () => {
      const setup = root.querySelector('[data-block="setup"]')
      let node = setup?.querySelector<HTMLElement>('[data-proto-picture]') ?? null
      if (setup && !node) {
        node = document.createElement('div')
        node.dataset['protoPicture'] = ''
        setup.prepend(node)
      }
      setTarget(previous => previous === node ? previous : node)
    }
    attach()
    const observer = new MutationObserver(attach)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!target) return
    const body = target.closest('.byd-rules-body')!
    const update = () => setMeasure(`${Math.round(target.getBoundingClientRect().height)} px bild · ${Math.round(body.getBoundingClientRect().height)} px läsyta`)
    const observer = new ResizeObserver(update)
    observer.observe(target)
    observer.observe(body)
    return () => observer.disconnect()
  }, [target])
  return <div className="setup-proto-host" data-surface={placement} ref={host}>
    <div className="setup-proto-felt"><h1>Kvällen på saloonen</h1><p>Spelbord · syntetiskt exempel</p><div className="setup-proto-piles"><span>Draghög</span><span>Kasthög</span></div></div>
    <RuleShelf rules={rules} placement={placement} startOpen />
    {target && createPortal(<Picture common={setup.common} seats={setup.seats} />, target)}
    <div className="setup-proto-controls">
      <label><input type="checkbox" checked={dense} onChange={e => {
        setDense(e.target.checked)
        const url = new URL(location.href); url.searchParams.set('zones', e.target.checked ? '45' : '6'); history.replaceState(null, '', url)
      }} />45 zoner / långa namn</label>
      <nav aria-label="Prototypens yta">{[['/play', 'Telefon'], ['/online', 'Lucka'], ['/table', 'TV']].map(([path, label]) => <a key={path} aria-current={location.pathname === path ? 'page' : undefined} href={`${path}?setupPrototype&lang=sv&variant=C&zones=${zoneCount}`}>{label}</a>)}</nav>
      <output>{zoneCount} zoner totalt · {measure}</output>
    </div>
    <div className="setup-proto-choice"><small>PROTOTYP · SPARAR INGENTING</small><strong>C · Utfällbar, grupperad uppställning</strong></div>
  </div>
}
