// PROTOTYP — #131. Tomläget är i dag ett stycke i hörnet av en tom skärm. Tre olika svar på vad
// en tom regelflik ska vara, och vad var och en blir när boken väl är skriven:
//
//   A  En komponerad ruta mitt i ytan med tre vägar in. Boken får en innehållsförteckning.
//   B  Ingen ruta: sidan själv, redan uppslagen i sin läsbredd, med en insättningspunkt att
//      börja skriva i. En enda väg in — att skriva. Boken hittas med en fråga i krönet (B7).
//   C  En disposition: fem tomma avsnitt som designern fyller i. Tomläget är redan bokens
//      innehållsförteckning.
import { useState } from 'react'
import { Chrome, Matare, useMatt, type Variant } from './Ux16Page.js'

const AVSNITT = ['Översikt', 'Uppställning', 'Turordning', 'Handlingar', 'Vinstvillkor']

export function Regler({ variant }: { variant: Variant }) {
  const [skriven, setSkriven] = useState(false)
  const matt = useMatt([variant, skriven])

  return (
    <>
      <Chrome tab="Regler" />
      <Matare matt={matt} extra={skriven ? 'skriven bok' : 'tomläge'} />
      <div className="ux16-panel">
        <div className="ux16-crown">
          <h2>Regler</h2>
          {skriven && variant === 'B' ? <input className="ux16-search" type="search" placeholder="Fråga boken: vad händer när högen tar slut?" style={{ width: 340 }} /> : null}
          <button className="ux16-btn" data-quiet="true" onClick={() => setSkriven((s) => !s)} style={{ marginLeft: 'auto' }}>
            Visa {skriven ? 'tomläge' : 'skriven bok'}
          </button>
          {skriven ? <button className="ux16-btn">Häfte för tryck</button> : null}
        </div>

        <div className="ux16-rules" data-ux16-work data-ux16-scroll>
          {!skriven && variant === 'A' ? (
            <div className="ux16-empty-centre">
              <h2>Spelets regler bor här</h2>
              <p>
                Reglerna versioneras med korten, så den bok spelarna läser är den bok leken låstes till när sessionen startade. Samma text
                möter dem på telefonen, på bordets skärm och hos observatören — och blir ett tryckfärdigt häfte när ordern läggs.
              </p>
              <ul>
                <li>En regel namnger en zon eller ett kort, och följer med när du döper om det.</li>
                <li>Ett stycke öppnas där det står och stängs när du lämnar det.</li>
              </ul>
              <div className="ux16-ways">
                <button className="ux16-btn" data-primary="true">
                  Börja skriva reglerna
                </button>
                <button className="ux16-btn">Börja från en mall</button>
                <button className="ux16-btn">Importera från fil</button>
              </div>
            </div>
          ) : null}

          {!skriven && variant === 'B' ? (
            <div className="ux16-book" data-toc="false">
              <div className="ux16-page" style={{ justifySelf: 'center' }}>
                <h3 style={{ color: 'var(--ux16-quiet)' }}>Översikt</h3>
                <p className="ux16-caret">
                  Skriv den första meningen om spelet här. Ett stycke öppnas där det står, och stängs när du lämnar det.
                </p>
                <div
                  style={{
                    marginTop: 24,
                    padding: 16,
                    borderRadius: 14,
                    border: '1px solid var(--ux16-line)',
                    background: 'var(--ux16-panel)',
                    color: 'var(--ux16-hint)',
                    lineHeight: 1.6,
                  }}
                >
                  <b style={{ color: 'var(--ux16-ink-strong)' }}>Vad boken är till för.</b> Den versioneras med korten, läses på telefonen,
                  på bordets skärm och hos observatören, och trycks som häfte med ordern. Skriv <code style={{ color: '#ffd98a' }}>[[</code> för
                  att peka på en zon eller ett kort.
                </div>
              </div>
            </div>
          ) : null}

          {!skriven && variant === 'C' ? (
            <div className="ux16-book">
              <nav className="ux16-toc" aria-label="Innehåll">
                <b>Innehåll</b>
                {AVSNITT.map((a) => (
                  <span key={a} style={{ color: 'var(--ux16-quiet)' }}>
                    {a} · tomt
                  </span>
                ))}
                <button className="ux16-btn" data-quiet="true" style={{ justifySelf: 'start', marginTop: 8 }}>
                  + Eget avsnitt
                </button>
              </nav>
              <div className="ux16-page">
                <p style={{ color: 'var(--ux16-hint)', lineHeight: 1.6 }}>
                  Fem avsnitt att fylla i. Reglerna versioneras med korten och läses på telefonen, bordets skärm och hos observatören.
                  Ett avsnitt du inte behöver tas bort.
                </p>
                {AVSNITT.map((a) => (
                  <div key={a}>
                    <h3 style={{ color: 'var(--ux16-quiet)' }}>{a}</h3>
                    <p className="ux16-caret" style={{ marginTop: 8 }}>
                      {a === 'Översikt' ? 'Vad handlar spelet om, i två meningar?' : a === 'Uppställning' ? 'Vad ligger var när spelet börjar?' : 'Skriv här.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {skriven ? (
            <div className="ux16-book" data-toc={variant === 'B' ? 'false' : 'true'}>
              {variant !== 'B' ? (
                <nav className="ux16-toc" aria-label="Innehåll">
                  <b>Innehåll</b>
                  {AVSNITT.map((a, i) => (
                    <span key={a} style={{ color: i === 0 ? 'var(--ux16-ink-strong)' : undefined }}>
                      {a}
                    </span>
                  ))}
                </nav>
              ) : null}
              <div className="ux16-page" style={{ justifySelf: variant === 'B' ? 'center' : undefined }}>
                <h3>Översikt</h3>
                <p>
                  Ni är ett gäng som ska ta er in i hotellets valv innan gryningen. Spelet spelas över tre nätter, och varje natt är en
                  runda där varje spelare gör två handlingar.
                </p>
                <h3>Uppställning</h3>
                <p>
                  Blanda leken och lägg den i <mark>Dragbunten</mark>. Lägg fyra kort öppet i <mark>Lobbyn</mark>. Varje spelare drar tre
                  kort till sin hand och tar en bricka ur <mark>Förrådet</mark>.
                </p>
                <h3>Turordning</h3>
                <p>
                  Den som senast blev utslängd från ett hotell börjar. På din tur gör du två av följande: dra ett kort, spela ett kort ur
                  handen, flytta din bricka, eller lägga ett kort i <mark>Kasthögen</mark> för att ta en mynt-bricka.
                </p>
                <p>
                  Tar <mark>Dragbunten</mark> slut blandas <mark>Kasthögen</mark> och blir den nya bunten. Händer det för tredje gången
                  går larmet och natten är över.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
