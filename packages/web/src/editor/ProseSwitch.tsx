import type { HTMLAttributes, Ref } from 'react'
import { BODY_LINES, type FieldBox } from './body.js'
import { useLang, useT } from '../i18n/index.js'

// Vad en kolumn skrivs som, där den står (L43, ändrat i #615): i kolumnlistan bakom `＋`, på samma
// rad som kolumnens namn. «Höjden föreslår, designern avgör» — rutans höjd i mallen sätter
// förvalet för vilken kolumn som får L39:s riktextredigerare, och här står valet och går att vända.
//
// Det stod förut i tabellhuvudet: en prick utanför rubrikens flöde och en utfällning som öppnades
// när pekaren vilade på rubriken. Pricken hamnade klistrad mot ordet («○typ»), utfällningen lade
// en primärknapp över raderna varje gång en hand stannade på väg att sortera, och varje
// designerkolumn kostade ett tabbstopp i huvudet — 11 i stället för 7 i exempelleken. Dörren
// har plats för det huvudet aldrig hade: två hela träffytor och en mening om varför, utan att
// röra en rubrik som också dras och sorteras.
//
// Skillnaden mellan förval och val bärs i form — en streckad markering när höjden föreslog, en
// ifylld när designern valde — och i ord, som gruppens namn, eftersom en streckad kant inte finns
// för en skärmläsare (L12).

export type ProseSwitchProps = {
  // Det ord kolumnen står under i huvudet. Det är namnet och aldrig nyckeln som läses upp (A4).
  label: string
  // Vad kolumnen *är* — förvalet vänt av valet — och vad designern själv har sagt, där `null` är
  // att hon inte har sagt något.
  prose: boolean
  choice: boolean | null
  // Rutan höjden räknas på, och `null` när mallen inte ritar kolumnen alls.
  box: FieldBox | null
  onProse(next: boolean | null): void
  // Dörrens tangentbordsordning (#388): varje knapp är en plats på radens pilväg.
  keys(one: 'prose' | 'plain' | 'follow'): HTMLAttributes<HTMLButtonElement> & { ref: Ref<HTMLButtonElement> }
}

// Ett mått i millimeter med en decimal, i läsarens egna siffror: decimaltecknet är ett komma på
// svenska och en punkt på engelska, och ett mått skrivet med fel tecken läses som ett annat tal.
const mm = (n: number, lang: string) => n.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// Växeln själv: två knappar i radens flöde, mellan namnet och ×.
export function ProseSwitch({ label, prose, choice, onProse, keys, whyId }: ProseSwitchProps & { whyId: string }) {
  const t = useT()
  const said = t(
    prose ? (choice === null ? 'table.prose.is.prose.height' : 'table.prose.is.prose.choice') : choice === null ? 'table.prose.is.plain.height' : 'table.prose.is.plain.choice',
    { field: label },
  )
  const one = (as: boolean) => (
    <button
      type="button"
      {...keys(as ? 'prose' : 'plain')}
      aria-pressed={prose === as}
      aria-label={t('table.prose.turn.named', { turn: t(as ? 'table.prose.as.prose' : 'table.prose.as.plain'), field: label })}
      aria-describedby={whyId}
      // Den tryckta knappen trycks också: på en kolumn som följer höjden gör det förslaget till
      // designerns eget val, och ett val är vad nästa omritning av mallen inte får röra.
      onClick={() => onProse(as)}
    >
      {t(as ? 'table.prose.as.prose' : 'table.prose.as.plain')}
    </button>
  )
  return (
    <span className="byd-prose-switch" role="group" aria-label={said} data-from={choice === null ? 'height' : 'choice'}>
      {one(true)}
      {one(false)}
    </span>
  )
}

// Och orsaken, på en egen rad under: rutan mallen ritar mot en rad av dess egen grad, och där
// designern har valt, vägen tillbaka till höjden.
export function ProseWhy({ label, choice, box, onProse, keys, whyId }: ProseSwitchProps & { whyId: string }) {
  const t = useT()
  const { lang } = useLang()
  return (
    <span className="byd-prose-why">
      <span id={whyId}>
        {box === null
          ? t('table.prose.why.undrawn')
          : t(box.h >= BODY_LINES * box.line ? 'table.prose.why.prose' : 'table.prose.why.plain', { box: mm(box.h, lang), line: mm(box.line, lang) })}
      </span>
      {/* Bara där det finns ett val att lämna: en knapp som lämnar tillbaka ingenting är en knapp
          som inte gör något. */}
      {choice !== null && (
        <button type="button" className="byd-prose-follow" {...keys('follow')} aria-label={t('table.prose.turn.named', { turn: t('table.prose.follow'), field: label })} onClick={() => onProse(null)}>
          {t('table.prose.follow')}
        </button>
      )}
    </span>
  )
}
