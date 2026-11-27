# Personeelsrooster – Cafetaria & Zalencentrum

Een webapp waarmee de eigenaar roosters maakt, en waarmee het personeel het rooster bekijkt, vrij vraagt en diensten ruilt. Er is niets te installeren: het werkt in de browser op telefoon, tablet en pc.

| Pagina | Voor wie | Wat |
|---|---|---|
| `index.html` | Personeel | Inloggen met naam en PIN, eigen diensten, rooster, vrij vragen, ziek melden, ruilen, open diensten oppakken, diensten in je telefoonagenda zetten |
| `beheer.html` | Eigenaar | Overzicht met takenlijst, rooster maken/aanpassen/versturen, personeel met een kaart per medewerker, verzuim, vaste cafetaria-diensten, agenda zalencentrum, aanvragen goedkeuren, prikbord, instellingen |

---

## 1. Eerst uitproberen (demo)

Open `beheer.html` (code **0000**) of `index.html` (bv. Sandra **1111**, Mark **2222**). Zolang `js/config.js` leeg is, draait de app in **demo-modus** met voorbeeldgegevens. Die worden alleen in die ene browser bewaard.

> Lokaal openen via dubbelklikken werkt in de meeste browsers. Lukt dat niet, start dan een mini-server in de map: `python -m http.server` en ga naar http://localhost:8000/beheer.html

---

## 2. Echt in gebruik nemen (gratis)

### Stap A – Database (Supabase)
1. Maak een gratis account op https://supabase.com en een **New project** (regio: Frankfurt/EU).
2. Ga naar **SQL Editor → New query**, plak de inhoud van `supabase/alles-in-een.sql` (uit het aparte Supabase-pakket, staat niet op GitHub) en klik **Run**.
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
- **oproepkrachten** (0 contracturen en geen vaste werkdagen) worden bij de **cafetaria nooit vanzelf** ingepland: zij kiezen zelf via "Ik kan" bij Beschikbaar of pakken een open dienst op. Wie 0 uur heeft maar wel vaste werkdagen, wordt alleen op die vaste dagen ingepland. Bij feesten met een oproep worden alleen oproepkrachten ingepland die "kan" zeiden;
- wie vrij heeft aangevraagd dat nog niet is goedgekeurd, wordt zo veel mogelijk ontzien.

Lukt het niet om een dienst in te vullen, dan blijft hij **open** (rood) en komt hij in de lijst *aandachtspunten*. Het personeel kan open diensten zelf oppakken.

**Werkwijze per maand:**
1. Personeel vraagt op tijd vrij voor de dagen dat ze niet kunnen.
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
- Een eigen dienst ruilen gaat via het tabblad **Ruilen** → *Kan je zelf een dienst niet?* (er staat bewust geen knop bij elke dienst, zodat niemand te snel afzegt). Je kiest:
  - **Iedereen die kan**: je dienst wordt aangeboden en wie hem als eerste overneemt, krijgt hem.
  - **Een collega met wie je het al hebt afgesproken**: die collega krijgt een verzoek en bevestigt met *Ja, akkoord* (of zegt nee).
- Optioneel kies je een **dienst van die collega die jij ervoor terugneemt**. Dan is het een echte ruil en worden beide diensten omgewisseld.
- Zijn beide collega's akkoord, dan keurt de baas het goed. Pas dan is er echt geruild. Goedkeuren door de baas kan ook uit bij Instellingen.

### Ziek melden
1. Een medewerker tikt in de app op **🤒 Ziek melden**. Die knop staat bovenaan bij de volgende dienst én onder *Vrij / ziek*. Hij of zij vinkt aan welke diensten vervallen en kiest vanaf wanneer. Er wordt **niet** gevraagd wat iemand heeft; dat mag een werkgever niet vastleggen.
2. Daarna verschijnt meteen een grote knop **📞 Bel Ricardo** met zijn nummer. Naam en nummer stel je in bij Instellingen.
3. Ricardo krijgt een melding (en een pushbericht als ntfy is ingesteld). Bij **Aanvragen → Ziek** klikt hij op **Bevestigen** zodra de medewerker heeft gebeld. Per dienst stelt de app een vervanger voor. Kiest hij "open laten", dan krijgen collega's die kunnen een bericht om de dienst op te pakken.
4. Wie ziek is wordt niet ingeroosterd tot hij of zij zich **beter meldt**. Dat kan de medewerker zelf doen, of Ricardo.
5. Belt iemand liever? Dan zet Ricardo het er zelf in met **🤒 Iemand belde: ziek** (op het Overzicht, bij Verzuim en bij Aanvragen → Ziek). Hij vult in hoe laat er gebeld werd; dat telt mee voor "hoe kort van tevoren".
6. Onder **Verzuim** staat per medewerker over de afgelopen 12 maanden: aantal meldingen, ziektedagen, gemiste diensten en hoe lang van tevoren er gemiddeld is gemeld. Er staan signalen bij, zoals *gesprek aanbevolen*, *vaak kort van tevoren* of *vaak op zondag*. Klik op een naam om de geschiedenis te zien en gesprekken en afspraken vast te leggen.

### Functies die bij elkaar horen
Bij **Instellingen → Functies → Wie dit kan, kan ook…** zet je bijvoorbeeld: wie *Bar zaal* kan, kan ook *Bar boven*. Dan hoef je dat niet bij iedere medewerker apart aan te vinken. De planner, de oproepen voor feesten en cafetaria, het oppakken van open diensten en het ruilen nemen het vanzelf mee. Bij de medewerker staat het grijs achter de eigen functies ("+ Bar boven"). Wat je bij de medewerker zelf aanvinkt, blijft gewoon staan. Opslaan in Supabase kan pas nadat `beveiliging.sql` (Supabase-pakket) is uitgevoerd.

### Cafetaria: openingstijden en spits
Bij **Cafetaria → ⚡ Snel invullen** kies je de dagen (bv. di t/m vr), de openingstijd (10:00–20:00), wanneer de dienst wisselt (bv. 15:00; leeg = één lange dienst) en de spits (bv. 17:00–20:00). Per functie vul je in hoeveel mensen er normaal staan en hoeveel er extra bij komen in de spits. De app maakt dan alle vaste diensten voor die dagen in één keer (bestaande diensten op die dagen worden vervangen). Doe het daarna nog een keer voor dagen met een andere openingstijd, zoals za en zo (11:00–20:00). Maandag dicht = maandag niet aanvinken.
Per dag staat een balkje met het aantal mensen per uur; de drukste uren zijn feller gekleurd. Losse diensten aanpassen kan nog steeds door erop te klikken.

### Eigen tijden per persoon bij een feest
Open een feest bij **Zalencentrum**. In de indeling staat bij elke persoon de begin- en eindtijd (standaard de feesttijden). Begint iemand later, mag iemand eerder weg of was iemand te laat? Pas de tijd daar aan; hij wordt meteen opgeslagen en telt mee bij **Rooster → Uren** en in de Excel-export. Afwijkende tijden zijn oranje gemarkeerd. Is het feest al verstuurd en ligt de dienst nog in de toekomst, dan krijgt de medewerker een melding van de nieuwe tijd. Achteraf aanpassen (gewerkte tijd) gaat zonder melding.
Let op: verander je daarna de datum, tijden of bezetting van het hele feest, dan wordt de indeling opnieuw gemaakt en gaan de eigen tijden verloren (de app waarschuwt daarvoor).

### Overzicht en personeelskaart
- Het **Overzicht** begint met een **takenlijst**: wat Ricardo nu moet doen (ziekmeldingen, vrij-aanvragen, ruilen, rooster of feesten nakijken, open plekken in de komende 3 dagen). Daaronder **Nog in te vullen · komende 14 dagen**: per open plek wanneer, wie hem zou kunnen doen, of hoeveel oproepkrachten gereageerd hebben, met een knop *Invullen*.
- Bij **Personeel** heeft iedereen een **kaart**: uren t.o.v. contract, gewerkte diensten, hoe vaak ziek (en hoe kort van tevoren), hoe vaak hij of zij reageert op oproepen en hoe snel, open diensten opgepakt, ruilen, vrije dagen. Bovenaan staat een korte samenvatting (👍 goed / ⚠️ let op). In de personeelslijst en op het Overzicht staat wie aandacht nodig heeft.
- De reactietijd wordt bijgehouden vanaf versie 1.9. Wordt een feest verwijderd waarop al gereageerd is, dan blijft het als *geannuleerd* bewaard voor de statistiek (het personeel ziet het niet meer).

**Versturen volgt het tabblad.** Bij **Rooster** kies je bovenaan *Alles*, *Cafetaria* of *Zalen*; de groene knop doet precies dat: **📤 Alles versturen**, **📤 Cafetaria versturen** of **📤 Zalencentrum versturen**. Zo kun je de cafetaria en het zalencentrum los van elkaar versturen. Terugtrekken werkt op dezelfde manier: **↩︎ Cafetaria terugtrekken**, **↩︎ Zalencentrum terugtrekken** of **↩︎ Alles terugtrekken**. Het personeel ziet het dan niet meer tot je opnieuw verstuurt; de indeling blijft staan en er gaan geen meldingen uit. Loopt de oproep voor een feest nog, dan wordt het eerst ingedeeld met de reacties die er zijn. Iedereen die is ingepland krijgt een melding. Plekken van Ricardo met "Personeel mag overnemen" blijven open voor wie toch kan.

**Te doen houdt ze ook apart.** Is het zalencentrum al verstuurd, dan staat bij *Te doen* "Cafetariarooster … nakijken en versturen" en kom je met één tik op het cafetaria-tabblad. Verstuurde feesten met nog open plekken staan er elk apart (bijv. "Oud en nieuw (do 31 dec): 10 plekken open"); tik erop om het feest meteen in te vullen. Bij **Zalencentrum** staat per maand de status van de feesten zelf (verstuurd / nog niet verstuurd), los van de cafetaria.

**Nog in te vullen** toont per dag één regel (cafetaria of het feest) met de open plekken als knopjes, bijv. *Keuken 10:00–16:00*, *2× Frituur 17:00–19:00*. Tik op een knopje om iemand in te vullen; daar zie je wie de functie heeft en vrij is. Een rood knopje betekent: niemand van het personeel heeft die functie en is vrij.

**Inplannen ongedaan maken.** Bij **Zalencentrum** staat naast elk feest dat *ingepland · nog niet verstuurd* is een knop **↩ Ongedaan maken**, en bovenaan de maand **↩ Hele maand ongedaan maken**. Bij een feest met oproep vervalt de indeling en gaat de oproep weer open (reacties blijven staan). Bij een feest zonder oproep worden de mensen eraf gehaald en blijven de plekken open om zelf in te vullen. Dat werkt ook voor feesten die al verstuurd zijn (zoals een hele maand december): wie erop stond krijgt dan één bericht dat de dienst vervalt. Bij feesten die nog niet verstuurd waren gaan er geen meldingen uit. In het venster zie je precies welke feesten het zijn.

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
Installatie: `alles-in-een.sql` uitvoeren (Supabase-pakket), Edge Function `rooster-push` aanmaken met `edge-function-rooster-push/index.ts` (Verify JWT uit) met de secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` en `VAPID_SUBJECT`, en `VAPID_PUBLIC_KEY` in `js/config.js`.

## 5. Goed om te weten

- **Beveiliging:** sinds versie 1.9 (met `beveiliging.sql` uit het Supabase-pakket) controleert de database zelf de PIN. De app kan de tabellen niet meer rechtstreeks lezen. Personeel krijgt alleen wat het nodig heeft: geen PIN-codes, geen beheercode, geen notities of gesprekken, geen ziektegeschiedenis van collega's en alleen de eigen meldingen. Na 10 foute codes binnen 15 minuten wordt die inlog op dat apparaat 15 minuten geblokkeerd. Het blijft een 4-cijferige PIN: zet er dus geen BSN, IBAN of adres in.
- **Back-up:** via **Instellingen → Back-up downloaden**. Supabase maakt ook zelf dagelijks back-ups.
- **App op telefoon:** open de personeelspagina en kies *Toevoegen aan beginscherm*. Dan werkt hij als een app.
- **Uren exporteren:** bij **Rooster → Uren → Exporteer** krijg je een bestand dat in Excel opent, handig voor de salarisadministratie.
- **Printen:** bij **Rooster** de printerknop; het rooster wordt liggend afgedrukt.

## Versie 1.9 installeren (beveiliging)

Doe het in deze volgorde:

1. **Upload de nieuwe bestanden** naar GitHub (alles uit deze map). De app werkt dan meteen, nog op de oude manier.
2. Iedereen krijgt bij het openen de melding **Nieuwe versie – even bijwerken**. Deze keer is er geen knop *Later*: bijwerken is nodig voor stap 4.
3. Wacht een paar dagen, zodat (bijna) iedereen de app een keer geopend heeft.
4. **Supabase → SQL Editor → New query**: plak `beveiliging.sql` uit het Supabase-pakket (`supabase-rooster-1.9.zip`, niet op GitHub) en klik **Run**. Gebruik daarna voortaan de nieuwe `alles-in-een.sql`; de oude versie zet de tabellen weer open. Vanaf nu is de beveiliging actief.
5. Iedereen moet daarna **één keer opnieuw zijn PIN invullen** (de naam staat al klaar). Ricardo ook, met de beheercode.
6. Controleer bij GitHub (Settings → Secrets → Actions) dat `SUPABASE_SERVICE_KEY` de **service_role**-sleutel is. De anon-sleutel werkt voor het automatische rooster niet meer.

Gaat er iets mis? Wie de app op de oude versie had, ziet "Kan geen verbinding maken". Bijwerken lost dat op.

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
scripts/auto-rooster.cjs        automatisch rooster (GitHub Actions)
.github/workflows/auto-rooster.yml
```

---

## Een nieuwe versie uitbrengen

Iedereen ziet bovenin **Nieuwe versie beschikbaar** met de knoppen **Bijwerken** en **Later**, zodra er een nieuwe versie op GitHub staat.

Staat in `versie.json` `"verplicht": true`, dan is er geen knop *Later* (alleen nodig als de database verandert, zoals bij 1.9). Haal die regel bij de volgende gewone versie weer weg.

Kiest iemand **Later**, dan blijft hij op de oude versie en komt de vraag terug bij elke keer dat de app geopend wordt, tot hij op **Bijwerken** tikt.

Zo breng je een update uit:

1. Pas je bestanden aan.
2. Verhoog het versienummer op **twee** plekken, met hetzelfde nummer:
   - `sw.js`, bovenaan: `const VERSIE = '1.1';`
   - `versie.json`: `"versie": "1.1"`, en zet bij `"nieuw"` in één zin wat er veranderd is.
3. Upload de bestanden naar GitHub.

Het huidige versienummer staat in het beheer onder **Uitloggen**, en op de inlogpagina van het personeel onder **Beheer**.

Let op: de app-bestanden (html, js, css) worden nu per versie bewaard. Een wijziging komt dus pas bij het personeel aan als je het versienummer verhoogt. Alleen `js/config.js` wordt altijd vers opgehaald. De `?v=35` achter de scripts hoef je niet meer op te hogen.
