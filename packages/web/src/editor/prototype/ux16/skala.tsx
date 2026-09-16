// PROTOTYP — #132. Ytterkanten är redan avgjord i issuen: 16 px, och skalan gäller editorn och
// inte spelarens ytor. Det som står öppet är den inre rytmen — vad en panel inuti en panel får,
// och hur många tal skalan över huvud taget behöver. Tre svar:
//
//   A  Halvstegsladder 4 · 8 · 12 · 16 · 24. Gutter 16, panel i panel 12, kronrader 8.
//   B  Strikt 4×-ladder 4 · 8 · 16 · 24 · 32, inget 12 alls. Panel i panel får samma 16 som
//      ytterkanten; rytmen blir grövre och entydig.
//   C  Två tal: `--byd-gutter` (16) och `--byd-gap` (8). Allt annat är en av dem, eller en
//      multipel skriven där den används.
import { Chrome, Matare, useMatt, type Variant } from './Ux16Page.js'

const LADDER: Record<Variant, { token: string; px: number; vad: string }[]> = {
  A: [
    { token: '--byd-s1', px: 4, vad: 'mellan två knappar i samma grupp' },
    { token: '--byd-s2', px: 8, vad: 'kronans rader och dess luft' },
    { token: '--byd-s3', px: 12, vad: 'panel inuti en panel: mallens kolumner' },
    { token: '--byd-s4', px: 16, vad: 'ytterkanten — `--byd-gutter`' },
    { token: '--byd-s5', px: 24, vad: 'mellan två självständiga block' },
  ],
  B: [
    { token: '--byd-s1', px: 4, vad: 'mellan två knappar i samma grupp' },
    { token: '--byd-s2', px: 8, vad: 'kronans rader och dess luft' },
    { token: '--byd-s3', px: 16, vad: 'panel inuti en panel — samma som kanten' },
    { token: '--byd-s4', px: 24, vad: 'mellan två självständiga block' },
    { token: '--byd-s5', px: 32, vad: 'runt en komponerad ruta, regelflikens tomläge' },
  ],
  C: [
    { token: '--byd-gap', px: 8, vad: 'allt som ligger bredvid något annat' },
    { token: '--byd-gutter', px: 16, vad: 'ytterkanten, och varje inre kant med' },
  ],
}

const IDAG = [
  ['Kortvägg', '.byd-wall', '16 px'],
  ['Kortvägg, verktyg', '.byd-wall-tools', '0 4px 10px'],
  ['Mall', '.byd-canvas-layers / -props', '12 px'],
  ['Data', '.byd-data-tools', 'x = 16 px'],
  ['Symboler', '.byd-symbols', '20 px'],
  ['Bord, uppställning', '.byd-setup', '20 px'],
  ['Bord, listan', '.byd-tables', '24 px'],
  ['Regler', 'panelens rot', '24 px'],
]

export function Skala({ variant }: { variant: Variant }) {
  const matt = useMatt([variant])
  const steg = LADDER[variant]
  return (
    <>
      <Chrome tab="Mall" />
      <Matare matt={matt} extra={`ytterkant 16 px (beslutad) · ${steg.length} tal i skalan`} />
      <div className="ux16-scale" data-ux16-work data-ux16-scroll>
        <p className="ux16-note">
          <b>Ytterkanten är inte öppen längre.</b> Beställaren har svarat i issuen: <code>--byd-gutter</code> blir 16 px, skalan gäller
          editorn och inte spelarens ytor, och #132 görs före de övriga så att de bygger på tokens från början. Det som varieras här är
          därför bara den inre rytmen och hur många tal skalan behöver — A, B och C har alla samma 16 px ytterkant.
        </p>

        <div>
          <h2>Skalan</h2>
          <div className="ux16-ladder">
            {steg.map((s) => (
              <div key={s.token}>
                <code>{s.token}</code>
                <i style={{ width: s.px * 3 }} />
                <code style={{ width: '6ch' }}>{s.px}px</code>
                <span>{s.vad}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2>Panel i panel</h2>
          <div className="ux16-boxes">
            <div className="ux16-box">
              Flikpanelens rot — <code>var(--byd-gutter)</code>
              <div>
                En panel inuti panelen — <code>var(--byd-inner)</code>
                <div>En rad i kronan — {variant === 'C' ? <code>var(--byd-gap)</code> : <code>var(--byd-s2)</code>}</div>
              </div>
            </div>
            <div className="ux16-box">
              <h2>Vad de fyra andra fynden ärver</h2>
              <p className="ux16-note" style={{ fontSize: 12 }}>
                Kronan i #128 och #130 är <code>var(--byd-rows) var(--byd-gutter)</code>. Gruppremsan i #129 är{' '}
                <code>var(--byd-s1) var(--byd-gutter)</code>. Regelflikens ruta i #131 är{' '}
                <code>var(--byd-s5)</code> inuti och runt om. Ingen av dem skriver ett eget tal.
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2>De åtta kanter editorn har i dag</h2>
          <div className="ux16-boxes">
            {IDAG.map(([flik, valjare, kant]) => (
              <div className="ux16-box" key={valjare} style={{ minWidth: 190, flex: '1 1 190px', padding: 12 }}>
                <b style={{ color: 'var(--ux16-ink-strong)' }}>{flik}</b>
                <div style={{ border: 0, padding: 0, marginTop: 6 }}>
                  <code style={{ color: '#cfe0ff' }}>{valjare}</code>
                  <br />
                  <span style={{ color: kant === '16 px' ? 'var(--ux16-green)' : 'var(--ux16-amber)' }}>{kant}</span>
                  {kant === '16 px' ? ' — oförändrad' : ` → 16 px`}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="ux16-note">
          <b>Vad varje val kostar.</b> A behåller 12 px, så mallens kolumner ser ut precis som i dag och ingen panel ändrar bredd — men
          skalan har ett halvsteg, och ett halvsteg är det som gör att någon skriver 12 där 16 hörde hemma. B tar bort 12 helt: mallens
          lager- och egenskapskolumner får 4 px mer på var sida, vilket är 16 px mindre duk vid 1024 — precis den bredd #129 slåss om. C
          har två tal och kan inte skriva fel, men har inget namn på de 24 px regelflikens tomläge vill ha, så det talet skrivs ändå,
          bara utan token.
        </p>
      </div>
    </>
  )
}
