// THROWAWAY #270: three ways to size the existing zone picture inside the real RuleShelf.
// Synthetic names only. No server, mutations, or second production renderer.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RenderedRules } from '@byd/template'
import { RuleShelf } from '../RuleDrawer.js'
import { PrototypeSwitcher, usePrototypeVariant } from '../../prototype/PrototypeSwitcher.js'
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
const small = ['Draghög', 'Kasthög', 'Hand A', 'Framför A', 'Hand B', 'Framför B']
const many = ['Draghög', 'Kasthög', 'Marknaden', 'Kort som lagts åt sidan i rundan', 'Gemensamma marker', ...'ABCDEFGH'.split('').flatMap(s => [`Hand ${s}`, `Framför ${s}`, `Reserv ${s}`, `Vunna kort ${s}`, `Kort som väntar på nästa runda ${s}`])]

function ZonePicture({ zones }: { zones: string[] }) {
  return <div className="setup-proto-zones" role="img" aria-label={`Spelets zoner: ${zones.join(', ')}`}>
    {zones.map((name, i) => <span key={i}>{name}</span>)}
  </div>
}
function MiniPicture({ zones }: { zones: string[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(.4)
  useEffect(() => {
    const el = box.current!
    const picture = el.firstElementChild as HTMLElement
    const resize = () => setScale(Math.min(el.clientWidth / 660, 128 / picture.offsetHeight))
    const observer = new ResizeObserver(resize)
    observer.observe(el); observer.observe(picture)
    return () => observer.disconnect()
  }, [])
  return <div ref={box} className="setup-proto-mini" aria-hidden="true"><div style={{ width: 660, transform: `scale(${scale})`, transformOrigin: 'top left' }}><ZonePicture zones={zones} /></div></div>
}
function Picture({ variant, zones }: { variant: string; zones: string[] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  if (variant === 'C') return <details className="setup-proto-picture"><summary>Visa uppställningen · {zones.length} zoner</summary><ZonePicture zones={zones} /></details>
  if (variant === 'B') return <figure className="setup-proto-picture setup-proto-overview">
    <MiniPicture zones={zones} />
    <button onClick={() => dialog.current?.showModal()}>Läs uppställningen · {zones.length} zoner</button>
    <dialog ref={dialog} aria-label="Uppställningen" className="setup-proto-dialog">
      <header><strong>Uppställningen</strong><button autoFocus onClick={() => dialog.current?.close()}>Tillbaka till reglerna</button></header>
      <ZonePicture zones={zones} />
    </dialog>
  </figure>
  return <figure className="setup-proto-picture"><ZonePicture zones={zones} /></figure>
}

export default function SetupBookPrototype() {
  const [variant, choose] = usePrototypeVariant()
  const [dense, setDense] = useState(new URLSearchParams(location.search).get('zones') === '45')
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [measure, setMeasure] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const zones = dense ? many : small
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
    {target && createPortal(<Picture key={variant} variant={variant} zones={zones} />, target)}
    <div className="setup-proto-controls">
      <label><input type="checkbox" checked={dense} onChange={e => {
        setDense(e.target.checked)
        const url = new URL(location.href); url.searchParams.set('zones', e.target.checked ? '45' : '6'); history.replaceState(null, '', url)
      }} />45 zoner / långa namn</label>
      <nav aria-label="Prototypens yta">{[['/play', 'Telefon'], ['/online', 'Lucka'], ['/table', 'TV']].map(([path, label]) => <a key={path} aria-current={location.pathname === path ? 'page' : undefined} href={`${path}?setupPrototype&lang=sv&variant=${variant}&zones=${zones.length}`}>{label}</a>)}</nav>
      <output>{zones.length} zoner · {measure}</output>
    </div>
    <PrototypeSwitcher variant={variant} names={['Hela bilden i boken', 'Översikt + läsvy', 'Fäll ut i boken']} choose={choose} reset={() => { setDense(false); choose('A') }} />
  </div>
}
