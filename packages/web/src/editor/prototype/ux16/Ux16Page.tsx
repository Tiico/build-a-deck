// PROTOTYP — #128, #129, #130, #131, #132. Engångskod: sparar ingenting, har inga tester och
// laddas bara i DEV. Adressen väljer fynd och variant:
//
//   /ux16?fynd=skala|krona|grupper|regler&variant=A|B|C&yta=vagg|symboler|data&shot=1
//
// `shot=1` krymper växlaren till en etikett, så skärmbilder visar layouten och inte verktyget.
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import './ux16.css'
import { Skala } from './skala.js'
import { Krona } from './krona.js'
import { Grupper } from './grupper.js'
import { Regler } from './regler.js'

export const FYND = [
  { id: 'skala', issue: 132, name: 'Spacing-skalan', variants: ['Halvstegsladder 4·8·12·16·24', 'Strikt 4×-ladder 4·8·16·24·32', 'Två tal: gutter och gap'] },
  { id: 'krona', issue: 128, name: 'Panelens krona', variants: ['Full krona som radbryter', 'En rad, överflödet i lådor', 'Verktygsskena till vänster'] },
  { id: 'grupper', issue: 129, name: 'Mallens grupper', variants: ['Remsan radbryter', 'En rad med pilar och överflöd', 'Grupperna i en meny'] },
  { id: 'regler', issue: 131, name: 'Regelflikens tomläge', variants: ['Komponerad ruta i mitten', 'Sidan själv, redan uppslagen', 'Disposition med tomma avsnitt'] },
] as const

export type FyndId = (typeof FYND)[number]['id']
export type Variant = 'A' | 'B' | 'C'
export type Yta = 'vagg' | 'symboler' | 'data'

function param(name: string, fallback: string) {
  return new URLSearchParams(location.search).get(name) ?? fallback
}
function put(name: string, value: string) {
  const next = new URL(location.href)
  next.searchParams.set(name, value)
  history.replaceState(null, '', next)
}

// Vad varianten kostar, i tal, i varje skärmbild: avståndet från chromets underkant till arbetets
// första pixel, hur många skrollytor fliken har, och om fönstret självt skrollar.
export function useMatt(deps: unknown[]) {
  const [matt, setMatt] = useState({ krona: 0, skroll: 0, nastlade: 0, fonster: 0, bredd: 0 })
  const read = () => {
    // Krönhöjden mäts från flikpanelens överkant, inte från prototypens egen mätarrad: i den
    // riktiga editorn börjar panelen exakt där chromet slutar.
    const chrome = document.querySelector('[data-ux16-panel]')
    const work = document.querySelector('[data-ux16-work]')
    const doc = document.scrollingElement ?? document.documentElement
    const skrollytor = [...document.querySelectorAll('[data-ux16-scroll]')]
    setMatt({
      krona: chrome && work ? Math.round(work.getBoundingClientRect().top - chrome.getBoundingClientRect().top) : 0,
      skroll: skrollytor.length,
      // Det #128 faktiskt förbjuder: en skrollyta inuti en annan, som symbolernas rutnät i dag.
      nastlade: skrollytor.filter((el) => el.parentElement?.closest('[data-ux16-scroll]')).length,
      // Appens egna live-regioner (`.byd-status-live`) är 1 px höga och absolut placerade, och ger
      // 1 px fönsterskroll på varje rutt i dag — även i den riktiga editorn. Den pixeln är inte
      // flikens, så den räknas bort här och rapporteras separat.
      fonster: Math.max(0, doc.scrollHeight - doc.clientHeight - 1),
      bredd: Math.round(window.innerWidth),
    })
  }
  useLayoutEffect(read, deps)
  useEffect(() => {
    const on = () => read()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, deps)
  return matt
}

export function Matare({ matt, extra, children }: { matt: ReturnType<typeof useMatt>; extra?: string; children?: ReactNode }) {
  return (
    <div className="ux16-meter">
      <span className="ux16-etikett" />
      <span>
        bredd <b>{matt.bredd}</b>
      </span>
      <span>
        krönhöjd{' '}
        <b data-bad={matt.krona > 80 ? 'true' : undefined}>{matt.krona} px</b>
      </span>
      <span>
        skrollytor <b>{matt.skroll}</b>
      </span>
      <span>
        nästlade <b data-bad={matt.nastlade > 0 ? 'true' : undefined}>{matt.nastlade}</b>
      </span>
      <span>
        fönsterskroll <b data-bad={matt.fonster > 0 ? 'true' : undefined}>{matt.fonster} px</b>
      </span>
      {extra ? <span>{extra}</span> : null}
      {children}
    </div>
  )
}

export function Chrome({ tab }: { tab: string }) {
  const tabs = ['Kortvägg', 'Mall', 'Data', 'Symboler', 'Bord', 'Regler']
  return (
    <header className="ux16-chrome" data-ux16-chrome>
      <strong>Heist på Hotell Aurora</strong>
      <nav>
        {tabs.map((t) => (
          <span key={t} data-open={t === tab ? 'true' : undefined}>
            {t}
          </span>
        ))}
      </nav>
      <span className="ux16-right">rev 41 · sparat</span>
    </header>
  )
}

export function Ux16Page() {
  const [fynd, setFynd] = useState(() => param('fynd', 'krona') as FyndId)
  const [variant, setVariant] = useState(() => param('variant', 'A') as Variant)
  const [yta, setYta] = useState(() => param('yta', 'vagg') as Yta)
  const shot = param('shot', '0') === '1'
  const valt = FYND.find((f) => f.id === fynd) ?? FYND[1]

  const valj = (id: FyndId) => {
    put('fynd', id)
    setFynd(id)
  }
  const valjVariant = (v: Variant) => {
    put('variant', v)
    setVariant(v)
  }
  const valjYta = (y: Yta) => {
    put('yta', y)
    setYta(y)
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select')) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const keys: Variant[] = ['A', 'B', 'C']
      const i = keys.indexOf(variant)
      valjVariant(keys[(i + (e.key === 'ArrowLeft' ? -1 : 1) + 3) % 3]!)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [variant])

  // I skärmbildsläge flyttar etiketten in i mätarraden i stället för att ligga över arbetet.
  const etikett = `#${valt.issue} ${valt.name} · ${variant} — ${valt.variants[['A', 'B', 'C'].indexOf(variant)]}`
  return (
    <div className="ux16" data-skala={fynd === 'skala' ? variant : 'A'} data-shot={shot ? 'true' : undefined} style={{ ['--ux16-etikett' as string]: JSON.stringify(etikett) }}>
      {fynd === 'skala' ? <Skala variant={variant} /> : null}
      {fynd === 'krona' ? <Krona variant={variant} yta={yta} valjYta={valjYta} /> : null}
      {fynd === 'grupper' ? <Grupper variant={variant} /> : null}
      {fynd === 'regler' ? <Regler variant={variant} /> : null}
      <nav className="ux16bar" hidden={shot} aria-label="Prototypväxlare">
        <strong>
          <small>PROTOTYP · SPARAR INGENTING</small>{etikett}
        </strong>
        {FYND.map((f) => (
          <button key={f.id} aria-pressed={f.id === fynd} onClick={() => valj(f.id)}>
            #{f.issue}
          </button>
        ))}
        <span aria-hidden="true">·</span>
        {(['A', 'B', 'C'] as const).map((v) => (
          <button key={v} aria-pressed={v === variant} onClick={() => valjVariant(v)}>
            {v}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default Ux16Page
