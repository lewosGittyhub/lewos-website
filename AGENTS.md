# AGENTS.md — lees dit eerst

Dit is de Lewos-website. Aan deze repo werken twee assistenten om beurten: **Codex**
(ChatGPT) en **Claude** (Claude Code). Ze delen geen gesprek, alleen deze repo.

## Verplicht, elke sessie, vóór je iets aanraakt

1. Lees **[`HANDOVER.md`](HANDOVER.md)** helemaal. Daar staat wat de ander deed, waarom,
   hoe je het controleert, en wat er nog moet gebeuren. **Bovenaan staat *Openstaande
   vragen aan de ander*.** Staat daar een vraag aan jou, beantwoord die eerst en haal hem
   daarna uit het blok; het antwoord gaat in het logboek. Het logboek is naslag, dat blok
   is het postvak.
2. Staat het bovenste logboekitem op `TE CONTROLEREN` en is het **van de ander**, dan is
   dat je eerste taak. Controleer het echt en zet het op `GECONTROLEERD`. Vind je een
   fout: schrijf het op en herstel het.
3. Pak daarna het bovenste punt uit *Openstaand* dat jij kunt doen.
4. Schrijf bovenaan het logboek een nieuw item volgens het sjabloon onderaan
   `HANDOVER.md`. Zonder dat item is je werk niet overdraagbaar en telt het niet als af.
5. Commit op de feature-branch. **Niet pushen, niet naar `main`**, tenzij Robert er
   expliciet om vraagt — een push naar de hoofdbranch gaat meteen live op lewos.co.

Lees ook Roberts eigen `CLAUDE.md` in `~/Downloads`; die beschrijft het merk, de
huisstijl en de harde grenzen. `HANDOVER.md` vat de grenzen samen die deze repo raken.

## Wat jij als Codex extra kunt

Jij hebt Node.js en toegang tot Supabase; Claude heeft die op deze Mac **niet**. Alles
wat Claude aan code verandert, moet jij natesten voordat het als geverifieerd geldt:

```bash
node --test tests/*.test.mjs
```

En de databasecontrole: `database/first-access.sql` gevolgd door
`tests/database-integration.sql`, in één Supabase-transactie die eindigt op `rollback`.
Die mag nooit testgegevens achterlaten.

## Nooit doen

- Betaling mogelijk maken of een omweg om de betaalblokkade bouwen. Verkopen mag pas als
  RC-polis en caución actief zijn, RECE0033T06 is ingediend met registratiecode binnen,
  én de klantdocumenten definitief zijn. `PUBLISHED_TERMS_VERSION` en de twee
  documentconstanten in `netlify/functions/_booking-config.mjs` staan bewust leeg; dat
  is de blokkade, niet een vergeten regel.
- Feiten verzinnen in publieke teksten. Geen namen, reviews, statistieken of edities die
  niet vaststaan.
- Persoonsgegevens of geheimen in de repo zetten, ook niet in commit-berichten.
- Een framework, bundler of dependency introduceren. Dit is losse HTML/CSS/JS zonder
  build-stap en dat blijft zo, tenzij Robert akkoord geeft.
- "Getest" schrijven zonder het gedraaid te hebben. Kun je iets niet verifiëren, zet het
  onder *Niet geverifieerd* en in *Openstaand* voor de ander.
