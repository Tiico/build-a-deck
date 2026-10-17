// Varianterna i prototyp 01 (#682): vad de är, och vad main redan gör. Mätningen står i data.js.
window.V = {
  nu: {
    namn: 'Nu · bara uppläsningen',
    kort: 'Nu',
    om: `<p>Det main gör i dag. Meningen finns — «Ingen sitter vid C än, så kortet går tillbaka.» och «Bordet blandade Kortlek» — men bara i appens live-region, 1 × 1 px. Den som står vid skärmen ser kortet hoppa tillbaka och högen fläktas (L35), utan ett ord, och kan inte läsa efteråt vad som hände.</p>`,
  },
  a: {
    namn: 'A · Vid kortet',
    kort: 'A',
    om: `<p>D5 ordagrant: meningen står där handen just var. Ett avvisat släpp sägs vid punkten där kortet släpptes; det som hände sägs vid högen det hände med. Plattan är filtens egen (mörk, krita, 24 px) och läggs under, över, vänster eller höger om punkten — den första sidan som inte täcker något — och bryter till två rader hellre än att täcka ett kort. Står 4 s och tonar bort på 0,6 s; nästa mening ersätter den.</p>
<ul><li class="plus">Läses där blicken redan är, och pekar på vad det gällde.</li><li class="plus">Kostar inget när inget händer.</li><li class="minus">Borta efter 4 s: den som tittade bort läser ingenting efteråt — fyndets andra halva står kvar.</li><li class="minus">På ett trångt bord måste den vika undan, och var den hamnar varierar.</li></ul>`,
  },
  b: {
    namn: 'B · Raden i hörnet',
    kort: 'B',
    rek: true,
    om: `<p>En rad nere till vänster, spegelbild av «Starta om» och «?» nere till höger, på samma platta i 24 px. Den säger alltid det senaste som hände — «Senast: Bordet blandade Kortlek · för 11 s sedan», som /online:s rad (#484) — och står kvar tills något nytt händer. Ett avvisat drag tar raden i bärnsten i 6 s och lämnar den sedan till det senaste som hände. Raden bryter före platsen A:s namnbricka.</p>
<ul><li class="plus">Går att läsa efteråt, och står på samma ställe varje gång.</li><li class="plus">Ligger på träet och mörkret utanför filten: täcker inget kort vid något mått.</li><li class="minus">Inte vid kontrollen som D5 säger: ögat måste gå från kortet till hörnet.</li><li class="minus">Vid 1024 bryter den långa meningen till två rader.</li></ul>`,
  },
  c: {
    namn: 'C · Toppens band',
    kort: 'C',
    om: `<p>Raden står i bandet ovanför träet, till höger om plattan med spelets namn och adress (#675) — samma beteende som B (senaste kvar, avvisat i bärnsten 6 s), men uppe, högerställt, där filten inte är. Allt bordet säger om sig självt står då på en rad överst.</p>
<ul><li class="plus">Filten och hörnen är orörda; namn, adress och det senaste läses på en rad.</li><li class="minus">Bandet är bara 44–50 px högt: en mening som bryter till två rader går ned över träet och platsen B:s antal.</li><li class="minus">Längst bort från spelaren vid A, och upp-och-ned för den som sitter vid B.</li></ul>`,
  },
  d: {
    namn: 'D · Två håll',
    kort: 'D',
    om: `<p>Bordsläget är skärmen som ligger ned med folk runt om (C5, #418: namnen är namnkort). Raden skrivs därför två gånger: nere till vänster för den som sitter vid A och uppe till höger, vänd ett halvt varv, för den som sitter mittemot. Står 5 s och tonar bort, som A.</p>
<ul><li class="plus">Den enda varianten som läses från båda långsidorna.</li><li class="minus">Två rader att se för en mening, och den upp-och-nedvända är brus för den som sitter vid A.</li><li class="minus">Tonar bort som A: inget att läsa efteråt.</li></ul>`,
  },
}
window.K = {
  nu: {
    namn: 'Nu · inget',
    kort: 'Nu',
    om: `<p>Hörnet har «Starta om» och «?». Ångra bor på telefonerna (K13) och avsluta i telefonens huvud och i editorns Bord-flik (C9). En grupp som spelar på filten utan telefoner kan varken ta tillbaka ett feldrag eller avsluta, och skärmen säger inte var det görs.</p>`,
  },
  a: {
    namn: 'A · Säg var',
    kort: 'A',
    om: `<p>Inga nya knappar. Bredvid «Starta om» står en stilla mening: «Ångra och avsluta gör ni på en telefon vid bordet, eller i editorns Bord-flik.» K13:s «skärmen har inga knappar» står kvar ordagrant.</p>
<ul><li class="plus">Ingenting nytt att bygga, och inget som kan tryckas av misstag på ett delat bord.</li><li class="minus">Gruppen utan telefoner får veta att den inte kan — ett feldrag rättas fortfarande bara genom att dra tillbaka för hand, och ett bord som ingen avslutar står öppet till dygnets timeout (C9).</li></ul>`,
  },
  b: {
    namn: 'B · Ångra i raden',
    kort: 'B',
    om: `<p>Raden från fråga 1 bär «Ångra» så länge det senaste som hände var bordets eget drag (plats null) — ett tryck tar tillbaka det, som telefonens ångra gör för en plats. Har en telefon spelat sedan dess står ingen knapp: bordet föreslår ingen tillbakaspolning (K13). «Avsluta…» står i hörnet bredvid «Starta om» och frågar med telefonens egna ord innan något händer.</p>
<ul><li class="plus">Ångra står där meningen om draget står: man ser vad som tas tillbaka.</li><li class="minus">En tredje knapp i hörnet, och «Avsluta…» syns hela spelet för alla runt bordet.</li><li class="minus">Med A:s rad (som tonar bort) försvinner ångra med den.</li></ul>`,
  },
  c: {
    namn: 'C · ⋯ i hörnet',
    kort: 'C',
    rek: true,
    om: `<p>En knapp, «⋯», mellan «Starta om» och «?». Den öppnar en meny med två rader: «Ångra bordets senaste drag» med draget utskrivet under, och «Avsluta bordet…» som frågar med telefonens egna ord (C9) och öppnar på «Inte än». Har en telefon gjort det senaste draget är ångra nedtonad och säger var det görs i stället.</p>
<ul><li class="plus">Diskret: en rund knapp till, och inget som kan avsluta ett bord på ett tryck.</li><li class="plus">Säger vad ångra tar tillbaka innan det görs, och varför det inte går när det inte går.</li><li class="minus">Två tryck till ångra, mot ett i B.</li></ul>`,
  },
}
window.REK = { v: 'b', k: 'c' }
window.MAIN_GOR = `<h3>Vad main redan gör (origin/main 2026-10-17)</h3>
<ul>
<li><b>Vägen in (#675, beslut C) är byggd:</b> plattan uppe till vänster säger spelets namn, versionen som ord (#703) och adressen <code>värd/KOD</code>. Ingen QR i bordsläget, som beslutet sa. Det är plattan bilderna visar.</li>
<li><b>Meningarna finns redan:</b> <code>TableRenderer</code> säger «Ingen sitter vid C än, så kortet går tillbaka.» (<code>drop.nobody</code>, #482) och «Bordet har inte svarat på draget än.» (<code>drop.unanswered</code>), och <code>useActivityLive</code> säger varje rad i flödet — «Bordet blandade Kortlek» — men bara i live-regionen. Prototypen läser just de meningarna; inget nytt i katalogen behövs.</li>
<li><b>Avvisningen sägs polite</b>, fast D5 säger assertive för «något någon bad om hände inte». Och ett drag som <em>servern</em> avvisar sägs inte alls: bordslägets <code>onAct</code> kastar svaret från <code>client.send</code> (<code>void</code>), liksom filtens på /online. Bara de två avvisningar klienten själv ser — tom plats och inget svar — har en mening.</li>
<li><b>Det som syns i dag:</b> blandningen fläktas på högen (L35) och ett drag ringas i 1,6 s (<code>RECENT_MS</code>). TV:n säger orden under högen (#718) och har SENAST i spalten; /online har «Senast:»-raden (#484). Bordsläget har ingetdera.</li>
<li><b>Ångra och avsluta för bordet behöver inget nytt verb:</b> servern tar redan emot <code>undo.self</code> och <code>session.end</code> från bordets egen anslutning (plats null), och motorns <code>undoTarget</code> räknar redan för plats null. Det som saknas är att projektionen säger <code>undo</code> för bordet — i dag är den alltid null för plats null (<code>project.ts</code>) — så att skärmen vet om det finns något att ångra utan att räkna ur loggen (K13).</li>
</ul>`
