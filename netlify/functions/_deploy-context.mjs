// In welke omgeving draait deze functie, en mag hij daar iets doen?
//
// Robert, 7 september 2026. De aanleiding: **Netlify laat omgevingsvariabelen standaard voor
// álle deploy contexts gelden.** Een branch- of preview-deploy zou dus met de
// productie-instellingen draaien en daarmee naar de productiedatabase schrijven, echte mail
// versturen en echte afspraken in de gedeelde agenda zetten.
//
// **Eerste poging, en waarom die faalde.** De eerste versie las `CONTEXT` en behandelde "niet
// gezet" als een ontwikkelmachine. In de Deploy Preview van 7 september bleek `CONTEXT` in de
// functie-runtime helemaal niet gezet — het is een bouwvariabele. Elke preview zag er dus uit
// als een laptop, de poort vuurde nooit, en `/api/first-access` haalde echt weekenddata op.
// Gevonden door de preview te testen; lokaal was er niets van te zien.
//
// **Daarom nu geen detectie meer, maar een verklaring.** Elke omgeving zegt zelf wat hij is:
//
//   `LEWOS_ENVIRONMENT=production`  → productie. Zet dit alleen in de Production-context.
//   `LEWOS_PREVIEW_SAFE=true`       → een omgeving met eigen instellingen: een preview waarvan
//                                     Supabase, Resend, Stripe en de agenda apart gezet zijn,
//                                     of een ontwikkelmachine.
//   niets van beide                 → **weigeren.**
//
// Raden doet deze module niet meer. Wie niets verklaart, mag niets — ook niet als hij toevallig
// productie is. Dat is luidruchtig, en luidruchtig is beter dan een preview die stilletjes de
// productiedatabase aanpast.

export const deployContext=()=>String(process.env.CONTEXT||"").trim().toLowerCase()||"niet gezet";

export const isProduction=()=>String(process.env.LEWOS_ENVIRONMENT||"").trim().toLowerCase()==="production";

export const previewIsConfigured=()=>String(process.env.LEWOS_PREVIEW_SAFE||"").trim()==="true";

export const environmentIsSafe=()=>isProduction()||previewIsConfigured();

// Welke verklaring er ligt, zonder waarden. Alleen voor de foutmelding en de logregel.

// Het adres waar de site zelf op draait. Op productie is dat URL (lewos.co). Op een
// branchdeploy of preview zet Netlify URL óók op lewos.co, en dan wezen betaallinks en
// bevestigingspaginas naar productie: een gast op de testomgeving kreeg een link naar een
// boeking die daar niet bestaat. Buiten productie gaat DEPLOY_PRIME_URL dus voor.
export const siteOrigin=()=>{
  const productie=String(process.env.URL||"").trim();
  const deploy=String(process.env.DEPLOY_PRIME_URL||"").trim();
  const gekozen=isProduction()?productie:(deploy||productie);
  return (gekozen||"https://lewos.co").replace(/\/+$/,"");
};

export const environmentLabel=()=>
  isProduction()?"production":previewIsConfigured()?"preview-safe":"niet verklaard";

// Waarom het geweigerd is, in gewone taal. Deze tekst komt in een preview op het scherm van
// wie hem aan het testen is, dus hij zegt wat er moet gebeuren.
export const unsafeEnvironmentBody=()=>({
  error:"environment_not_declared",
  environment:environmentLabel(),
  buildContext:deployContext(),
  message:"This environment has not declared what it is, so it will not read or write anything. "
    +"Set LEWOS_ENVIRONMENT=production in the Production context, or give this context its own "
    +"Supabase, Resend, Stripe and calendar values and set LEWOS_PREVIEW_SAFE=true. "
    +"Nothing has been charged, sent or stored."
});

// Netlify geeft DEPLOY_PRIME_URL alleen tijdens de build mee, niet aan de functies zelf. De
// betrouwbare bron tijdens een verzoek is de host waarop het verzoek binnenkwam. Die is door
// een aanvaller te vervalsen, dus we vertrouwen alleen ons eigen domein en onze eigen
// Netlify-adressen; alles anders valt terug op siteOrigin().
const eigenHost=host=>host==="lewos.co"||host==="www.lewos.co"||host==="lewos.netlify.app"
  ||/^[a-z0-9-]+--lewos\.netlify\.app$/.test(host)||/^deploy-preview-\d+--lewos\.netlify\.app$/.test(host);

export const requestOrigin=event=>{
  const kop=event&&event.headers?event.headers:{};
  const rauw=String(kop["x-forwarded-host"]||kop["host"]||"").split(",")[0].trim().toLowerCase();
  if(!rauw||!eigenHost(rauw))return siteOrigin();
  const schema=String(kop["x-forwarded-proto"]||"https").split(",")[0].trim()||"https";
  return `${schema}://${rauw}`;
};
