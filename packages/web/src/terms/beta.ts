// The beta's terms and privacy text (#1272, F4, G6): the draft from the prototype on
// `proto/1272-betavillkor` @ 70e7a5d, which the beställare approved as the text to publish, marked
// «utkast, inte juridiskt granskat» until she says otherwise (F4 beslut 3).
//
// The terms follow #1268's outline section by section, with the same numbering, so 9 and 10 stand as
// headings from the start and no number ever changes. The privacy text follows #1269's maps and F1–F7,
// and says only what is true today (beställarens beslut 3, 2026-10-24): erasure goes through Kontakt,
// and the text is brought up to date with each slice that changes that (#1277, #1279–#1281).
//
// This is legal text and not the tool's catalogue: «vi» here is the one who runs Deckster, a party to
// an agreement, which is why it lives outside `i18n/` and is not held to L73's voice
// (`catalog-tone.test.ts`). The words of the step and the page around it are the catalogue's.
//
// `{name}`, `{address}`, `{contact}`, `{processors}` and `{transfer}` are read from `operator.ts`.
// `**…**` is bold, `[…](#integritet)` and `[…](#villkor)` lead to the other half of the page, and
// `[…](#anmal)` to the report page (#1274).
// The text is Swedish only for now: the English is written once the Swedish is approved (#1272,
// beslut 2026-10-24), and an English page says so above it.

export type Block = string | { list: readonly string[] }
export type Section = { h: string; ks: string; body: readonly Block[]; waits?: true }
export type Document = { title: string; sections: readonly Section[] }
export type TermsText = { version: string; terms: Document; privacy: Document; summary: readonly string[] }

const terms: Document = {
  title: 'Villkor för Decksters beta',
  sections: [
    {
      h: 'Vilka vi är och vad Deckster är',
      ks: 'Deckster drivs i betan av en privatperson och är ett verktyg för att göra och speltesta kortspel.',
      body: [
        'Deckster drivs under betan av {name}, {address} («vi»). Du når oss på {contact}, som också är kontaktpunkten för myndigheter och användare enligt EU:s förordning om digitala tjänster.',
        'Deckster är ett verktyg för att skapa kortspel, speltesta dem vid ett bord och ta fram tryckfiler.',
        'Innan något i Deckster säljs tar ett aktiebolag över tjänsten. Då får du nya villkor att läsa och godkänna.',
      ],
    },
    {
      h: 'Konto, ålder och gäster',
      ks: 'Du måste vara 18 år för att ha ett konto. Gäster vid ditt bord ingår inget avtal, så du svarar för vilka du bjuder in.',
      body: [
        'Du måste vara 18 år eller äldre för att ha ett konto. Kontot är ditt eget: dela inte inloggningslänken eller dina passkeys med någon.',
        'Den som sätter sig vid ett bord med en rumskod är gäst. Gäster har ingen åldersgräns, loggar aldrig in och ingår inget avtal med oss. Därför svarar du som startar bordet för vilka du bjuder in, och för att bordet används enligt de här villkoren.',
        'Det gästerna lämnar vid ditt bord, alltså namn, drag, anteckningar, flaggor och enkätsvar, ser du och de du delar spelet med. Ni får använda det bara för att utveckla ert spel. Hur vi sparar och raderar det står i [integritetstexten](#integritet).',
        'En gäst som sparar sin session till ett konto blir användare och godkänner villkoren som alla andra.',
      ],
    },
    {
      h: 'Ditt innehåll är ditt',
      ks: 'Allt du gör i Deckster är ditt, och du kan exportera allt när som helst.',
      body: [
        'Du behåller all rätt till det du skapar och laddar upp.',
        'Du kan när som helst exportera hela spelet, med alla versioner, bilder, typsnitt och tryckfiler, också utan att betala. Om ett abonnemang en dag går ut kan du fortfarande läsa och exportera; vi raderar inte ett spel för att du slutat betala.',
      ],
    },
    {
      h: 'Det du lovar om ditt innehåll',
      ks: 'Du lovar att du har rätt till allt du laddar upp och skriver, och att det inte bryter mot lag.',
      body: [
        'Du garanterar att du äger eller har licens till allt du laddar upp eller skriver: bilder, typsnitt, text, kortnamn och regler. Särskilt att',
        { list: ['ett typsnitts licens tillåter att det bäddas in i tryck,', 'du inte använder andras varumärken eller figurer utan tillstånd,', 'innehållet inte bryter mot lag.'] },
        'Symbolerna i Decksters bibliotek och typsnitten från Google Fonts är undantagna så länge du använder dem som de levereras. Deras licenser är vår sak.',
        'Får vi krav från någon annan för att du brutit mot det här, ska du ersätta oss för det om du varit vårdslös eller gjort det med avsikt.',
      ],
    },
    {
      h: 'Det du låter oss göra med ditt innehåll',
      ks: 'Du ger oss rätt att lagra, kopiera och visa ditt innehåll, men bara för att Deckster ska fungera.',
      body: [
        'För att Deckster ska fungera måste vi kopiera ditt innehåll: spara och säkerhetskopiera det, rita kort, texturer och tryckfiler, och visa det för dem du delar med, alltså medredigerare, testledare, gäster och observatörer.',
        'Du ger oss därför en icke-exklusiv, avgiftsfri och världsomfattande rätt att göra just det och inget annat, och att låta våra leverantörer göra det åt oss: lagring, e-post och, när tryck finns, tryckeriet. I rätten ingår också att bilder du laddar upp får granskas automatiskt på vår egen server (avsnitt 7).',
        'Rätten upphör när du tar bort innehållet, utom i säkerhetskopior under den tid de sparas.',
        'Ett bord du spelat blir testdata för Deckster bara om du sagt ja till det, och då utan namn och fritext.',
      ],
    },
    {
      h: 'Det vi inte gör med ditt innehåll',
      ks: 'Vi publicerar inte, säljer inte och tränar inga modeller på det du gör.',
      body: ['Vi publicerar inte ditt spel, använder det inte i marknadsföring utan att fråga dig, säljer det inte och tränar inga modeller på det.'],
    },
    {
      h: 'Tillåtet innehåll och hur vi modererar',
      ks: 'Våld och mörka teman går bra. Explicit sexuellt innehåll trycks inte. Sexuellt innehåll som rör barn tolereras aldrig.',
      body: [
        {
          list: [
            '**Aldrig tillåtet:** olagligt innehåll, sexuellt innehåll som rör barn, sexuellt innehåll om verkliga personer utan deras samtycke, och intrång i andras rättigheter. Sexuellt innehåll som rör barn tas bort, kontot stängs och vi anmäler det alltid till polisen.',
            '**Tillåtet digitalt men trycks inte:** explicit sexuellt innehåll, om det är lagligt.',
            '**Tillåtet överallt:** våld och mörka teman.',
          ],
        },
        'Vi kan klassificera bilder du laddar upp automatiskt på vår egen server; ingen bild lämnar den för det. Under betan stoppar en sådan granskning ingenting och syns inte för dig.',
        'En automatisk träff stoppar aldrig något ensam: en människa granskar alltid. När tryck kan beställas granskar en människa också den första ordern för varje spel.',
      ],
    },
    {
      h: 'Betan',
      ks: 'Betan är gratis och kan ändras eller stängas. Tryckpaketet är ett exempel: inga riktiga priser och ingen beställning.',
      body: [
        'Under betan får du Deckster som den är, utan avgift. Den kan ändras, ligga nere eller behöva återställas från en säkerhetskopia, och då kan det senaste du gjort försvinna. Exportera det du inte vill förlora.',
        'Tryckpaketet är ett exempel. Testtryckeriet finns inte, priserna är påhittade och ingen beställning läggs. Inget i betan är ett erbjudande att sälja något.',
        'Vi stänger betan med minst 30 dagars varsel, och exporten är öppen hela tiden.',
      ],
    },
    { h: 'Abonnemang och betalning', ks: 'Under betan kostar ingenting.', waits: true, body: ['Skrivs när det finns något att betala för.'] },
    { h: 'Tryck och leverans', ks: 'Under betan trycks ingenting.', waits: true, body: ['Skrivs när tryck kan beställas.'] },
    {
      h: 'Anmälan och borttagning',
      ks: 'Ser du en bild som inte får finnas, anmäl den. Spärrar vi något får du veta varför och kan invända.',
      body: [
        'Anmäl en bild som du tror är olaglig eller gör intrång i dina rättigheter på [anmälningssidan](#anmal). Där skriver du vad det är, var det finns, varför det inte får finnas och vem du är, och att du lämnar uppgifterna i god tro. Gäller det en text, skriv till {contact}.',
        'Vi läser varje anmälan inom två arbetsdagar och mejlar beslutet till den adress du lämnat.',
        'Håller anmälan spärrar vi bilden i varje spel som använder den och berättar för varje ägare varför. Ägaren kan invända genom att svara på mejlet, och vi prövar beslutet igen inom två arbetsdagar.',
        'Den som gör intrång upprepade gånger får sitt konto stängt. Misstanke om brott som hotar någons liv eller säkerhet anmäler vi till polisen.',
      ],
    },
    {
      h: 'Ansvar',
      ks: 'Deckster körs på en server utan reserv. Exportera själv; dina rättigheter som konsument gäller alltid.',
      body: [
        'Deckster körs på en enda server utan reservström. Vi lovar ingen tillgänglighet, och vår säkerhetskopia ersätter inte din egen export.',
        'Vi svarar inte för indirekt skada eller förlorad vinst, och vårt ansvar är högst det du betalat oss de senaste tolv månaderna. Det gäller inte om vi orsakat skadan med avsikt eller genom grov vårdslöshet, och det inskränker aldrig de rättigheter du har som konsument enligt lag.',
      ],
    },
    {
      h: 'Uppsägning',
      ks: 'Du kan sluta när du vill. Stänger vi ditt konto får du skälen och 30 dagar att exportera.',
      body: ['Du kan sluta använda Deckster när du vill.', 'Vi får stänga ett konto som väsentligt bryter mot villkoren. Då får du veta skälen, och exporten är öppen i 30 dagar, utom när innehållet är olagligt.'],
    },
    {
      h: 'Ändringar i villkoren',
      ks: 'Varje version har ett datum och finns kvar. En väsentlig ändring får du veta 30 dagar innan, och du godkänner den igen.',
      body: [
        'Varje version av villkoren har ett datum och ligger kvar att läsa på den här sidan.',
        'En väsentlig ändring mejlar vi 30 dagar innan den börjar gälla, och du godkänner den nästa gång du kommer in. En redaktionell ändring, som en ny adress eller ett rättat ord, får du bara veta i ett mejl.',
      ],
    },
    {
      h: 'Lag och tvister',
      ks: 'Svensk lag gäller. Som konsument kan du alltid vända dig till Allmänna reklamationsnämnden.',
      body: [
        'Svensk lag gäller. Bor du i ett annat land behåller du det skydd som tvingande regler där ger dig som konsument.',
        'Tvister prövas av svensk allmän domstol. Som konsument kan du också vända dig till Allmänna reklamationsnämnden, arn.se.',
      ],
    },
    {
      h: 'Integritet',
      ks: 'Vad vi sparar om dig och hur det raderas står i integritetstexten.',
      body: ['Vad vi sparar om dig och om gästerna vid ditt bord, varför, hur länge och hur det raderas står i [integritetstexten](#integritet).'],
    },
  ],
}

// What is true today (beställarens beslut 3, 2026-10-24). What can no longer be used is swept (#1277),
// and a guest's names and free text are masked after twelve months and with a game taken away, with
// the ledger run again after a restore (#1279). Profil's download and erase (#1280) and the guest's
// own way from her phone (#1281) are not built, so the text does not say them: any other erasure is a
// letter to Kontakt. Each slice brings its own line in here when it lands.
const privacy: Document = {
  title: 'Integritet i Decksters beta',
  sections: [
    {
      h: 'Vem som ansvarar',
      ks: 'Den som driver Deckster ansvarar för alla personuppgifter i tjänsten, också gästernas.',
      body: [
        'Personuppgiftsansvarig är {name}, {address}, som driver Deckster under betan. Det gäller allt som sparas i Deckster, också det gäster lämnar vid en designers bord.',
        'Den som äger ett spel får läsa det gästerna lämnat, men bara för att utveckla spelet. Frågor och begäran skickar du till {contact}.',
      ],
    },
    {
      h: 'Om du har ett konto',
      ks: 'Din e-postadress, ditt namn, dina spel och det som behövs för att logga in.',
      body: [
        {
          list: [
            'Din e-postadress och ditt namn, om du satt ett.',
            'Att du godkänt villkoren, vilken version och när.',
            'Dina passkeys: den publika nyckeln, webbläsaren och när den användes senast.',
            'Din AI-nyckel, krypterad, om du lagt in en.',
            'Dina spel, deras versioner, bilder och typsnitt, och adresserna du bjudit in.',
            'En kaka som håller dig inloggad.',
          ],
        },
        'Vi behandlar det för att kunna ge dig tjänsten, alltså enligt avtalet med dig. Inloggningslänkar, spärrar mot för många försök och säkerhetskopior har vi för att hålla tjänsten säker, vilket är ett berättigat intresse.',
      ],
    },
    {
      h: 'Om du är gäst vid ett bord',
      ks: 'Namnet du skriver, dina drag, anteckningar, flaggor och enkätsvar. Alla vid bordet ser dem medan ni spelar, och spelets ägare efteråt.',
      body: [
        'När du sätter dig vid ett bord sparar vi namnet du skriver, dina drag, dina anteckningar och flaggor, och dina enkätsvar.',
        'Medan ni spelar ser alla vid bordet dem. Efteråt ser spelets ägare och de hen delar spelet med dem. Ingen annan.',
        'Du väljer själv att sätta dig och att svara. Vi behandlar det därför på ett berättigat intresse, utan samtyckesruta. Gäster åldersprövas inte.',
      ],
    },
    {
      h: 'Hur länge vi sparar',
      ks: 'En gästs namn och fritext tas bort efter ett år, och direkt när spelet tas bort. Vill du att något annat raderas, skriv till oss.',
      body: [
        {
          list: [
            '**Ditt konto och dina spel:** så länge kontot finns. Ett konto som inte används raderas inte under betan.',
            '**Gäst utan konto:** namn och fritext tas bort 12 månader efter att bordet avslutades. Spelet och enkätens siffror står kvar utan namn.',
            '**Gäst som sparat till ett konto:** så länge kontot finns.',
            '**Ett borttaget spel:** namnen och fritexten vid dess bord, och enkätsvaren, tas bort direkt.',
            '**Inloggningslänkar och kakor:** en länk gäller i 15 minuter och kakan i 30 dagar, och vi tar bort dem när de inte längre går att använda.',
            '**Inbjudningar:** 30 dagar efter att de använts eller gått ut.',
            '**Säkerhetskopior:** åtta dagar. Efter en återställning tar vi bort det som raderats igen.',
          ],
        },
        'Vill du att något raderas tidigare, ditt konto eller det du lämnat som gäst, skriver du till {contact}. Den här texten ändras när det finns fler vägar.',
      ],
    },
    {
      h: 'Vilka andra som får uppgifter',
      ks: 'Cloudflare, som står framför servern och lagrar bilder i EU, och Resend, som skickar mejlen. Ingen analys och ingen spårning.',
      body: [
        {
          list: [
            '**Cloudflare** står framför vår server och lagrar bilder och tryckfiler i sin europeiska jurisdiktion.',
            '**Resend** skickar inloggnings- och inbjudningsmejlen och får då adressen och länken. Resend finns i USA; överföringen sker under {transfer}.',
            '**Google:** typsnittsväljaren i editorn hämtar typsnitt direkt från Google Fonts, som då ser din IP-adress.',
          ],
        },
        '{processors} Vi använder inga analysverktyg och ingen reklam. Den enda kakan håller dig inloggad, och därför finns ingen kakruta.',
      ],
    },
    {
      h: 'Speltester som testdata',
      ks: 'Bord kan bli testdata för Deckster, men bara utan namn och fritext.',
      body: ['För att hitta fel spelar vi ibland upp bord igen. Då byts alla namn och all fritext ut innan något sparas utanför servern, och den råa kopian sparas aldrig. Bord ur andras spel används bara om spelets ägare sagt ja.'],
    },
    {
      h: 'Dina rättigheter',
      ks: 'Du kan få se, rätta, flytta och radera det vi har om dig. Skriv till oss.',
      body: [
        'Du har rätt att få veta vad vi har om dig, få det rättat, raderat eller utlämnat i ett format du kan ta med dig, och att invända mot det vi gör på ett berättigat intresse.',
        '**Med konto:** skriv till {contact}. Ditt namn kan du själv ändra eller ta bort i Profil.',
        '**Som gäst:** skriv till {contact} med spelets namn, ungefär när ni spelade och namnet du satt under.',
        'Är du inte nöjd med hur vi svarar kan du klaga hos Integritetsskyddsmyndigheten, imy.se.',
      ],
    },
    {
      h: 'Ändringar',
      ks: 'Varje version har ett datum och ligger kvar.',
      body: ['Varje version av den här texten har ett datum och ligger kvar att läsa. Ändras något väsentligt får du ett mejl.'],
    },
  ],
}

// The five lines the step says, out of «Kort sagt»: what one actually promises and gets.
const summary = [
  'Det du gör i Deckster är **ditt**, och du kan exportera allt när som helst.',
  'Du lovar att du har **rätt till** det du laddar upp, och att det inte bryter mot lag.',
  'Vi lagrar och visar ditt innehåll bara för att tjänsten ska fungera, och **tränar inga modeller** på det.',
  'Betan är **gratis** och kan ändras eller stängas. Tryckpaketet är ett exempel och inget erbjudande.',
  'Du måste vara **18 år**. Gästerna vid ditt bord svarar du för.',
]

// Every version's text, under the version the server's register names it by (`TERMS`, #1270). A test
// holds the two to each other, so a version the box asks for always has its text here.
export const TEXTS: Readonly<Record<string, TermsText>> = {
  '2026-10-25': { version: '2026-10-25', terms, privacy, summary },
}

// The text of a version, or the newest there is when the version is unknown here — a page older than
// the box's register, which then shows the newest text it has rather than nothing.
const NEWEST: TermsText = Object.values(TEXTS).reduce((a, b) => (b.version > a.version ? b : a))
export function textOf(version: string | null): TermsText {
  return (version !== null ? TEXTS[version] : undefined) ?? NEWEST
}
