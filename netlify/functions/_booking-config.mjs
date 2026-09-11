// Version 2026-09-11 of the three sales documents. These values open nothing on their own: payment
// also needs TAVERN_PAYMENTS_ENABLED=true and BOOKING_TERMS_VERSION set to this same version in
// Netlify. The two documents are attached to every confirmation email by loadAttachment in
// stripe-webhook.mjs; tests/sales-documents.test.mjs checks that they are real PDFs.
export const PUBLISHED_TERMS_VERSION="2026-09-11";
export const PUBLISHED_TERMS_DOCUMENT="/documents/lewos-tavern-booking-terms-2026-09-11.pdf";
export const PUBLISHED_TRAVEL_DOCUMENT="/documents/lewos-tavern-travel-information-2026-09-11.pdf";

// The published booking terms promise a 40 minute hold. The database hold and
// the Stripe session must expire together: a shorter Stripe session would hand
// a returning guest a dead payment link while the seat is still reserved.
export const CHECKOUT_HOLD_MINUTES=40;

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
