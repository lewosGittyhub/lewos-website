# Juridische status, nagetrokken op 29 augustus 2026

Robert vroeg wat er nu precies geregeld is. Hieronder per punt: wat er is, welk bewijs
daarvoor bestaat, en wat er ontbreekt. Elk punt is gemarkeerd als **bevestigd**, **bewijs
ontbreekt** of **deskundige nodig**.

Dit is geen juridisch advies. Het is een reconstructie uit de documenten die op deze
machine staan en uit officiële bronnen, met de bron er telkens bij. Waar iets niet te
staven was, staat dat er.

---

## a. De registratie: accommodatie versus reisorganisator

Dit is het belangrijkste onderscheid van het hele dossier, en het wordt makkelijk door
elkaar gehaald.

**Fontecha heeft eigen vergunningen. Die gelden voor Fontecha.** In de briefing aan Story
Forge staat het zo: *"De accommodatie heeft eigen verzekeringen en licenties om gasten te
ontvangen."* Dat is de vergunning van een accommodatie om mensen te laten slapen. Die zegt
niets over Lewos.

**Lewos verkoopt iets anders: een pakketreis.** Drie nachten, maaltijden, transfers en een
programma in één prijs is een *viaje combinado*. Dat is een eigen activiteit met een eigen
vergunningsplicht, los van waar de gasten slapen.

> ⚠️ **Deskundige nodig.** De Asturische regelgeving reserveert de organisatie en verkoop
> van pakketreizen uitsluitend voor bedrijven met de bijbehorende *título-licencia*, en
> bedrijven met vestiging in Asturië moeten die vergunning **vóór het begin van de
> activiteit** verkrijgen. Bron: het Reglamento de las Empresas de Intermediación Turística
> van Asturië en de dienstbeschrijving *"Inicio de actividad de empresas de intermediación"*
> van het Principado.

**En dit verklaart waarom de registratie nog niet rond kan zijn.** Inschrijving in het
Registro de Empresas y Actividades Turísticas gebeurt automatisch na een correct ingediende
*declaración responsable* — maar voor reisbureaus **onder voorbehoud van controle van de
verplichte fianza**, de caución. De registratie hangt dus aan de garantie. Zolang het
certificaat van de caución er niet is, kan de registratiecode er ook niet zijn. Het zijn
geen twee losse taken maar een keten.

### Wat er aan bewijs ligt

| Wat | Status | Bewijs |
| --- | --- | --- |
| Fiscale inschrijving bij AEAT | ✅ **Bevestigd** | `inschrijving hacienda modelo 036.pdf`. Een *alta en el censo de empresarios*, met een AEAT-dossiernummer dat begint met `2026C36`. Volgens Roberts eigen aantekeningen groep 755, Agencias de viajes. |
| Toeristische registratie van Lewos | ⬜ **Bewijs ontbreekt** | Geen enkel document op deze machine noemt Turismo Asturias, een RECE-nummer of een registratiecode. Het AEAT-dossiernummer is géén toeristische registratie. |
| Verzekering RC en caución | ⬜ **Bewijs ontbreekt voor een lopende polis** | `Información _ Presupuesto seguro Caucion y RC Agencias de Viajes.pdf` is informatie en een **offerte**: caución €550 per jaar, RC €421 per jaar, garantiebedrag minimaal €100.000. Een offerte is geen polis. Er is geen polisblad of certificaat gevonden. |

**Let op het woord in de bestandsnaam: *Presupuesto*. Dat is een offerte.** Dat de
verzekering "bevestigd" is, betekent volgens de stukken: gekozen, geoffreerd en akkoord —
niet aantoonbaar actief. Roberts eigen aantekeningen van 21 augustus zeggen hetzelfde: de
ingangsdatum is 1 september 2026 en het certificaat van de caución was toen nog niet in
handen.

---

## b. Het wettelijke standaardinformatieformulier

⚠️ **Deskundige nodig. Het bestaat nog niet.**

Bij een pakketreis moet de reiziger, **vóórdat hij ergens aan gebonden is**, een formulier
krijgen met wettelijk vastgelegde standaardinformatie. Niet een tekst die wij mooi
opschrijven: de inhoud ligt vast in de wet (richtlijn 2015/2302 bijlage I, in Spanje via
het TRLGDCU).

Daarin staat onder meer dat het om een pakketreis gaat, welke rechten daarbij horen, wie
verantwoordelijk is voor de uitvoering, en dat er insolventiebescherming is met de naam van
de garantieverstrekker erbij.

`/travel-information/` kondigt dit formulier zelf aan. Het is nergens geschreven. Dit is
het soort document waarvan de tekst grotendeels voorgeschreven is — laat het opstellen of
controleren door iemand die het Spaanse reisrecht doet.

---

## c. Welke reisvoorwaarden definitief moeten worden

⬜ **Bewijs ontbreekt: alles staat nog als concept.**

Twee pagina's in de repo zijn geschreven maar dragen zelf het stempel concept, staan op
`noindex`, en zeggen op hun eigen kop dat ze niet gelden:

- `/terms/` — de boekingsvoorwaarden. Onderwerpen die er al in staan: aanhouden van
  stoelen, bevestiging, overdracht aan een andere reiziger, annulering door de reiziger,
  annulering door Lewos, minimum van vier gasten, prijswijziging, uitvoering, klachten en
  toepasselijk recht.
- `/travel-information/` — de precontractuele reisinformatie.

**Wat er in beide nog letterlijk ontbreekt** staat er als *"To complete before sales"*:
volledig adres, fiscaal nummer, telefoonnummer, toeristische registratiegegevens, de
bevoegde autoriteit en de insolventiegarantieverstrekker.

Zolang de drie constanten in `netlify/functions/_booking-config.mjs` leeg zijn, is betalen
technisch onmogelijk. Die blokkade staat er juist voor dit moment.

---

## d. De verwerkersovereenkomst met Resend

⬜ **Bewijs ontbreekt.**

Resend verstuurt de bevestigings- en ontvangstmails. Hun eigen privacybeleid zegt dat zij
in de Verenigde Staten verwerken, maar **noemt geen enkel waarborgmechanisme** — geen
standaardcontractbepalingen, geen Data Privacy Framework. De drie andere verwerkers doen dat
wel: Netlify noemt standaardcontractbepalingen én het Data Privacy Framework, Supabase noemt
standaardcontractbepalingen voor doorgifte naar de Verenigde Staten en Singapore, en Stripe
noemt beide.

Waarschijnlijk staat het wél in hun verwerkersovereenkomst. Die moet je tekenen en bewaren
vóór de eerste bevestigingsmail uitgaat. Daarna kan de privacyverklaring het mechanisme ook
voor Resend noemen; nu staat er alleen het feit dat zij in de Verenigde Staten verwerken.

Bronnen, alle gecontroleerd op 29 augustus 2026: resend.com/legal/privacy-policy ·
netlify.com/privacy · supabase.com/privacy · stripe.com/legal/privacy-center

---

## e. Welke bedrijfsgegevens nog ontbreken

⬜ **Bewijs ontbreekt.** Wat er staat en wat er mist:

| Gegeven | Status |
| --- | --- |
| Naam van de aanbieder | ✅ Staat er: Robert Neugebauer, handelend als Lewos |
| Woonplaats en provincie | ✅ Staat er: concejo Parres, Asturië. Voor een natuurlijk persoon vraagt de LSSI niet meer dan gemeente en provincie |
| E-mailadres | ✅ Staat er |
| Fiscaal nummer | ⬜ Ontbreekt in `legal/index.html`, blok `#provider` |
| Telefoonnummer | ⬜ Ontbreekt. De voorwaarden beloven wel een telefonisch contact voor dringende hulp tijdens het weekend |
| Toeristische registratiecode en bevoegde autoriteit | ⬜ Ontbreekt, en kan pas als de keten uit punt a rond is |
| Insolventiegarantieverstrekker met contactgegevens | ⬜ Ontbreekt |

---

## Samengevat

**Bevestigd:** de fiscale inschrijving bij AEAT, en de identiteitsgegevens die nu al op de
site staan.

**Bewijs ontbreekt:** een lopende RC- en cauciónpolis, de toeristische registratie van Lewos
als reisorganisator, de definitieve klantdocumenten, de verwerkersovereenkomst met Resend en
vier bedrijfsgegevens.

**Deskundige nodig:** het standaardinformatieformulier, en de vraag of de gekozen
constructie in Asturië de juiste vergunningsroute is.

En het antwoord op de vraag die hieronder ligt: **de toeristische registratie kán nog niet
gedaan zijn zolang het certificaat van de caución er niet is.** Die twee hangen wettelijk
aan elkaar. Dat is geen slecht nieuws maar een volgorde: eerst de garantie, dan de
declaración responsable, dan de registratie, dan pas verkopen.
