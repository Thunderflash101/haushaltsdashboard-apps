import test from 'node:test';
import assert from 'node:assert/strict';
import {forecast,defaults} from '../haushaltsdashboard/app/public/forecast.mjs';
const today='2026-11-10';
const b=(amount,category,extra={})=>({date:'05.11.2026',amount,category,payee:'Test',purpose:'Testzahlung',fixed:'Nein',...extra});
const setup=()=>({version:1,bookings:[],fixed:[{name:'Internet',category:'Internet',monthly:100,rhythm:'monatlich',dueDay:15,status:'Ja',matchKeyword:'Internetanbieter'}],budgets:{Lebensmittel:300},forecast:defaults({automatic:false,balanceSource:'manual',manualBalance:{amount:1000,date:today},incomePlans:[{id:'salary',name:'Gehalt',source:'fixed',amount:2000,day:28,startMonth:'2026-11',matchKeyword:'Arbeitgeber'}]})});
test('monthly room is full income minus all monthly costs, independent from opening balance',()=>{
  const s=setup();s.bookings=[b(-50,'Lebensmittel')];let r=forecast(s,null,{today});assert.equal(r.monthly.income,2000);assert.equal(r.monthly.costs,400);assert.equal(r.monthly.available,1600);assert.equal(r.monthly.booked,50);assert.equal(r.monthly.open,350);
  s.forecast.manualBalance.amount=10000;assert.equal(forecast(s,null,{today}).monthly.available,1600);s.forecast.manualBalance=null;r=forecast(s,null,{today});assert.equal(r.current,null);assert.equal(r.monthly.available,1600);
});
test('receiving salary replaces the expected income and paying fixed costs replaces the open charge',()=>{
  const s=setup();const before=forecast(s,null,{today}).monthly;s.bookings.push(b(2000,'Gehalt',{payee:'Arbeitgeber'}),b(-100,'Internet',{payee:'Internetanbieter',fixed:'Ja'}));const after=forecast(s,null,{today}).monthly;
  assert.equal(after.available,before.available);assert.equal(after.income,2000);assert.equal(after.expected,0);assert.equal(after.received,2000);assert.equal(after.fixed,100);assert.equal(after.booked,100);
});
test('investment/transfer outflows reserve part of income; incoming own transfers do not become earned income',()=>{
  const s=setup();s.bookings=[b(-200,'ETFs'),b(-50,'Haushaltsgeld'),b(999,'Sonstiges',{flowType:'transfer'})];const m=forecast(s,null,{today}).monthly;assert.equal(m.income,2000);assert.equal(m.other,250);assert.equal(m.costs,650);assert.equal(m.available,1350);
});
test('split fixed and flexible costs plus refunds retain their monthly categories',()=>{
  const s=setup();s.fixed=[];s.budgets={};s.bookings=[b(-100,'Sonstiges',{financeId:'purchase',splits:[{category:'Internet',amount:40,kind:'expense',fixed:'Ja'},{category:'Lebensmittel',amount:60,kind:'expense',fixed:'Nein'}]}),b(20,'Erstattung',{financeId:'refund',flowType:'refund',refund:{targetId:'purchase',allocations:[{category:'Lebensmittel',amount:20,kind:'expense',fixed:'Nein'}]}})];const m=forecast(s,null,{today}).monthly;assert.equal(m.fixed,40);assert.equal(m.flexible,40);assert.equal(m.costs,80);assert.equal(m.received,0);assert.equal(m.available,1920);
});
test('monthly room remains the same across forecast horizons and protected balance settings',()=>{
  const s=setup(),m=forecast(s,null,{today}).monthly;s.forecast.horizon=90;s.forecast.protectedBalance=800;s.forecast.buffer=200;const after=forecast(s,null,{today}).monthly;assert.deepEqual(after,m);
});
test('missing income stays unknown rather than counting manual net income as a bank receipt',()=>{
  const s=setup();s.forecast.incomePlans=[];s.incomes={'2026-11':{bettina:2000}};const m=forecast(s,null,{today}).monthly;assert.equal(m.incomeKnown,false);assert.equal(m.available,null);assert.equal(m.costs,400);
});
test('monthly deficit is shown with a negative sign',()=>{
  const s=setup();s.forecast.oneOffs=[{id:'repair',name:'Reparatur',amount:-2000,date:'2026-11-20',kind:'expense',category:'Werkstatt',matchKeyword:''}];const m=forecast(s,null,{today}).monthly;assert.equal(m.costs,2400);assert.equal(m.available,-400);
});
