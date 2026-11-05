import {matchesContractBooking} from './contracts.mjs';
import {bookingParts,monthKey,shiftMonth,cents,inflowKind} from './finance.mjs';
const norm=s=>String(s||'').normalize('NFC').toLocaleLowerCase('de').replace(/\s+/g,' ').trim();
const iso=b=>b.date.slice(6)+'-'+b.date.slice(3,5)+'-'+b.date.slice(0,2);
const days=key=>new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5)),0)).getUTCDate();
const mi=key=>Number(key.slice(0,4))*12+Number(key.slice(5))-1;
const median=a=>{const x=[...a].sort((a,b)=>a-b),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2;};
const id=value=>{let n=14695981039346656037n;for(const c of new TextEncoder().encode(value)){n^=BigInt(c);n=BigInt.asUintN(64,n*1099511628211n);}return n.toString(16);};
const cycles={monatlich:1,vierteljährlich:3,halbjährlich:6,jährlich:12};
const rhythm={1:'monatlich',2:'zweimonatlich',3:'vierteljährlich',6:'halbjährlich',12:'jährlich'};
const isSalary=b=>!b.householdContribution&&b.amount>0&&inflowKind(b)==='income'&&(b.category==='Gehalt'||/lohn|gehalt|salary/.test(norm(b.purpose+' '+b.booking)));
const isContract=category=>/wohnen|finanzierung|versicherung|telefon|internet|abo|streaming|rundfunk|bankgebühr|kita|kommunal/i.test(category||'');
const essentials=category=>/lebensmittel|tanken|drogerie/i.test(category||'');
function proof(rows){return rows.map(r=>({index:r.index,date:r.b.date,payee:r.b.payee,amount:r.amount/100}));}
function infer(rows,forcedCycle=0,variableAmount=false){
  const sorted=[...rows].sort((a,b)=>iso(a.b).localeCompare(iso(b.b))),months=sorted.map(r=>monthKey(r.b.date));
  if(sorted.length<2||new Set(months).size!==sorted.length)return null;
  const gaps=months.slice(1).map((m,i)=>mi(m)-mi(months[i])),cycle=forcedCycle||[1,2,3,6,12].find(c=>gaps.filter(g=>g===c).length>=Math.ceil(gaps.length*.67)&&gaps.every(g=>g===c||g===2*c));
  if(!cycle||gaps.some(g=>g!==cycle&&g!==2*cycle)||!gaps.includes(cycle)||!forcedCycle&&sorted.length<3)return null;
  const amounts=sorted.map(r=>Math.abs(r.amount)),amount=median(amounts),dayValues=sorted.map(r=>Number(r.b.date.slice(0,2))),offsets=sorted.map(r=>days(monthKey(r.b.date))-Number(r.b.date.slice(0,2)));
  const endOfMonth=offsets.every(n=>n<=3)&&Math.max(...offsets)-Math.min(...offsets)<=3&&(Math.max(...dayValues)-Math.min(...dayValues)>=2||median(offsets)<=1),day=Math.round(median(dayValues));
  if(!endOfMonth&&Math.max(...dayValues)-Math.min(...dayValues)>8)return null;
  if(!variableAmount&&amounts.some(n=>Math.abs(n-amount)>Math.max(300,amount*.3)))return null;
  return {cycle,rhythm:rhythm[cycle],day:endOfMonth?31:day,endOfMonth,anchorMonth:Number(months.at(-1).slice(5)),amount:amount/100,confidence:rows.length>=3?'hoch':'mittel',count:rows.length,lastDate:iso(sorted.at(-1).b),sources:proof(sorted),rows:sorted};
}
export function learnPatterns(state,today){
  const start=shiftMonth(today.slice(0,7),-24),rows=[];
  (state.bookings||[]).forEach((b,index)=>{if(!b?.date||iso(b)>today||monthKey(b.date)<start||b.forecastOneOff)return;for(const p of bookingParts(b)){if((state.contracts||[]).some(c=>matchesContractBooking(c,b,p.category)))continue;rows.push({b,index,category:p.category,kind:p.kind,fixed:p.fixed,amount:-p.cents});}});
  const groups=new Map();
  for(const r of rows){const payee=norm(r.b.payee);if(payee.length<3||/^(paypal|sumup|adyen|nexi)$/.test(payee))continue;const mandate=norm(r.b.purpose).match(/\bmref:\s*(\S+)/)?.[1]||'',key=JSON.stringify([payee,r.category,r.kind,mandate]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  // Split different contracts from one payee by amount; reject repeated same-month series.
  const series=[];
  for(const [key,group] of groups){const clusters=[];for(const row of [...group].sort((a,b)=>Math.abs(a.amount)-Math.abs(b.amount))){let cluster=clusters.find(c=>Math.abs(Math.abs(row.amount)-Math.abs(median(c.map(r=>r.amount))))<=Math.max(200,Math.abs(median(c.map(r=>r.amount)))*.15));if(!cluster){cluster=[];clusters.push(cluster);}cluster.push(row);}for(const cluster of clusters)series.push({key:key+':'+Math.round(Math.abs(median(cluster.map(r=>r.amount)))/100),rows:cluster});}
  const fixed=[],used=new Set(),fixedModels=(state.fixed||[]).map((f,index)=>{
    if(f.status==='Nein')return f;
    const hint=norm(f.matchKeyword),cycle=cycles[f.rhythm]||0;
    const candidates=series.map(s=>({...s,model:infer(s.rows,cycle)})).filter(s=>s.model&&s.rows[0].category===f.category&&(!hint||norm(s.rows[0].b.payee+' '+s.rows[0].b.purpose).includes(hint)))
      .map(s=>({...s,difference:Math.abs(s.model.amount/s.model.cycle-Number(f.monthly||0))})).sort((a,b)=>a.difference-b.difference);
    if(!candidates.length)return f;
    const best=candidates[0];if(candidates.length>1&&Math.abs(candidates[1].difference-best.difference)<1)return f;
    if(Number(f.monthly)>0&&best.difference>Math.max(3,Number(f.monthly)*.2))return f;
    used.add(best.key);
    const learned={...f,rhythm:cycle?f.rhythm:best.model.rhythm,dueDay:f.dueDay||best.model.day,anchorMonth:f.anchorMonth||best.model.anchorMonth,matchKeyword:f.matchKeyword||best.rows[0].b.payee};
    if(learned.rhythm!==f.rhythm||!f.dueDay||!f.anchorMonth&&best.model.cycle>1)fixed.push({id:'existing-'+index,name:f.name,...best.model,existing:true,category:f.category,reason:'Fehlende Termine aus wiederkehrenden Abbuchungen ergänzt.'});
    return {...learned,_learning:fixed.find(m=>m.id==='existing-'+index)||null};
  });
  const automaticFixed=[];
  for(const s of series){if(used.has(s.key))continue;const first=s.rows[0],model=infer(s.rows);if(!model||!isContract(first.category)&&!s.rows.every(r=>r.fixed==='Ja'))continue;
    if(today>addMonthsDay(model.lastDate,model.cycle*2))continue;
    // An existing item takes precedence even if its schedule cannot yet be inferred safely.
    if((state.fixed||[]).some(f=>f.category===first.category&&(!f.matchKeyword||norm(first.b.payee+' '+first.b.purpose).includes(norm(f.matchKeyword)))))continue;
    const item={id:'auto-fixed-'+id(s.key),name:first.b.payee,category:first.category,monthly:Math.round(model.amount/model.cycle*100)/100,rhythm:model.rhythm,dueDay:model.day,anchorMonth:model.anchorMonth,status:'Ja',matchKeyword:first.b.payee,learned:model};
    automaticFixed.push(item);fixed.push({id:item.id,name:item.name,category:item.category,...model,existing:false,reason:'Regelmäßige Vertragsabbuchungen erkannt.'});
  }
  const salaryGroups=new Map();for(const [index,b] of (state.bookings||[]).entries())if(isSalary(b)&&!b.forecastOneOff&&iso(b)<=today&&monthKey(b.date)>=start&&norm(b.payee).length>=3){const key=norm(b.payee);if(!salaryGroups.has(key))salaryGroups.set(key,[]);salaryGroups.get(key).push({b,index,amount:cents(b.amount)});}
  const incomes=[];
  for(const [key,group] of salaryGroups){const byMonth=new Map();for(const r of group){const k=monthKey(r.b.date);if(!byMonth.has(k))byMonth.set(k,[]);byMonth.get(k).push(r);}const monthly=[...byMonth.values()].map(items=>{const largest=[...items].sort((a,b)=>b.amount-a.amount)[0];return {...largest,amount:items.reduce((n,r)=>n+r.amount,0)};}).sort((a,b)=>iso(a.b).localeCompare(iso(b.b))).slice(-6);const model=infer(monthly,1,true);if(model)model.sources=proof(group);if(!model||model.count<3||today>addMonthsDay(model.lastDate,2))continue;const recent=model.rows.slice(-3),amount=median(recent.map(r=>r.amount))/100;
    if((state.forecast?.incomePlans||[]).some(p=>key.includes(norm(p.matchKeyword))||norm(p.matchKeyword).includes(key)))continue;
    incomes.push({id:'auto-income-'+id(key),name:group[0].b.payee,source:'fixed',amount,day:model.day,startMonth:monthKey(model.rows[0].b.date),matchKeyword:group[0].b.payee,category:'Gehalt',automatic:true,learned:model});
  }
  const months=comparisonMonths(state.bookings||[],today);
  const merchants=new Map();for(const r of rows)if(months.includes(monthKey(r.b.date))&&r.kind==='expense'&&r.fixed==='Nein'){const key=JSON.stringify([r.category,norm(r.b.payee)]);if(!merchants.has(key))merchants.set(key,new Set());merchants.get(key).add(monthKey(r.b.date));}
  const fixedSources=[...new Set([...series.filter(s=>used.has(s.key)).flatMap(s=>s.rows.map(r=>r.index+':'+r.category)),...automaticFixed.flatMap(f=>f.learned.sources.map(s=>s.index+':'+f.category))])];
  const grouped=new Map();for(const r of rows){const month=monthKey(r.b.date);if(!months.includes(month)||r.kind!=='expense'||r.fixed!=='Nein'||fixedSources.includes(r.index+':'+r.category)||(state.fixed||[]).some(f=>f.status!=='Nein'&&f.category===r.category&&norm(f.matchKeyword)&&norm(r.b.payee+' '+r.b.purpose).includes(norm(f.matchKeyword))))continue;
    const recurrent=essentials(r.category)||(merchants.get(JSON.stringify([r.category,norm(r.b.payee)]))?.size||0)>=2;if(!recurrent)continue;
    if(!grouped.has(r.category))grouped.set(r.category,[]);grouped.get(r.category).push(r);
  }
  const flexible=[];
  if(months.length>=2)for(const [category,items] of grouped){const refundRows=[];for(const [index,b] of (state.bookings||[]).entries())if(b.flowType==='refund'&&b.refund&&iso(b)<=today&&months.includes(monthKey(b.date))){const target=(state.bookings||[]).findIndex(x=>x.financeId===b.refund.targetId);for(const part of b.refund.allocations)if(part.kind==='expense'&&part.fixed==='Nein'&&part.category===category&&items.some(r=>r.index===target&&r.category===category))refundRows.push({b,index,amount:cents(part.amount)});}
    const rawTotals=months.map(month=>items.filter(r=>monthKey(r.b.date)===month).reduce((n,r)=>n-r.amount,0)-refundRows.filter(r=>monthKey(r.b.date)===month).reduce((n,r)=>n+r.amount,0)),totals=rawTotals.map(n=>Math.max(0,n));
    const nonzero=totals.filter(n=>n>0);if(nonzero.length<Math.max(2,Math.ceil(months.length*.5)))continue;
    const center=median(totals),mad=median(totals.map(n=>Math.abs(n-center))),cap=Math.round(center+Math.max(3*mad,center*.5,2000)),adjusted=totals.map(n=>Math.min(n,cap)),amount=Math.round(adjusted.reduce((n,x)=>n+x,0)/months.length)/100;
    flexible.push({id:'auto-flex-'+id(category),name:category,category,amount,months,monthly:months.map((month,i)=>({month,amount:rawTotals[i]/100,used:adjusted[i]/100})),confidence:months.length>=4?'hoch':'mittel',outlierAdjusted:totals.some(n=>n>cap),count:items.length,sources:proof([...items,...refundRows]),reason:'Durchschnitt wiederkehrender flexibler Kosten; große Monatsausreißer begrenzt.'});
  }
  const ignored=new Set(state.forecast?.ignoredPatterns||[]);
  return {fixedModels:[...fixedModels.map((f,i)=>ignored.has('existing-'+i)?state.fixed[i]:f),...automaticFixed.filter(f=>!ignored.has(f.id))],fixed:fixed.filter(f=>!ignored.has(f.id)),incomes:incomes.filter(f=>!ignored.has(f.id)),flexible:flexible.filter(f=>!ignored.has(f.id)&&!Object.hasOwn(state.budgets||{},f.category)),flexibleComparisons:flexible.filter(f=>!ignored.has(f.id)),months,fixedSources};
}
function addMonthsDay(date,count){const key=shiftMonth(date.slice(0,7),count);return key+'-'+String(Math.min(Number(date.slice(8)),days(key))).padStart(2,'0');}

export function comparisonMonths(bookings,today){
  const dates=bookings.filter(b=>b.date&&iso(b)<=today).map(iso).sort(),allDates=dates.map(d=>d.slice(0,7)),present=new Set(allDates),first=allDates[0],last=allDates.at(-1),lastFull=dates.at(-1)?.slice(8)===String(days(last||today.slice(0,7))).padStart(2,'0'),months=[];
  for(let k=shiftMonth(today.slice(0,7),-6);k<today.slice(0,7);k=shiftMonth(k,1))if(k>first&&(k<last||k===last&&lastFull)&&present.has(k))months.push(k);
  return months;
}
