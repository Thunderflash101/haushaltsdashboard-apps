import {bookingParts,monthKey,cents,analyzeMonth,flowKind} from './finance.mjs';
import {matchesContractBooking} from './contracts.mjs';
import {comparisonMonths} from './learning.mjs';
const norm=s=>String(s||'').normalize('NFC').toLocaleLowerCase('de').trim();
const iso=b=>b.date.slice(6)+'-'+b.date.slice(3,5)+'-'+b.date.slice(0,2);

export function flexibleEntries(state,learning,today){
  const bookings=state.bookings||[],sources=new Set(learning.fixedSources||[]),models=learning.fixedModels||state.fixed||[],entries=[];
  function eligible(b,index,part){
    if(part.kind!=='expense'||part.fixed!=='Nein'||sources.has(index+':'+part.category))return false;
    if((state.contracts||[]).some(c=>matchesContractBooking(c,b,part.category)))return false;
    return !models.some(f=>!f.contractId&&f.status!=='Nein'&&f.category===part.category&&norm(f.matchKeyword)&&norm(b.payee+' '+b.purpose).includes(norm(f.matchKeyword)));
  }
  bookings.forEach((b,index)=>{
    if(!b.date||iso(b)>today)return;
    if(b.amount<0){for(const part of bookingParts(b))if(eligible(b,index,part))entries.push({category:part.category,value:part.cents/100,index,booking:b,isRefund:false});}
    else if(b.flowType==='refund'&&b.refund){
      const target=bookings.findIndex(x=>x.financeId===b.refund.targetId);if(target<0)return;
      for(const part of b.refund.allocations)if(eligible(bookings[target],target,part))entries.push({category:part.category,value:-cents(part.amount)/100,index,booking:b,isRefund:true});
    }
  });return entries;
}

export function flexiblePlans(state,learning,events,keys,today,settings){
  const bookings=(state.bookings||[]).filter(b=>b.date&&iso(b)<=today),entries=flexibleEntries(state,learning,today),months=comparisonMonths(bookings,today);
  const comparisons=new Map((learning.flexibleComparisons||learning.flexible||[]).map(p=>[p.category,p]));
  const categories=new Set([...Object.keys(state.budgets||{}).filter(c=>flowKind(c)==='expense'),...comparisons.keys(),...entries.filter(e=>monthKey(e.booking.date)>=today.slice(0,7)||months.includes(monthKey(e.booking.date))).map(e=>e.category)]);
  const cache=new Map(),analysis=key=>{if(!cache.has(key))cache.set(key,analyzeMonth(bookings,key,{spendingOnly:true}));return cache.get(key);};
  function detailEntries(category,key,manual){return (manual?analysis(key).entries:entries.filter(e=>monthKey(e.booking.date)===key)).filter(e=>e.category===category);}
  return keys.map(key=>{
    const rows=[...categories].map(category=>{
      const configured=Number(state.budgets?.[category]),manual=settings.useBudgets&&Number.isFinite(configured)&&configured>0,model=comparisons.get(category)||null;
      const transactions=detailEntries(category,key,manual),spent=transactions.reduce((n,e)=>n+cents(e.value),0),planned=manual?events.filter(e=>e.month===key&&e.status==='planned'&&e.amount<0&&e.kind==='expense'&&e.category===category).reduce((n,e)=>n-cents(e.amount),0):0;
      const target=manual?cents(configured):model?cents(model.amount):null;
      const rest=target===null?null:target-Math.max(0,spent)-planned;
      const history=months.map(month=>({month,spent:detailEntries(category,month,manual).reduce((n,e)=>n+cents(e.value),0)/100,used:model?.monthly.find(m=>m.month===month)?.used??null,transactions:detailEntries(category,month,manual)}));
      return {category,source:manual?'budget':model?'average':'unknown',target:target===null?null:target/100,average:model?.amount??null,spent:spent/100,scheduled:planned/100,remaining:rest===null?null:Math.max(0,rest)/100,over:rest===null?0:Math.max(0,-rest)/100,model,history,transactions,scope:manual?'category':'flexible',configuredBudget:configured>0?configured:null};
    }).filter(r=>r.source!=='unknown'||r.spent!==0||r.history.some(h=>h.spent!==0));
    rows.sort((a,b)=>(a.source==='unknown')-(b.source==='unknown')||(b.target||0)-(a.target||0)||a.category.localeCompare(b.category,'de'));
    const known=rows.filter(r=>r.target!==null);
    return {key,rows,unknown:rows.filter(r=>r.target===null).length,target:known.length?known.reduce((n,r)=>n+cents(r.target),0)/100:null,spent:rows.reduce((n,r)=>n+cents(r.spent),0)/100,scheduled:known.reduce((n,r)=>n+cents(r.scheduled),0)/100,remaining:known.length?known.reduce((n,r)=>n+cents(r.remaining),0)/100:null,over:known.reduce((n,r)=>n+cents(r.over),0)/100};
  });
}
