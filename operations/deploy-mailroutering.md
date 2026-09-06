# Deploy-stappen: de mailroutering

Wat er in Netlify moet staan voordat de wijziging van 5 september 2026 live gaat, en in welke
volgorde. Geschreven door Claude; **ik kan het Netlify-dashboard niet zien**, dus wat hier
staat is wat de code nodig heeft, niet wat er nu ingesteld staat. Dat laatste kan alleen
Robert nakijken.

---

## 1. De twee omgevingsvariabelen

| Sleutel | Waarde | Status |
| --- | --- | --- |
| `LEWOS_GENERAL_EMAIL` | `lewos.co@gmail.com` | kan nu |
| `FONTECHA_ACCOMMODATION_EMAIL` | *het adres van Fontecha* | **wacht op het Gmail-account** |

### Waar ze horen

In Netlify, per site (niet per team), onder:

> **Site configuration → Environment variables → Add a variable → Add a single variable**

Twee dingen om aan te vinken bij het toevoegen:

- **Scopes.** De functies lezen deze waarden tijdens het uitvoeren, niet tijdens de build.
  Laat `Functions` in elk geval aanstaan. Staat er een keuze *All scopes*, dan is dat prima
  en het eenvoudigst.
- **Deploy contexts.** `Same value for all deploy contexts`. Er is geen reden om op een
  preview-deploy een ander adres te gebruiken — en een preview die per ongeluk een echte mail
  naar Fontecha stuurt, is precies wat je niet wilt.

Ze staan naast de variabelen die er al zijn: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RATE_LIMIT_SECRET`, `RESEND_API_KEY`, `TAVERN_FROM_EMAIL`, `URL` en
`PUBLIC_BOOKING_OPENS_AT`.

### Of via de CLI

De dashboard-doorklik verandert wel eens van naam; deze twee opdrachten niet:

```bash
netlify env:set LEWOS_GENERAL_EMAIL lewos.co@gmail.com
```

```bash
netlify env:list
```

Het adres van Fontecha zet je er op dezelfde manier bij zodra het bestaat.

---

## 2. Volgorde, en wat er gebeurt als er iets ontbreekt

`LEWOS_GENERAL_EMAIL` heeft `lewos.co@gmail.com` als standaardwaarde in de code. Staat de
variabele er niet, dan werkt alles gewoon en gaat alles naar dat adres. De variabele is er om
het adres te kunnen verplaatsen zonder code te wijzigen — niet om het te vervangen.

`FONTECHA_ACCOMMODATION_EMAIL` heeft **geen** standaardwaarde. Bewust: het postvak van een
derde partij hoort niet in een repository, en dat account bestaat nu nog niet. Zolang de
variabele leeg is:

- het contactformulier, de aanmeldingen en de meldingen aan Lewos werken normaal;
- een **bevestigde, betaalde** boeking kan niet worden afgerond. De webhook antwoordt met
  `accommodation_recipient_not_configured` en Stripe blijft het opnieuw proberen. De gast
  heeft zijn bevestiging dan al wel gekregen.

Dat laatste is geen bijwerking maar het ontwerp: een betaalde boeking waar de accommodatie
niets van weet, is een gast zonder bed, en dat mag niet stil misgaan. Het valt nu ook niemand
lastig, want de betaalpoort staat dicht — `PUBLISHED_TERMS_VERSION` in
`netlify/functions/_booking-config.mjs` is leeg. Er komt dus geen betaalde boeking langs
voordat die poort opengaat.

**Praktisch:** `LEWOS_GENERAL_EMAIL` kan vandaag erin. `FONTECHA_ACCOMMODATION_EMAIL` moet
erin staan vóórdat de betaalpoort opengaat, en dat is dezelfde dag als de andere
verkoopvoorwaarden rond zijn. Zet hem in de go-live-checklist naast de betaalpoort, niet
ervoor.

---

## 3. Het oude Netlify-formulier uitzetten

Het vragenformulier op `/contact/` postte naar Netlify Forms onder de naam `tavern-question`.
Sinds deze wijziging post het naar `/api/contact` en komt er niets meer binnen op dat
formulier.

> **Site configuration → Forms** (of **Forms** in het zijmenu) → `tavern-question` →
> notificatie-instelling verwijderen, en het formulier zelf mag weg.

Laat je het staan, dan blijft er een postvak bestaan dat niets meer ontvangt. Dat is precies
het soort halfdode instelling waar over een jaar iemand naar gaat zoeken.

---

## 4. De databasemigratie

`database/first-access.sql` moet opnieuw draaien. **Nog niet tegen een echte database
gehouden** — bovenaan dat bestand staat een blok met wat er is bijgekomen en welke vijf
scenario's er nagelopen moeten worden. Eerst op een tijdelijke database of een testbranch, in
één transactie die eindigt op `rollback`; pas daarna op productie.

Zonder die migratie blijft de site werken, maar dan:

- weigeren de RPC's de parameter `p_extra_nights` en komt een verzoek om extra nachten niet
  in de database;
- vallen de regels *Arrival*, *Departure* en *Extra nights* weg uit de melding aan de
  accommodatie. Het weekendlabel draagt de datums dan nog wel als tekst.

De migratie hoort dus vóór de deploy, of in elk geval vóór de eerste bevestigde boeking.

---

## 5. De privacyverklaring

`operations/privacy-concept-accommodatie.diff` is een concept en is **niet toegepast**.
`privacy/index.html` is ongewijzigd. De patch hoort erin te gaan vóórdat de eerste echte
melding aan de accommodatie de deur uit gaat — anders ontvangt een partij gastgegevens die de
gast nergens heeft kunnen lezen. Zie `operations/privacy-concept-accommodatie.md` voor de
tekst en voor de ene vraag die bij de gestor hoort.

---

## Afvinklijst

- [ ] `LEWOS_GENERAL_EMAIL=lewos.co@gmail.com` staat in Netlify, scope Functions, alle contexts.
- [ ] `LEWOS_CALENDAR_ID` en `LEWOS_ACCOMMODATION_EMAILS` staan erin. **Let op de volgorde:** ze doen pas iets zodra deze branch gedeployd is; `origin/main` kent geen agendacode.
- [ ] Het Gmail-account van Fontecha bestaat, en het adres staat als
      `FONTECHA_ACCOMMODATION_EMAIL` in Netlify — **vóór de betaalpoort opengaat**.
- [ ] `netlify env:list` toont beide, en ze zijn niet aan elkaar gelijk. (De code weigert twee
      gelijke adressen, maar dan is het al een mislukte deploy in plaats van een instelfout.)
- [ ] Het Netlify-formulier `tavern-question` en zijn notificatie zijn verwijderd.
- [ ] `database/first-access.sql` is nagelopen op een testdatabase en daarna gedraaid.
- [ ] Het blok *NOG NIET GEVERIFIEERD* bovenaan dat bestand is weggehaald.
- [ ] De privacypatch is met Robert doorgenomen en toegepast.
- [ ] `node --test tests/*.test.mjs` is groen op de commit die live gaat.
- [ ] Na de deploy: één vraag via `/contact/` versturen en controleren dat hij aankomt op
      `lewos.co@gmail.com` met het adres van de afzender als antwoordadres.

---

## Volledige lijst omgevingsvariabelen (gecontroleerd 6 september 2026)

Nagelopen tegen de code, niet tegen het Netlify-dashboard — **dat kan ik niet zien.** Wat
hier staat is wat de functies nodig hebben; of het ingesteld staat kan alleen Robert
nakijken. **Geen enkele waarde staat hieronder**, ook geen gedeeltelijke.

### Tien die deze branch nieuw nodig heeft

| Sleutel | Waarvoor | Zonder deze variabele |
| --- | --- | --- |
| `LEWOS_GENERAL_EMAIL` | postvak van Lewos | valt terug op `lewos.co@gmail.com` — werkt dus, maar leg hem vast |
| `FONTECHA_ACCOMMODATION_EMAIL` | postvak van de accommodatie | **een betaalde boeking kan niet afgerond worden**; de webhook antwoordt `accommodation_recipient_not_configured` en Stripe blijft het proberen. Dat is de bedoeling: een gast zonder bed mag niet stil misgaan |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Agenda | de agenda-stap wordt overgeslagen en gelogd; de boeking loopt door |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | idem | idem. Let op de regeleindes: als `\n` opslaan |
| `LEWOS_CALENDAR_ID` | idem | idem |
| `LEWOS_ACCOMMODATION_EMAILS` | herkennen welke agenda-afspraken van de accommodatie komen | de koppeling valt terug op streng gedrag: **elke** vreemde afspraak in de agenda blokkeert nachten, ook een privénotitie. Veilig, maar je verliest verkoop |
| `TAVERN_TIMEZONE` | tijdzone van de afspraken | valt terug op `Europe/Madrid` |
| `LEWOS_ADMIN_EMAILS` | wie de beheeromgeving in mag | **niemand komt binnen** — ook Robert niet |
| `SUPABASE_JWT_SECRET` | het inlogtoken controleren | de beheeromgeving weigert elk token (401) |
| `SUPABASE_ANON_KEY` | de publiceerbare sleutel voor de inlogpagina | inloggen op `/admin/` werkt niet |

### Veertien die er al waren

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `TAVERN_FROM_EMAIL`,
`RATE_LIMIT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`TAVERN_PAYMENTS_ENABLED`, `PUBLIC_BOOKING_OPENS_AT`, `BOOKING_TERMS_VERSION`,
`BOOKING_TERMS_DOCUMENT_URL`, `TRAVEL_INFORMATION_DOCUMENT_URL`, `URL`, `NODE_ENV`.

Aan deze veertien is niets veranderd. `TAVERN_PAYMENTS_ENABLED` hoort **uit** te blijven
zolang de reisbureauregistratie niet rond is.

### Wat ik niet kan controleren

Of ze in Netlify staan, en met welke waarde. Ik heb geen toegang tot dat dashboard en heb
er ook niet naar gezocht. De enige manier om dit af te vinken is: Netlify openen, deze
negen erbij zetten, en daarna de eerste deploy nalopen op de foutmeldingen in de rechter
kolom hierboven.

---

## Het contactformulier: Netlify Forms uitzetten

**Livegangstap, pas ná de deploy.** Het contactformulier liep via Netlify Forms; sinds
5 september 2026 loopt het via `netlify/functions/contact.mjs` naar `LEWOS_GENERAL_EMAIL`.

De vervangende route is op 6 september 2026 lokaal doorgemeten tegen de echte functie:

| Proef | Uitkomst |
| --- | --- |
| Gewone vraag | `200`, bericht in de postbus aan `lewos.co@gmail.com`, met *reply-to* de gast |
| Zonder JavaScript (gewone formulier-post) | `303` naar `/contact-thanks/` |
| Honeypot ingevuld | `200`, en **geen** bericht verstuurd |
| Vraag langer dan 500 tekens | `400`, niet afgekapt |
| `GET` | `405` |

Zet de oude Netlify Forms-melding voor **`tavern-question`** pas uit nadat de nieuwe route
op productie één echte vraag heeft doorgelaten. Doe je het eerder, dan is er een gat waarin
een vraag nergens aankomt. Volgorde:

1. Deploy met de negen variabelen hierboven ingesteld.
2. Stuur zelf één vraag via `/contact/` en controleer of hij in `lewos.co@gmail.com` staat.
3. Pas dán: Netlify → Forms → `tavern-question` → melding uitzetten.
4. Het formulierveld `form-name` mag blijven staan; het doet verder niets.
