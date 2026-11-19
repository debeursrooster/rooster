# Personeelsrooster – Cafetaria & Zalencentrum

Een webapp waarmee de eigenaar roosters maakt, en waarmee het personeel het rooster bekijkt, vrij vraagt en diensten ruilt. Er is niets te installeren: het werkt in de browser op telefoon, tablet en pc.

| Pagina | Voor wie | Wat |
|---|---|---|
| `index.html` | Personeel | Inloggen met naam en PIN, eigen diensten, weekrooster, vrij vragen, doorgeven wanneer je niet kunt, ruilen, open diensten oppakken, diensten in je telefoonagenda zetten |
| `beheer.html` | Eigenaar | Overzicht, rooster maken/aanpassen/publiceren, personeel, vaste cafetaria-diensten, agenda zalencentrum, aanvragen goedkeuren, prikbord, instellingen |

---

## 1. Eerst uitproberen (demo)

Open `beheer.html` (code **0000**) of `index.html` (bv. Sandra **1111**, Mark **2222**). Zolang `js/config.js` leeg is, draait de app in **demo-modus** met voorbeeldgegevens. Die worden alleen in die ene browser bewaard.

> Lokaal openen via dubbelklikken werkt in de meeste browsers. Lukt dat niet, start dan een mini-server in de map: `python -m http.server` en ga naar http://localhost:8000/beheer.html

---

## 2. Echt in gebruik nemen (gratis)

### Stap A – Database (Supabase)
1. Maak een gratis account op https://supabase.com en een **New project** (regio: Frankfurt/EU).
2. Ga naar **SQL Editor → New query**, plak de inhoud van `supabase/schema.sql` en klik **Run**.
3. Ga naar **Project Settings → API** en noteer:
   - **Project URL** (bv. `https://abcd1234.supabase.co`)
   - de **anon public** key
   - de **service_role** key (geheim! alleen voor stap C)
4. Vul URL en anon-key in bij `js/config.js`.

### Stap B – Website (GitHub Pages)
1. Maak op GitHub een nieuwe repository (bv. `rooster`) en upload alle bestanden uit deze map, inclusief de map `.github`.
2. **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
3. Na een minuut staat de site op `https://<gebruikersnaam>.github.io/rooster/`.
   - Personeel: `…/rooster/` (index.html)
   - Eigenaar: `…/rooster/beheer.html`

### Stap C – Automatisch rooster (GitHub Actions)
1. In de repository: **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_URL` = de Project URL
   - `SUPABASE_SERVICE_KEY` = de service_role key
2. Klaar. Elke ochtend controleert GitHub of er uitvragen voor feesten verlopen zijn (die worden dan ingepland) en of het tijd is voor het nieuwe maandrooster. Standaard is dat **21 dagen voor het einde van de maand**; dat is in te stellen. Dan wordt het rooster voor de volgende maand gemaakt.
3. Testen kan via het tabblad **Actions → Automatisch rooster maken → Run workflow**.

> Ook zonder stap C wordt het rooster gemaakt. Dat gebeurt dan zodra de eigenaar `beheer.html` opent na de ingestelde datum.

### Stap D – Inrichten
1. Log in op `beheer.html` met code **0000** en wijzig die meteen bij **Instellingen**.
2. **Instellingen**: bedrijfsnaam en functies (Bediening, Frituur, Bar…).
3. **Cafetaria**: per weekdag de vaste diensten (tijden, functie, aantal mensen), plus sluitingsdagen.
4. **Personeel**: iedereen toevoegen met functies, locaties, contracturen, vaste werkdagen en dagen waarop iemand nooit kan. Na het opslaan kun je de link en PIN direct via WhatsApp sturen.
5. **Zalencentrum**: feesten in de agenda zetten met de benodigde bezetting. De knop *Voorstel op basis van gasten* vult die alvast in.

---

## 3. Hoe het rooster gemaakt wordt

Voor elke dienst die ingevuld moet worden, kijkt de planner wie er **kan**:
- heeft de juiste functie en werkt op die locatie (cafetaria/zalen);
- heeft geen goedgekeurd vrij, geen vaste vrije dag en heeft niet doorgegeven dat hij of zij niet kan;
- werkt op dat moment niet al ergens anders en zit nog onder het maximaal aantal dagen per week.

Uit die mensen kiest de planner wie het **beste past**:
- **vaste werkdag** krijgt voorrang;
- wie nog het meeste **uren tekort** komt op zijn contract (contracturen × dagen in de maand ÷ 7);
- liever geen twee diensten op één dag, liever geen vroege dienst na een late avond;
- **oproepkrachten** (0 contracturen) komen pas aan de beurt als het anders niet lukt;
- wie vrij heeft aangevraagd dat nog niet is goedgekeurd, wordt zo veel mogelijk ontzien.

Lukt het niet om een dienst in te vullen, dan blijft hij **open** (rood) en komt hij in de lijst *aandachtspunten*. Het personeel kan open diensten zelf oppakken.

**Werkwijze per maand:**
1. Personeel geeft vóór de ingestelde dag door wanneer ze niet kunnen, en vraagt vrij.
2. Het rooster wordt automatisch gemaakt als **concept**. Dat is nog niet zichtbaar voor personeel.
3. De eigenaar krijgt een **pushbericht op zijn telefoon** (zie *Meldingen op je telefoon*) en ziet het ook bovenaan het Overzicht. Hij kijkt het rooster na, klikt op diensten om iemand anders te kiezen (de beste kandidaten staan bovenaan) en klikt op **Versturen naar personeel**.
4. Alleen wie is ingeroosterd krijgt een persoonlijke melding, bijvoorbeeld: *"Je bent 14× ingeroosterd (68,5 uur). Eerste dienst: donderdag 3 december."* Met één klik zet je ook een bericht in de WhatsApp-groep.

### Feesten en oproepkrachten (uitvraag)
1. De eigenaar zet een feest in de agenda met *Oproepkrachten laten reageren* aangevinkt. Dat staat standaard aan.
   Meerdere feesten tegelijk? Gebruik **+ Meerdere feesten**: alle datums in één scherm, en elke oproepkracht krijgt **één bericht** met alle nieuwe datums waarop hij of zij kan werken.
2. Alle oproepkrachten met een passende functie krijgen een melding. In de app zien ze bovenaan **"Kun jij op deze feesten?"** en klikken per feest op *Ik kan* of *Kan niet*. Tot het einde van de termijn kunnen ze hun antwoord nog wijzigen.
3. De termijn is standaard **7 dagen**, in te stellen bij Instellingen, en eindigt uiterlijk 2 dagen voor het feest. Twee dagen voor het einde krijgt wie nog niet reageerde een herinnering.
4. Na de termijn worden alle feesten waarvan de termijn is verlopen **samen** ingepland:
   - eerst **vast personeel**, zolang ze nog niet aan hun contracturen zitten en niet al ingepland zijn;
   - daarna **oproepkrachten die "kan" zeiden**, eerlijk verdeeld: wie de afgelopen drie maanden het minst heeft gewerkt, gaat voor. Wie het eerst reageerde, krijgt **geen** voorrang. Bij een gelijke stand beslist het toeval, niet de naam;
   - wie niet reageerde of "kan niet" zei, wordt niet ingepland.
5. De eigenaar krijgt een pushbericht: het feest staat klaar om te **controleren**. Het personeel ziet nog niets.
6. Na controle klikt hij bij Zalencentrum op **Versturen**. Wie is ingeroosterd krijgt een melding, en oproepkrachten die "kan" zeiden maar niet nodig zijn krijgen ook bericht. Het feest staat dan meteen in het rooster van het personeel, ook als het maandrooster nog niet verstuurd is.
7. Wil de eigenaar niet wachten? In het feest staat de knop **Nu inplannen**. Hij ziet daar ook per oproepkracht wat die heeft geantwoord. Op de pagina Zalencentrum staat een overzicht van hoe het werk verdeeld is.

### Diensten ruilen
- Bij **Kan niet** kies je:
  - **Iedereen die kan**: je dienst wordt aangeboden en wie hem als eerste overneemt, krijgt hem.
  - **Een collega met wie je het al hebt afgesproken**: die collega krijgt een verzoek en bevestigt met *Ja, akkoord* (of zegt nee).
- Optioneel kies je een **dienst van die collega die jij ervoor terugneemt**. Dan is het een echte ruil en worden beide diensten omgewisseld.
- Zijn beide collega's akkoord, dan keurt de baas het goed. Pas dan is er echt geruild. Goedkeuren door de baas kan ook uit bij Instellingen.

### Ziek melden
1. Een medewerker tikt in de app op **🤒 Ziek melden**, vinkt aan welke diensten vervallen en kiest vanaf wanneer. Er wordt **niet** gevraagd wat iemand heeft; dat mag een werkgever niet vastleggen.
2. Daarna verschijnt meteen een grote knop **📞 Bel Ricardo** met zijn nummer. Naam en nummer stel je in bij Instellingen.
3. Ricardo krijgt een melding (en een pushbericht als ntfy is ingesteld). Bij **Aanvragen → Ziek** klikt hij op **Bevestigen** zodra de medewerker heeft gebeld. Per dienst stelt de app een vervanger voor. Kiest hij "open laten", dan krijgen collega's die kunnen een bericht om de dienst op te pakken.
4. Wie ziek is wordt niet ingeroosterd tot hij of zij zich **beter meldt**. Dat kan de medewerker zelf doen, of Ricardo.
5. Onder **Verzuim** staat per medewerker over de afgelopen 12 maanden: aantal meldingen, ziektedagen, gemiste diensten en hoe lang van tevoren er gemiddeld is gemeld. Er staan signalen bij, zoals *gesprek aanbevolen*, *vaak kort van tevoren* of *vaak op zondag*. Klik op een naam om de geschiedenis te zien en gesprekken en afspraken vast te leggen.

**Wat er gebeurt na het publiceren:**
- *Automatisch versturen*: wil de eigenaar niet eerst controleren, zet dan bij Instellingen *"Automatisch gemaakt rooster meteen versturen"* aan. Dat geldt voor maandroosters en voor feesten.
- *Vrij goedkeuren* → als iemand al stond ingepland, zoekt de app zelf een vervanger en laat zien wie dat wordt.
- *Feest toevoegen of wijzigen* → het personeel voor dat feest wordt meteen ingepland. Bij een wijziging blijven dezelfde mensen zo veel mogelijk staan.
- Iedereen die het raakt krijgt automatisch een melding.

---

## 4. App en meldingen op de telefoon
De site werkt als app (installeren) en stuurt pushmeldingen, voor personeel én beheer. Geen extra app nodig.
- **Android**: knop *App installeren* en *Meldingen aanzetten* (op de personeelspagina, onder het belletje en bij Instellingen in het beheer).
- **iPhone**: eerst via Safari → Deel-knop → *Zet op beginscherm*, daarna de app vanaf het beginscherm openen en meldingen aanzetten (iOS 16.4+).

Elke nieuwe rij in de tabel `meldingen` gaat automatisch als pushbericht naar de juiste telefoon(s): een database-trigger roept de Edge Function `rooster-push` aan.
Installatie: `supabase/push.sql` uitvoeren, Edge Function `supabase/functions/rooster-push/index.ts` aanmaken (Verify JWT uit) met de secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` en `VAPID_SUBJECT`, en `VAPID_PUBLIC_KEY` in `js/config.js`.

## 5. Goed om te weten

- **Beveiliging:** inloggen gaat met een PIN-code. Dat is handig en simpel, maar het is geen bankbeveiliging: iemand met technische kennis kan de database uitlezen. Zet er dus geen gevoelige gegevens in (geen BSN, IBAN of adres). Naam, telefoonnummer en rooster zijn prima.
- **Back-up:** via **Instellingen → Back-up downloaden**. Supabase maakt ook zelf dagelijks back-ups.
- **App op telefoon:** open de personeelspagina en kies *Toevoegen aan beginscherm*. Dan werkt hij als een app.
- **Uren exporteren:** bij **Rooster → Uren → Exporteer** krijg je een bestand dat in Excel opent, handig voor de salarisadministratie.
- **Printen:** bij **Rooster** de printerknop; het rooster wordt liggend afgedrukt.

## Bestanden

```
index.html            personeelspagina
beheer.html           beheerpagina
css/app.css           opmaak
js/config.js          ← hier de Supabase-gegevens invullen
js/store.js           opslag (Supabase of demo)
js/generator.js       de roosterplanner
js/uitvraag.js        uitvraag zalencentrum (herinneren + inplannen na de termijn)
js/common.js          gedeelde functies + demogegevens
js/beheer.js          logica beheer
js/personeel.js       logica personeel
supabase/schema.sql   database aanmaken
scripts/auto-rooster.cjs        automatisch rooster (GitHub Actions)
.github/workflows/auto-rooster.yml
```
