import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inflowKind,analyzeMonth,compareMonths,validateFinanceState,refundableParts,relationCandidates,bookingParts} from '../haushaltsdashboard/app/public/finance.mjs';
import {validState} from '../haushaltsdashboard/app/lib/storage.mjs';
import {reconcile} from '../haushaltsdashboard/app/lib/banking.mjs';
import {createApp} from '../haushaltsdashboard/app/server.mjs';

const debit=(overrides={})=>({date:'10.10.2026',amount:-100,payee:'Testgeschäft',purpose:'Einkauf',category:'Lebensmittel',fixed:'Nein',...overrides});
const fixture=()=>({version:1,fixed:[],bookings:[debit({financeId:'purchase',splits:[{category:'Lebensmittel',amount:60,kind:'expense',fixed:'Nein'},{category:'Abos',amount:40,kind:'expense',fixed:'Ja'}]}),debit({financeId:'refund',date:'05.11.2026',amount:30,flowType:'refund',category:'Erstattungen/Gutschriften',refund:{targetId:'purchase',allocations:[{category:'Lebensmittel',amount:30,kind:'expense',fixed:'Nein'}]}})]});

test('split amounts conserve cents and their individual fixed status',()=>{
  const {bookings}=fixture(),result=analyzeMonth(bookings,'2026-10',{spendingOnly:true});
  assert.equal(result.expense,100);assert.equal(result.variable,60);assert.equal(result.yes,40);assert.equal(result.balance,-100);
  assert.equal(validState(fixture()),true);
  assert.equal(bookingParts(debit({splits:[{category:'A',amount:60,kind:'expense'},{category:'B',amount:40,kind:'expense'}],fixed:'Ja'}))[0].fixed,'Ja');
});
test('a partial refund reduces its category on receipt date, without changing bank cashflow',()=>{
  const state=fixture(),nov=analyzeMonth(state.bookings,'2026-11',{spendingOnly:true});
  assert.equal(nov.expense,-30);assert.equal(nov.income,0);assert.equal(nov.balance,30);assert.equal(nov.cashIncome,30);assert.equal(nov.variable,-30);
  assert.equal(nov.categories[0][0],'Lebensmittel');assert.equal(nov.entries[0].isRefund,true);
  const cash=analyzeMonth(state.bookings,'2026-11');assert.equal(cash.expense,0);assert.equal(cash.income,30);assert.equal(cash.balance,nov.balance);
  assert.equal(refundableParts(state.bookings,state.bookings[0])[0].cents,3000);
});
test('multiple partial refunds cannot exceed an original category or orphan their purchase',()=>{
  const state=fixture();state.bookings.push({...structuredClone(state.bookings[1]),financeId:'refund-2'});
  assert.equal(validateFinanceState(state),null);
  state.bookings[2].amount=31;state.bookings[2].refund.allocations[0].amount=31;assert.match(validateFinanceState(state),/überschreiten/);
  state.bookings.splice(0,1);assert.match(validateFinanceState(state),/Erstattungszuordnung/);
});
test('invalid splits, duplicate identities and inconsistent refund amounts are rejected',()=>{
  for(const mutate of [s=>s.bookings[0].splits[0].amount=59.99,s=>s.bookings[0].splits[0].amount=60.001,s=>s.bookings[1].financeId='purchase',s=>s.bookings[1].amount=29.99,s=>s.bookings[1].refund.allocations[0].category='Andere Kategorie',s=>s.bookings[1].refund=null]){const state=fixture();mutate(state);assert.notEqual(validateFinanceState(state),null);}
});
test('investment and transfer flows are distinct from income and consumption',()=>{
  const bookings=[debit({amount:-50,category:'ETFs'}),debit({amount:-200,flowType:'transfer',financeId:'out',transferPeerId:'in'}),debit({amount:200,flowType:'transfer',financeId:'in',transferPeerId:'out'}),debit({amount:100,flowType:'investment'}),debit({amount:1000,category:'Gehalt',flowType:'income'})];
  assert.equal(validateFinanceState({bookings}),null);
  const spending=analyzeMonth(bookings,'2026-10',{spendingOnly:true}),cash=analyzeMonth(bookings,'2026-10');
  assert.equal(spending.expense,0);assert.equal(spending.income,1000);assert.equal(cash.income,1300);assert.equal(cash.expense,250);assert.equal(spending.balance,1050);
  assert.equal(inflowKind({category:'ETFs'}),'investment');assert.equal(inflowKind({category:'ETFs',flowType:'income'}),'income');assert.equal(inflowKind({category:'Sonstiges',flowType:'expense'}),'income');
  bookings[2].transferPeerId='missing';assert.match(validateFinanceState({bookings}),/Umbuchungen/);
});
test('refund candidates suggest same merchant, but do not mutate or auto-link',()=>{
  const purchase=debit({financeId:'purchase'}),refund=debit({date:'15.10.2026',amount:30}),unrelated=debit({payee:'Anderes Geschäft'}),bookings=[purchase,refund,unrelated],before=JSON.stringify(bookings);
  const choices=relationCandidates(bookings,refund,'refund');assert.equal(choices[0].booking,purchase);assert.equal(choices[0].suggested,true);assert.equal(JSON.stringify(bookings),before);
});
test('transfers on the same known account are not proposed',()=>{
  const a=debit({account:'account-a'}),b=debit({account:'account-a',amount:100}),c=debit({account:'account-b',amount:100});
  const choices=relationCandidates([a,b,c],a,'transfer');assert.equal(choices.length,1);assert.equal(choices[0].booking,c);assert.equal(choices[0].suggested,true);
});
test('previous month means calendar month, never the previous available month',()=>{
  const bookings=[debit({date:'01.08.2026'}),debit({date:'31.10.2026'})];
  const result=compareMonths(bookings,'2026-10',{today:'2026-11-01'});assert.equal(result.hasComparison,false);assert.deepEqual(result.missing,['2026-09']);
});
test('twelve-month baseline excludes missing months and includes zero categories in present months',()=>{
  const bookings=[debit({date:'31.08.2026',amount:-20}),debit({date:'30.09.2026',amount:-80,category:'Tanken'}),debit({date:'31.10.2026',amount:-70})];
  const result=compareMonths(bookings,'2026-10',{mode:'average',today:'2026-11-01'});
  assert.equal(result.keys.length,2);assert.equal(result.missing.length,10);assert.equal(result.average,50);assert.equal(result.delta,20);
  assert.equal(result.changes.find(x=>x.name==='Lebensmittel').previous,10);assert.equal(result.changes.reduce((n,x)=>n+Math.round(x.delta*100),0),2000);
});
test('same-day comparisons use the data cutoff and handle short months without extrapolation',()=>{
  const bookings=[debit({date:'05.10.2026',amount:-50}),debit({date:'15.10.2026',amount:-80}),debit({date:'05.11.2026',amount:-70})];
  const result=compareMonths(bookings,'2026-11',{today:'2026-11-10'});assert.equal(result.throughDay,5);assert.equal(result.average,50);assert.equal(result.delta,20);
  const whole=compareMonths(bookings,'2026-11',{today:'2026-11-10',sameDay:false});assert.equal(whole.average,130);assert.equal(whole.partial,true);
  const short=compareMonths([debit({date:'28.02.2026'}),debit({date:'31.03.2026'})],'2026-03',{today:'2026-04-01'});assert.equal(short.delta,0);
});
test('year-over-year compares the matching calendar month and accounts for refunds',()=>{
  const state=fixture();state.bookings.push(debit({date:'05.11.2025',amount:-80}));
  const result=compareMonths(state.bookings,'2026-11',{mode:'year',today:'2026-11-05'});assert.deepEqual(result.keys,['2025-11']);assert.equal(result.delta,-110);
});
test('bank overlap preserves split/refund identity, while a new import keeps every association valid',()=>{
  const state=fixture();state.bookings[0].account='ACCOUNT-A';state.bookings[0].booking='CSV';
  const result=reconcile(state,[{...debit(),account:'ACCOUNT-A',bankId:'ref-1',importSource:'enablebanking',booking:'Bankimport'}],'ACCOUNT-A');
  assert.equal(result.matched,1);assert.equal(state.bookings[0].financeId,'purchase');assert.equal(state.bookings[1].refund.targetId,'purchase');assert.equal(validateFinanceState(state),null);
});
test('dashboard module parses before publication',()=>{
  const html=readFileSync(new URL('../haushaltsdashboard/app/public/dashboard.html',import.meta.url),'utf8');
  const code=html.split('<script type="module">')[1].split('</script>')[0],folder=mkdtempSync(path.join(tmpdir(),'dashboard-syntax-'));
  try{const file=path.join(folder,'dashboard.mjs');writeFileSync(file,code);const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}finally{rmSync(folder,{recursive:true,force:true});}
});
test('HTTP saving rejects invalid relationships and persists valid ones across restart',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'finance-server-'));let app;
  async function start(){app=createApp({dataDir:dir,allowedIngress:['127.0.0.1']});await new Promise(r=>app.ingress.listen(0,'127.0.0.1',r));}
  await start();t.after(()=>{app.stop();rmSync(dir,{recursive:true,force:true});});
  const request=(route,data)=>fetch(`http://127.0.0.1:${app.ingress.address().port}${route}`,{method:data?'POST':'GET',headers:{'X-Remote-User-Id':'owner',...(data?{'Content-Type':'application/json','X-Haushalt-Request':'1'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const initial=await (await request('/api/dashboard')).json(),state=fixture();
  state.forecast={balanceSource:'manual',manualBalance:{amount:1000,date:'2026-11-01'},horizon:60,protectedBalance:200};
  const result=await request('/api/dashboard',{revision:initial.revision,state});assert.equal(result.status,200);
  const saved=await result.json();state.bookings[1].refund.targetId='missing';assert.equal((await request('/api/dashboard',{revision:saved.revision,state})).status,400);
  app.stop();await start();const reloaded=await (await request('/api/dashboard')).json();assert.equal(reloaded.state.bookings[1].refund.targetId,'purchase');assert.equal(reloaded.revision,saved.revision);assert.equal(reloaded.state.forecast.protectedBalance,200);assert.equal(reloaded.state.forecast.horizon,60);
  const module=await request('/finance.mjs');assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);
});
