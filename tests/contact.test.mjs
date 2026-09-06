// Het vragenformulier op /contact/. Tot 5 september 2026 liep dit via Netlify Forms;
// sindsdien langs een eigen functie, zodat de ontvanger uit `LEWOS_GENERAL_EMAIL` komt.
import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import http from "node:http";
import {listenOnTestPort,stopTestServer} from "./_test-server.mjs";

let mailBodies=[];
let rateAllowed=true;
let mailFails=false;
let server;
let base;
const nativeFetch=globalThis.fetch;

before(async()=>{
  server=http.createServer((request,response)=>{
    let body="";
    request.on("data",chunk=>body+=chunk);
    request.on("end",()=>{
      response.setHeader("content-type","application/json");
      if(request.url==="/rest/v1/rpc/check_tavern_request_limit")return response.end(JSON.stringify(rateAllowed));
      if(request.url==="/emails"){
        if(mailFails){response.statusCode=500;return response.end(JSON.stringify({message:"email_failed"}));}
        mailBodies.push(JSON.parse(body));
        return response.end(JSON.stringify({id:"email-1"}));
      }
      response.statusCode=404;response.end("{}");
    });
  });
  await listenOnTestPort(server);
  base=`http://127.0.0.1:${server.address().port}`;
  globalThis.fetch=(input,options)=>{
    const url=String(input);
    if(url.startsWith("https://api.resend.com/"))return nativeFetch(`${base}/emails`,options);
    if(url.startsWith(base))return nativeFetch(input,options);
    return Promise.reject(new Error(`test_reached_the_network: ${url}`));
  };
  process.env.SUPABASE_URL=base;
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key";
  process.env.RATE_LIMIT_SECRET="a-long-random-test-secret";
  process.env.RESEND_API_KEY="test-resend-key";
  process.env.TAVERN_FROM_EMAIL="The Lewos Tavern <tavern@example.com>";
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
  process.env.FONTECHA_ACCOMMODATION_EMAIL="accommodation@example.invalid";
});
beforeEach(()=>{mailBodies=[];rateAllowed=true;mailFails=false;});
after(async()=>{globalThis.fetch=nativeFetch;await stopTestServer(server);server=null;});

const post=(body,headers={"content-type":"application/json",accept:"application/json"})=>({httpMethod:"POST",headers,body:JSON.stringify(body)});
const valid={name:"Marta",email:"marta@example.com",question:"Is the house accessible with a walking frame?"};

test("a special question goes to Lewos and never to the accommodation",async()=>{
  const {handler}=await import("../netlify/functions/contact.mjs");
  const result=await handler(post(valid));
  assert.equal(result.statusCode,200);
  assert.equal(mailBodies.length,1);
  assert.deepEqual(mailBodies[0].to,["lewos.co@gmail.com"]);
  assert.equal([].concat(mailBodies[0].to).includes("accommodation@example.invalid"),false);
  assert.match(mailBodies[0].text,/Is the house accessible with a walking frame\?/);
  assert.match(mailBodies[0].html,/Is the house accessible with a walking frame\?/);
});

test("the reply goes straight back to the person who asked",async()=>{
  const {handler}=await import("../netlify/functions/contact.mjs");
  await handler(post(valid));
  assert.equal(mailBodies[0].reply_to,"marta@example.com");
  // Het adres is al door de patrooncontrole gekomen, dus er kan geen regeleinde en dus
  // geen tweede kopregel in staan. Deze assertie houdt dat vast.
  assert.doesNotMatch(mailBodies[0].reply_to,/[\r\n]/);
});

test("the general address follows the environment variable",async()=>{
  process.env.LEWOS_GENERAL_EMAIL="robert@lewos.co";
  const {handler}=await import("../netlify/functions/contact.mjs");
  await handler(post(valid));
  assert.deepEqual(mailBodies[0].to,["robert@lewos.co"]);
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
});

test("one address for both mailboxes stops the question instead of misrouting it",async()=>{
  process.env.LEWOS_GENERAL_EMAIL="accommodation@example.invalid";
  const {handler}=await import("../netlify/functions/contact.mjs");
  const result=await handler(post(valid));
  assert.equal(result.statusCode,503);
  assert.equal(mailBodies.length,0);
  process.env.LEWOS_GENERAL_EMAIL="lewos.co@gmail.com";
});

test("a form post without JavaScript lands on the thank-you page",async()=>{
  const {handler}=await import("../netlify/functions/contact.mjs");
  const result=await handler({httpMethod:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(valid).toString()});
  assert.equal(result.statusCode,303);
  assert.equal(result.headers.location,"/contact-thanks/");
  assert.equal(mailBodies.length,1);
});

test("the honeypot is answered normally and sends nothing",async()=>{
  const {handler}=await import("../netlify/functions/contact.mjs");
  const result=await handler(post({...valid,"contact-bot-field":"spam"}));
  assert.equal(result.statusCode,200);
  assert.equal(mailBodies.length,0,"een bot kreeg toch een mail verstuurd");
});

test("an incomplete or malformed question is refused",async()=>{
  const {handler}=await import("../netlify/functions/contact.mjs");
  for(const invoer of [{...valid,name:"M"},{...valid,email:"geen-adres"},{...valid,question:"   "}]){
    const result=await handler(post(invoer));
    assert.equal(result.statusCode,400,`geaccepteerd: ${JSON.stringify(invoer)}`);
  }
  assert.equal(mailBodies.length,0);
});

test("a question over the limit is refused by name and never truncated",async()=>{
  const {handler}=await import("../netlify/functions/contact.mjs");
  const result=await handler(post({...valid,question:"x".repeat(501)}));
  assert.equal(result.statusCode,400);
  const body=JSON.parse(result.body);
  assert.equal(body.error,"field_too_long");
  assert.deepEqual(body.fields,[{field:"question",limit:500,length:501}]);
  assert.equal(mailBodies.length,0);
});

test("exactly on the limit still comes through in full",async()=>{
  const vraag="y".repeat(500);
  const {handler}=await import("../netlify/functions/contact.mjs");
  const result=await handler(post({...valid,question:vraag}));
  assert.equal(result.statusCode,200);
  assert.ok(mailBodies[0].text.includes(vraag),"de vraag is onderweg afgekapt");
});

test("too many messages in a short time are held back",async()=>{
  rateAllowed=false;
  const {handler}=await import("../netlify/functions/contact.mjs");
  const result=await handler(post(valid));
  assert.equal(result.statusCode,429);
  assert.equal(mailBodies.length,0);
});

test("a delivery failure is reported instead of pretending it was sent",async()=>{
  mailFails=true;
  const {handler}=await import("../netlify/functions/contact.mjs");
  const result=await handler(post(valid));
  assert.equal(result.statusCode,502);
  assert.equal(JSON.parse(result.body).error,"contact_not_delivered");
});

test("HTML in a question is shown, not executed",async()=>{
  const {handler}=await import("../netlify/functions/contact.mjs");
  await handler(post({...valid,question:"<script>alert(1)</script>\nSecond line"}));
  assert.equal(mailBodies[0].html.includes("<script>alert(1)</script>"),false);
  assert.match(mailBodies[0].html,/&lt;script&gt;/);
  // Regeleindes blijven staan, net als in elke andere mail die Lewos verstuurt.
  assert.match(mailBodies[0].html,/<br>Second line/);
  assert.match(mailBodies[0].text,/\nSecond line/);
});
