// In welke omgeving draait deze functie, en mag hij daar iets doen?
//
// Robert, 7 september 2026. De aanleiding: **Netlify laat omgevingsvariabelen standaard voor
// álle deploy contexts gelden.** Een branch- of preview-deploy van deze site zou dus met de
// productie-instellingen draaien en daarmee naar de productiedatabase schrijven, echte mail
// versturen en echte afspraken in de gedeelde agenda zetten. Geen enkele functie keek tot die
// dag naar `CONTEXT`, dus niets hield dat tegen.
//
// De regel die hier staat is bewust streng en bewust smal:
//
//   `CONTEXT` niet gezet          → een ontwikkelmachine. Toegestaan; daar staat geen
//                                    productieconfiguratie, en de lokale testserver zet zijn
//                                    eigen waarden.
//   `CONTEXT` = "production"      → toegestaan.
//   `CONTEXT` = iets anders       → **alleen toegestaan met `LEWOS_PREVIEW_SAFE=true`**,
//                                    en die zet je pas nadat je Supabase, Resend, Stripe en
//                                    de agenda voor díé context een eigen waarde hebt gegeven.
//
// Netlify zet `CONTEXT` altijd. Een preview die niet uitdrukkelijk als veilig is gemarkeerd,
// weigert dus — hij valt niet stilzwijgend terug op productie. Fout staan is hier de veilige
// kant: een preview die niets doet is een ongemak, een preview die de productiedatabase
// aanpast is dat niet.

export const deployContext=()=>String(process.env.CONTEXT||"").trim().toLowerCase()||"lokaal";

export const isProduction=()=>deployContext()==="production";

// Een ontwikkelmachine herken je eraan dat Netlify er niet draait: dan is `CONTEXT` leeg.
export const isLocal=()=>deployContext()==="lokaal";

export const previewIsConfigured=()=>String(process.env.LEWOS_PREVIEW_SAFE||"").trim()==="true";

export const environmentIsSafe=()=>isProduction()||isLocal()||previewIsConfigured();

// Waarom het geweigerd is, in gewone taal. Deze tekst komt in een preview op het scherm van
// wie hem aan het testen is, dus hij zegt wat er moet gebeuren.
export const unsafeEnvironmentBody=()=>({
  error:"preview_not_configured",
  context:deployContext(),
  message:"This deploy context has no environment of its own yet, so it will not write anything. "
    +"Give this context its own Supabase, Resend, Stripe and calendar values in Netlify, then set "
    +"LEWOS_PREVIEW_SAFE=true for this context. Nothing has been charged, sent or stored."
});
