import assert from "node:assert/strict";
import {afterEach,test} from "node:test";
import {paymentsAreEnabled} from "../netlify/functions/_booking-config.mjs";

const original={...process.env};
afterEach(()=>{
  for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];
  Object.assign(process.env,original);
});

const configureTestDocuments=()=>{
  process.env.NODE_ENV="test";
  process.env.TAVERN_PAYMENTS_ENABLED="true";
  process.env.BOOKING_TERMS_VERSION="booking-test-v1";
  process.env.BOOKING_TERMS_DOCUMENT_URL="/documents/terms.pdf";
  process.env.TRAVEL_INFORMATION_DOCUMENT_URL="/documents/travel.pdf";
};

test("local test servers can exercise payment flows with fixture documents",()=>{
  configureTestDocuments();
  process.env.URL="http://127.0.0.1:4177";
  assert.equal(paymentsAreEnabled(),true);
});

test("NODE_ENV test can never bypass reviewed documents on a public deployment",()=>{
  configureTestDocuments();
  process.env.URL="https://lewos.co";
  assert.equal(paymentsAreEnabled(),false);
});
