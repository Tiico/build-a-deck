import { BODY_LINES, type FieldBox } from './body.js'
import { useLang, useT } from '../i18n/index.js'

// Kolumnens märke i tabellhuvudet (L43, #362, variant C). «Höjden föreslår, designern avgör»:
// rutans höjd i mallen sätter förvalet för vilken kolumn som får L39:s riktextredigerare, och
// det här är där valet står skrivet och går att vända.
//
// Varianten valdes på mätningen och inte på utseendet. **A**, en växel i rubriken, når 20 px där
// `--byd-tap` är 44 och kapar rubriken «Kostnad» till «KOST…» med sina egna två kontroller —
// samma räkning #46 gjorde när × fick lämna rubriken. **B**, en kolumnspalt vid sidan, är den
// tydligaste men rullar redan vid fyra kolumner (201 px) och lägger valet en bit från kolumnen
// det gäller. **C** kostar ingenting i vila — en prick i huvudet, inga kontroller — och når hela
// träffytan när den är framme.
//
// **Pricken är därför ingen kontroll.** Det är inte en förenkling utan vad mätningen säger: C:s
// rad «minsta träffyta» är tom i vila, och en knapp där hade blivit 8 px i en kolumn som är en
// siffra bred — under `--byd-tap` överallt, vilket är precis vad som fällde A. Det som fälls ut
// och vänder valet är kontrollerna, och de når 44 px. Rubriken själv är utfällningens handtag:
// pekaren eller fokus någonstans i den, aldrig bara det ena (#184, #216).
//
// Skillnaden mellan förval och val bärs **i form**: prickad ring mot ifylld bricka. En prickad
// ring finns inte för en skärmläsare och editorns a11y är inte mjukad (L12), så samma skillnad
// står i ord som **utfällningens namn** — «Kostnad skrivs som vanlig text, du valde» mot «…,
// höjden föreslog». Den läses upp när utfällningen nås, vilket är samma ögonblick som formen
// visar sig för ögat, och den kostar ingen höjd i ytan.

export type ProseMarkProps = {
  // Det ord kolumnen står under i huvudet. Det är kolumnens nyckel för allt utom `antal`, och
  // det är namnet och aldrig nyckeln som läses upp (A4).
  label: string
  // Vad kolumnen *är* — förvalet vänt av valet — och vad designern själv har sagt, där `null`
  // är att hon inte har sagt något. Två frågor och inte en: den första styr cellen, den andra
  // styr formen och orden.
  prose: boolean
  choice: boolean | null
  // Rutan höjden räknas på, och `null` när mallen inte ritar kolumnen alls.
  box: FieldBox | null
  // Om rubriken är rörd just nu. Rubriken äger det och inte märket, eftersom handtaget är hela
  // rubriken och inte pricken.
  open: boolean
  // Vägen till att vända valet. Utan den säger utfällningen fortfarande vad kolumnen är och
  // varför — tabellen kan visas utan ett projekt att skriva i — men det finns inget att trycka på.
  onProse?: ((next: boolean | null) => void) | undefined
}

// Ett mått i millimeter med en decimal, i läsarens egna siffror: decimaltecknet är ett komma på
// svenska och en punkt på engelska, och ett mått skrivet med fel tecken läses som ett annat tal.
const mm = (n: number, lang: string) => n.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function ProseMark({ label, prose, choice, box, open, onProse }: ProseMarkProps) {
  const t = useT()
  const { lang } = useLang()
  const said = t(
    prose ? (choice === null ? 'table.prose.is.prose.height' : 'table.prose.is.prose.choice') : choice === null ? 'table.prose.is.plain.height' : 'table.prose.is.plain.choice',
    { field: label },
  )
  return (
    <>
      {/* Formen, och ingenting annat: prickad ring när höjden föreslog, ifylld bricka när
          designern valde. Den är dold för skärmläsaren eftersom orden står i utfällningens namn
          — en prick som också lästes upp vore samma sak sagd två gånger i samma rad. */}
      <span className="byd-prose-mark" aria-hidden="true" data-from={choice === null ? 'height' : 'choice'} data-prose={prose ? 'true' : 'false'} />
      {open && (
        <div className="byd-prose-why" role="group" aria-label={said}>
          <b>{t(prose ? 'table.prose.is.prose' : 'table.prose.is.plain', { field: label })}</b>
          {/* Orsaken, och bara orsaken. Att höjden *föreslog* eller att designern *valde* står i
              formen och i utfällningens namn och inte här: den meningen valdes bort, och det är
              att den är samma i båda lägena som gör att den kan väljas bort. */}
          <p>
            {box === null
              ? t('table.prose.why.undrawn')
              : t(box.h >= BODY_LINES * box.line ? 'table.prose.why.prose' : 'table.prose.why.plain', { box: mm(box.h, lang), line: mm(box.line, lang) })}
          </p>
          {onProse && (
            <div className="byd-prose-turn-row">
              <button type="button" className="byd-prose-turn byd-prose-turn-strong" onClick={() => onProse(!prose)}>
                {t(prose ? 'table.prose.make.plain' : 'table.prose.make.prose')}
              </button>
              {/* Bara där det finns ett val att lämna: en knapp som lämnar tillbaka ingenting är
                  en knapp som inte gör något. */}
              {choice !== null && (
                <button type="button" className="byd-prose-turn" onClick={() => onProse(null)}>
                  {t('table.prose.follow')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
