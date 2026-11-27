import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {newRecordId} from '../haushaltsdashboard/app/public/record-id.mjs';
const html=fs.readFileSync(new URL('../haushaltsdashboard/app/public/dashboard.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('function clean(value)'),html.indexOf('function parseDelimited('));
const context=vm.createContext({state:{bankReview:[],bankDismissed:[]},newRecordId});vm.runInContext(code,context);
const existing={date:'31.10.2026',amount:-12.3,payee:'ALDI',purpose:'Lebensmittel',booking:'Bankimport',importSource:'enablebanking',bankId:'bank-1'};
const csv={...existing,booking:'Kartenzahlung',importSource:undefined,bankId:undefined};
test('CSV after an API import matches across different booking-type strings',()=>{
  const r=context.selectNewBookings([existing],[csv]);assert.equal(r.fresh.length,0);assert.equal(r.duplicates,1);assert.equal(r.held.length,0);
});
test('CSV/API matching is one-to-one for genuinely repeated equal transactions',()=>{
  const r=context.selectNewBookings([existing,{...existing,bankId:'bank-2'}],[csv,{...csv}]);assert.equal(r.duplicates,2);assert.equal(r.fresh.length,0);
});
test('CSV with a changed reference is held for review even over local HTTP',t=>{
  t.mock.getter(globalThis,'crypto',()=>({getRandomValues:webcrypto.getRandomValues.bind(webcrypto)}));
  const r=context.selectNewBookings([existing],[{...csv,purpose:'Anderer Text'}]);
  assert.equal(r.fresh.length,0);
  assert.equal(r.held.length,1);
  assert.match(r.held[0].id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
