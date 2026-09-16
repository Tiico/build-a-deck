// PROTOTYP — #128 och #130 är samma fråga: vad äger en flikpanel överst, och vad skrollar under
// det. Därför visas en mekanism åt gången, tillämpad på alla tre ytorna — kortväggen, symbolerna
// och datafliken — i stället för tre lösningar per yta.
//
//   A  Full krona som radbryter: allt som är ett verktyg står kvar överst, hur brett det än blir.
//   B  Exakt en rad: överflödet faller ner i namngivna lådor som öppnas över arbetet.
//   C  Ingen krona: verktygen flyttar till en 68 px skena till vänster, den duken redan har.
//
// Tabellens egna rättelser — fast kolumnplan, klippt brödtext, svans under sista raden — är
// gemensamma för alla tre. De är en rättelse, inte ett val.
import { useState } from 'react'
import { Chrome, Matare, useMatt, type Variant, type Yta } from './Ux16Page.js'
import { FILTER, KONTROLLER, KORT, SYMBOLER } from './data.js'

const OGON = ['Som du ser det', 'Deuteranopi', 'Protanopi', 'Tritanopi', 'Gråskala'] as const
const TATHET = [110, 130, 150, 180, 220]
const KATEGORIER = ['Resurser', 'Handlingar', 'Tillstånd', 'Platshållare']

export function Krona({ variant, yta, valjYta }: { variant: Variant; yta: Yta; valjYta(y: Yta): void }) {
  const [oga, setOga] = useState(0)
  const [snitt, setSnitt] = useState(true)
  const [arm, setArm] = useState(false)
  const [steg, setSteg] = useState(2)
  const [lada, setLada] = useState<string | null>(null)
  const [kat, setKat] = useState(0)
  const [valda, setValda] = useState<string[]>(['Playcard'])
  const matt = useMatt([variant, yta, steg, lada, arm])

  const flik = yta === 'vagg' ? 'Kortvägg' : yta === 'symboler' ? 'Symboler' : 'Data'
  const oppna = (namn: string) => setLada((n) => (n === namn ? null : namn))

  // Verktygen som ord, en gång — kronan, raden och skenan ritar samma uppsättning olika.
  const ogonSeg = (
    <div className="ux16-seg" role="group" aria-label="Se leken med">
      {OGON.map((o, i) => (
        <button key={o} className="ux16-btn" aria-pressed={i === oga} onClick={() => setOga(i)}>
          {o}
        </button>
      ))}
    </div>
  )
  const bockar = (
    <>
      <label className="ux16-tick">
        <input type="checkbox" checked={snitt} onChange={(e) => setSnitt(e.target.checked)} /> skär- och skyddsmarginal
      </label>
      <label className="ux16-tick">
        <input type="checkbox" checked={arm} onChange={(e) => setArm(e.target.checked)} /> på armlängds avstånd
      </label>
    </>
  )
  const tathet = (
    <div className="ux16-seg" role="group" aria-label="Täthet">
      <button className="ux16-btn" onClick={() => setSteg((s) => Math.max(0, s - 1))} aria-label="Fler kort per rad">
        −
      </button>
      <button className="ux16-btn" onClick={() => setSteg((s) => Math.min(TATHET.length - 1, s + 1))} aria-label="Färre och större kort">
        +
      </button>
    </div>
  )

  const vagg = (
    <div
      className="ux16-wall"
      data-eye={oga === 4 ? 'gray' : oga === 1 ? 'deuteranopia' : undefined}
      style={{ ['--ux16-card' as string]: `${arm ? 90 : TATHET[steg]}px` }}
    >
      {KORT.map((k) => (
        <div className="ux16-card" key={k.id}>
          <b>{k.titel}</b>
          <small>{k.typ}</small>
          <i />
        </div>
      ))}
    </div>
  )

  const symbolerYta = (
    <div className="ux16-symbols">
      <div className="ux16-symbols-lib">
        {variant !== 'C' ? <input className="ux16-search" type="search" placeholder="Sök namn, nyckelord…" style={{ width: '100%', marginBottom: 12 }} /> : null}
        <div className="ux16-symbols-grid">
          {SYMBOLER.concat(SYMBOLER).map((s, i) => (
            <div className="ux16-symbols-tile" key={`${s}-${i}`}>
              <em />
              {s}
              <small>CC0</small>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 style={{ fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ux16-quiet)', marginBottom: 10 }}>Spelets uppsättning</h2>
        <p style={{ color: 'var(--ux16-hint)', lineHeight: 1.6, marginBottom: 14 }}>
          Vad du skriver, vilken licens symbolen har och hur många kort den sitter på.
        </p>
        <div className="ux16-symbols-grid">
          {SYMBOLER.slice(0, 14).map((s) => (
            <div className="ux16-symbols-tile" key={s}>
              <em />
              {`{${s}}`}
              <small>13 kort</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const tabell = (
    <table className="ux16-table">
      <colgroup>
        <col style={{ width: 118 }} />
        <col style={{ width: 210 }} />
        <col />
        <col style={{ width: 150 }} />
        <col style={{ width: 74 }} />
        <col style={{ width: 104 }} />
      </colgroup>
      <thead>
        <tr>
          <th>typ</th>
          <th>title</th>
          <th>body</th>
          <th>grupp</th>
          <th>kostnad</th>
          <th>id</th>
        </tr>
      </thead>
      <tbody>
        {KORT.map((k) => (
          <tr key={k.id}>
            <td className="ux16-nowrap">{k.typ}</td>
            <td className="ux16-nowrap">{k.titel}</td>
            <td className="ux16-clamp">{k.text}</td>
            <td className="ux16-nowrap">{k.grupp}</td>
            <td>{k.kostnad}</td>
            <td className="ux16-nowrap" style={{ color: 'var(--ux16-quiet)' }}>
              {k.id}
            </td>
          </tr>
        ))}
        <tr aria-hidden="true">
          <td className="ux16-tail" colSpan={6} />
        </tr>
      </tbody>
    </table>
  )

  const dock = (
    <aside className="ux16-dock" data-ux16-scroll>
      <h2>Fysisk kontroll</h2>
      <ul>
        {KONTROLLER.map((k) => (
          <li key={k.rubrik} data-severity={k.grad}>
            <b>{k.rubrik}</b> <span>{k.text}</span>
          </li>
        ))}
      </ul>
      <button className="ux16-btn">Visa hela rapporten</button>
    </aside>
  )

  const arbete = yta === 'vagg' ? vagg : yta === 'symboler' ? symbolerYta : tabell
  const fot =
    yta === 'data' ? (
      <div className="ux16-foot">
        <span>77 av 77 kort</span>
        <span>Osorterat: kortens ordning i spelet</span>
        <span style={{ marginLeft: 'auto' }}>En import lägger till rader och skriver över celler med samma id.</span>
      </div>
    ) : yta === 'vagg' ? (
      <div className="ux16-foot">
        <span>77 kort · {TATHET[steg]} px breda</span>
        <span>4 anmärkningar</span>
      </div>
    ) : (
      <div className="ux16-foot">
        <span>56 symboler i biblioteket · 14 i spelet</span>
      </div>
    )

  return (
    <>
      <Chrome tab={flik} />
      <Matare matt={matt} extra={`yta ${flik}`} />
      <YtaVal yta={yta} valjYta={valjYta} />
      <div className="ux16-panel">
        {/* A — full krona: allt står kvar, och kronan radbryter när rummet tar slut. */}
        {variant === 'A' ? (
          <div className="ux16-crown">
            {yta === 'vagg' ? (
              <>
                <h2>Se leken med</h2>
                {ogonSeg}
                {bockar}
                <h2>Täthet</h2>
                {tathet}
              </>
            ) : null}
            {yta === 'symboler' ? (
              <>
                <input className="ux16-search" type="search" placeholder="Sök symbol" />
                {KATEGORIER.map((k, i) => (
                  <button key={k} className="ux16-chip" aria-pressed={i === kat} onClick={() => setKat(i)}>
                    {k}
                  </button>
                ))}
                <button className="ux16-btn">Lägg till i spelet</button>
              </>
            ) : null}
            {yta === 'data' ? (
              <>
                <input className="ux16-search" type="search" placeholder="Sök i leken" />
                {FILTER.map((f) => (
                  <button
                    key={f}
                    className="ux16-chip"
                    aria-pressed={valda.includes(f)}
                    onClick={() => setValda((v) => (v.includes(f) ? v.filter((x) => x !== f) : [...v, f]))}
                  >
                    {f}
                  </button>
                ))}
                <button className="ux16-btn">Importera CSV…</button>
                <button className="ux16-btn">Hämta CSV</button>
                <button className="ux16-btn" data-primary="true">
                  Nytt kort
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {/* B — exakt en rad, hur smalt fönstret än blir; resten i lådor som öppnas över arbetet. */}
        {variant === 'B' ? (
          <div className="ux16-crown" data-one="true">
            {yta === 'data' ? <input className="ux16-search" type="search" placeholder="Sök i leken" /> : null}
            {yta === 'symboler' ? <input className="ux16-search" type="search" placeholder="Sök symbol" /> : null}
            {yta === 'vagg' ? (
              <button className="ux16-btn" aria-pressed={lada === 'ogon'} onClick={() => oppna('ogon')}>
                Ögon: {OGON[oga]} ▾
              </button>
            ) : null}
            {yta === 'vagg' ? (
              <button className="ux16-btn" aria-pressed={lada === 'guider'} onClick={() => oppna('guider')}>
                Guider ({(snitt ? 1 : 0) + (arm ? 1 : 0)}) ▾
              </button>
            ) : null}
            {yta === 'vagg' ? tathet : null}
            {yta === 'symboler' ? (
              <button className="ux16-btn" aria-pressed={lada === 'kat'} onClick={() => oppna('kat')}>
                {KATEGORIER[kat]} ▾
              </button>
            ) : null}
            {yta === 'data' ? (
              <button className="ux16-btn" aria-pressed={lada === 'filter'} onClick={() => oppna('filter')}>
                Filter ({valda.length}) ▾
              </button>
            ) : null}
            {yta === 'data' ? (
              <button className="ux16-btn" aria-pressed={lada === 'import'} onClick={() => oppna('import')}>
                Importera ▾
              </button>
            ) : null}
            <button className="ux16-btn" aria-pressed={lada === 'kontroll'} onClick={() => oppna('kontroll')} style={{ marginLeft: 'auto' }}>
              Fysisk kontroll (4) ▾
            </button>
          </div>
        ) : null}

        {variant === 'B' && lada ? (
          <div className="ux16-crown" style={{ background: 'var(--ux16-panel)' }}>
            {lada === 'ogon' ? ogonSeg : null}
            {lada === 'guider' ? bockar : null}
            {lada === 'kat'
              ? KATEGORIER.map((k, i) => (
                  <button key={k} className="ux16-chip" aria-pressed={i === kat} onClick={() => setKat(i)}>
                    {k}
                  </button>
                ))
              : null}
            {lada === 'filter'
              ? FILTER.map((f) => (
                  <button
                    key={f}
                    className="ux16-chip"
                    aria-pressed={valda.includes(f)}
                    onClick={() => setValda((v) => (v.includes(f) ? v.filter((x) => x !== f) : [...v, f]))}
                  >
                    {f}
                  </button>
                ))
              : null}
            {lada === 'import' ? (
              <>
                <button className="ux16-btn">Importera CSV…</button>
                <button className="ux16-btn">Hämta CSV</button>
                <span style={{ color: 'var(--ux16-hint)' }}>En import lägger till rader och skriver över celler med samma id.</span>
              </>
            ) : null}
            {lada === 'kontroll'
              ? KONTROLLER.map((k) => (
                  <span key={k.rubrik} className="ux16-chip">
                    <b>{k.rubrik}</b> {k.text}
                  </span>
                ))
              : null}
          </div>
        ) : null}

        <div className="ux16-split">
          {/* C — verktygen lämnar krönet helt och blir skenan duken redan har. */}
          {variant === 'C' ? (
            <div className="ux16-railleft">
              {yta === 'vagg' ? (
                <>
                  {OGON.map((o, i) => (
                    <button key={o} aria-pressed={i === oga} onClick={() => setOga(i)} title={o}>
                      <span aria-hidden="true" style={{ fontSize: 16 }}>
                        {['👁', 'D', 'P', 'T', '◐'][i]}
                      </span>
                      {o.split(' ')[0]}
                    </button>
                  ))}
                  <hr />
                  <button aria-pressed={snitt} onClick={() => setSnitt((s) => !s)}>
                    <span aria-hidden="true" style={{ fontSize: 16 }}>
                      ▣
                    </span>
                    snitt
                  </button>
                  <button aria-pressed={arm} onClick={() => setArm((a) => !a)}>
                    <span aria-hidden="true" style={{ fontSize: 16 }}>
                      ↔
                    </span>
                    armlängd
                  </button>
                  <hr />
                  <button onClick={() => setSteg((s) => Math.max(0, s - 1))}>− tätare</button>
                  <button onClick={() => setSteg((s) => Math.min(TATHET.length - 1, s + 1))}>+ större</button>
                </>
              ) : null}
              {yta === 'symboler' ? (
                <>
                  <button aria-pressed={lada === 'sok'} onClick={() => oppna('sok')}>
                    <span aria-hidden="true" style={{ fontSize: 16 }}>
                      🔍
                    </span>
                    sök
                  </button>
                  <hr />
                  {KATEGORIER.map((k, i) => (
                    <button key={k} aria-pressed={i === kat} onClick={() => setKat(i)}>
                      {k}
                    </button>
                  ))}
                </>
              ) : null}
              {yta === 'data' ? (
                <>
                  <button aria-pressed={lada === 'sok'} onClick={() => oppna('sok')}>
                    <span aria-hidden="true" style={{ fontSize: 16 }}>
                      🔍
                    </span>
                    sök
                  </button>
                  <button aria-pressed={lada === 'filter'} onClick={() => oppna('filter')}>
                    <span aria-hidden="true" style={{ fontSize: 16 }}>
                      ⚑
                    </span>
                    filter {valda.length}
                  </button>
                  <hr />
                  <button>importera</button>
                  <button>hämta</button>
                  <button>nytt kort</button>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="ux16-col">
            {variant === 'C' && lada ? (
              <div className="ux16-crown" style={{ background: 'var(--ux16-panel)' }}>
                {lada === 'sok' ? <input className="ux16-search" type="search" placeholder="Sök" autoFocus /> : null}
                {lada === 'filter'
                  ? FILTER.map((f) => (
                      <button
                        key={f}
                        className="ux16-chip"
                        aria-pressed={valda.includes(f)}
                        onClick={() => setValda((v) => (v.includes(f) ? v.filter((x) => x !== f) : [...v, f]))}
                      >
                        {f}
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
            <div className="ux16-work" data-ux16-work data-ux16-scroll>
              {arbete}
            </div>
            {fot}
          </div>

          {/* Fysisk kontroll står kvar som docka i A och C; i B är den en låda i raden. */}
          {yta === 'vagg' && variant !== 'B' ? dock : null}
        </div>
      </div>
    </>
  )
}

function YtaVal({ yta, valjYta }: { yta: Yta; valjYta(y: Yta): void }) {
  return (
    <div className="ux16-meter" style={{ borderBottom: '1px solid var(--ux16-line)' }}>
      <span>samma mekanism på tre ytor:</span>
      {(
        [
          ['vagg', 'Kortvägg (#128)'],
          ['symboler', 'Symboler (#128)'],
          ['data', 'Data (#130)'],
        ] as const
      ).map(([id, namn]) => (
        <button
          key={id}
          onClick={() => valjYta(id)}
          aria-pressed={yta === id}
          style={{
            background: yta === id ? 'var(--ux16-mark)' : 'transparent',
            color: yta === id ? '#0d1117' : 'var(--ux16-hint)',
            border: '1px solid var(--ux16-edge)',
            borderRadius: 6,
            padding: '2px 8px',
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          {namn}
        </button>
      ))}
    </div>
  )
}
