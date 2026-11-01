import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EnableBanking,jwt,convertTransactions,reconcile,consumeAuthorization,pendingAuthorization} from '../haushaltsdashboard/app/lib/banking.mjs';
import {createApp} from '../haushaltsdashboard/app/server.mjs';

const APP_ID='00000000-0000-4000-8000-000000000001',REDIRECT='https://ha.example.org/api/webhook/test-hook-0123456789',TEST_IBAN='DE89370400440532013000';
const keys=generateKeyPairSync('rsa',{modulusLength:2048}),pem=keys.privateKey.export({format:'pem',type:'pkcs8'}).toString();
const account={uid:'test-uid',account_id:{iban:TEST_IBAN},currency:'EUR',identification_hash:'account-hash'};
function tx(overrides={}) {return {status:'BOOK',booking_date:'2026-10-31',transaction_amount:{amount:'12.30',currency:'EUR'},credit_debit_indicator:'DBIT',creditor:{name:'ALDI'},remittance_information:['Einkauf Lebensmittel'],...overrides};}
const state=()=>({version:1,bookings:[],fixed:[],rules:[],incomes:{'2026-10':{joern:4000,bettina:1800}},categories:[]});

test('JWT signs the required application identity; no private key is embedded',()=>{
  const token=jwt(pem,APP_ID),parts=token.split('.'),header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  assert.equal(header.kid,APP_ID);assert.equal(claims.iss,'enablebanking.com');assert.equal(claims.aud,'api.enablebanking.com');
  assert.equal(claims.exp-claims.iat,3600);assert(verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),keys.publicKey,Buffer.from(parts[2],'base64url')));
});
test('state mismatch does not cancel a valid flow; valid state is single-use and expires',()=>{
  const p=pendingAuthorization({name:'Test',country:'DE',maximum_consent_validity:86400},1000),v={pending:p};
  assert.throws(()=>consumeAuthorization(v,{state:'wrong',code:'code'},2000));assert(v.pending);
  consumeAuthorization(v,{state:p.state,code:'code'},2000);assert(!v.pending);assert.throws(()=>consumeAuthorization(v,{state:p.state,code:'code'},2000));
  assert.throws(()=>consumeAuthorization({pending:p},{state:p.state,code:'code'},p.expires+1));
});
test('duplicate imports preserve two genuinely identical transactions without stable IDs',()=>{
  const s=state(),batch=convertTransactions([tx(),tx()],account).converted;
  assert.notEqual(batch[0].bankId,batch[1].bankId);assert.equal(reconcile(s,batch,TEST_IBAN).added,2);
  const repeat=reconcile(s,convertTransactions([tx(),tx()],account).converted,TEST_IBAN);assert.equal(repeat.duplicates,2);assert.equal(s.bookings.length,2);
});
test('CSV/API overlap preserves manual categorisation and monthly income',()=>{
  const s=state();s.bookings.push({date:'31.10.2026',amount:-12.3,payee:'ALDI',purpose:'Einkauf Lebensmittel',booking:'Kartenzahlung',category:'Meine Kategorie',categoryManual:true,fixed:'Ja',fixedManual:true});
  const out=reconcile(s,convertTransactions([tx({entry_reference:'ref-1'})],account).converted,TEST_IBAN);
  assert.equal(out.matched,1);assert.equal(s.bookings.length,1);assert.equal(s.bookings[0].category,'Meine Kategorie');assert.equal(s.bookings[0].fixed,'Ja');assert.equal(s.incomes['2026-10'].bettina,1800);
  assert.equal(reconcile(s,convertTransactions([tx({entry_reference:'ref-1'})],account).converted,TEST_IBAN).duplicates,1);
});
test('uncertain same-date-and-amount overlap is quarantined, not added to totals',()=>{
  const s=state();s.bookings.push({date:'31.10.2026',amount:-12.3,payee:'Anderer Name',purpose:'Alter Text',booking:'CSV'});
  const batch=convertTransactions([tx({entry_reference:'uncertain'})],account).converted;
  assert.equal(reconcile(s,batch,TEST_IBAN).review,1);assert.equal(s.bookings.length,1);assert.equal(s.bankReview.length,1);
  reconcile(s,batch,TEST_IBAN);assert.equal(s.bankReview.length,1);
});
test('pending and non-EUR rows are excluded explicitly; bad booked data aborts',()=>{
  const result=convertTransactions([tx({status:'PDNG'}),tx({transaction_amount:{amount:'12.3',currency:'USD'}})],account);
  assert.equal(result.converted.length,0);assert.deepEqual(result.stats,{pending:1,foreign:1});
  assert.throws(()=>convertTransactions([tx({transaction_amount:{amount:'n/a',currency:'EUR'}})],account));
});
test('all transaction pages are fetched, and looping pages fail',async()=>{
  const urls=[];const client=new EnableBanking(pem,APP_ID,async(url)=>{urls.push(url);return Response.json(url.includes('continuation_key=page2')?{transactions:[tx({entry_reference:'2'})]}:{transactions:[tx({entry_reference:'1'})],continuation_key:'page2'});});
  assert.equal((await client.transactions('id','2026-01-01','2026-11-01')).length,2);assert.equal(urls.length,2);
  const loop=new EnableBanking(pem,APP_ID,async()=>Response.json({transactions:[],continuation_key:'same'}));
  await assert.rejects(loop.transactions('id','2026-01-01','2026-11-01'),/Wiederholter/);
});
test('complete mocked HTTP flow: auth gates, key upload, callback, migration, import, conflict',async(t)=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'haushalt-test-'));let clock=Date.parse('2026-11-01T12:00:00Z'),authBody,failPages=false;
  const seed=path.join(dir,'seed.json');writeFileSync(seed,JSON.stringify({joern:4000,account:TEST_IBAN,fixed:[],bookings:[]}));
  const mock=async(url,opts)=>{
    const u=new URL(url);
    if(u.pathname==='/application')return Response.json({kid:APP_ID,active:true,environment:'PRODUCTION',redirect_urls:[REDIRECT]});
    if(u.pathname==='/aspsps')return Response.json({aspsps:[{name:'Test Volksbank',country:'DE',psu_types:['personal'],maximum_consent_validity:180*86400}]});
    if(u.pathname==='/auth'){authBody=JSON.parse(opts.body);return Response.json({url:'https://auth.enablebanking.com/ais/start?sessionid=test'});}
    if(u.pathname==='/sessions')return Response.json({session_id:'session-1',accounts:[account]});
    if(u.pathname.endsWith('/transactions')){if(failPages)return Response.json({error:'ASPSP_TIMEOUT'},{status:408});return Response.json({transactions:[tx({entry_reference:'r1'})]});}
    if(u.pathname.endsWith('/balances'))return Response.json({balances:[{balance_amount:{amount:'1000.00',currency:'EUR'},balance_type:'CLBD'}]});
    return Response.json({error:'UNEXPECTED'},{status:400});
  };
  const app=createApp({dataDir:path.join(dir,'data'),fetcher:mock,now:()=>clock,allowedIngress:['127.0.0.1'],seedPath:seed});
  await new Promise(resolve=>app.ingress.listen(0,'127.0.0.1',resolve));await new Promise(resolve=>app.internal.listen(0,'127.0.0.1',resolve));
  t.after(()=>{app.stop();rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+app.ingress.address().port,internal='http://127.0.0.1:'+app.internal.address().port;
  async function request(route,data,user='owner',extra={}) {const r=await fetch(base+route,{method:data===undefined?'GET':'POST',headers:{...(user?{'X-Remote-User-Id':user}:{}),...(data===undefined?{}:{'Content-Type':'application/json','X-Haushalt-Request':'1'}),...extra},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:r.status,data:await r.json()};}
  assert.equal((await request('/api/status',undefined,null)).status,403);
  let s=(await request('/api/status')).data;assert(s.bridgeSecret);assert(!JSON.stringify(s).includes('PRIVATE KEY'));
  assert.equal((await request('/api/dashboard',undefined,'stranger')).status,403);
  assert.equal((await fetch(internal+'/health')).status,401);
  assert.equal((await request('/api/key',{pem},'owner',{'X-Haushalt-Request':'bad'})).status,403);
  assert.equal((await request('/api/connection',{applicationId:APP_ID,redirectUrl:REDIRECT,expectedAccount:TEST_IBAN})).status,200);
  assert.equal((await request('/api/key',{pem})).status,200);
  const privateFile=readFileSync(path.join(dir,'data/private.json'),'utf8');assert(privateFile.includes('PRIVATE KEY'));
  const bridgeHeaders={Authorization:'Bearer '+s.bridgeSecret};assert.equal((await fetch(internal+'/health',{headers:bridgeHeaders})).status,200);
  assert.equal((await request('/api/auth',{name:'Test Volksbank'})).status,200);assert.equal(authBody.psu_type,'personal');
  const callback=payload=>fetch(internal+'/callback',{method:'POST',headers:{...bridgeHeaders,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal((await callback({code:'secret-code',state:'wrong'})).status,400);
  assert.equal((await callback({code:'secret-code',state:authBody.state})).status,200);
  assert.equal((await callback({code:'secret-code',state:authBody.state})).status,400);
  assert.equal((await request('/api/accounts',{uids:['test-uid']})).status,200);
  assert.equal((await request('/api/sync',{})).status,400); // migration required, no data imported
  assert.equal(app.getDatabase().state.bookings.length,0);
  await request('/api/migration',{confirmed:true});
  const before=app.getDatabase();const synced=await request('/api/sync',{});assert.equal(synced.status,200);assert.equal(synced.data.added,1);
  assert.equal((await request('/api/dashboard',{revision:before.revision,state:before.state})).status,409);
  clock+=60001;const again=await request('/api/sync',{});assert.equal(again.data.duplicates,1);assert.equal(app.getDatabase().state.bookings.length,1);
  const revision=app.getDatabase().revision;clock+=60001;failPages=true;assert.equal((await request('/api/sync',{})).status,502);assert.equal(app.getDatabase().revision,revision);
  await request('/api/users',{ids:['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']});s=(await request('/api/status',undefined,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).data;assert.equal(s.owner,false);assert.equal(s.bridgeSecret,undefined);assert.equal(s.keyStored,true);
  assert.equal((await request('/api/settings',{autoSync:false,intervalHours:12,historyDays:90},'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).status,403);
});
