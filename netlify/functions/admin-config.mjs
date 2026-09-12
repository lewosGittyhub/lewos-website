// Wat de beheerpagina mág weten vóórdat er iemand is ingelogd.
//
// Alleen publieke waarden. De servicesleutel van de database en het JWT-geheim komen hier
// niet in voor, en dat is geen kwestie van vergeten: de anon-sleutel van Supabase is
// bedoeld om in een browser te staan, de andere twee nooit. Daarom staat de anon-sleutel
// in een eigen variabele en niet in dezelfde als de servicesleutel.
const json=(statusCode,body)=>({statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(body)});

// Deze twee waarden zijn publieke Supabase-clientconfiguratie. De service-role-sleutel
// en het JWT-geheim blijven uitsluitend server-side. De fallback voorkomt dat de login
// volledig uitvalt wanneer Netlify Production de publiceerbare variabele mist; Netlify
// mag de waarden nog steeds overschrijven per deploycontext.
const PUBLIC_SUPABASE_URL="https://obnkmuhcpkfwqazvqawq.supabase.co";
const PUBLIC_SUPABASE_KEY="sb_publishable_gkXXoXcGU3HtuFwDhT6f2A_yqTtwsy9";

export const handler=async event=>{
  if(event.httpMethod!=="GET")return json(405,{error:"method_not_allowed"});
  return json(200,{
    mode:"supabase",
    supabaseUrl:String(process.env.SUPABASE_URL||PUBLIC_SUPABASE_URL),
    anonKey:String(process.env.SUPABASE_ANON_KEY||PUBLIC_SUPABASE_KEY),
    testEnvironment:false
  });
};
