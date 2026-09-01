// Eén plek voor het starten en stoppen van de mockservers die de testbestanden gebruiken.
// Het stond vijf keer los in de suite, telkens als
// `await new Promise(resolve=>server.close(resolve))`. Twee dingen zijn daaraan
// aangescherpt, allebei omdat de gevolgen zwaar zijn en de kosten nihil:
//
// 1. `server.listen(...)` ving geen fout af. Lukt het binden niet, dan lost de belofte
//    eromheen nooit op en blijft de `before`-hook staan zonder te zeggen waarom.
// 2. `server.close(cb)` roept zijn callback pas als élke verbinding weg is, en er stond
//    geen bovengrens omheen. Komt die callback niet, dan lost de belofte in `after()` nooit
//    op: de tests zijn klaar, maar het proces eindigt niet, en `node --test` blijft staan
//    met "Promise resolution is still pending but the event loop has already resolved".
//    Dat is op 1 september 2026 echt gebeurd. Twee vastgelopen runs van 13:54 en 13:56
//    stonden er twintig minuten later nog; hun workers hingen in `kevent` zonder één open
//    TCP-socket. De server was dus al weg en er wachtte alleen nog een belofte die nooit
//    meer zou aflopen. Op commando was het niet na te bootsen — daarom een harde grens in
//    plaats van een verklaring.
//
// Daarom: de server wordt ge-unref't zodat hij de gebeurtenislus nooit kan openhouden, en
// het sluiten heeft een harde bovengrens. Liever een server die we hardhandig afkappen dan
// een suite die zonder uitleg blijft staan.

export const listenOnTestPort=async server=>{
  await new Promise((resolve,reject)=>{
    const failed=error=>reject(error);
    server.once("error",failed);
    server.listen(0,"127.0.0.1",()=>{server.removeListener("error",failed);resolve();});
  });
  // Een testserver hoort het proces nooit in leven te houden. De verzoeken die de tests
  // zelf doen houden de lus wel wakker, dus dit kost geen dekking.
  server.unref();
  return `http://127.0.0.1:${server.address().port}`;
};

export const stopTestServer=async server=>{
  if(!server)return;
  server.closeAllConnections?.();
  await new Promise(resolve=>{
    let settled=false;
    let timer=null;
    const finish=()=>{
      if(settled)return;
      settled=true;
      if(timer)clearTimeout(timer);
      resolve();
    };
    timer=setTimeout(()=>{
      // Er hangt nog een verbinding. Afkappen en doorgaan: de suite is klaar.
      server.closeAllConnections?.();
      finish();
    },1000);
    timer.unref?.();
    server.close(finish);
  });
};
