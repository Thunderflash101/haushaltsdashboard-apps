import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyBudget,forecast,defaults} from '../haushaltsdashboard/app/public/forecast.mjs';
import {inflowKind,applyContributionRules,validateFinanceState} from '../haushaltsdashboard/app/public/finance.mjs';
import {reconcile} from '../haushaltsdashboard/app/lib/banking.mjs';
const today='2026-11-10';
const b=(amount,extra={})=>({date:'05.11.2026',amount,payee:'Test Partner',purpose:'Haushaltskosten',category:'Haushaltsgeld',fixed:'Nein',...extra});
const state=()=>({version:1,bookings:[],fixed:[{name:'Gemeinsam',category:'Wohnen',monthly:1000,rhythm:'monatlich',status:'Ja',dueDay:15,matchKeyword:'Vermieter'},{name:'Eigenes Abo',category:'Abos',monthly:100,rhythm:'monatlich',status:'Ja',dueDay:20,matchKeyword:'Eigenanbieter',costOwner:'joern'}],contracts:[],incomes:{'2026-11':{joern:3000,bettina:2000}},forecast:defaults({automatic:false,balanceSource:'manual',manualBalance:{amount:2000,date:today}})});
const run=s=>monthlyBudget(s,{today,key:'2026-11'});
test('second net income determines only the split; actual contributions fund the full common costs once',()=>{
 const s=state();let m=run(s);assert.equal(m.income,3000);assert.equal(m.available,1900);assert.equal(m.contributionExpected,400);assert.equal(m.contributionOpen,400);
 s.bookings.push(b(400,{householdContribution:true}));m=run(s);assert.equal(m.income,3400);assert.equal(m.available,2300);assert.equal(m.contributions,400);assert.equal(m.contributionOpen,0);assert.equal(m.people.bettina.income,2000);
 s.incomes['2026-11'].bettina=6000;const changed=run(s);assert.equal(changed.available,2300);assert.equal(changed.income,3400);assert.notEqual(changed.contributionExpected,m.contributionExpected);
});
test('partial, excess and missing payments remain separate from the calculated share',()=>{
 const s=state();s.bookings=[b(150,{householdContribution:true}),b(200,{householdContribution:true})];let m=run(s);assert.equal(m.contributions,350);assert.equal(m.contributionOpen,50);assert.equal(m.available,2250);
 s.bookings.push(b(100,{householdContribution:true}));m=run(s);assert.equal(m.contributionOpen,0);assert.equal(m.contributionExtra,50);assert.equal(m.available,2350);
});
test('a missing second net value does not block own budget or create an estimated contribution',()=>{
 const s=state();delete s.incomes['2026-11'].bettina;s.bookings=[b(200,{householdContribution:true})];const m=run(s);assert.equal(m.available,2100);assert.equal(m.contributionExpected,null);assert.equal(m.contributionOpen,null);assert.equal(m.incomeKnown,true);
});
test('own transfers and allocated refunds are not additional budget income; explicit other income is',()=>{
 const s=state();s.bookings=[b(500,{flowType:'transfer'}),b(80,{category:'Sonstiges',flowType:'income'}),b(-100,{financeId:'buy',category:'Lebensmittel'}),b(20,{financeId:'refund',category:'Erstattung',flowType:'refund',refund:{targetId:'buy',allocations:[{category:'Lebensmittel',amount:20,kind:'expense',fixed:'Nein'}]}})];const m=run(s);assert.equal(m.otherIncome,80);assert.equal(m.contributions,0);assert.equal(m.income,3080);assert.equal(m.spentFlexible,80);assert.equal(m.remaining,1900);
});
test('salary, partner reference plans and future contributions cannot be counted twice as own income',()=>{
 const s=state();s.forecast.incomePlans=[{id:'own',name:'Gehalt',source:'joern',amount:3000,day:28,startMonth:'2026-11',matchKeyword:'Arbeitgeber',category:'Gehalt'},{id:'second',name:'Zweites Netto',source:'bettina',amount:2000,day:28,startMonth:'2026-11',matchKeyword:'Zweiter Arbeitgeber',category:'Gehalt'}];s.bookings=[b(3000,{payee:'Arbeitgeber',category:'Gehalt'}),b(400,{householdContribution:true,category:'Gehalt'}),b(999,{date:'15.11.2026',householdContribution:true})];const m=run(s),r=forecast(s,null,{today});assert.equal(m.income,3400);assert.equal(m.otherIncome,0);assert.equal(r.events.some(e=>e.id.includes('income-second')),false);assert.equal(r.plannedIncome,0);
});
test('contribution classification does not credit the actual bank balance a second time',()=>{
 const s=state();s.bookings=[b(400,{flowType:'transfer'})];const before=forecast(s,null,{today});s.bookings[0].householdContribution=true;const after=forecast(s,null,{today});assert.equal(after.current,before.current);assert.deepEqual(after.points,before.points);assert.equal(after.budget.available-before.budget.available,400);assert.equal(inflowKind(s.bookings[0]),'income');
});
test('confirmed exact sender rules recognize new imports while preserving individual exceptions and deduplication',()=>{
 const s=state();s.contributionPayees=['Test Partner'];s.bookings=[b(20,{householdContribution:false}),b(30,{payee:'Test Partner GmbH'}),b(40,{flowManual:true,flowType:'transfer'})];applyContributionRules(s.bookings,s.contributionPayees);assert.equal(s.bookings[0].householdContribution,false);assert.equal(s.bookings[1].householdContribution,undefined);assert.equal(s.bookings[2].householdContribution,undefined);
 const incoming=b(100,{payee:'  TEST   PARTNER ',account:'household',bankId:'partner-credit',importSource:'enablebanking'});assert.equal(reconcile(s,[incoming],'household').added,1);assert.equal(s.bookings.at(-1).householdContribution,true);assert.equal(reconcile(s,[incoming],'household').duplicates,1);assert.equal(run(s).contributions,100);
});
test('a contribution requires an unallocated credit and a valid private sender rule list',()=>{
 const s=state();for(const invalid of [b(-100,{householdContribution:true}),b(100,{householdContribution:true,flowType:'investment'}),b(100,{householdContribution:true,transferPeerId:'other'})]){s.bookings=[invalid];assert.notEqual(validateFinanceState(s),null);}
 s.bookings=[b(100,{householdContribution:true})];assert.equal(validateFinanceState(s),null);s.contributionPayees=[''];assert.notEqual(validateFinanceState(s),null);
});
test('private second-person plans stay outside the own account; an actual debit for them is still charged',()=>{
 const s=state();s.fixed.push({name:'Privat zweite Person',category:'Internet',monthly:50,rhythm:'monatlich',status:'Ja',dueDay:16,matchKeyword:'Privatanbieter',costOwner:'bettina'});let r=forecast(s,null,{today});assert.equal(r.events.some(e=>e.name==='Privat zweite Person'),false);assert.equal(r.budget.obligations,1100);
 s.bookings.push(b(-50,{payee:'Privatanbieter',category:'Internet',fixed:'Ja'}));r=forecast(s,null,{today});assert.equal(r.budget.paidForPartner,50);assert.equal(r.budget.available,1850);
});
