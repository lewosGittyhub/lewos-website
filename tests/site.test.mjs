import assert from "node:assert/strict";
import {readdir,readFile,stat} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";

const root=path.resolve(import.meta.dirname,"..");
const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).filter(entry=>entry.name!==".git").map(async entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):path.join(dir,entry.name)))).flat();
const files=await walk(root);
const htmlFiles=files.filter(file=>file.endsWith(".html"));
const read=file=>readFile(file,"utf8");

const localTarget=(source,value)=>{
  const clean=value.split("#")[0].split("?")[0];
  if(!clean||clean.startsWith("mailto:")||clean.startsWith("tel:")||clean.startsWith("http://")||clean.startsWith("https://")||clean.startsWith("data:")||clean.startsWith("javascript:")||clean.startsWith("/.netlify/")||clean.startsWith("/api/"))return null;
  const absolute=clean.startsWith("/")?path.join(root,clean):path.resolve(path.dirname(source),clean);
  return path.extname(absolute)?absolute:path.join(absolute,"index.html");
};

test("all local HTML links and media targets exist",async()=>{
  const missing=[];
  for(const file of htmlFiles){
    const html=await read(file);
    for(const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)){
      const target=localTarget(file,match[1]);
      if(target)try{await stat(target);}catch{missing.push(`${path.relative(root,file)} -> ${match[1]}`);}
    }
    for(const match of html.matchAll(/url\(["']?([^"')]+)["']?\)/gi)){
      const target=localTarget(file,match[1]);
      if(target)try{await stat(target);}catch{missing.push(`${path.relative(root,file)} -> ${match[1]}`);}
    }
  }
  assert.deepEqual(missing,[]);
});

test("First Access form keeps its privacy and anti-spam safeguards",async()=>{
  const html=await read(path.join(root,"tavern/index.html"));
  const handler=await read(path.join(root,"netlify/functions/first-access.mjs"));
  assert.match(html,/name=["']form-name["']/);
  assert.match(html,/name=["']bot-field["']/);
  assert.match(html,/aria-hidden=["']true["']/);
  assert.match(html,/href=["'](?:\.\.\/|\/)privacy\//);
  assert.match(html,/action=["']\/api\/first-access["']/);
  assert.match(handler,/redirect\(`\/thanks\/\?status=held/);
});

test("contact form is separate and limited to 500 characters",async()=>{
  const html=await read(path.join(root,"contact/index.html"));
  assert.match(html,/name=["']form-name["'][^>]*value=["']tavern-question["']/);
  assert.match(html,/name=["']question["'][^>]*maxlength=["']500["']/);
  assert.match(html,/action=["']\/contact-thanks\/["']/);
});

test("consumer price remains consistent and banned sales wording is absent",async()=>{
  const publicHtml=(await Promise.all(htmlFiles.filter(file=>!file.includes(`${path.sep}terms${path.sep}`)&&!file.includes(`${path.sep}travel-information${path.sep}`)).map(read))).join("\n");
  assert.match(publicHtml,/€2[.,]025/);
  for(const banned of ["excl","VAT","Book now","Buy"])assert.doesNotMatch(publicHtml,new RegExp(`\\b${banned}\\b`,"i"));
  const displayedPrices=[...publicHtml.matchAll(/€\s*([0-9][0-9.,]*)/g)].map(match=>match[1].replace(/[.,]/g,""));
  assert.deepEqual([...new Set(displayedPrices)],["2025"]);
});

test("sitemap includes privacy but excludes transactional and draft pages",async()=>{
  const sitemap=await read(path.join(root,"sitemap.xml"));
  assert.match(sitemap,/https:\/\/lewos\.co\/privacy\//);
  for(const hidden of ["thanks","contact-thanks","booking-success","booking-cancelled","terms","travel-information","tavern/book","tavern/checkout"])assert.doesNotMatch(sitemap,new RegExp(`lewos\\.co/${hidden.replace("/","\\/")}`));
});

test("metadata and structured data are present without Event schema",async()=>{
  const home=await read(path.join(root,"index.html"));
  const tavern=await read(path.join(root,"tavern/index.html"));
  const contact=await read(path.join(root,"contact/index.html"));
  assert.match(home,/"@type":"Organization"/);
  assert.match(tavern,/"@type":"FAQPage"/);
  assert.match(contact,/property=["']og:title["']/);
  assert.match(contact,/name=["']twitter:card["']/);
  assert.doesNotMatch(`${home}\n${tavern}`,/"@type"\s*:\s*"Event"/);
});

test("payments remain gated on explicit configuration and a reviewed code version",async()=>{
  const source=await read(path.join(root,"netlify/functions/create-checkout-session.mjs"));
  assert.match(source,/TAVERN_PAYMENTS_ENABLED/);
  assert.match(source,/PUBLIC_BOOKING_OPENS_AT/);
  assert.match(source,/PUBLISHED_TERMS_VERSION=""/);
  assert.match(source,/BOOKING_TERMS_VERSION/);
});
