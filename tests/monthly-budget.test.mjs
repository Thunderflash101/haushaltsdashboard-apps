import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyBudget,forecast,defaults,budgetIncomes} from '../haushaltsdashboard/app/public/forecast.mjs';
import {validateContracts} from '../haushaltsdashboard/app/public/contracts.mjs';
import {validState} from '../haushaltsdashboard/app/lib/storage.mjs';
const today='2026-11-10';
const contract=(extra={})=>({id:'subscription',name:'Abo',provider:'Streaming',category:'Abos',amount:30,cycleMonths:1,dueDay:15,anchorMonth:1,matchKeyword:'Streaming',status:'active',priceMode:'manual',noticeValue:null,noticeUnit:'months',renewalMonths:0,linkedFixedIndex:null,...extra});
const booking=(amount,category,extra={})=>({date:'05.11.2026',amount,category,payee:'Test',purpose:'Testzahlung',fixed:'Nein',...extra});
const setup=()=>({version:1,people:{first:'Person 1',second:'Person 2'},bookings:[],fixed:[{name:'Wohnen',category:'Wohnen',monthly:1000,rhythm:'monatlich',dueDay:15,status:'Ja',matchKeyword:'Vermieter'}],contracts:[],incomes:{'2026-11':{joern:3000,bettina:2000}},budgets:{Lebensmittel:900,Shopping:2000},forecast:defaults({automatic:false,balanceSource:'manual',manualBalance:{amount:2000,date:today}})});
const budget=s=>monthlyBudget(s,{today,key:'2026-11'});
test('monthly budget subtracts obligations only; actual flexible purchases reduce the remaining pot',()=>{
  const s=setup();s.bookings=[booking(-120,'Lebensmittel'),booking(-80,'Shopping')];let m=budget(s);assert.equal(m.income,3000);assert.equal(m.obligations,1000);assert.equal(m.available,2000);assert.equal(m.spentFlexible,200);assert.equal(m.remaining,1800);
  s.budgets={Lebensmittel:10000};s.forecast.oneOffs=[{id:'repair',name:'Repair',amount:-900,date:'2026-11-20',kind:'expense',category:'Werkstatt',matchKeyword:''}];assert.deepEqual(budget(s),m);
});
test('shared costs split by income; personal contracts charge only their owner even hidden from fixed list',()=>{
  const s=setup();s.contracts=[contract({costOwner:'joern',showInFixed:false}),contract({id:'second',amount:20,costOwner:'bettina'})];const m=budget(s);
  assert.deepEqual([m.people.joern.shared,m.people.bettina.shared],[600,400]);assert.equal(m.people.joern.available,2370);assert.equal(m.people.bettina.available,1580);assert.equal(m.available,1970);assert.equal(Math.round((m.people.joern.available+m.people.bettina.available)*100),Math.round((5000-m.allocationTotal)*100));
});
test('linked fixed item and contract count once, under contract owner',()=>{
  const s=setup();s.contracts=[contract({category:'Wohnen',amount:1000,linkedFixedIndex:0,costOwner:'joern'})];const m=budget(s);assert.equal(m.obligations,1000);assert.equal(m.rows.length,1);assert.equal(m.shared,0);assert.equal(m.people.joern.available,2000);assert.equal(m.people.bettina.available,2000);
});
test('quarterly and yearly contracts reserve monthly proportions, independent of due month',()=>{
  const s=setup();s.fixed=[];s.contracts=[contract({amount:90,cycleMonths:3,anchorMonth:12}),contract({id:'annual',amount:120,cycleMonths:12,anchorMonth:4})];assert.equal(budget(s).obligations,40);assert.equal(forecast(s,null,{today}).events.filter(e=>e.type==='fixed'&&e.month==='2026-11').length,0);
});
test('booked contract and fixed debits are not deducted a second time as flexible purchases',()=>{
  const s=setup();s.contracts=[contract({costOwner:'joern',showInFixed:false,matchMode:'manual',matchKeyword:''})];s.bookings=[booking(-30,'Sonstiges',{contractId:'subscription'}),booking(-1000,'Wohnen',{payee:'Vermieter',fixed:'Ja'}),booking(-40,'Sonstiges')];const m=budget(s);assert.equal(m.obligations,1030);assert.equal(m.spentFlexible,40);assert.equal(m.remaining,1930);
});
test('refunds restore only actual flexible spending; own transfers do not consume spending capacity',()=>{
  const s=setup();s.bookings=[booking(-100,'Lebensmittel',{financeId:'buy'}),booking(20,'Erstattung',{financeId:'refund',flowType:'refund',refund:{targetId:'buy',allocations:[{category:'Lebensmittel',amount:20,kind:'expense',fixed:'Nein'}]}}),booking(-400,'ETFs'),booking(-900,'Haushaltsgeld',{flowType:'transfer'}),booking(900,'Sonstiges',{flowType:'transfer'})];const m=budget(s);assert.equal(m.spentFlexible,80);assert.equal(m.spentOther,400);assert.equal(m.remaining,1520);
});
test('net income entries including zero override salary; second income never becomes a bank receipt',()=>{
  const s=setup();s.incomes['2026-11'].joern=0;s.bookings=[booking(3000,'Gehalt')];const m=budget(s),r=forecast(s,null,{today});assert.equal(m.income,0);assert.equal(m.people.joern.shared,0);assert.equal(m.people.bettina.shared,1000);assert.equal(r.monthly.income,3000);assert.equal(r.plannedIncome,0);
});
test('missing second income stays unknown; personal budget can still be known without shared obligations',()=>{
  const s=setup();delete s.incomes['2026-11'].bettina;let m=budget(s);assert.equal(m.available,2000);assert.equal(m.people.joern.available,null);assert.ok(m.warnings.length);s.fixed=[];s.contracts=[contract({costOwner:'joern'})];m=budget(s);assert.equal(m.people.joern.available,2970);assert.equal(m.people.bettina.available,null);
});
test('income can come from salary and person-specific plans, without counting both',()=>{
  const s=setup();s.incomes={};s.forecast.incomePlans=[{id:'one',source:'joern',amount:3000,startMonth:'2026-01',matchKeyword:'Employer one'},{id:'two',source:'bettina',amount:2000,startMonth:'2026-01',matchKeyword:'Employer two'}];s.bookings=[booking(3100,'Gehalt',{payee:'Employer one'})];const m=budget(s);assert.equal(m.income,3100);assert.equal(m.people.joern.source,'Gehaltsbuchungen');assert.equal(m.people.bettina.source,'Einkommensplan · geschätzt');s.bookings.push(booking(2100,'Gehalt',{payee:'Employer two'}));assert.equal(budgetIncomes(s,'2026-11',today).bettina,2100);
});
test('personal fixed costs and legacy defaults are supported; proportions conserve every cent',()=>{
  const s=setup();s.fixed[0].monthly=1000.01;s.fixed.push({name:'Personal',category:'Internet',monthly:50,status:'Ja',costOwner:'bettina'});const m=budget(s);assert.equal(m.people.bettina.personal,50);assert.equal(Math.round((m.people.joern.shared+m.people.bettina.shared)*100),100001);assert.equal(Math.round((m.people.joern.available+m.people.bettina.available)*100),Math.round((5000-m.allocationTotal)*100));
});
test('ended and future contracts are excluded, contracts active during month are included',()=>{
  const s=setup();s.fixed=[];s.contracts=[contract({id:'expired',endDate:'2026-10-31'}),contract({id:'future',startDate:'2026-12-01'}),contract({id:'month-end',status:'cancelled',endDate:'2026-11-05'})];const m=budget(s);assert.equal(m.obligations,30);assert.equal(m.rows[0].name,'Abo');
});
test('cost owner fields are validated server-side; legacy backups remain valid',()=>{
  const s=setup();assert.equal(validState(s),true);s.fixed[0].costOwner='wrong';assert.equal(validState(s),false);s.fixed[0].costOwner='shared';s.contracts=[contract({costOwner:'wrong'})];assert.match(validateContracts(s.contracts),/Kostenzuordnung/);s.contracts[0].costOwner='joern';s.contracts[0].showInFixed='false';assert.match(validateContracts(s.contracts),/Fixkostenanzeige/);s.contracts[0].showInFixed=false;assert.equal(validState(s),true);
});
