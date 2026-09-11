# Runbook — lådan

Hur tjänsten sätts upp, deployas, verifieras och återställs på hemmaservern.
Besluten bakom stegen står i [DRIFT.md](../DRIFT.md); det här dokumentet är bara handgreppen, i ordning.

Allt nedan körs på lådan, i `/opt/build-your-deck`, om inget annat sägs.

---

## 1. Innan du börjar

Du behöver:

- En Ubuntu-låda med Docker och Compose, och ett konto som får köra `docker`.
- En domän i Cloudflare, för tunneln och för inloggningslänkarna.
- Valfritt men rekommenderat: R2 (assets och backup), Resend (inloggningsmejl), Tailscale (administration).

Vad som händer om något av det valfria saknas:

| Saknas | Konsekvens |
|---|---|
| R2 | Texturer och uppladdade bilder ligger kvar i Postgres och går genom lådans uppström; ingen WAL-arkivering, alltså **ingen backup** (DRIFT §4, §5). |
| Resend | Inloggningslänken skrivs i `app`-containerns logg i stället för att mejlas; bara den som når loggen kan logga in (DRIFT §12). |
| Tailscale | Administration sker över SSH på det lokala nätet; Postgres lyssnar ändå bara på lådans `127.0.0.1` (DRIFT §10). |

## 2. Ny låda från noll

```bash
sudo git clone https://github.com/Tiico/build-a-deck.git /opt/build-your-deck
cd /opt/build-your-deck
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

Minsta `.env` som duger i produktion:

```sh
POSTGRES_PASSWORD=<något långt och slumpat>
PUBLIC_ORIGIN=https://<ditt värdnamn>
CLOUDFLARE_TUNNEL_TOKEN=<token från Cloudflare, steg 3>
BYD_REGISTRY=ghcr.io/tiico/build-a-deck
```

`PUBLIC_ORIGIN` är inte kosmetik: den avgör vart inloggningslänkarna pekar och om sessionskakan får `Secure`.
Utan den fungerar inloggning inte som den ska bakom tunneln.

Värden som innehåller mellanslag måste citeras, eftersom filen läses både av Compose och av systemd:

```sh
MAIL_FROM="build-your-deck <login@ditt-värdnamn>"
```

Lägg till `R2_*` och `RESEND_API_KEY` när de finns; `.env.example` beskriver varje rad.
Sätt aldrig `AUTH_BYPASS` här — stacken skickar den inte vidare till containern, men raden vilseleder nästa läsare.

Koppla in deployen och kör den första gången:

```bash
sudo cp ops/byd-deploy.service ops/byd-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now byd-deploy.timer
ops/deploy.sh --force
```

Timern pollar var femte minut efter en nyare `v*`-tagg; `--force` kör om även om lådan redan står på den nyaste.

## 3. Tunneln i Cloudflare

Tunneln är enda vägen in; inga portar öppnas mot bostadsnätet (DRIFT §2).

1. Zero Trust → Networks → Tunnels → skapa en tunnel av typen *Cloudflared*.
2. Kopiera tunnelns token till `CLOUDFLARE_TUNNEL_TOKEN` i `.env`. Kör inte installationskommandot Cloudflare visar: `cloudflared` körs som en container i stacken, inte som en tjänst på lådan.
3. Lägg till en *Public hostname*: ditt värdnamn, tjänst `HTTP`, URL `app:8080`.
4. `ops/deploy.sh --force` igen, så att `tunnel`-profilen startar med token på plats.

WebSockets behöver ingen inställning; tunneln bär dem.

## 4. Första verifieringen

```bash
curl -s http://127.0.0.1:8080/health          # på lådan
curl -s https://<ditt värdnamn>/health        # utifrån, genom tunneln
docker compose ps
docker compose logs -n 50 app
```

`/health` svarar `{"ok":true,...}` bara när Postgres svarar, och när R2 är konfigurerat även att bucketen går att läsa (DRIFT §2).
Ett `503` här är svaret på frågan om tjänsten lever — inte att processen råkar vara igång.

Gå sedan hela vägen en gång, i en webbläsare mot det publika värdnamnet:

1. Logga in med din e-postadress. Utan Resend hämtas länken ur loggen: `docker compose logs app | grep '"msg":"mail"'`.
2. Skapa ett spel i wizarden, öppna editorn, tryck "Uppdatera bordet".
3. Öppna bordet i TV-läge och anslut en telefon med QR-koden.
4. Spela ett kort, och kontrollera att det syns på bordet.

Det är den tunna skivan, körd skarpt.

## 5. Att deploya: en tagg är en release

`main` är trunk och deployas aldrig i sig (DRIFT §7).
Lådan kör den nyaste `v*`-taggen som nås från `origin/main`.

Från en utvecklingsmaskin:

```bash
git checkout main && git pull
git tag v0.2.0 && git push origin v0.2.0
```

Taggen startar CI, som bygger `app`-, `render`- och `postgres`-bilderna till GHCR märkta med commitens SHA.
Lådan hämtar dem vid nästa tick, kör schemamigreringen vid appens start och väntar på `/health`.
Är CI inte klar säger lådan `images-not-ready` och försöker igen om fem minuter; ingenting hinner gå sönder däremellan.

Följ deployen på lådan:

```bash
journalctl -u byd-deploy.service -f
```

Att rulla tillbaka är att tagga om från en äldre commit — eller, om det brådskar, `git reset --hard <äldre tagg> && ops/deploy.sh --force`, med vetskapen att nästa tick tar lådan tillbaka till den nyaste taggen.

## 6. Backup och återställning

Med R2-nycklar i `.env` arkiverar Postgres varje färdigt WAL-segment inom en minut och `backup`-containern tar en basbackup per natt (DRIFT §5).

```bash
docker compose --profile backup run --rm --no-deps backup /usr/local/bin/backup.sh list   # vad som finns
ops/restore-test.sh                                                                        # prova tillbaka
```

`ops/restore-test.sh` hämtar senaste basbackupen och allt WAL efter den till en tillfällig Postgres, räknar sessioner och rader, och spelar upp den senaste sessionens logg genom motorn.
Kör det efter första natten, och därefter med jämna mellanrum: en backup som aldrig lästs tillbaka är en förhoppning.

**Återställning från noll**, när lådan eller disken är borta:

1. Sätt upp den nya lådan enligt steg 2, med **samma** `R2_*`-nycklar och samma `POSTGRES_PASSWORD`, men starta inte stacken än.
2. Skapa den tomma datavolymen och fyll den ur R2, som `postgres`-användaren i backup-bilden:

   ```bash
   docker compose create postgres
   docker compose --profile backup run --rm --no-deps -T --user postgres \
     -v build-your-deck_pgdata:/restore backup sh -eu -c '
       wal-g backup-fetch /restore LATEST
       touch /restore/recovery.signal
       printf "restore_command = '\''wal-g wal-fetch %%f %%p'\''\nrecovery_target_timeline = '\''latest'\''\n" >> /restore/postgresql.auto.conf
     '
   ```

3. `ops/deploy.sh --force`. Postgres startar på den återställda katalogen, spelar upp WAL till slutet och lämnar återställningsläget själv.
4. Verifiera enligt steg 4, och kontrollera att den senaste sessionen finns: `docker compose exec postgres psql -U byd -d byd -c 'select count(*) from events'`.

Vägen i steg 2 är densamma som `ops/restore.sh` går i sin tillfälliga katalog, men mot den riktiga volymen.
Det som är provat varje gång `ops/restore-test.sh` körs är att bytesen i R2 går att läsa tillbaka och att loggen spelar upp; att peka dem på den riktiga volymen är resten.

## 7. När något går fel

| Symptom | Vad det betyder |
|---|---|
| `{"msg":"images-not-ready"}` | CI har inte byggt klart bilderna för taggens SHA. Lådan står kvar där den står och försöker igen. Håller det i sig: ett paket som CI skapar för första gången blir **privat** i GHCR, även för ett publikt repo. Sätt det till publikt (GitHub → Packages → paketet → Package settings → Change visibility) eller lägg en `read:packages`-token i `GHCR_TOKEN`. |
| `{"msg":"deploy-unhealthy"}` | Stacken startade men `/health` svarade inte på en minut. `docker compose logs app` säger varför; oftast Postgres. |
| `{"msg":"no-release"}` | Ingen `v*`-tagg nås från `origin/main`. Tagga. |
| `/health` ger 503 med `assets` | R2-nycklarna är fel eller bucketen finns inte. Texturer slutar visas; spelet i övrigt lever. |
| Inloggningsmejlet kommer inte | Ingen `RESEND_API_KEY`, eller avsändardomänen är inte verifierad. Länken finns i `docker compose logs app`. |
| Inloggning loopar tillbaka till inloggningskortet | `PUBLIC_ORIGIN` matchar inte värdnamnet i webbläsaren, så kakan sätts på fel origin. |
| Allt är nere och ingen vet | Lådan kan inte berätta att den är nere (DRIFT §8). Signalen är en användare som hör av sig. |

En buggrapport behöver bara ett sessions-id och ett seq-nummer: `replay` till den punkten ger exakt det tillstånd användaren såg.
