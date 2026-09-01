// De mediapoort staat los van de betaalpoort in `_booking-config.mjs` en mag die nooit
// openen of verzwakken. Een gast kan betalen zonder mediatoestemming, en mediatoestemming
// geeft geen enkele betaalroute vrij.
//
// Deze zes constanten staan bewust leeg zolang de Filming & Media Agreement concept is.
// Ze vullen vraagt een code-wijziging die iemand moet reviewen; de omgevingsvariabelen
// alleen zijn niet genoeg. Twee sloten, allebei bewust om te draaien.
export const PUBLISHED_MEDIA_AGREEMENT_VERSION="";
export const PUBLISHED_MEDIA_AGREEMENT_DOCUMENT="";
export const PUBLISHED_MEDIA_AGREEMENT_HASH="";
export const PUBLISHED_MEDIA_PRIVACY_CONTACT="";
export const PUBLISHED_MEDIA_RETENTION="";
export const PUBLISHED_MEDIA_LEGAL_REVIEW="";

// Hoe lang een persoonlijke link geldig is. Kort genoeg dat een gelekte link veroudert,
// lang genoeg dat iemand die pas in het weekend erna kijkt niet buitengesloten wordt.
export const MEDIA_INVITATION_WINDOW_DAYS=21;

const value=name=>String(process.env[name]||"").trim();

// Zelfde afspraak als bij de betaalpoort: testfixtures mogen alleen meedoen op een lokale
// testserver. Op een publieke deploy is `NODE_ENV=test` geen sleutel maar een lege huls.
const localTestOverridesAllowed=()=>process.env.NODE_ENV==="test"&&/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/.test(String(process.env.URL||""));

const publishedSettings=()=>localTestOverridesAllowed()
  ?{
    version:value("MEDIA_AGREEMENT_VERSION"),
    document:value("MEDIA_AGREEMENT_DOCUMENT_URL"),
    hash:value("MEDIA_AGREEMENT_HASH"),
    privacyContact:value("MEDIA_PRIVACY_CONTACT"),
    retention:value("MEDIA_RETENTION_PERIOD"),
    legalReview:value("MEDIA_LEGAL_REVIEW_REFERENCE")
  }
  :{
    version:PUBLISHED_MEDIA_AGREEMENT_VERSION,
    document:PUBLISHED_MEDIA_AGREEMENT_DOCUMENT,
    hash:PUBLISHED_MEDIA_AGREEMENT_HASH,
    privacyContact:PUBLISHED_MEDIA_PRIVACY_CONTACT,
    retention:PUBLISHED_MEDIA_RETENTION,
    legalReview:PUBLISHED_MEDIA_LEGAL_REVIEW
  };

// Eén lijst met wat er ontbreekt, in plaats van één botte booleaan. Zo kan de functie een
// nette melding teruggeven en kan Robert in het logboek zien wélke instelling hem tegenhoudt,
// zonder dat de bezoeker die namen ooit te zien krijgt.
export const mediaConsentBlockers=()=>{
  const settings=publishedSettings();
  const configuredVersion=value("MEDIA_AGREEMENT_VERSION");
  const blockers=[];
  if(value("TAVERN_MEDIA_CONSENT_ENABLED")!=="true")blockers.push("TAVERN_MEDIA_CONSENT_ENABLED is not set to true");
  if(!settings.version)blockers.push("no approved agreement version is published in _media-config.mjs");
  else if(configuredVersion!==settings.version)blockers.push("MEDIA_AGREEMENT_VERSION does not match the published version");
  if(!settings.document)blockers.push("no final agreement document reference is published");
  if(!settings.hash)blockers.push("no content hash for the approved agreement text is published");
  if(!settings.privacyContact)blockers.push("no confirmed privacy contact is published");
  if(!settings.retention)blockers.push("no confirmed retention period is published");
  if(!settings.legalReview)blockers.push("no legal review reference is published");
  return blockers;
};

export const mediaConsentIsEnabled=()=>mediaConsentBlockers().length===0;

// Geeft nooit iets terug zolang de poort dicht is. Zo kan een aanroeper niet per ongeluk
// een halve, niet-goedgekeurde versie aan een gast tonen.
export const mediaAgreement=()=>{
  if(!mediaConsentIsEnabled())return null;
  const settings=publishedSettings();
  return {version:settings.version,document:settings.document,hash:settings.hash,privacyContact:settings.privacyContact,retention:settings.retention};
};
