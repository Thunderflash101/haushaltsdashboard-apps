import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeIban,normalizeConnection} from '../haushaltsdashboard/app/lib/configuration.mjs';
import {createApp} from '../haushaltsdashboard/app/server.mjs';

const connection={applicationId:'00000000-0000-4000-8000-000000000001',redirectUrl:'https://ha.example.org/api/webhook/test-hook-0123456789',expectedAccount:'DE89370400440532013000'};
test('IBAN normalization checks the checksum and does not accept a transcription error',()=>{
  assert.equal(normalizeIban('de89 3704 0044 0532 0130 00'),connection.expectedAccount);
  assert.throws(()=>normalizeIban(connection.expectedAccount.slice(0,-1)+'1'));
});
test('only a complete HTTPS callback URL without credentials or query parameters is accepted',()=>{
  assert.equal(normalizeConnection(connection).webhook,'test-hook-0123456789');
  for(const redirectUrl of ['http://ha.example.org/api/webhook/test-hook-0123456789','https://ha.example.org/','https://u:p@ha.example.org/api/webhook/test-hook-0123456789','https://ha.example.org/api/webhook/test-hook-0123456789?secret=1'])assert.throws(()=>normalizeConnection({...connection,redirectUrl}));
});
test('empty first start, JSON migration, names, user permissions and config survive a code restart',async(t)=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'household-update-'));let app;
  async function start(){app=createApp({dataDir:dir,allowedIngress:['127.0.0.1']});await new Promise(r=>app.ingress.listen(0,'127.0.0.1',r));}
  await start();t.after(()=>{app.stop();rmSync(dir,{recursive:true,force:true});});
  async function req(route,data,user='owner'){const r=await fetch('http://127.0.0.1:'+app.ingress.address().port+'/api/'+route,{method:data===undefined?'GET':'POST',headers:{'X-Remote-User-Id':user,...(data===undefined?{}:{'Content-Type':'application/json','X-Haushalt-Request':'1'})},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:r.status,data:await r.json()};}
  const initial=await req('dashboard');assert.equal(initial.data.state.bookings.length,0);assert.equal(initial.data.state.fixed.length,0);assert.equal(initial.data.state.joern,null);assert.equal(initial.data.connection.applicationId,'');
  assert.equal((await req('connection',connection)).status,200);
  const migrated={...initial.data.state,incomes:{'2026-10':{joern:4000,bettina:1800}},categories:['Eigene Kategorie'],rules:[],fixed:[{name:'Internet',monthly:40,status:'Ja'}],bookings:[{date:'31.10.2026',amount:-20,payee:'Testgeschäft',purpose:'Einkauf',booking:'CSV',category:'Eigene Kategorie',fixed:'Nein'}]};
  assert.equal((await req('dashboard',{revision:initial.data.revision,state:migrated})).status,200);
  assert.equal((await req('people',{first:'Alex',second:'Sam'})).status,200);
  assert.equal((await req('users',{ids:['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']})).status,200);
  assert.equal((await req('users',{ids:['c'.repeat(33)]})).status,400);
  app.stop();await start();
  const updated=await req('dashboard');assert.equal(updated.data.state.incomes['2026-10'].bettina,1800);assert.equal(updated.data.state.bookings[0].category,'Eigene Kategorie');assert.equal(updated.data.state.people.first,'Alex');assert.equal(updated.data.connection.expectedAccount,connection.expectedAccount);
  assert.equal((await req('dashboard',undefined,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).status,200);
});
