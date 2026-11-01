import http from 'node:http';
import {bankSnapshot} from './public/forecast.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {readJson,writeJson,validState} from './lib/storage.mjs';
import {normalizeConnection,publicConnection} from './lib/configuration.mjs';
import {EnableBanking,parseKey,equalSecret,pendingAuthorization,consumeAuthorization,convertTransactions,reconcile} from './lib/banking.mjs';

const APP=path.dirname(fileURLToPath(import.meta.url));
const clone=structuredClone;
export function createApp({dataDir=process.env.DATA_DIR||'/data',fetcher=fetch,now=()=>Date.now(),allowedIngress=['172.30.32.2'],seedPath=path.join(APP,'seed.json')}={}) {
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const vaultFile=path.join(dataDir,'private.json'),dbFile=path.join(dataDir,'dashboard.json');
  let vault=readJson(vaultFile,{bridgeSecret:randomBytes(32).toString('hex'),owner:null,allowedUsers:[],settings:{autoSync:true,intervalHours:12,historyDays:90},session:null,migrationConfirmed:false});
  writeJson(vaultFile,vault);
  if(vault.connection)vault.connection=normalizeConnection(vault.connection);
  const seed=JSON.parse(fs.readFileSync(seedPath,'utf8'));
  let db=readJson(dbFile,{revision:1,state:{version:1,joern:seed.joern,bettina:null,basis:'yes',fixed:seed.fixed,bookings:seed.bookings,categories:[],rules:[],incomes:{},budgets:{},reserves:[],bankReview:[],bankDismissed:[]}});
  if(!validState(db.state))throw new Error('Die Datenbank enthält kein gültiges Dashboard.');
  writeJson(dbFile,db);
  let syncing=false,bankCache=[],lastAttempt=0,stopped=false;
  const persistVault=()=>writeJson(vaultFile,vault);
  function commit(state) {
    if(!validState(state))throw new Error('Ungültige Dashboard-Daten.');
    const day=new Date(now()).toISOString().slice(0,10),backups=path.join(dataDir,'snapshots');fs.mkdirSync(backups,{recursive:true,mode:0o700});
    const before=path.join(backups,day+'.json');if(!fs.existsSync(before))writeJson(before,db);
    const old=fs.readdirSync(backups).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();for(const f of old.slice(0,-7))fs.unlinkSync(path.join(backups,f));
    const next={revision:db.revision+1,state};writeJson(dbFile,next);db=next;return db.revision;
  }
  const connection=()=>{if(!vault.connection)throw fail('Bitte zuerst Application ID, Rücksprungadresse und Haushaltskonto konfigurieren.');return vault.connection;};
  const bank=()=>{if(!vault.pem)throw new Error('Bitte zuerst den privaten PEM-Schlüssel hinterlegen.');return new EnableBanking(vault.pem,connection().applicationId,fetcher);};
  const fail=(message,status=400)=>Object.assign(new Error(message),{httpStatus:status});
  async function banks() {
    const r=await bank().request('/aspsps');
    if(!Array.isArray(r.aspsps))throw fail('Unerwartete Bankenliste.');
    bankCache=r.aspsps.filter(b=>b.country==='DE'&&b.psu_types?.includes('personal'));
    return bankCache;
  }
  async function sync({force=false,from:customFrom}={}) {
    if(syncing)throw fail('Ein Bankabruf läuft bereits.',409);
    if(!vault.migrationConfirmed)throw fail('Bitte zuerst die Übernahme deiner bestehenden Dashboard-Daten bestätigen.');
    if(!vault.session?.session_id)throw fail('Bitte zuerst die Bankverbindung freigeben.');
    if(!vault.selectedAccounts?.length)throw fail('Bitte mindestens ein Konto auswählen.');
    if(vault.session.validUntil && +new Date(vault.session.validUntil)<=now())throw fail('Die Bankfreigabe ist abgelaufen. Bitte erneut verbinden.');
    if(now()-(vault.lastAttempt||0)<60000)throw fail('Bitte mindestens eine Minute bis zum nächsten Bankabruf warten.',429);
    syncing=true;vault.lastAttempt=now();lastAttempt=now();persistVault();
    try {
      const accounts=vault.session.accounts.filter(a=>vault.selectedAccounts.includes(a.uid));
      const until=new Date(now()).toISOString().slice(0,10),incoming=[],balances=[],stats={pending:0,foreign:0};
      for(const account of accounts) {
        const previous=vault.lastSyncByAccount?.[account.uid];
        const from=customFrom||new Date(previous?+new Date(previous)-14*86400000:now()-vault.settings.historyDays*86400000).toISOString().slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!Number.isFinite(+new Date(from))||from>until)throw fail('Ungültiges Startdatum.');
        const tx=await bank().transactions(account.uid,from,until);
        const converted=convertTransactions(tx,account);incoming.push(...converted.converted);stats.pending+=converted.stats.pending;stats.foreign+=converted.stats.foreign;
        try {const b=await bank().request(`/accounts/${encodeURIComponent(account.uid)}/balances`);balances.push({uid:account.uid,balances:b.balances||[]});}
        catch {balances.push({uid:account.uid,error:'Kontostand derzeit nicht verfügbar'});}
      }
      // Await all pages/accounts first. Read the latest db after network waits.
      const state=clone(db.state),result={...reconcile(state,incoming,connection().expectedAccount),...stats};
      state.bankImportAt=new Date(now()).toISOString();commit(state);
      vault.lastSync=state.bankImportAt;vault.lastResult=result;vault.lastError=null;vault.balances=balances;
      vault.lastSyncByAccount||={};for(const a of accounts)vault.lastSyncByAccount[a.uid]=vault.lastSync;
      persistVault();return result;
    } catch(error) {vault.lastError=safeError(error);persistVault();throw error;}
    finally {syncing=false;}
  }
  async function callback(input) {
    let pending;
    try {pending=consumeAuthorization(vault,input,now());}
    finally {persistVault();}
    try {
      const session=await bank().request('/sessions',{method:'POST',body:{code:input.code}});
      if(!session.session_id||!Array.isArray(session.accounts)||!session.accounts.length)throw fail('Keine freigegebenen Konten. Bitte die im Control Panel verknüpften Konten prüfen.');
      const accounts=[];
      for(const a of session.accounts) {
        // POST /sessions normally returns full account resources. Resolve if a bank omits them.
        let account=a;
        if(!account.account_id&&!account.identification_hash)account={...a,...await bank().request(`/accounts/${encodeURIComponent(a.uid)}/details`)};
        accounts.push(account);
      }
      const oldSession=vault.session?.session_id;
      vault.session={session_id:session.session_id,accounts,validUntil:session.access?.valid_until||pending.validUntil};
      vault.selectedAccounts=[];vault.lastSyncByAccount={};vault.lastError=null;persistVault();
      if(oldSession && oldSession!==session.session_id)try{await bank().request(`/sessions/${encodeURIComponent(oldSession)}`,{method:'DELETE'});}catch{}
      return {ok:true};
    } catch(error) {vault.lastError=safeError(error);persistVault();throw error;}
  }
  function safeError(error) {
    if(error.name==='TimeoutError'||error.name==='AbortError')return 'Der Bankabruf hat zu lange gedauert. Bitte später erneut versuchen.';
    if(error.code && /^[A-Z_]+$/.test(error.code))return error.message;
    // Never return upstream response bodies, request headers, URLs with auth codes, or a key.
    const known=['Bitte','Ein Bankabruf','Die Bank','Keine freigegebenen','Ungültige','Unerwartet','Wiederholter','Zu viele','Umsatz','Buchungs','Konto ohne','Ein privater','Die Datei','Die Rücksprung','Die Anwendung','Das Konto','Nur EUR','Keine Bank','Kein'];
    return known.some(s=>String(error.message).startsWith(s))?error.message:'Der Vorgang ist fehlgeschlagen. Verbindung und Einstellungen prüfen.';
  }
  function reply(res,status,value,type='application/json; charset=utf-8') {
    res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"});res.end(type.startsWith('application/json')?JSON.stringify(value):value);
  }
  async function body(req,limit=20*1024*1024) {
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail('Bitte JSON-Daten senden.',415);
    let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>limit)throw fail('Die Datei ist zu groß.',413);chunks.push(c);}
    try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch {throw fail('Ungültige JSON-Daten.');}
  }
  function user(req) {
    const ip=req.socket.remoteAddress?.replace(/^::ffff:/,'');
    if(!allowedIngress.includes(ip))throw fail('Kein Zugriff außerhalb von Home Assistant Ingress.',403);
    const id=req.headers['x-remote-user-id'];
    if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw fail('Keine bestätigte Home-Assistant-Benutzerkennung. Bitte die App direkt über Home Assistant öffnen.',403);
    if(!vault.owner){vault.owner=id;persistVault();}
    if(id!==vault.owner&&!vault.allowedUsers.includes(id))throw fail('Kein Zugriff für diesen Home-Assistant-Benutzer. Der Besitzer kann deine Benutzerkennung freigeben: '+id,403);
    return {id,owner:id===vault.owner};
  }
  const ingress=http.createServer(async(req,res)=>{
    try {
      const who=user(req),url=new URL(req.url,'http://ingress'),route=url.pathname;
      if(req.method==='GET') {
        if(route==='/api/dashboard')return reply(res,200,{...db,connection:publicConnection(vault.connection),forecastBank:bankSnapshot(vault)});
        if(route==='/api/revision')return reply(res,200,{revision:db.revision});
        if(route==='/api/status')return reply(res,200,{version:'0.4.0',people:db.state.people||{first:'Person 1',second:'Person 2'},connection:publicConnection(vault.connection),applicationId:vault.connection?.applicationId||'',redirect:vault.connection?.redirectUrl||'',keyStored:!!vault.pem,keyVerified:!!vault.keyVerified,owner:who.owner,currentUser:who.id,allowedUsers:who.owner?vault.allowedUsers:undefined,bridgeSecret:who.owner?vault.bridgeSecret:undefined,bridgeConfirmed:vault.bridgeConfirmed||null,migrationConfirmed:vault.migrationConfirmed,settings:vault.settings,syncing,lastSync:vault.lastSync||null,lastError:vault.lastError||null,lastResult:vault.lastResult||null,accounts:(vault.session?.accounts||[]).map(a=>({uid:a.uid,iban:a.account_id?.iban||'',name:a.name||a.details||'',currency:a.currency||'EUR',selected:vault.selectedAccounts?.includes(a.uid)||false})),validUntil:vault.session?.validUntil||null,connected:!!vault.session,balances:vault.balances||[],reviews:db.state.bankReview||[]});
        if(route==='/api/banks') {if(!who.owner)throw fail('Nur der Besitzer darf Bankverbindungen verwalten.',403);return reply(res,200,(await banks()).map(b=>({name:b.name,country:b.country,maximum_consent_validity:b.maximum_consent_validity,beta:b.beta})));}
        const files={'/':'index.html','/dashboard.html':'dashboard.html','/settings.js':'settings.js','/finance.mjs':'finance.mjs','/forecast.mjs':'forecast.mjs','/forecast-ui.mjs':'forecast-ui.mjs'};
        if(files[route])return reply(res,200,fs.readFileSync(path.join(APP,'public',files[route])),/\.m?js$/.test(route)?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
        return reply(res,404,{error:'Nicht gefunden.'});
      }
      if(req.method!=='POST'||req.headers['x-haushalt-request']!=='1')throw fail('Nicht erlaubte Anfrage.',403);
      const input=await body(req);
      if(route==='/api/dashboard') {
        if(input.revision!==db.revision)throw fail('Daten wurden auf einem anderen Gerät oder durch den Bankimport geändert. Bitte lokale Änderungen sichern und neu laden.',409);
        if(!validState(input.state))throw fail('Ungültige Sicherung.');
        return reply(res,200,{revision:commit(input.state)});
      }
      if(!who.owner)throw fail('Nur der Besitzer darf diese Einstellung ändern.',403);
      if(route==='/api/people') {
        const people={first:String(input.first||'').trim(),second:String(input.second||'').trim()};
        if(Object.values(people).some(name=>!name||name.length>40))throw fail('Bitte zwei Anzeigenamen mit höchstens 40 Zeichen eintragen.');
        const state=clone(db.state);state.people=people;commit(state);return reply(res,200,{ok:true});
      }
      if(route==='/api/connection') {
        if(syncing||vault.pending?.expires>now())throw fail('Bitte einen laufenden Bankabruf oder Freigabeablauf zuerst beenden.',409);
        const next=normalizeConnection(input);
        if(vault.session)throw fail('Bitte zuerst die bestehende Bankverbindung beenden, bevor du deren Konfiguration änderst.',409);
        const old=vault.connection;vault.connection=next;
        if(!old||old.applicationId!==next.applicationId||old.redirectUrl!==next.redirectUrl)vault.keyVerified=false;
        vault.bridgeConfirmed=null;bankCache=[];persistVault();return reply(res,200,{ok:true});
      }
      if(route==='/api/key') {
        if(typeof input.pem!=='string'||input.pem.length>65536)throw fail('Die Datei ist kein gültiger privater Schlüssel.');
        parseKey(input.pem);
        const info=await new EnableBanking(input.pem,connection().applicationId,fetcher).request('/application');
        if(info.kid!==connection().applicationId||info.environment!=='PRODUCTION'||!info.active)throw fail('Die Anwendung ist nicht als aktive Production-Anwendung mit dieser ID registriert.');
        if(!info.redirect_urls?.includes(connection().redirectUrl))throw fail('Die Rücksprungadresse ist bei Enable Banking noch nicht exakt hinterlegt.');
        vault.pem=input.pem;vault.keyVerified=true;persistVault();return reply(res,200,{ok:true});
      }
      if(route==='/api/migration') {if(input.confirmed!==true)throw fail('Bitte die Datenübernahme bestätigen.');vault.migrationConfirmed=true;persistVault();return reply(res,200,{ok:true});}
      if(route==='/api/users') {
        if(!Array.isArray(input.ids)||input.ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{32}$/i.test(id)))throw fail('Ungültige Benutzerkennung.');
        vault.allowedUsers=[...new Set(input.ids.map(id=>id.toLowerCase()))].filter(x=>x!==vault.owner);persistVault();return reply(res,200,{ok:true});
      }
      if(route==='/api/settings') {
        if(typeof input.autoSync!=='boolean'||![12,24].includes(Number(input.intervalHours))||![30,90,180,365].includes(Number(input.historyDays)))throw fail('Ungültige Einstellungen.');
        vault.settings={autoSync:input.autoSync,intervalHours:Number(input.intervalHours),historyDays:Number(input.historyDays)};persistVault();return reply(res,200,{ok:true});
      }
      if(route==='/api/auth') {
        if(!vault.keyVerified)throw fail('Bitte zuerst den Schlüssel prüfen.');
        if(!vault.bridgeConfirmed)throw fail('Bitte zuerst die Rückleitungs-Integration in Home Assistant einrichten.');
        if(!bankCache.length)await banks();
        const aspsp=bankCache.find(b=>b.name===input.name&&b.country==='DE');if(!aspsp)throw fail('Keine Bank ausgewählt.');
        if(vault.pending&&vault.pending.expires>now())throw fail('Bitte die bereits gestartete Bankfreigabe abschließen oder nach 15 Minuten erneut starten.',409);
        const pending=pendingAuthorization(aspsp,now());vault.pending=pending;persistVault();
        try {
          const r=await bank().request('/auth',{method:'POST',body:{access:{valid_until:pending.validUntil},aspsp:pending.aspsp,state:pending.state,redirect_url:connection().redirectUrl,psu_type:'personal',language:'de'}});
          const link=new URL(r.url);if(link.protocol!=='https:'||!(link.hostname==='enablebanking.com'||link.hostname.endsWith('.enablebanking.com')))throw fail('Unerwartete Bank-Rückleitung.');
          return reply(res,200,{url:link.href});
        }catch(error){delete vault.pending;persistVault();throw error;}
      }
      if(route==='/api/accounts') {
        const available=vault.session?.accounts||[];
        if(!Array.isArray(input.uids)||input.uids.length<1||input.uids.some(id=>!available.some(a=>a.uid===id&&(a.currency||'EUR')==='EUR')))throw fail('Bitte mindestens ein verfügbares EUR-Konto auswählen.');
        // Version 0.1 imports one household account. Avoid attributing an additional account to existing CSV rows.
        if(input.uids.length!==1)throw fail('Bitte genau ein Haushaltskonto auswählen.');
        const chosen=available.find(a=>a.uid===input.uids[0]);
        if(String(chosen.account_id?.iban||'').replace(/\s/g,'').toUpperCase()!==connection().expectedAccount)throw fail('Das Konto passt nicht zur IBAN deiner vorhandenen Haushaltsauswertung.');
        vault.selectedAccounts=input.uids;persistVault();return reply(res,200,{ok:true});
      }
      if(route==='/api/sync')return reply(res,200,await sync({force:true,from:input.from||undefined}));
      if(route==='/api/review') {
        const state=clone(db.state),index=(state.bankReview||[]).findIndex(r=>r.id===input.id);if(index<0)throw fail('Bitte die aktuelle Prüfliste neu laden.',409);
        const item=state.bankReview[index];
        if(input.action==='add')state.bookings.push(item.booking);
        else if(input.action==='duplicate'){state.bankDismissed||=[];state.bankDismissed.push(item.booking.bankId);}
        else throw fail('Bitte eine gültige Prüfentscheidung wählen.');
        state.bankReview.splice(index,1);commit(state);return reply(res,200,{ok:true});
      }
      if(route==='/api/disconnect') {
        if(syncing)throw fail('Ein Bankabruf läuft. Bitte kurz warten.',409);
        if(vault.session?.session_id)await bank().request('/sessions/'+encodeURIComponent(vault.session.session_id),{method:'DELETE'});
        vault.session=null;vault.selectedAccounts=[];delete vault.pending;persistVault();return reply(res,200,{ok:true});
      }
      return reply(res,404,{error:'Nicht gefunden.'});
    }catch(error){reply(res,error.httpStatus||502,{error:safeError(error)});}
  });
  const internal=http.createServer(async(req,res)=>{
    try {
      if(!equalSecret(req.headers.authorization,'Bearer '+vault.bridgeSecret))throw fail('Nicht autorisiert.',401);
      const url=new URL(req.url,'http://internal');
      if(req.method==='GET'&&url.pathname==='/health') {vault.bridgeConfirmed=new Date(now()).toISOString();persistVault();return reply(res,200,{ok:true,webhook:connection().webhook});}
      if(req.method==='POST'&&url.pathname==='/callback')return reply(res,200,await callback(await body(req,32768)));
      return reply(res,404,{error:'Nicht gefunden.'});
    }catch(error){reply(res,error.httpStatus||400,{error:safeError(error)});}
  });
  const tick=()=>{
    if(stopped||syncing||!vault.settings.autoSync||!vault.migrationConfirmed||!vault.session||!vault.selectedAccounts?.length)return;
    const due=now()-Math.max(vault.lastAttempt||0,lastAttempt)>vault.settings.intervalHours*3600000;
    if(due)sync().catch(()=>{});
  };
  const timer=setInterval(tick,60000);timer.unref();
  return {ingress,internal,sync,callback,getDatabase:()=>clone(db),stop:()=>{stopped=true;clearInterval(timer);ingress.close();internal.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {const app=createApp();app.ingress.listen(8099,'0.0.0.0');app.internal.listen(8100,'0.0.0.0');console.log('Haushaltsdashboard bereit. Oberfläche ausschließlich über Home Assistant öffnen.');process.on('SIGTERM',()=>{app.stop();process.exit(0);});}
  catch {console.error('Start fehlgeschlagen. Lokale Datendateien und Sicherungen prüfen. Es wurden keine Daten zurückgesetzt.');process.exit(1);}
}
