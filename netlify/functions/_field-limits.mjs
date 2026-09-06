// Eén bron voor elke lengtegrens die een gast kan raken.
//
// Deze getallen staan twee keer: hier voor de server, en in `assets/field-limits.js`
// voor de browser. Er is geen bouwstap, dus een gedeelde module bestaat niet — maar
// `tests/field-limits.test.mjs` valt om zodra de twee bestanden uit elkaar lopen.
//
// De regel eronder is belangrijker dan de getallen: **niets wordt stil afgekapt.**
// Te lange invoer wordt geweigerd met een melding die zegt welk veld het is en hoeveel
// tekens er te veel zijn. Wie zijn allergie opschrijft, moet erop kunnen rekenen dat
// die allergie ook echt aankomt — of meteen te horen krijgen dat hij dat niet doet.
export const FIELD_LIMITS={
  name:120,        // gelijk aan de bestaande servercontrole en aan tavern_media_participants.full_name
  email:254,       // RFC 5321: de langste adresvorm die een mailserver hoort te accepteren
  // Sinds 5 september 2026 één veld op alle boekingsformulieren: allergieën en dieetwensen
  // gaan over hetzelfde gesprek en werden door gasten toch door elkaar ingevuld. 1.000 is
  // de ruimte van de twee oude velden samen, plus iets extra voor een groep waarin per
  // persoon staat wat er speelt.
  dietaryNotes:1000,
  // De twee oude velden blijven geldig: er staan boekingen in de database die ze gebruiken,
  // en een oudere pagina in iemands tabblad mag niet stilzwijgend afketsen.
  allergies:500,   // eigen veld, zie hieronder waarom 500
  dietary:500,     // idem, en bewust hetzelfde getal als allergieën
  extraNights:500, // /tavern/ en /tavern/book/, het enige veld dat naar de accommodatie gaat
  message:2000,    // overige opmerkingen op /tavern/
  when:120,        // /tavern/private/, gaat als regel bovenaan het berichtveld mee
  idea:1800,       // /tavern/private/, de rest van dat berichtveld: 120 + 8 + 1800 blijft onder 2000
  question:500     // /contact/, gaat sinds 5 september 2026 langs netlify/functions/contact.mjs
};

// Waarom 500 voor allergieën en dieetwensen, en niet een rond getal uit de lucht:
// 500 tekens is ongeveer tachtig woorden. Dat is ruim genoeg voor een volledige lijst met
// de ernst erbij — "severe peanut allergy, carries an EpiPen; also shellfish and sesame" is
// nog geen tachtig tekens — en het is hetzelfde getal dat `question` op /contact/ al draagt,
// een grens die er bewust staat en zich in de praktijk houdt. Wie meer kwijt moet, heeft
// daarnaast het veld voor overige opmerkingen van 2000 tekens. En te lang wordt geweigerd,
// niet afgekapt: bij een allergie is stil tekst weggooien het gevaarlijkste wat je kunt doen.

export const NAME_MIN=2;

// De privépagina plakt de gewenste periode als "When: …" bovenaan het bericht, dus die
// tekst telt mee tegen `message`. Vandaar dat `when` en `idea` samen onder 2000 blijven;
// `tests/field-limits.test.mjs` rekent dat na.

export const tooLongFields=values=>Object.entries(values)
  .filter(([veld,waarde])=>FIELD_LIMITS[veld]!==undefined&&typeof waarde==="string"&&waarde.length>FIELD_LIMITS[veld])
  .map(([veld,waarde])=>({field:veld,limit:FIELD_LIMITS[veld],length:waarde.length}));
