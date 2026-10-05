# Prototyp #789 — kortets namn på en hög utan bild, i bordsläget

Beställaren valde 2026-10-05 att prototypa C (#771:s bildtext på en egen platta under högens handtag) mot D (namnet kvar på kortet i 12 px med ellips).

Öppna `prototyper/index.html` över http:

```
cd docs/ux-audits/2026-10-05-hogens-namn/prototyper && python3 -m http.server 8789 --bind 127.0.0.1
```

och gå till `http://127.0.0.1:8789/01-hogens-namn.html?v=c`.

Bilderna i `prototyper/img/` är det byggda appen, inte ritningar.
`prototyper/matning/rig.mts` ställer upp e2e-stacken med två Sal's Saloon-bord (fyra och åtta platser), `shoot.mjs` injicerar varje variants CSS ur `variants.mjs`, mäter med `page.js` och tar bilderna, och `mk-data.mjs` skriver `data.js`.
Matningskatalogen behöver `node_modules` som en länk till `packages/e2e/node_modules`.

Rekommendationen är C; motiveringen står längst ner i prototypen och i issuet.
