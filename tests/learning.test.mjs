import test from 'node:test';
import assert from 'node:assert/strict';
import {learnPatterns} from '../haushaltsdashboard/app/public/learning.mjs';
import {forecast,defaults,validateForecast} from '../haushaltsdashboard/app/public/forecast.mjs';
const date=(month,day=15)=>String(day).padStart(2,'0')+'.'+month.slice(5)+'.'+month.slice(0,4);
const b=(month,amount,payee,category,extra={})=>({date:date(month),amount,payee,purpose:'Testzahlung',category,fixed:'Nein',...extra});
const state=()=>({version:1,bookings:[],fixed:[],budgets:{},forecast:defaults({balanceSource:'manual',manualBalance:{amount:1000,date:'2026-11-01'}})});
const today='2026-11-01';
function coverage(s){s.bookings.push(b('2026-03',1,'Start','Sonstiges',{date:'01.03.2026'}),b('2026-11',1,'Letzte Buchung','Sonstiges',{date:'01.11.2026'}));}
function salary(s){for(const month of ['2026-08','2026-09','2026-10'])s.bookings.push(b(month,2000,'Testarbeitgeber','Gehalt',{date:date(month,28)}));}
test('existing quarterly items infer anchor and day from two actual charges without changing saved costs',()=>{
  const s=state();s.fixed=[{name:'Beitrag',category:'Rundfunkbeitrag',rhythm:'vierteljährlich',monthly:18.36,status:'Ja'}];s.bookings=[b('2026-05',-55.08,'Beitragsservice','Rundfunkbeitrag'),b('2026-08',-55.08,'Beitragsservice','Rundfunkbeitrag')];
  const before=JSON.stringify(s),l=learnPatterns(s,today);assert.equal(l.fixedModels[0].anchorMonth,8);assert.equal(l.fixedModels[0].dueDay,15);assert.equal(l.fixed[0].confidence,'mittel');assert.equal(JSON.stringify(s),before);
  assert.equal(forecast(s,null,{today}).events.find(e=>e.id==='fixed-0-2026-11').amount,-55.08);
});
test('unknown community rhythm is inferred from recurring records and normalized monthly cost',()=>{
  const s=state();s.fixed=[{name:'Gemeinde',category:'Abgaben',rhythm:'unklar',monthly:100,status:'Ja'}];s.bookings=['2026-02','2026-05','2026-08'].map(m=>b(m,-300,'Testgemeinde','Abgaben'));const l=learnPatterns(s,today);assert.equal(l.fixedModels[0].rhythm,'vierteljährlich');assert.equal(l.fixedModels[0].anchorMonth,8);assert.equal(l.fixedModels[0].dueDay,15);
});
test('explicit due day, anchor and manual budgets take precedence',()=>{
  const s=state();s.fixed=[{name:'Beitrag',category:'Rundfunkbeitrag',rhythm:'vierteljährlich',monthly:10,status:'Ja',dueDay:20,anchorMonth:1}];s.bookings=['2026-02','2026-05','2026-08'].map(m=>b(m,-30,'Testbeitrag','Rundfunkbeitrag'));assert.equal(learnPatterns(s,today).fixedModels[0].dueDay,20);assert.equal(learnPatterns(s,today).fixedModels[0].anchorMonth,1);
});
test('new monthly contract is recognized but repeated supermarket visits are not fixed contracts',()=>{
  const s=state();for(const m of ['2026-08','2026-09','2026-10'])s.bookings.push(b(m,-39.99,'Test-Telekom','Telefon/Internet'),b(m,-50,'Testmarkt','Lebensmittel'));
  const l=learnPatterns(s,today);assert.equal(l.fixed.filter(f=>!f.existing).length,1);assert.equal(l.fixed[0].name,'Test-Telekom');assert.equal(l.fixedModels[0].monthly,39.99);
});
test('automatic fractional quarterly amounts stay cent exact',()=>{
  const s=state();s.bookings=['2026-02','2026-05','2026-08'].map(m=>b(m,-100,'Testversicherung','Versicherung'));const r=forecast(s,null,{today});assert.equal(r.events.find(e=>e.month==='2026-11').amount,-100);
});
test('multiple contracts at one payee are separated by amount and cannot overwrite one another',()=>{
  const s=state();for(const m of ['2026-08','2026-09','2026-10'])s.bookings.push(b(m,-10,'Testversicherung','Versicherung'),b(m,-90,'Testversicherung','Versicherung'));const l=learnPatterns(s,today);assert.equal(l.fixed.length,2);assert.deepEqual(l.fixed.map(f=>f.amount).sort((a,b)=>a-b),[10,90]);
});
test('automatic salary needs three months; refunds and transfers cannot become salary',()=>{
  const s=state();salary(s);const l=learnPatterns(s,today);assert.equal(l.incomes.length,1);assert.equal(l.incomes[0].day,28);assert.equal(l.incomes[0].amount,2000);
  s.bookings.pop();assert.equal(learnPatterns(s,today).incomes.length,0);s.bookings.push(b('2026-10',2000,'Testarbeitgeber','Gehalt',{flowType:'transfer'}));assert.equal(learnPatterns(s,today).incomes.length,0);
});
test('salary estimates are actually used by default, but manual income plans suppress the duplicate',()=>{
  const s=state();salary(s);let r=forecast(s,null,{today});assert.equal(r.nextIncome.amount,2000);assert.equal(r.nextIncome.automatic,true);assert.equal(r.nextIncome.status,'planned');
  s.forecast.incomePlans=[{id:'manual',name:'Gehalt',source:'fixed',amount:2500,day:28,startMonth:'2026-11',matchKeyword:'Testarbeitgeber'}];r=forecast(s,null,{today});assert.equal(r.learning.incomes.length,0);assert.equal(r.nextIncome.amount,2500);
});
test('an already posted changed salary is not projected a second time',()=>{
  const s=state();salary(s);s.bookings.push(b('2026-11',3000,'Testarbeitgeber','Gehalt',{date:'26.11.2026'}));s.forecast.manualBalance.date='2026-11-26';const r=forecast(s,null,{today:'2026-11-26'});const e=r.events.find(e=>e.month==='2026-11'&&e.type==='income');assert.equal(e.status,'booked');assert.equal(e.booking.amount,3000);
});
test('month-end salary follows the last weekday; fixed calendar dates stay fixed',()=>{
  const s=state();s.bookings=[b('2026-07',2000,'Testarbeitgeber','Gehalt',{date:'31.07.2026'}),b('2026-08',2000,'Testarbeitgeber','Gehalt',{date:'31.08.2026'}),b('2026-09',2000,'Testarbeitgeber','Gehalt',{date:'30.09.2026'})];const r=forecast(s,null,{today:'2026-10-01'});assert.equal(r.nextIncome.date,'2026-10-30');
});
test('flex costs use closed comparable months, include zero category months, and exclude current month',()=>{
  const s=state();coverage(s);for(const m of ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']){s.bookings.push(b(m,1,'Andere Buchung','Sonstiges'));if(m!=='2026-07')s.bookings.push(b(m,-120,'Testtankstelle','Mobilität - Tanken'));}
  s.bookings.push(b('2026-11',-9999,'Testtankstelle','Mobilität - Tanken',{date:'01.11.2026'}));const l=learnPatterns(s,today),f=l.flexible.find(f=>f.category==='Mobilität - Tanken');assert.equal(f.amount,100);assert.equal(f.months.length,6);
});
test('one-off merchants do not become flexible averages; large monthly outliers are capped',()=>{
  const s=state();coverage(s);for(const [i,m] of ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'].entries())s.bookings.push(b(m,i===5?-2000:-100,'Testmarkt','Lebensmittel'));
  s.bookings.push(b('2026-10',-6000,'Einmalwerkstatt','Werkstatt/Auto'));const l=learnPatterns(s,today);assert.equal(l.flexible.some(f=>f.category==='Werkstatt/Auto'),false);const food=l.flexible.find(f=>f.category==='Lebensmittel');assert.equal(food.outlierAdjusted,true);assert.ok(food.amount<150);assert.equal(food.monthly.at(-1).amount,2000);
});
test('marked one-offs are ignored for learning and user budgets override automatic averages',()=>{
  const s=state();coverage(s);for(const m of ['2026-08','2026-09','2026-10'])s.bookings.push(b(m,-100,'Testmarkt','Lebensmittel'));s.bookings.push(b('2026-10',-10000,'Testmarkt','Lebensmittel',{forecastOneOff:true}));assert.equal(learnPatterns(s,today).flexible[0].amount,100);
  s.budgets.Lebensmittel=250;assert.equal(learnPatterns(s,today).flexible.length,0);
});
test('learned flexible allowance is additional to fixed costs and exceptional planned purchases',()=>{
  const s=state();coverage(s);for(const m of ['2026-08','2026-09','2026-10'])s.bookings.push(b(m,-100,'Testmarkt','Lebensmittel'));s.fixed=[{name:'Festposten',category:'Lebensmittel',monthly:200,rhythm:'monatlich',dueDay:15,status:'Ja',matchKeyword:'Festanbieter'}];s.forecast.oneOffs=[{id:'party',name:'Feier',date:'2026-11-20',amount:-300,kind:'expense',category:'Lebensmittel',matchKeyword:''}];
  const r=forecast(s,null,{today});assert.equal(r.budgetEvents.filter(e=>e.month==='2026-11').reduce((n,e)=>n+Math.round(-e.amount*100),0),10000);assert.equal(r.events.filter(e=>e.month==='2026-11'&&e.status==='planned').reduce((n,e)=>n-e.amount,0),500);
});
test('algorithm can be switched off and individual patterns can be excluded without modifying history',()=>{
  const s=state();salary(s);const before=JSON.stringify(s.bookings),l=learnPatterns(s,today);s.forecast.ignoredPatterns=[l.incomes[0].id];assert.equal(forecast(s,null,{today}).learning.incomes.length,0);s.forecast.ignoredPatterns=[];s.forecast.automatic=false;assert.equal(forecast(s,null,{today}).learning.incomes.length,0);assert.equal(JSON.stringify(s.bookings),before);assert.equal(validateForecast(s.forecast),null);
});
test('stale contracts/salaries and sparse irregular payments are not projected indefinitely',()=>{
  const s=state();s.bookings=['2025-03','2025-04','2025-05'].map(m=>b(m,2000,'Testarbeitgeber','Gehalt'));assert.equal(learnPatterns(s,today).incomes.length,0);
  s.bookings=['2026-02','2026-06','2026-10'].map(m=>b(m,-100,'Testabo','Abos'));assert.equal(learnPatterns(s,today).fixed.length,0);
});

test('a one-off credit cannot satisfy a learned salary, and fixed split parts do not swallow another category',()=>{
  const s=state();salary(s);s.bookings.push(b('2026-11',2000,'Testarbeitgeber','Gehalt',{date:'01.11.2026',forecastOneOff:true}));assert.equal(forecast(s,null,{today}).events.find(e=>e.type==='income'&&e.month==='2026-11').status,'planned');
  const t=state();coverage(t);t.fixed=[{name:'Abo',category:'Abos',monthly:40,rhythm:'monatlich',status:'Ja'}];for(const m of ['2026-08','2026-09','2026-10'])t.bookings.push(b(m,-100,'Testanbieter','Abos',{splits:[{category:'Abos',amount:40,kind:'expense',fixed:'Ja'},{category:'Lebensmittel',amount:60,kind:'expense',fixed:'Nein'}]}));const l=learnPatterns(t,today);assert.equal(l.flexible.find(f=>f.category==='Lebensmittel').amount,60);
});
