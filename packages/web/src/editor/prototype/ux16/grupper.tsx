// PROTOTYP — #129. Två frågor i en flik: hur gruppremsan slutar dölja 61 % av sig själv, och hur
// duken får bredd vid 1024 när egenskaperna inte används.
//
//   A  Remsan radbryter och räknar korten; egenskapskolumnen fälls för hand och minns sitt läge.
//   B  Remsan är en rad med toning, pilar och en överflödsmeny; egenskapskolumnen fälls av sig
//      själv när ingenting är markerat och öppnas i samma stund något blir det.
//   C  Remsan försvinner: grupperna blir en meny i krönet med antal; egenskaperna blir ett lager
//      över duken i stället för en kolumn bredvid den.
//
// Lagerlistans egen krona (rubrik och antal) och fot (hjälptexten) är gemensam för alla tre: den
// är en rättelse av att listan skrollar bort sin egen överskrift, inte ett designval.
import { useLayoutEffect, useRef, useState } from 'react'
import { Chrome, Matare, useMatt, type Variant } from './Ux16Page.js'
import { GRUPPER, LAGER } from './data.js'

export function Grupper({ variant }: { variant: Variant }) {
  const [grupp, setGrupp] = useState(1)
  const [valt, setValt] = useState<number | null>(variant === 'B' ? null : 0)
  const [oppen, setOppen] = useState(true)
  const [meny, setMeny] = useState(false)
  const [overflod, setOverflod] = useState(false)
  const remsa = useRef<HTMLDivElement>(null)
  const duk = useRef<HTMLDivElement>(null)
  const [dolt, setDolt] = useState(0)
  const [dukBredd, setDukBredd] = useState(0)

  // B fäller kolumnen av sig själv; A och C låter designern bestämma.
  const propsVisas = variant === 'B' ? valt !== null : variant === 'C' ? false : oppen

  const matt = useMatt([variant, propsVisas, grupp, overflod, meny])
  useLayoutEffect(() => {
    const r = remsa.current
    setDolt(r ? Math.max(0, r.scrollWidth - r.clientWidth) : 0)
    setDukBredd(duk.current ? Math.round(duk.current.getBoundingClientRect().width) : 0)
  }, [variant, propsVisas, overflod, matt.bredd])

  const synliga = variant === 'B' && !overflod ? GRUPPER.slice(0, 5) : GRUPPER
  const resten = GRUPPER.length - 5

  return (
    <>
      <Chrome tab="Mall" />
      <Matare matt={matt} extra={`duk ${dukBredd} px · dold remsa ${dolt} px`} />
      <div className="ux16-panel">
        {/* Krönet: fram/baksida, och i C även grupperna. */}
        <div className="ux16-crown">
          <div className="ux16-seg" role="group" aria-label="Sida">
            <button className="ux16-btn" aria-pressed>
              Framsida
            </button>
            <button className="ux16-btn">Baksida</button>
          </div>
          {variant === 'C' ? (
            <>
              <h2>Grupp</h2>
              <button className="ux16-btn" aria-expanded={meny} onClick={() => setMeny((m) => !m)}>
                {GRUPPER[grupp]!.namn} · {GRUPPER[grupp]!.antal} kort ▾
              </button>
            </>
          ) : null}
          {variant !== 'C' ? (
            <button className="ux16-btn" data-quiet="true" onClick={() => setOppen((o) => !o)} aria-pressed={propsVisas} style={{ marginLeft: 'auto' }}>
              {propsVisas ? 'Fäll ihop egenskaper' : 'Visa egenskaper'}
            </button>
          ) : null}
        </div>

        {variant === 'C' && meny ? (
          <div className="ux16-crown" style={{ background: 'var(--ux16-panel)' }}>
            {GRUPPER.map((g, i) => (
              <button key={g.namn} className="ux16-chip" aria-pressed={i === grupp} onClick={() => (setGrupp(i), setMeny(false))}>
                {g.namn} <b>{g.antal}</b>
              </button>
            ))}
          </div>
        ) : null}

        {/* A: remsan radbryter. B: en rad med pilar och överflöd. */}
        {variant !== 'C' ? (
          <div className="ux16-groupbar" data-wrap={variant === 'A' ? 'true' : 'false'}>
            {variant === 'B' ? (
              <button className="ux16-btn" data-quiet="true" aria-label="Föregående grupper">
                ‹
              </button>
            ) : null}
            <div className={variant === 'B' ? 'ux16-rail' : ''} style={variant === 'B' ? undefined : { display: 'contents' }}>
              <div ref={remsa} className={variant === 'B' ? 'ux16-rail-scroll' : ''} style={variant === 'B' ? undefined : { display: 'contents' }}>
                {synliga.map((g, i) => (
                  <button key={g.namn} className="ux16-chip" aria-pressed={i === grupp} onClick={() => setGrupp(i)}>
                    {g.namn} <b>{g.antal}</b>
                  </button>
                ))}
              </div>
            </div>
            {variant === 'B' ? (
              <>
                <button className="ux16-btn" data-quiet="true" aria-label="Fler grupper">
                  ›
                </button>
                <button className="ux16-btn" aria-expanded={overflod} onClick={() => setOverflod((o) => !o)}>
                  +{resten} till ▾
                </button>
              </>
            ) : null}
            <button className="ux16-btn" data-quiet="true">
              + Ny grupp
            </button>
          </div>
        ) : null}

        <div className="ux16-canvas" data-props={propsVisas ? 'true' : 'false'} style={{ position: 'relative' }}>
          <section aria-label="Verktyg">
            <div className="ux16-railleft" style={{ width: '100%', borderRight: 0, flex: '1 1 auto' }}>
              {['text', 'bild', 'form', 'symbol', 'villkor', 'linjal'].map((t) => (
                <button key={t}>{t}</button>
              ))}
            </div>
          </section>

          <section aria-label="Lager">
            <div className="ux16-subcrown">
              <h2>Lager</h2>
              <span>{LAGER.length} st</span>
            </div>
            <div className="ux16-layers" data-ux16-scroll>
              {LAGER.map((l, i) => (
                <div key={l.namn} className="ux16-layer" aria-selected={i === valt} onClick={() => setValt(i)}>
                  <span aria-hidden="true" style={{ color: l.last ? 'var(--ux16-amber)' : 'var(--ux16-quiet)' }}>
                    {l.last ? '🔒' : '·'}
                  </span>
                  <span>
                    {l.namn}
                    <br />
                    <small style={{ color: 'var(--ux16-quiet)' }}>{l.vad}</small>
                  </span>
                  <span aria-hidden="true" style={{ color: 'var(--ux16-quiet)' }}>
                    ⠿
                  </span>
                </div>
              ))}
            </div>
            <div className="ux16-subfoot">Dra ett lager för att ändra ordning, eller Alt och en piltangent.</div>
          </section>

          <section aria-label="Duk" ref={duk as never}>
            <div className="ux16-stage" data-ux16-work>
              <div className="ux16-cardbig">{GRUPPER[grupp]!.namn}</div>
            </div>
          </section>

          {propsVisas ? (
            <section aria-label="Egenskaper">
              <div className="ux16-subcrown">
                <h2>Egenskaper</h2>
                <span>{valt === null ? '—' : LAGER[valt]!.namn}</span>
              </div>
              <div className="ux16-layers" data-ux16-scroll style={{ gap: 10 }}>
                {valt === null ? (
                  <p style={{ color: 'var(--ux16-hint)', lineHeight: 1.6 }}>Välj ett lager i lagerlistan, eller ett element på kortet.</p>
                ) : (
                  ['x', 'y', 'bredd', 'höjd', 'typsnitt', 'storlek', 'färg', 'bindning'].map((f) => (
                    <label key={f} style={{ display: 'grid', gap: 4, color: 'var(--ux16-hint)' }}>
                      {f}
                      <input className="ux16-search" style={{ width: '100%' }} defaultValue="12,0 mm" />
                    </label>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {/* C: egenskaperna som lager över duken i stället för en kolumn som tar dess bredd. */}
          {variant === 'C' && valt !== null ? (
            <aside
              className="ux16-dock"
              data-ux16-scroll
              style={{ position: 'absolute', right: 12, top: 12, bottom: 12, width: 280, borderRadius: 14, border: '1px solid var(--ux16-edge)', boxShadow: '0 18px 40px rgba(0,0,0,.5)' }}
            >
              <h2>Egenskaper · {LAGER[valt]!.namn}</h2>
              {['x', 'y', 'bredd', 'höjd', 'typsnitt', 'storlek'].map((f) => (
                <label key={f} style={{ display: 'grid', gap: 4, color: 'var(--ux16-hint)', marginBottom: 10 }}>
                  {f}
                  <input className="ux16-search" style={{ width: '100%' }} defaultValue="12,0 mm" />
                </label>
              ))}
              <button className="ux16-btn" onClick={() => setValt(null)}>
                Stäng
              </button>
            </aside>
          ) : null}
        </div>
      </div>
    </>
  )
}
