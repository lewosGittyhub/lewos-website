// Allergieën en dieetwensen, als één veld.
//
// Robert heeft ze op 5 september 2026 samengevoegd. Ze gaan over hetzelfde gesprek en
// werden door gasten toch door elkaar ingevuld: een notenallergie onder "dietary", "geen
// varkensvlees" onder "allergies". Twee vakjes dwongen tot een indeling die de gast zelf
// niet maakt, en bij een groep verdween wie wat had.
//
// Wat blijft: dit is een **eigen veld**, los van "Anything else". Een allergie moet terug
// te vinden zijn zonder een vrije tekst te hoeven doorlezen.
//
// Wat ook blijft: deze tekst gaat **niet** naar Google Agenda en **niet** naar de
// accommodatie. Hij gaat naar Lewos. Zie `_calendar.mjs`, dat het veld niet eens aanneemt.

// Twee oude velden als één tekst. Wordt gebruikt voor twee dingen die op hetzelfde
// neerkomen: een oudere pagina die nog twee velden verstuurt, en een boeking van vóór de
// samenvoeging die nog twee kolommen heeft.
//
// De kopjes blijven staan. De gast schreef die zinnen onder díé kopjes; ze weglaten zou
// betekenis kosten. Dezelfde vorm als `private.merged_dietary_text` in de database, zodat
// een oude client en een oude rij er hetzelfde uitzien.
export const mergeLegacyDietary=(allergies,dietary)=>[
  String(allergies||"").trim()?`Allergies: ${String(allergies).trim()}`:"",
  String(dietary||"").trim()?`Dietary requirements: ${String(dietary).trim()}`:""
].filter(Boolean).join("\n");

// Wat er uit een formulier of uit de database komt, als één tekst. Het nieuwe veld wint;
// staat dat leeg, dan vallen we terug op de twee oude. **Nooit allebei** — dan zou een
// gast zijn allergie twee keer zien staan.
export const dietaryText=({dietaryNotes,allergies,dietary}={})=>
  String(dietaryNotes||"").trim()||mergeLegacyDietary(allergies,dietary);

export const DIETARY_LABEL="Allergies & dietary requirements";
