// Wie mag de beheeromgeving zien.
//
// Drie sloten achter elkaar, en ze doen alle drie iets anders:
//
//   1. **De handtekening.** Het token moet echt van de identiteitsprovider komen. Een
//      zelfgemaakt token met `{"email":"lewos.co@gmail.com"}` erin komt hier niet langs.
//   2. **De lijst in deze functie.** Alleen adressen uit `LEWOS_ADMIN_EMAILS`. Ingelogd
//      zijn is niet genoeg — wie een account bij dezelfde provider heeft, is daarmee nog
//      geen beheerder.
//   3. **De lijst in de database.** Elke admin-RPC controleert het adres nog eens tegen
//      `public.lewos_admins` en weigert anders. Zou slot 2 ooit verkeerd staan, dan geeft
//      de database nog steeds niets prijs.
//
// Waarom niet gewoon RLS met de `authenticated`-rol: op 3 september 2026 zijn de rechten
// van `anon` en `authenticated` op de tavern-tabellen expliciet ingetrokken (zie
// HANDOVER). Die beslissing draai ik niet om. De browser praat dus niet rechtstreeks met
// de database; hij praat met deze functie, en die praat met de database.

import {createHmac,createPublicKey,timingSafeEqual,verify as verifySignature} from "node:crypto";

const b64urlToBuffer=value=>Buffer.from(String(value).replace(/-/g,"+").replace(/_/g,"/"),"base64");

const decodeSegment=segment=>JSON.parse(b64urlToBuffer(segment).toString("utf8"));

// Supabase tekent projecttokens met een gedeeld geheim (HS256) of, in nieuwere projecten,
// met een sleutelpaar waarvan de publieke helft in een JWKS staat. Allebei worden hier
// ondersteund, want welke van de twee een project gebruikt kan ik niet van buitenaf zien.
const verifyHs256=(header,claims,signature,secret)=>{
  const verwacht=createHmac("sha256",secret).update(`${header}.${claims}`).digest();
  const gegeven=b64urlToBuffer(signature);
  return verwacht.length===gegeven.length&&timingSafeEqual(verwacht,gegeven);
};

const jwksCache={sleutels:null,opgehaald:0};
const haalJwks=async supabaseUrl=>{
  if(jwksCache.sleutels&&Date.now()-jwksCache.opgehaald<10*60*1000)return jwksCache.sleutels;
  const response=await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  if(!response.ok)throw new Error(`jwks:${response.status}`);
  const {keys}=await response.json();
  jwksCache.sleutels=keys||[];jwksCache.opgehaald=Date.now();
  return jwksCache.sleutels;
};

const ALGORITMEN={RS256:"RSA-SHA256",ES256:"SHA256",EdDSA:null};
const verifyAsymmetric=async(header,claims,signature,headerObject,supabaseUrl)=>{
  const sleutels=await haalJwks(supabaseUrl);
  const jwk=sleutels.find(k=>k.kid===headerObject.kid)||sleutels[0];
  if(!jwk)throw new Error("jwks_empty");
  const publicKey=createPublicKey({key:jwk,format:"jwk"});
  const data=Buffer.from(`${header}.${claims}`);
  const handtekening=b64urlToBuffer(signature);
  if(headerObject.alg==="ES256")
    return verifySignature("sha256",data,{key:publicKey,dsaEncoding:"ieee-p1363"},handtekening);
  if(headerObject.alg==="EdDSA")return verifySignature(null,data,publicKey,handtekening);
  return verifySignature(ALGORITMEN[headerObject.alg]||"RSA-SHA256",data,publicKey,handtekening);
};

// De lijst met toegestane adressen. Staat in een omgevingsvariabele en niet in de code,
// zodat Robert iemand kan toevoegen zonder een deploy — maar hij is er wél, want alleen
// "ingelogd" is geen toegangsrecht.
export const allowedEmails=()=>String(process.env.LEWOS_ADMIN_EMAILS||"")
  .split(",").map(waarde=>waarde.trim().toLowerCase()).filter(Boolean);

export const AUTH_ERRORS={missing:"no_token",invalid:"invalid_token",expired:"token_expired",forbidden:"not_an_administrator",unconfigured:"admin_not_configured"};

// Geeft `{email}` terug, of gooit met een van de codes hierboven. De aanroeper vertaalt
// dat naar 401 of 403 — en geeft nooit door wélk adres in het token stond, want dat is
// informatie die een buitenstaander niet hoeft te krijgen.
export const authenticate=async event=>{
  const toegestaan=allowedEmails();
  if(!toegestaan.length)throw new Error(AUTH_ERRORS.unconfigured);
  const header=Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()==="authorization")?.[1]||"";
  const token=header.replace(/^Bearer\s+/i,"").trim();
  if(!token)throw new Error(AUTH_ERRORS.missing);
  const delen=token.split(".");
  if(delen.length!==3)throw new Error(AUTH_ERRORS.invalid);
  const [kop,inhoud,handtekening]=delen;
  let headerObject,claims;
  try{headerObject=decodeSegment(kop);claims=decodeSegment(inhoud);}
  catch{throw new Error(AUTH_ERRORS.invalid);}

  // `alg: none` is de klassieke manier om een tokencontrole te omzeilen. Expliciet weren.
  if(!headerObject.alg||headerObject.alg==="none")throw new Error(AUTH_ERRORS.invalid);

  const geheim=String(process.env.SUPABASE_JWT_SECRET||"").trim();
  let geldig=false;
  if(headerObject.alg==="HS256"){
    if(!geheim)throw new Error(AUTH_ERRORS.unconfigured);
    geldig=verifyHs256(kop,inhoud,handtekening,geheim);
  }else{
    const supabaseUrl=String(process.env.SUPABASE_URL||"").trim();
    if(!supabaseUrl)throw new Error(AUTH_ERRORS.unconfigured);
    try{geldig=await verifyAsymmetric(kop,inhoud,handtekening,headerObject,supabaseUrl);}
    catch{throw new Error(AUTH_ERRORS.invalid);}
  }
  if(!geldig)throw new Error(AUTH_ERRORS.invalid);

  const nu=Math.floor(Date.now()/1000);
  if(!claims.exp||claims.exp<=nu)throw new Error(AUTH_ERRORS.expired);
  // Een token dat nog niet geldig is hoort ook niet te werken.
  if(claims.nbf&&claims.nbf>nu+60)throw new Error(AUTH_ERRORS.invalid);

  const email=String(claims.email||"").trim().toLowerCase();
  if(!email)throw new Error(AUTH_ERRORS.forbidden);
  // Een niet-bevestigd adres is geen bewijs van identiteit: wie een account aanmaakt met
  // andermans adres zonder het te bevestigen, hoort hier niet binnen te komen.
  if(claims.email_verified===false)throw new Error(AUTH_ERRORS.forbidden);
  if(!toegestaan.includes(email))throw new Error(AUTH_ERRORS.forbidden);
  return {email};
};

export const authErrorResponse=error=>{
  const code=error.message;
  if(code===AUTH_ERRORS.forbidden)return {statusCode:403,body:{error:code}};
  if(code===AUTH_ERRORS.unconfigured)return {statusCode:503,body:{error:code}};
  if([AUTH_ERRORS.missing,AUTH_ERRORS.invalid,AUTH_ERRORS.expired].includes(code))return {statusCode:401,body:{error:code}};
  return {statusCode:401,body:{error:AUTH_ERRORS.invalid}};
};
