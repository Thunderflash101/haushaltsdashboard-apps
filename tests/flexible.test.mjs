import test from 'node:test';
import assert from 'node:assert/strict';
import {forecast,defaults} from '../haushaltsdashboard/app/public/forecast.mjs';
const today='2026-11-03';
const booking=(date,amount,category='Lebensmittel',extra={})=>({date,amount,category,payee:'Testmarkt',purpose:'Testzahlung',fixed:'Nein',...extra});
function state(){return {version:1,bookings:[booking('01.03.2026',1,'Sonstiges'),...['08','09','10'].map(m=>booking(`10.${m}.2026`,-100)),booking('01.11.2026',1,'Sonstiges')],fixed:[],contracts:[],budgets:{},forecast:defaults({balanceSource:'manual',manualBalance:{amount:1000,date:today}})};}
const run=s=>forecast(s,null,{today});
const row=(r,category='Lebensmittel',key='2026-11')=>r.flexibleMonths.find(m=>m.key===key).rows.find(r=>r.category===category);
test('flexible monthly estimates never become daily transactions or lower the dated balance curve',()=>{
  const s=state(),r=run(s);assert.equal(row(r).target,100);assert.equal(row(r).remaining,100);assert.deepEqual(r.budgetEvents,[]);assert.equal(r.endBalance,1000);assert.equal(r.plannedExpense,0);assert.ok(r.points.every(p=>p.balance===1000&&p.events.length===0));
  s.budgets.Lebensmittel=10000;const other=run(s);assert.deepEqual(other.points,r.points);assert.equal(row(other).target,10000);assert.equal(other.available,r.available);
});
test('dated fixed and one-off payments still change the balance on their real planned dates',()=>{
  const s=state();s.fixed=[{name:'Internet',category:'Internet',monthly:100,rhythm:'monatlich',status:'Ja',dueDay:15,matchKeyword:'Internetanbieter'}];s.forecast.oneOffs=[{id:'purchase',name:'Geplanter Einkauf',amount:-50,date:'2026-11-20',kind:'expense',category:'Lebensmittel',matchKeyword:''}];const r=run(s);assert.equal(r.points.find(p=>p.date==='2026-11-14').balance,1000);assert.equal(r.points.find(p=>p.date==='2026-11-15').balance,900);assert.equal(r.points.find(p=>p.date==='2026-11-20').balance,850);assert.equal(row(r).remaining,100);
});
test('actual purchases and allocated refunds update monthly consumption without a second cash deduction',()=>{
  const s=state();s.bookings.push(booking('02.11.2026',-40,'Lebensmittel',{financeId:'buy'}),booking('03.11.2026',10,'Erstattung',{financeId:'refund',flowType:'refund',refund:{targetId:'buy',allocations:[{category:'Lebensmittel',amount:10,kind:'expense',fixed:'Nein'}]}}));const r=run(s),food=row(r);assert.equal(food.spent,30);assert.equal(food.remaining,70);assert.equal(food.transactions.length,2);assert.equal(food.transactions.find(e=>e.isRefund).value,-10);assert.equal(r.current,1000);assert.equal(r.endBalance,1000);
});
test('historical refunds lower the flexible average and remain traceable in the history',()=>{
  const s=state();s.bookings.find(b=>b.date==='10.09.2026').financeId='september';s.bookings.push(booking('15.09.2026',30,'Erstattung',{financeId:'refund',flowType:'refund',refund:{targetId:'september',allocations:[{category:'Lebensmittel',amount:30,kind:'expense',fixed:'Nein'}]}}));const food=row(run(s));assert.equal(food.average,90);assert.equal(food.history.find(h=>h.month==='2026-09').spent,70);assert.equal(food.history.find(h=>h.month==='2026-09').used,70);assert.equal(food.model.sources.some(s=>s.amount===30),true);
});
test('a manual category budget takes priority while preserving the average for comparison',()=>{
  const s=state();s.budgets.Lebensmittel=250;s.bookings.push(booking('02.11.2026',-40));const r=run(s),food=row(r);assert.equal(food.source,'budget');assert.equal(food.target,250);assert.equal(food.average,100);assert.equal(food.remaining,210);assert.equal(r.learning.flexible.length,0);delete s.budgets.Lebensmittel;assert.equal(row(run(s)).source,'average');
});
test('manual category limits account for booked and still scheduled contract costs only once',()=>{
  const s=state();s.budgets.Lebensmittel=500;s.fixed=[{name:'Abokiste',category:'Lebensmittel',monthly:100,rhythm:'monatlich',status:'Ja',dueDay:15,matchKeyword:'Abokiste'}];s.bookings.push(booking('02.11.2026',-50));s.forecast.oneOffs=[{id:'party',name:'Feier',date:'2026-11-20',amount:-200,kind:'expense',category:'Lebensmittel',matchKeyword:''}];let food=row(run(s));assert.equal(food.spent,50);assert.equal(food.scheduled,300);assert.equal(food.remaining,150);
  s.bookings.push(booking('03.11.2026',-100,'Lebensmittel',{payee:'Abokiste',fixed:'Ja'}));food=row(run(s));assert.equal(food.spent,150);assert.equal(food.scheduled,200);assert.equal(food.remaining,150);
});
test('linked personal PayPal contracts are excluded from flexible consumption despite their category',()=>{
  const s=state();s.contracts=[{id:'abo',name:'Abo',provider:'Teststreaming',category:'Sonstiges',amount:15,cycleMonths:1,dueDay:10,anchorMonth:1,matchMode:'manual',matchKeyword:'',status:'active',priceMode:'manual',renewalMonths:0,noticeValue:null,noticeUnit:'months',costOwner:'joern',showInFixed:false}];s.bookings.push(booking('02.11.2026',-15,'Lebensmittel',{contractId:'abo',payee:'PayPal Europe'}),booking('03.11.2026',-20));const food=row(run(s));assert.equal(food.spent,20);assert.equal(food.remaining,80);assert.equal(food.transactions.some(e=>e.booking.contractId),false);
});
test('split fixed parts, transfers and investments do not enter flexible category consumption',()=>{
  const s=state();s.bookings.push(booking('02.11.2026',-100,'Sonstiges',{splits:[{category:'Internet',amount:40,kind:'expense',fixed:'Ja'},{category:'Lebensmittel',amount:60,kind:'expense',fixed:'Nein'}]}),booking('02.11.2026',-999,'ETFs'),booking('02.11.2026',-999,'Haushaltsgeld',{flowType:'transfer'}));s.budgets.ETFs=1000;const r=run(s);assert.equal(row(r).spent,60);assert.equal(row(r).transactions[0].value,60);assert.equal(row(r,'ETFs'),undefined);assert.equal(row(r,'Haushaltsgeld'),undefined);
});
test('overspending is explicit and does not create a negative future allowance',()=>{
  const s=state();s.bookings.push(booking('02.11.2026',-135));const food=row(run(s));assert.equal(food.remaining,0);assert.equal(food.over,35);assert.equal(food.target,100);assert.equal(run(s).endBalance,1000);
});
test('one-off-only categories remain unknown instead of predicting a zero monthly allowance',()=>{
  const s=state();s.bookings.push(booking('02.11.2026',-800,'Werkstatt',{forecastOneOff:true}));const r=run(s),repair=row(r,'Werkstatt');assert.equal(repair.source,'unknown');assert.equal(repair.target,null);assert.equal(repair.remaining,null);assert.equal(repair.spent,800);assert.ok(r.flexibleMonths[0].unknown>0);
});
test('future months retain monthly estimates without adding transactions on the first day or any other day',()=>{
  const s=state();s.forecast.horizon=90;const r=run(s);assert.equal(row(r,'Lebensmittel','2026-12').remaining,100);assert.equal(row(r,'Lebensmittel','2026-12').spent,0);assert.ok(r.points.every(p=>p.events.every(e=>e.type!=='budget')));assert.equal(r.endBalance,1000);
});
test('automatic estimates and manually saved budgets respect their settings without modifying account cash flow',()=>{
  const s=state();s.forecast.automatic=false;assert.equal(row(run(s)).target,null);s.budgets.Lebensmittel=200;assert.equal(row(run(s)).target,200);s.forecast.useBudgets=false;assert.equal(row(run(s)).target,null);assert.equal(run(s).endBalance,1000);
});
test('foreign accounts are excluded from both the category average and its current transactions',()=>{
  const s=state();s.bookings.push(booking('02.11.2026',-20,'Lebensmittel',{account:'household'}),booking('02.11.2026',-999,'Lebensmittel',{account:'other'}));const r=forecast(s,null,{today,account:'household'});assert.equal(row(r).spent,20);assert.equal(row(r).average,100);
});
