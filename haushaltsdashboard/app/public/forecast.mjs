import {cents,bookingParts,monthKey,shiftMonth,berlinToday,analyzeMonth,inflowKind,flowKind} from './finance.mjs';
import {learnPatterns} from './learning.mjs';
const DAY=86400000;
const norm=s=>String(s||'').normalize('NFC').trim().toLocaleLowerCase('de');
export const isoDate=b=>/^\d{2}\.\d{2}\.\d{4}$/.test(b.date||'')?b.date.slice(6)+'-'+b.date.slice(3,5)+'-'+b.date.slice(0,2):'';
export const addDays=(date,count)=>new Date(Date.parse(date+'T12:00:00Z')+count*DAY).toISOString().slice(0,10);
export const daysInMonth=key=>new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5)),0)).getUTCDate();
const atDay=(key,day)=>key+'-'+String(Math.min(daysInMonth(key),Math.max(1,day))).padStart(2,'0');
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const money=(x,negative=false)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<1e10&&(negative||x>=0)&&Math.abs(x*100-cents(x))<.001;
export function defaults(value={}) {return {balanceSource:'bank',manualBalance:null,horizon:30,protectedBalance:0,buffer:0,useBudgets:true,includePossible:true,includeEstimates:false,automatic:true,ignoredPatterns:[],incomePlans:[],oneOffs:[],excluded:[],...value};}
export function validateForecast(value){
  if(value===undefined)return null;
  if(!value||Array.isArray(value)||typeof value!=='object')return 'Ungültige Prognoseeinstellungen.';
  const f=defaults(value);
  if(!['bank','manual'].includes(f.balanceSource)||![30,60,90].includes(f.horizon)||!money(f.buffer)||!money(f.protectedBalance)||['useBudgets','includePossible','includeEstimates','automatic'].some(k=>typeof f[k]!=='boolean'))return 'Ungültige Prognoseeinstellungen.';
  if(f.manualBalance!==null&&(!f.manualBalance||!money(f.manualBalance.amount,true)||!isDate(f.manualBalance.date)))return 'Bitte Kontostand und Stichtag prüfen.';
  if(!Array.isArray(f.incomePlans)||f.incomePlans.length>50||!Array.isArray(f.oneOffs)||f.oneOffs.length>100||!Array.isArray(f.excluded)||f.excluded.length>4000||f.excluded.some(x=>typeof x!=='string'||x.length>150))return 'Zu viele oder ungültige Planposten.';
  if(!Array.isArray(f.ignoredPatterns)||f.ignoredPatterns.length>1000||f.ignoredPatterns.some(x=>typeof x!=='string'||x.length>150))return 'Ungültige ausgeschlossene Muster.';
  const ids=new Set();
  for(const p of [...f.incomePlans,...f.oneOffs]){
    if(!p||typeof p.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.matchKeyword!=='string'||p.matchKeyword.length>100||p.category!==undefined&&(typeof p.category!=='string'||p.category.length>100))return 'Ungültiger Planposten.';ids.add(p.id);
  }
  for(const p of f.incomePlans)if(!['fixed','joern','bettina'].includes(p.source)||!money(p.amount)||p.amount<=0||!Number.isInteger(p.day)||p.day<1||p.day>31||!p.matchKeyword.trim()||!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.startMonth||''))return 'Einkommensplan benötigt Betrag, Tag, Startmonat und Zahlungsbeteiligten.';
  for(const p of f.oneOffs)if(!money(p.amount,true)||!p.amount||!isDate(p.date)||!['expense','investment','transfer','income'].includes(p.kind)||p.kind==='expense'&&p.amount>0||p.kind==='income'&&p.amount<0)return 'Einmalige Zahlung benötigt Datum, Art und Betrag.';
  return null;
}
// Only booked balances, never available balances containing overdraft/holds.
export function bankSnapshot(vault){
  if(!vault.session||vault.selectedAccounts?.length!==1)return null;
  const account=vault.selectedAccounts[0],rows=vault.balances?.find(b=>b.uid===account)?.balances||[];
  const booked=rows.filter(b=>['ITBD','CLBD'].includes(b.balance_type)&&b.balance_amount?.currency==='EUR'&&/^-?\d+(\.\d{1,2})?$/.test(String(b.balance_amount.amount)));
  booked.sort((a,b)=>String(b.reference_date||b.last_change_date_time||'').localeCompare(String(a.reference_date||a.last_change_date_time||''))||Number(b.balance_type==='ITBD')-Number(a.balance_type==='ITBD'));
  const b=booked[0];if(!b||!vault.lastSync)return null;
  const date=b.reference_date||b.last_change_date_time?.slice(0,10)||berlinDay(vault.lastSync);
  if(!isDate(date)||!money(Number(b.balance_amount.amount),true))return null;
  return {amount:Number(b.balance_amount.amount),date,type:b.balance_type,fetchedAt:vault.lastSync,inferredDate:!b.reference_date&&!b.last_change_date_time,account:vault.connection?.expectedAccount||''};
}
function berlinDay(date){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));}
export function incomeSuggestions(bookings){
  const grouped=new Map();
  for(const b of bookings)if(b.amount>0&&b.category==='Gehalt'&&inflowKind(b)==='income'&&norm(b.payee)){
    const key=norm(b.payee);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(b);
  }
  return [...grouped.values()].map(rows=>{rows.sort((a,b)=>isoDate(b).localeCompare(isoDate(a)));const recent=rows.slice(0,3),amounts=recent.map(b=>b.amount).sort((a,b)=>a-b),days=recent.map(b=>Number(b.date.slice(0,2))).sort((a,b)=>a-b);return {name:rows[0].payee,amount:amounts[Math.floor(amounts.length/2)],day:days[Math.floor(days.length/2)],count:recent.length};});
}
function fixedEvents(fixed,bookings,key,options,warnings){
  const events=[],categories=new Map();for(const f of fixed)if(f.status!=='Nein')categories.set(f.category,(categories.get(f.category)||0)+1);
  fixed.forEach((f,index)=>{
    if(f.status==='Nein'||f.status==='Möglich'&&!options.includePossible)return;
    const cycle={'monatlich':1,'zweimonatlich':2,'vierteljährlich':3,'halbjährlich':6,'jährlich':12}[f.rhythm],anchor=Number(f.anchorMonth);
    if(!cycle||cycle>1&&(!Number.isInteger(anchor)||anchor<1||anchor>12)){warnings.add(`${f.name}: Rhythmus oder Fälligkeitsmonat fehlt; nicht eingerechnet.`);return;}
    if(cycle>1&&(Number(key.slice(5))-anchor+12)%cycle)return;
    const hint=norm(f.matchKeyword),past=bookings.filter(b=>b.amount<0&&bookingParts(b).some(p=>p.category===f.category)&&(!hint||norm(b.payee+' '+b.purpose).includes(hint)));
    const days=past.map(b=>Number(b.date.slice(0,2))).sort((a,b)=>a-b),explicit=Number(f.dueDay),estimatedDay=!(explicit>=1&&explicit<=31),day=estimatedDay?(days.length>=2?days[Math.floor(days.length/2)]:daysInMonth(key)):explicit;
    const amount=-cents(f.learned?f.learned.amount:Number(f.monthly)*cycle);if(!(amount<0))return;
    events.push({id:f.id?`${f.id}-${key}`:`fixed-${index}-${key}`,name:f.name,date:atDay(key,day),month:key,amount:amount/100,category:f.category||'Sonstiges',kind:flowKind(f.category,f.flowType),type:'fixed',hint,uniqueCategory:categories.get(f.category)===1,estimated:estimatedDay||f.status==='Möglich',automatic:!!f.learned||!!f._learning,detail:f.learned||f._learning?'Automatisch erkannt · '+(f.learned||f._learning).confidence:estimatedDay?'Fälligkeit geschätzt':f.status==='Möglich'?'Mögliche Fixkosten':'Fixkosten'});
  });return events;
}
export function forecast(state,bank,{today=berlinToday(),account=bank?.account||''}={}){
  const settings=defaults(state.forecast),warnings=new Set(),end=addDays(today,settings.horizon),endMonth=end.slice(0,7),startMonth=today.slice(0,7);
  const bookings=(state.bookings||[]).filter(b=>(!account||!b.account||norm(b.account)===norm(account))&&isoDate(b)<=today);
  const learning=settings.automatic?learnPatterns({...state,bookings},today):{fixedModels:state.fixed||[],fixed:[],incomes:[],flexible:[],months:[],fixedSources:[]};
  const budgets={...Object.fromEntries(learning.flexible.map(p=>[p.category,p.amount])),...(state.budgets||{})},autoCategories=new Set(learning.flexible.map(p=>p.category));
  const selected=settings.balanceSource==='manual'?settings.manualBalance:bank;
  const balance=selected&&isDate(selected.date)&&selected.date<=today&&money(selected.amount,true)?{...selected}:null;
  if(!balance)warnings.add('Ein gültiger gebuchter Kontostand mit Stichtag wird benötigt.');
  let currentCents=balance?cents(balance.amount):0;
  if(balance){
    for(const b of bookings)if(isoDate(b)>balance.date)currentCents+=cents(b.amount);
    if(balance.date<addDays(today,-3))warnings.add('Kontostand älter als drei Tage. Nur danach importierte Buchungen sind fortgeschrieben; bitte Bankabruf oder Kontostand aktualisieren.');
    if(balance.inferredDate)warnings.add('Die Bank liefert keinen Saldo-Stichtag. Verwendet wird der Abruftag; bitte mit dem Onlinebanking abgleichen.');
  }
  const all=[],months=[];for(let key=shiftMonth(startMonth,-1);key<=endMonth;key=shiftMonth(key,1))months.push(key);
  for(const key of months){
    all.push(...fixedEvents(learning.fixedModels,bookings,key,settings,warnings));
    for(const p of [...settings.incomePlans,...learning.incomes]){
      if(key<p.startMonth)continue;
      const entered=p.source==='fixed'?p.amount:state.incomes?.[key]?.[p.source],explicit=typeof entered==='number'&&Number.isFinite(entered)&&entered>=0;
      const amount=explicit?entered:p.amount;
      if(amount<=0)continue;
      let incomeDate=atDay(key,p.day);if(p.learned?.endOfMonth){while([0,6].includes(new Date(incomeDate+'T12:00:00Z').getUTCDay()))incomeDate=addDays(incomeDate,-1);}
      all.push({id:`income-${p.id}-${key}`,automatic:!!p.automatic,name:p.name,date:incomeDate,month:key,amount,category:p.category||'Gehalt',kind:'income',type:'income',hint:norm(p.matchKeyword),estimated:!explicit||!!p.automatic,detail:p.automatic?'Automatisches Gehalt · '+p.learned.confidence:explicit?'Einkommensplan':'Standardbetrag · Monatsnetto fehlt'});
    }
  }
  for(const p of settings.oneOffs)if(p.date.slice(0,7)>=shiftMonth(startMonth,-1)&&p.date.slice(0,7)<=endMonth)all.push({...p,id:'once-'+p.id,month:p.date.slice(0,7),type:'once',hint:norm(p.matchKeyword),estimated:false,detail:'Einmalig geplant'});
  // Match original gross debits, not refunded net expense. Each part can satisfy one plan only.
  const slots=bookings.flatMap((b,index)=>b.amount<0?bookingParts(b).map((p,partIndex)=>({b,index,key:`${index}:${partIndex}`,date:isoDate(b),amount:-p.cents/100,category:p.category,kind:p.kind,fixed:p.fixed})): [{b,index,key:String(index),date:isoDate(b),amount:b.amount,category:b.category,kind:inflowKind(b),fixed:'Nein'}]);
  const candidates=[];
  for(const e of all){
    if(settings.excluded.includes(e.id))continue;
    for(const s of slots){
      if(e.automatic&&s.b.forecastOneOff)continue;
      if(Math.sign(s.amount)!==Math.sign(e.amount)||e.amount>0&&s.kind!==e.kind&&!(e.kind==='income'&&s.b.refund))continue;
      const sameMonth=s.date.slice(0,7)===e.month,distance=Math.abs(Date.parse(s.date)-Date.parse(e.date))/DAY;
      if(!sameMonth&&distance>5)continue;
      if(e.type==='fixed'&&s.category!==e.category)continue;
      const hinted=e.hint&&norm(s.b.payee+' '+s.b.purpose).includes(e.hint);
      const categoryMatch=e.type==='fixed'&&e.uniqueCategory&&s.category===e.category&&s.fixed!=='Nein';
      if(!hinted&&!categoryMatch)continue;
      const diff=Math.abs(cents(s.amount)-cents(e.amount)),tolerance=Math.max(200,Math.abs(cents(e.amount))*.05);
      if(diff>tolerance&&!(e.automatic&&e.type==='income'&&isLearnedSalary(s.b)))continue;
      candidates.push({event:e,slot:s,score:(hinted?0:1000)+diff/100+distance});
    }
  }
  const ambiguous=new Set();
  for(const e of all){const choices=candidates.filter(c=>c.event.id===e.id).sort((a,b)=>a.score-b.score);if(choices.length>1&&(!e.hint||Math.abs(choices[0].score-choices[1].score)<.0001)){ambiguous.add(e.id);if(e.month>=startMonth)warnings.add(`${e.name}: mehrere Buchungen passen; bleibt bis zur Prüfung eingeplant.`);}}
  candidates.sort((a,b)=>a.score-b.score);const matched=new Map(),used=new Set();
  for(const c of candidates)if(!ambiguous.has(c.event.id)&&!matched.has(c.event.id)&&!used.has(c.slot.key)){matched.set(c.event.id,c.slot);used.add(c.slot.key);}
  const events=[];
  for(const e of all){
    if(e.month<startMonth||e.date>end&&e.month!==endMonth)continue;
    const match=matched.get(e.id),excluded=settings.excluded.includes(e.id);
    let status=match?'booked':excluded?'excluded':'planned';
    if(!match&&!excluded&&e.amount>0&&e.date<today){status='overdue-income';warnings.add(`${e.name}: erwarteter Geldeingang überfällig; nicht eingerechnet.`);}
    if(!match&&!excluded&&e.amount>0&&e.estimated&&!e.automatic&&!settings.includeEstimates)status='estimate-excluded';
    events.push({...e,originalDate:e.date,date:e.date<today?today:e.date,status,booking:match?{date:match.b.date,payee:match.b.payee,amount:match.amount,index:match.index}:null});
  }
  // Budgets contain fixed costs too: subtract actual spending AND planned category costs.
  const budgetEvents=[];
  if(settings.useBudgets)for(const key of months.filter(k=>k>=startMonth)){
    const analysis=analyzeMonth(bookings,key,{spendingOnly:true}),actual=new Map(analysis.categories),flexActual=new Map();for(const entry of analysis.entries)if(entry.status==='variable'&&!entry.booking.forecastOneOff&&!learning.fixedSources.includes(entry.index+':'+entry.category)&&!events.some(e=>e.type==='once'&&e.booking?.index===entry.index&&e.category===entry.category))flexActual.set(entry.category,(flexActual.get(entry.category)||0)+entry.value);
    for(const [category,raw] of Object.entries(budgets)){
      const budget=cents(raw);if(!(budget>0))continue;
      const planned=events.filter(e=>e.month===key&&e.status==='planned'&&e.amount<0&&e.kind==='expense'&&e.category===category&&!autoCategories.has(category)).reduce((n,e)=>n-cents(e.amount),0);
      const remaining=Math.max(0,budget-Math.max(0,cents((autoCategories.has(category)?flexActual:actual).get(category)||0))-planned),start=key===startMonth?Number(today.slice(8)):1,days=daysInMonth(key)-start+1;
      const daily=Math.floor(remaining/days),rest=remaining%days;
      for(let i=0;i<days;i++)if(daily+(i<rest?1:0)>0)budgetEvents.push({id:`budget-${category}-${key}-${start+i}`,name:(autoCategories.has(category)?'Typische flexible Kosten: ':'Restbudget: ')+category,date:atDay(key,start+i),month:key,amount:-(daily+(i<rest?1:0))/100,category,type:'budget',kind:'expense',status:'planned',estimated:true,automatic:autoCategories.has(category),detail:autoCategories.has(category)?'Automatischer Durchschnitt · '+learning.months.length+' vergangene Monate':'Gleichmäßig auf verbleibende Kalendertage verteilt'});
    }
  }
  if(!Object.values(budgets).some(n=>Number(n)>0)&&settings.useBudgets)warnings.add('Keine Kategoriebudgets vorhanden. Flexible Ausgaben sind nur über Einmalposten eingeplant.');
  const uncovered=[...new Set(bookings.filter(b=>monthKey(b.date)>=shiftMonth(startMonth,-2)).flatMap(b=>bookingParts(b)).filter(p=>p.kind==='expense'&&p.fixed==='Nein'&&!(Number(budgets[p.category])>0)).map(p=>p.category))];
  if(settings.useBudgets&&uncovered.length)warnings.add('Bekannte flexible Kategorien ohne Budget: '+uncovered.slice(0,6).join(', ')+(uncovered.length>6?' …':'')+'. Dafür sind nur ausdrücklich geplante Einmalposten berücksichtigt.');
  if(!settings.useBudgets)warnings.add('Restbudgets sind ausgeschaltet. Flexible Ausgaben nur aus Einmalposten berücksichtigt.');
  if(!settings.incomePlans.length&&!learning.incomes.length)warnings.add('Noch kein regelmäßiger Kontoeingang geplant. Die Freigrenze reicht bis zum Monatsende.');
  const active=[...events,...budgetEvents].filter(e=>e.status==='planned'&&e.date>=today&&e.date<=end);
  const protectedCents=cents(settings.protectedBalance)+cents(settings.buffer),points=[],byDate=new Map();
  for(const e of active){if(!byDate.has(e.date))byDate.set(e.date,[]);byDate.get(e.date).push(e);}
  let running=currentCents;
  for(let d=today;d<=end;d=addDays(d,1)){const dayEvents=byDate.get(d)||[],income=dayEvents.filter(e=>e.amount>0).reduce((n,e)=>n+cents(e.amount),0),expense=dayEvents.filter(e=>e.amount<0).reduce((n,e)=>n-cents(e.amount),0);running+=income-expense;points.push({date:d,balance:running/100,free:(running-protectedCents)/100,income:income/100,expense:expense/100,events:dayEvents});}
  const nextIncome=active.filter(e=>e.type==='income'&&e.amount>0).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const freeUntil=nextIncome?nextIncome.date===today?today:addDays(nextIncome.date,-1):[atDay(startMonth,31),end].sort()[0];
  const beforePay=points.filter(p=>p.date<=freeUntil),minimum=Math.min(currentCents/100,...points.map(p=>p.balance)),freeMinimum=Math.min(currentCents/100,...beforePay.map(p=>p.balance))-protectedCents/100;
  const monthly=monthlyRoom(bookings,events,budgetEvents,learning,startMonth,settings);
  return {today,end,settings,learning,monthly,balance,current:balance?currentCents/100:null,points:balance?points:[],events:events.filter(e=>e.date<=end).sort((a,b)=>a.date.localeCompare(b.date)||a.amount-b.amount),budgetEvents:budgetEvents.filter(e=>e.date<=end),warnings:[...warnings],endBalance:balance?running/100:null,minimum:balance?minimum:null,available:balance?Math.round(freeMinimum*100)/100:null,freeUntil,nextIncome:nextIncome||null,protected:protectedCents/100,plannedIncome:active.filter(e=>e.amount>0).reduce((n,e)=>n+cents(e.amount),0)/100,plannedExpense:active.filter(e=>e.amount<0).reduce((n,e)=>n-cents(e.amount),0)/100};
}

function isLearnedSalary(b){return b.amount>0&&!b.refund&&inflowKind(b)==='income'&&(b.category==='Gehalt'||/lohn|gehalt|salary/i.test(b.purpose||''));}

export function monthlyRoom(bookings,events,budgetEvents,learning,key,settings){
  let received=0,expected=0,bookedFixed=0,bookedFlex=0,bookedOther=0,openFixed=0,openFlex=0,openOther=0;
  const categories=new Map(),fixedSources=new Set(learning.fixedSources||[]);
  const isFixed=(index,category,status)=>status==='Ja'||status==='Möglich'||fixedSources.has(index+':'+category)||events.some(e=>e.type==='fixed'&&e.booking?.index===index&&e.category===category);
  function add(category,value,fixed,other,planned){
    if(!categories.has(category))categories.set(category,{name:category,booked:0,planned:0});categories.get(category)[planned?'planned':'booked']+=value;
    if(planned){if(other)openOther+=value;else if(fixed)openFixed+=value;else openFlex+=value;}
    else{if(other)bookedOther+=value;else if(fixed)bookedFixed+=value;else bookedFlex+=value;}
  }
  bookings.forEach((b,index)=>{
    if(monthKey(b.date)!==key)return;
    if(b.amount>0){
      if(b.refund&&b.flowType==='refund')for(const part of b.refund.allocations){const target=bookings.findIndex(x=>x.financeId===b.refund.targetId);add(part.category,-cents(part.amount),isFixed(target,part.category,part.fixed),part.kind!=='expense',false);}
      else if(inflowKind(b)==='income')received+=cents(b.amount);
    }else for(const part of bookingParts(b))add(part.category,part.cents,isFixed(index,part.category,part.fixed),part.kind!=='expense',false);
  });
  for(const e of [...events,...budgetEvents])if(e.month===key&&e.status==='planned'){
    if(e.amount>0){if(e.kind==='income')expected+=cents(e.amount);}
    else add(e.category,-cents(e.amount),e.type==='fixed',e.kind!=='expense',true);
  }
  const income=received+expected,booked=bookedFixed+bookedFlex+bookedOther,open=openFixed+openFlex+openOther,costs=booked+open;
  const incomeKnown=received>0||settings.incomePlans.length>0||learning.incomes.length>0;
  return {key,incomeKnown,income:income/100,received:received/100,expected:expected/100,costs:costs/100,booked:booked/100,open:open/100,fixed:(bookedFixed+openFixed)/100,flexible:(bookedFlex+openFlex)/100,other:(bookedOther+openOther)/100,available:incomeKnown?(income-costs)/100:null,categories:[...categories.values()].map(r=>({name:r.name,booked:r.booked/100,planned:r.planned/100,total:(r.booked+r.planned)/100})).sort((a,b)=>b.total-a.total)};
}
