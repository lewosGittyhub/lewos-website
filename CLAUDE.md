# CLAUDE.md — lees dit eerst

Dit is de Lewos-website. Aan deze repo werken twee assistenten om beurten: **Claude**
(Claude Code) en **Codex** (ChatGPT). Ze delen geen gesprek, alleen deze repo.

## Verplicht, elke sessie, vóór je iets aanraakt

1. Lees **[`HANDOVER.md`](HANDOVER.md)** helemaal. Daar staat wat de ander deed, waarom,
   hoe je het controleert, en wat er nog moet gebeuren. **Bovenaan staat *Openstaande
   vragen aan de ander*.** Staat daar een vraag aan jou, beantwoord die eerst en haal hem
   daarna uit het blok; het antwoord gaat in het logboek. Het logboek is naslag, dat blok
   is het postvak.
2. Staat het bovenste logboekitem op `TE CONTROLEREN` en is het **van Codex**, dan is dat
   je eerste taak. Controleer het echt en zet het op `GECONTROLEERD`. Vind je een fout:
   schrijf het op en herstel het.
3. Pak daarna het bovenste punt uit *Openstaand* dat jij kunt doen.
4. Schrijf bovenaan het logboek een nieuw item volgens het sjabloon onderaan
   `HANDOVER.md`. Zonder dat item is je werk niet overdraagbaar en telt het niet als af.
5. Commit op de feature-branch. **Niet pushen, niet naar `main`**, tenzij Robert er
   expliciet om vraagt — een push naar de hoofdbranch gaat meteen live op lewos.co.

Roberts eigen `CLAUDE.md` in `~/Downloads` blijft leidend voor merk, huisstijl, stem en
de harde grenzen. `HANDOVER.md` vat de grenzen samen die deze repo raken.

## Wat jij als Claude wel en niet kunt

Node.js v24 staat sinds 29 augustus 2026 in `~/.local/node` en zit via `~/.zshrc` op je
PATH. **Draai dus altijd zelf `node --test tests/*.test.mjs` voordat je iets als af
meldt.** Voor beeldbewerking is `sharp` beschikbaar; installeer die buiten de repo, in een
tijdelijke map, zodat de site zonder dependencies blijft.

Wat je **niet** kunt is de echte databaseproef: je hebt geen Supabase-toegang, Codex wel.
Raak je de SQL aan, zet dan onder *Niet geverifieerd* welk scenario Codex moet natesten.
Schrijf nooit "getest" als je het niet hebt gedraaid.

Let op bij de lokale preview: `python3 -m http.server` weigert te starten met de werkmap
in `~/Documents` (macOS blokkeert daar `os.getcwd()`). Kopieer de site naar een map buiten
`~/Documents` en serveer die.

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
