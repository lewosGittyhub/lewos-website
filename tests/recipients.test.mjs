// De twee postvakken en de grens ertussen. Dit bestand bewaakt de instelling zelf;
// checkout.test.mjs en first-access.test.mjs bewaken welke mail waarheen gaat.
import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {LEWOS_GENERAL_DEFAULT,readRecipients,recipientsAreMixed} from "../netlify/functions/_recipients.mjs";
import {resendPayload} from "../netlify/functions/_email.mjs";

// Deze test roept echte functies aan. Sinds 7 september 2026 weigert elke omgeving die
// niet verklaart wat hij is — zie netlify/functions/_deploy-context.mjs. Een testrun is
// een omgeving met eigen instellingen, dus die verklaart zich hier als zodanig.
process.env.LEWOS_PREVIEW_SAFE="true";

const herstel=()=>{delete process.env.LEWOS_GENERAL_EMAIL;delete process.env.FONTECHA_ACCOMMODATION_EMAIL;};
afterEach(herstel);

// Het echte adres van Fontecha staat hier bewust niet, en nergens anders in de repo: het
// postvak van een derde partij hoort niet in een repository, en dat account bestaat op
// 5 september 2026 nog niet. De tests draaien op een `.invalid`-adres; het echte adres komt
// alleen in Netlify te staan, als `FONTECHA_ACCOMMODATION_EMAIL`.
test("without configuration Lewos keeps its own address and the accommodation gets nothing",()=>{
  herstel();
  const mailboxes=readRecipients();
  assert.equal(mailboxes.general,"lewos.co@gmail.com");
  assert.equal(LEWOS_GENERAL_DEFAULT,"lewos.co@gmail.com");
  // Geen standaardwaarde voor het adres van de accommodatie: het postvak van een derde
  // partij hoort niet in de repository, en stil niets versturen is erger dan hardop niets.
  assert.equal(mailboxes.accommodation,null);
});

test("both addresses come from the environment",()=>{
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
  process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodation@example.invalid";
  assert.deepEqual(readRecipients(),{general:"lewos.co@gmail.com",accommodation:"accommodation@example.invalid"});
});

test("a different general address replaces the default without touching the accommodation",()=>{
  process.env.LEWOS_GENERAL_EMAIL="Robert@Lewos.CO";
  process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodation@example.invalid";
  const mailboxes=readRecipients();
  assert.equal(mailboxes.general,"robert@lewos.co");
  assert.equal(mailboxes.accommodation,"accommodation@example.invalid");
});

test("one address for both mailboxes is refused",()=>{
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
  process.env.FONTECHA_ACCOMMODATION_EMAIL="LEWOS.CO@gmail.com";
  assert.throws(()=>readRecipients(),/recipient_mixup/);
});

test("a malformed address is refused rather than silently used",()=>{
  process.env.LEWOS_GENERAL_EMAIL="not-an-address";
  assert.throws(()=>readRecipients(),/general_recipient_invalid/);
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
  process.env.FONTECHA_ACCOMMODATION_EMAIL="also-not-an-address";
  assert.throws(()=>readRecipients(),/accommodation_recipient_invalid/);
});

test("no email can carry both mailboxes at once",()=>{
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
  process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodation@example.invalid";
  assert.equal(recipientsAreMixed(["lewos.co@gmail.com","accommodation@example.invalid"]),true);
  assert.equal(recipientsAreMixed(["lewos.co@gmail.com"]),false);
  assert.equal(recipientsAreMixed(["accommodation@example.invalid"]),false);
  assert.equal(recipientsAreMixed(["guest@example.com"]),false);
  const basis={from:"T <t@e.invalid>",subject:"Onderwerp",html:"<p>hoi</p>",text:"hoi"};
  assert.throws(()=>resendPayload({...basis,to:["lewos.co@gmail.com","accommodation@example.invalid"]}),/email_recipient_mixup/);
  // De gast en één van de twee postvakken samen is geen vermenging: dat is gewoon
  // dezelfde mail aan twee partijen die hem allebei mogen zien.
  assert.doesNotThrow(()=>resendPayload({...basis,to:["guest@example.com","accommodation@example.invalid"]}));
});
