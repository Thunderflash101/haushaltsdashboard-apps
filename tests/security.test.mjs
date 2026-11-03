import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {createApp} from '../haushaltsdashboard/app/server.mjs';
import {writeJson,readJson} from '../haushaltsdashboard/app/lib/storage.mjs';

const connection={applicationId:'00000000-0000-4000-8000-000000000001',redirectUrl:'https://ha.example.org/api/webhook/test-hook-0123456789',expectedAccount:'DE89370400440532013000'};
const member='b'.repeat(32);
const getRoutes=['/','/dashboard.html','/settings.js','/finance.mjs','/forecast.mjs','/learning.mjs','/contracts.mjs','/contracts-ui.mjs','/booking-text.mjs','/forecast-ui.mjs','/flexible.mjs','/flexible-ui.mjs','/api/dashboard','/api/revision','/api/status','/api/banks'];
const postRoutes=['/api/dashboard','/api/people','/api/connection','/api/key','/api/migration','/api/users','/api/settings','/api/auth','/api/accounts','/api/sync','/api/review','/api/disconnect'];
async function fixture(t,options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'household-security-'));
  const app=createApp({dataDir:dir,allowedIngress:['127.0.0.1'],...options});
  await new Promise(resolve=>app.ingress.listen(0,'127.0.0.1',resolve));
  await new Promise(resolve=>app.internal.listen(0,'127.0.0.1',resolve));
  t.after(()=>{app.stop();fs.rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+app.ingress.address().port,internal='http://127.0.0.1:'+app.internal.address().port;
  const req=(route,data,user='owner',headers={})=>fetch(base+route,{method:data===undefined?'GET':'POST',headers:{...(user?{'X-Remote-User-Id':user}:{}),...(data===undefined?{}:{'Content-Type':'application/json','X-Haushalt-Request':'1'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
  return {dir,app,req,internal};
}

test('every ingress route rejects a forged user identity from an untrusted source before claiming ownership',async t=>{
  const {dir,req}=await fixture(t,{allowedIngress:['192.0.2.1']});
  for(const route of getRoutes)assert.equal((await req(route)).status,403,route);
  for(const route of postRoutes)assert.equal((await req(route,{})).status,403,route);
  assert.equal(readJson(path.join(dir,'private.json'),{}).owner,null);
});

test('every ingress route requires a valid and explicitly authorized Home Assistant user',async t=>{
  const {req}=await fixture(t);
  for(const user of [null,'bad identity']){
    for(const route of getRoutes)assert.equal((await req(route,undefined,user)).status,403,route);
    for(const route of postRoutes)assert.equal((await req(route,{},user)).status,403,route);
  }
  assert.equal((await req('/api/status')).status,200);
  for(const route of getRoutes)assert.equal((await req(route,undefined,'stranger')).status,403,route);
  for(const route of postRoutes)assert.equal((await req(route,{},'stranger')).status,403,route);
});

test('approved household members may edit finances but cannot administer the bank connection or user list',async t=>{
  const {req}=await fixture(t);
  await req('/api/status');await req('/api/users',{ids:[member]});
  for(const route of postRoutes.filter(route=>route!=='/api/dashboard'))assert.equal((await req(route,{},member)).status,403,route);
  assert.equal((await req('/api/banks',undefined,member)).status,403);
  const status=await (await req('/api/status',undefined,member)).json();
  assert.equal(status.owner,false);assert.equal(status.bridgeSecret,undefined);assert.equal(status.allowedUsers,undefined);
  const db=await (await req('/api/dashboard',undefined,member)).json();
  assert.equal((await req('/api/dashboard',{revision:db.revision,state:{...db.state,budgets:{Lebensmittel:150}}},member)).status,200);
});

test('every internal endpoint requires the exact bearer secret; ingress identity cannot replace it',async t=>{
  const {req,internal}=await fixture(t);
  await req('/api/connection',connection);
  const status=await (await req('/api/status')).json();
  for(const authorization of [undefined,'Bearer wrong',status.bridgeSecret,'bearer '+status.bridgeSecret]){
    for(const [route,method] of [['/health','GET'],['/callback','POST'],['/unknown','GET']]){
      const response=await fetch(internal+route,{method,headers:{'X-Remote-User-Id':'owner',...(authorization?{Authorization:authorization}:{})}});
      assert.equal(response.status,401,route);
    }
  }
  assert.equal((await fetch(internal+'/health',{headers:{Authorization:'Bearer '+status.bridgeSecret}})).status,200);
});

test('private key and bridge secret stay out of financial exports and bank error responses',async t=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const pem=privateKey.export({format:'pem',type:'pkcs8'}).toString();
  const fetcher=async url=>new URL(url).pathname==='/application'?Response.json({kid:connection.applicationId,environment:'PRODUCTION',active:true,redirect_urls:[connection.redirectUrl]}):Response.json({error:'ASPSP_TIMEOUT',details:pem},{status:503});
  const {dir,req}=await fixture(t,{fetcher});await req('/api/connection',connection);
  assert.equal((await req('/api/key',{pem})).status,200);
  const status=await (await req('/api/status')).json();
  const exported=await (await req('/api/dashboard')).text();
  assert.ok(!exported.includes('PRIVATE KEY'),'Financial export must not contain the private key');
  assert.ok(!exported.includes(status.bridgeSecret),'Financial export must not contain the bridge secret');
  assert.equal(status.pem,undefined);assert.equal(status.keyStored,true);assert.ok(!JSON.stringify(status).includes('PRIVATE KEY'));
  const error=await req('/api/banks');assert.equal(error.status,502);assert.ok(!(await error.text()).includes('PRIVATE KEY'));
  assert.equal((await req('/private.json')).status,404);
});

test('data files and snapshots use private permissions, including after replacing an old file',async t=>{
  const {dir,req}=await fixture(t);
  for(const name of ['private.json','dashboard.json']){
    const file=path.join(dir,name);assert.equal(fs.statSync(file).mode&0o777,0o600,name);
    fs.chmodSync(file,0o644);writeJson(file,readJson(file,{}));assert.equal(fs.statSync(file).mode&0o777,0o600,name);
  }
  const db=await (await req('/api/dashboard')).json();
  assert.equal((await req('/api/dashboard',{revision:db.revision,state:db.state})).status,200);
  const snapshots=path.join(dir,'snapshots');assert.equal(fs.statSync(snapshots).mode&0o777,0o700);
  const files=fs.readdirSync(snapshots);assert.ok(files.length>0);
  for(const name of files)assert.equal(fs.statSync(path.join(snapshots,name)).mode&0o777,0o600,name);
});

test('stale concurrent writes are rejected without overwriting the newer on-disk state',async t=>{
  const {dir,req}=await fixture(t);await req('/api/users',{ids:[member]});
  const old=await (await req('/api/dashboard')).json();
  const next={...old.state,incomes:{'2026-11':{joern:3000,bettina:1800}}};
  assert.equal((await req('/api/dashboard',{revision:old.revision,state:next},member)).status,200);
  const before=fs.readFileSync(path.join(dir,'dashboard.json'),'utf8');
  assert.equal((await req('/api/dashboard',{revision:old.revision,state:old.state})).status,409);
  assert.equal(fs.readFileSync(path.join(dir,'dashboard.json'),'utf8'),before);
});

test('a failed atomic replacement preserves the complete previous JSON generation',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'household-atomic-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'state.json');writeJson(file,{revision:1,value:'previous'});
  const rename=t.mock.method(fs,'renameSync',()=>{throw new Error('Simulated rename failure');});
  assert.throws(()=>writeJson(file,{revision:2,value:'next'}),/Simulated/);
  assert.deepEqual(readJson(file,{}),{revision:1,value:'previous'});
  rename.mock.restore();writeJson(file,{revision:2,value:'next'});
  assert.deepEqual(readJson(file,{}),{revision:2,value:'next'});
});
