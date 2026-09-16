# UX-prototyper 16 september 2026 — #128, #129, #130, #131, #132

Engångskod.
Sparar ingenting, har inga tester och laddas bara i DEV.
Den är underlag för fem designbeslut, inte början på en implementation — implementationen grenas ur `origin/main` på nytt.

## Frågan varje fynd svarar på

| Issue | Frågan |
| --- | --- |
| #132 | Vilken rytm sitter de andra fyra på? |
| #128 + #130 | Vad äger en flikpanel överst, och vad skrollar under det? |
| #129 | Hur slutar gruppremsan dölja sig själv, och hur får duken bredd vid 1024? |
| #131 | Vad är en tom regelflik? |

#128 och #130 är samma fråga på tre ytor — kortväggen, symbolerna och datafliken — och prototypas
därför som **en** mekanism i taget, tillämpad på alla tre, inte som två oberoende lösningar.

## Kör

```
PORT=5199 pnpm --filter @byd/web dev
```

Öppna `http://localhost:5199/ux16`.
Adressen bär hela läget:

```
/ux16?fynd=skala|krona|grupper|regler&variant=A|B|C&yta=vagg|symboler|data&shot=1
```

Vänster- och högerpil växlar variant.
`shot=1` krymper växlaren till en etikett, så skärmbilder visar layouten och inte verktyget.

## Mätaren

Varje vy bär en rad med de tal fynden faktiskt handlar om: fönstrets bredd, krönhöjden (avståndet
från chromets underkant till arbetets första pixel), antalet skrollytor, hur många av dem som
ligger inuti en annan, och om fönstret självt skrollar.
Talen står i varje skärmbild, så en variant kan inte se bra ut och kosta något annat än den säger.

## Vad som är riktigt och vad som är simulerat

Ingenting här talar med servern.
Leken är syntetisk men i rätt storleksordning: 77 kort, tretton filter, elva grupper, tolv lager.
Talen är det som gör mätningarna ärliga; texterna är påhittade.

## Efter designvalet

Skriv in valet i `DESIGN-BESLUT.md`, implementera med TDD på en gren ur `origin/main`, och ta
sedan bort den här mappen och `/ux16`-grenen i `App.tsx`.
