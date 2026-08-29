// Deliberately empty while the public booking terms still contain placeholders.
// Publishing final terms requires a reviewed code change as well as the matching environment value.
export const PUBLISHED_TERMS_VERSION="";
export const PUBLISHED_TERMS_DOCUMENT="";
export const PUBLISHED_TRAVEL_DOCUMENT="";

const localTestOverridesAllowed=()=>process.env.NODE_ENV==="test"&&/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/.test(String(process.env.URL||""));

export const bookingDocuments=()=>localTestOverridesAllowed()
  ?{terms:String(process.env.BOOKING_TERMS_DOCUMENT_URL||""),travel:String(process.env.TRAVEL_INFORMATION_DOCUMENT_URL||"")}
  :{terms:PUBLISHED_TERMS_DOCUMENT,travel:PUBLISHED_TRAVEL_DOCUMENT};

export const termsArePublished=()=>{
  const configured=String(process.env.BOOKING_TERMS_VERSION||"").trim();
  const documents=bookingDocuments();
  const versionMatches=localTestOverridesAllowed()?Boolean(configured):Boolean(PUBLISHED_TERMS_VERSION)&&configured===PUBLISHED_TERMS_VERSION;
  return versionMatches&&Boolean(documents.terms)&&Boolean(documents.travel);
};

export const paymentsAreEnabled=()=>process.env.TAVERN_PAYMENTS_ENABLED==="true"&&termsArePublished();

export const publicBookingIsOpen=()=>{
  if(!paymentsAreEnabled())return false;
  const opensAt=Date.parse(process.env.PUBLIC_BOOKING_OPENS_AT||"");
  return Number.isFinite(opensAt)&&Date.now()>=opensAt;
};
