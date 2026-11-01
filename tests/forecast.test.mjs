import test from 'node:test';
import assert from 'node:assert/strict';
import {forecast,defaults,bankSnapshot,validateForecast,incomeSuggestions} from '../haushaltsdashboard/app/public/forecast.mjs';
import {validState} from '../haushaltsdashboard/app/lib/storage.mjs';
const today='2026-11-10';
const base=()=>({version:1,fixed:[],bookings:[],budgets:{},incomes:{},forecast:defaults({balanceSource:'manual',manualBalance:{amount:1000,date:today},useBudgets:false})});
const booking=(date,amount,extra={})=>({date,amount,payee:'Testanbieter',purpose:'Zahlung',category:'Wohnen',fixed:'Nein',...extra});
const fixed=(extra={})=>({name:'Wohnen',category:'Wohnen',monthly:100,rhythm:'monatlich',status:'Ja',dueDay:15,matchKeyword:'Testanbieter',...extra});
const income=(extra={})=>({id:'salary',name:'Gehalt',source:'fixed',amount:2000,day:28,matchKeyword:'Arbeitgeber',startMonth:'2026-11',category:'Gehalt',...extra});
const run=s=>forecast(s,null,{today});
test('missing balance never becomes zero, and negative manual balances are supported',()=>{
  const state=base();state.forecast.manualBalance=null;let r=run(state);assert.equal(r.current,null);assert.equal(r.available,null);assert.deepEqual(r.points,[]);
  state.forecast.manualBalance={amount:-100,date:today};r=run(state);assert.equal(r.available,-100);assert.equal(r.minimum,-100);
});
test('bank balance selection excludes available balances, preserves zero, and requires the selected account',()=>{
  const vault={session:{},selectedAccounts:['a'],lastSync:'2026-11-10T12:00:00Z',balances:[{uid:'a',balances:[{balance_type:'ITAV',balance_amount:{amount:'5000',currency:'EUR'}},{balance_type:'ITBD',reference_date:today,balance_amount:{amount:'0',currency:'EUR'}}]}]};
  assert.equal(bankSnapshot(vault).amount,0);vault.balances[0].balances.pop();assert.equal(bankSnapshot(vault),null);vault.selectedAccounts=[];assert.equal(bankSnapshot(vault),null);
});
test('bookings after the balance date are added exactly once; same-day and foreign-account bookings are excluded',()=>{
  const state=base();state.forecast.manualBalance.date='2026-11-01';state.bookings=[booking('01.11.2026',-900),booking('05.11.2026',-100),booking('10.11.2026',-50),booking('09.11.2026',500,{account:'other'})];
  const r=forecast(state,null,{today,account:'household'});assert.equal(r.current,850);assert.equal(r.endBalance,850);assert.ok(r.warnings.some(x=>x.includes('älter')));
});
test('a booked fixed cost disappears from the forecast but stays in the original records',()=>{
  const state=base();state.fixed=[fixed()];state.bookings=[booking('10.11.2026',-100,{fixed:'Ja'})];const before=JSON.stringify(state),r=run(state),e=r.events.find(e=>e.id==='fixed-0-2026-11');
  assert.equal(e.status,'booked');assert.equal(r.points[0].balance,1000);assert.equal(JSON.stringify(state),before);
});
test('matching uses split gross amounts and does not reduce paid fixed costs by refunds',()=>{
  const state=base();state.fixed=[fixed()];state.bookings=[booking('10.11.2026',-150,{splits:[{category:'Wohnen',amount:100,kind:'expense',fixed:'Ja'},{category:'Lebensmittel',amount:50,kind:'expense',fixed:'Nein'}]})];
  assert.equal(run(state).events.find(e=>e.id==='fixed-0-2026-11').status,'booked');
});
test('one booking cannot pay two plans and ambiguous category-only matches stay planned',()=>{
  const state=base();state.fixed=[fixed(),fixed({name:'Zweiter Posten'})];state.bookings=[booking('10.11.2026',-100,{fixed:'Ja'})];assert.equal(run(state).events.filter(e=>e.month==='2026-11'&&e.status==='booked').length,1);
  state.fixed=[fixed({matchKeyword:''})];state.bookings.push(booking('11.11.2026',-100,{fixed:'Ja'}));
  const r=forecast(state,null,{today:'2026-11-12'});assert.equal(r.events.find(e=>e.id==='fixed-0-2026-11').status,'planned');assert.ok(r.warnings.some(x=>x.includes('mehrere Buchungen')));
});
test('monthly net income requires an explicit account plan; missing months are excluded estimates, zero stays zero',()=>{
  const state=base();state.incomes={'2026-11':{bettina:1800},'2026-12':{bettina:0}};assert.equal(run(state).plannedIncome,0);
  state.forecast.incomePlans=[income({source:'bettina',amount:1500})];state.forecast.horizon=90;let r=run(state);
  assert.equal(r.events.find(e=>e.id==='income-salary-2026-11').amount,1800);assert.equal(r.events.some(e=>e.id==='income-salary-2026-12'),false);assert.equal(r.events.find(e=>e.id==='income-salary-2027-01').status,'estimate-excluded');
  state.forecast.includeEstimates=true;r=run(state);assert.equal(r.events.find(e=>e.id==='income-salary-2027-01').status,'planned');
});
test('overdue unreceived income is not counted, while overdue expenses remain deducted',()=>{
  const state=base();state.fixed=[fixed({dueDay:5})];state.forecast.incomePlans=[income({day:5})];const r=run(state);
  assert.equal(r.events.find(e=>e.id==='income-salary-2026-11').status,'overdue-income');assert.equal(r.events.find(e=>e.id==='fixed-0-2026-11').date,today);assert.equal(r.points[0].balance,900);
});
test('salary around a month boundary satisfies the closest month and is not counted again',()=>{
  const state=base();state.forecast.incomePlans=[income({day:31,startMonth:'2026-10'})];state.bookings=[booking('01.11.2026',2000,{payee:'Arbeitgeber',category:'Gehalt'})];
  const r=run(state);assert.equal(r.events.find(e=>e.id==='income-salary-2026-11').status,'planned');assert.equal(r.events.find(e=>e.id==='income-salary-2026-11').date,'2026-11-30');
});
test('budget remaining subtracts actual spending and planned fixed/one-off expenses, without double counting',()=>{
  const state=base();state.forecast.useBudgets=true;state.fixed=[fixed()];state.budgets={Wohnen:500};state.bookings=[booking('05.11.2026',-50)];state.forecast.oneOffs=[{id:'repair',name:'Reparatur',date:'2026-11-20',amount:-200,kind:'expense',category:'Wohnen',matchKeyword:''}];
  const r=run(state),budget=r.budgetEvents.filter(e=>e.month==='2026-11').reduce((n,e)=>n+Math.round(e.amount*100),0);
  assert.equal(budget,-15000);assert.equal(r.events.filter(e=>e.month==='2026-11'&&e.status==='planned').reduce((n,e)=>n+e.amount,0),-300);
});
test('protected money and buffer affect availability but not the cash balance; minimum includes starting balance',()=>{
  const state=base();state.forecast.protectedBalance=200;state.forecast.buffer=100;state.forecast.incomePlans=[income()];state.fixed=[fixed()];const r=run(state);
  assert.equal(r.available,600);assert.equal(r.freeUntil,'2026-11-27');assert.equal(r.endBalance,2900);assert.equal(r.minimum,900);
});
test('quarterly/yearly plans need an anchor, include whole due amounts, and clamp dates in February',()=>{
  const state=base();state.fixed=[fixed({monthly:10,rhythm:'jährlich',anchorMonth:11,dueDay:31})];assert.equal(run(state).events[0].amount,-120);assert.equal(run(state).events[0].date,'2026-11-30');
  state.fixed[0].anchorMonth=null;const r=run(state);assert.equal(r.events.length,0);assert.ok(r.warnings.some(x=>x.includes('Fälligkeitsmonat')));
});
test('excluded plans can be restored and are not fake bank transactions',()=>{
  const state=base();state.fixed=[fixed()];state.forecast.excluded=['fixed-0-2026-11'];let r=run(state);assert.equal(r.events[0].status,'excluded');assert.equal(state.bookings.length,0);
  state.forecast.excluded=[];r=run(state);assert.equal(r.events[0].status,'planned');
});
test('forecast validation rejects nonfinite values and invalid dates, but accepts old states',()=>{
  assert.equal(validateForecast(undefined),null);assert.equal(validState(base()),true);
  for(const update of [{buffer:-1},{horizon:10000},{manualBalance:{amount:0,date:'2026-02-30'}},{incomePlans:[income({day:0})]},{oneOffs:[{id:'a',name:'Test',date:today,amount:0,kind:'expense',matchKeyword:''}]}])assert.notEqual(validateForecast({...defaults(),...update}),null);
});
test('salary suggestions remain proposals and do not add income to the account',()=>{
  const state=base();state.bookings=[booking('28.09.2026',2000,{payee:'Arbeitgeber',category:'Gehalt'}),booking('28.10.2026',2100,{payee:'Arbeitgeber',category:'Gehalt'})];assert.equal(incomeSuggestions(state.bookings)[0].day,28);assert.equal(run(state).plannedIncome,0);
});
