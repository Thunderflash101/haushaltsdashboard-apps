// Shared by the browser and server validation. Amounts are calculated in cents.
export const cents = value => Math.round(Number(value) * 100);
export const monthKey = date => /^\d{2}\.\d{2}\.\d{4}$/.test(date || '') ? date.slice(6) + '-' + date.slice(3,5) : '';
const day = date => Number(String(date).slice(0,2));
const status = fixed => fixed === 'Ja' ? 'yes' : fixed === 'Möglich' ? 'maybe' : 'variable';
const validMoney = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1e12 && Math.abs(value * 100 - cents(value)) < .001;
const validFixed = value => ['Ja','Möglich','Nein'].includes(value);
export function flowKind(category, kind) {
  if (['expense','transfer','investment'].includes(kind)) return kind;
  return category === 'ETFs' ? 'investment' : category === 'Haushaltsgeld' ? 'transfer' : 'expense';
}
export function bookingParts(booking) {
  if (!(booking.amount < 0)) return [];
  const parts = booking.splits;
  if (Array.isArray(parts) && parts.length > 1 && parts.every(p => validMoney(p.amount)) && parts.reduce((n,p) => n + cents(p.amount),0) === -cents(booking.amount)) {
    return parts.map(p => ({category:p.category || 'Sonstiges', cents:cents(p.amount), kind:flowKind(p.category,p.kind), fixed:p.fixed || booking.fixed || 'Nein'}));
  }
  return [{category:booking.category || 'Sonstiges', cents:-cents(booking.amount), kind:flowKind(booking.category,booking.flowType), fixed:booking.fixed || 'Nein'}];
}
const partKey = p => JSON.stringify([p.category,p.kind,p.fixed]);
export function refundableParts(bookings, target, excludingId) {
  const remaining = new Map();
  for (const part of bookingParts(target)) {
    const key = partKey(part);
    if (!remaining.has(key)) remaining.set(key,{...part,cents:0});
    remaining.get(key).cents += part.cents;
  }
  for (const booking of bookings) {
    if (booking.financeId === excludingId || !target.financeId || booking.refund?.targetId !== target.financeId) continue;
    for (const part of booking.refund.allocations || []) {
      const row = remaining.get(partKey(part));
      if (row) row.cents -= cents(part.amount);
    }
  }
  return [...remaining.values()];
}
export function validateFinanceState(state) {
  const bookings = state.bookings;
  if (!Array.isArray(bookings)) return 'Buchungen fehlen.';
  const ids = new Map();
  for (const b of bookings) {
    if (!b) return 'Ungültige Buchung.';
    if (b.financeId !== undefined) {
      if (typeof b.financeId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(b.financeId) || ids.has(b.financeId)) return 'Doppelte oder ungültige Buchungskennung.';
      ids.set(b.financeId,b);
    }
    if (b.flowType !== undefined && !['expense','transfer','investment','income','refund'].includes(b.flowType)) return 'Ungültige Buchungsart.';
    if (b.splits !== undefined) {
      if (!Array.isArray(b.splits)) return 'Ungültige Teilbuchungen.';
      if (b.splits.length && (!(b.amount < 0) || b.splits.length < 2 || b.splits.length > 100 || b.splits.some(p => !p || !validMoney(p.amount) || typeof p.category !== 'string' || !p.category.trim() || p.category.length > 100 || !['expense','transfer','investment'].includes(p.kind) || p.fixed !== undefined && !validFixed(p.fixed)) || b.splits.reduce((n,p) => n + cents(p.amount),0) !== -cents(b.amount))) return 'Die Teilbeträge müssen centgenau zur Abbuchung passen.';
    }
  }
  const refunds = new Map();
  for (const b of bookings) {
    if (b.flowType === 'refund' && !b.refund) return 'Eine Erstattung benötigt eine Originalbuchung.';
    if (b.refund !== undefined) {
      const target = ids.get(b.refund?.targetId), parts = b.refund?.allocations;
      if (!b.financeId || !(b.amount > 0) || b.flowType !== 'refund' || b.transferPeerId || !target || !(target.amount < 0) || target.transferPeerId || !Array.isArray(parts) || !parts.length || parts.length > 100) return 'Ungültige Erstattungszuordnung.';
      if (parts.some(p => !p || !validMoney(p.amount) || typeof p.category !== 'string' || !['expense','transfer','investment'].includes(p.kind) || !validFixed(p.fixed)) || parts.reduce((n,p) => n + cents(p.amount),0) !== cents(b.amount)) return 'Die Aufteilung der Erstattung passt nicht zum Geldeingang.';
      const available = new Map();
      for (const part of bookingParts(target)) available.set(partKey(part),(available.get(partKey(part)) || 0) + part.cents);
      if (!refunds.has(target.financeId)) refunds.set(target.financeId,new Map());
      const used = refunds.get(target.financeId);
      for (const part of parts) {
        const key = partKey(part), total = (used.get(key) || 0) + cents(part.amount);
        if (!available.has(key) || total > available.get(key)) return 'Erstattungen dürfen die ursprünglichen Teilbeträge nicht überschreiten.';
        used.set(key,total);
      }
    }
    if (b.transferPeerId !== undefined) {
      const peer = ids.get(b.transferPeerId);
      if (!b.financeId || b.flowType !== 'transfer' || b.refund || b.splits?.length || !peer || peer === b || peer.flowType !== 'transfer' || peer.transferPeerId !== b.financeId || cents(b.amount) === 0 || cents(b.amount) + cents(peer.amount) !== 0 || b.account && peer.account && b.account === peer.account) return 'Umbuchungen benötigen zwei unterschiedliche, gleich hohe Gegenbuchungen.';
    }
  }
  return null;
}
export function analyzeMonth(bookings, key, options = {}) {
  const spending = options.spendingOnly === true, maxDay = options.throughDay || 31;
  let cashIn=0,cashOut=0,income=0,expense=0,yes=0,maybe=0,variable=0,refunds=0,transfersIn=0,investmentIn=0;
  const categories = new Map(), entries = [];
  function add(booking,index,part,value,isRefund=false) {
    if (spending && part.kind !== 'expense') return;
    const bucket = status(part.fixed);
    expense += value;
    if (bucket === 'yes') yes += value; else if (bucket === 'maybe') maybe += value; else variable += value;
    categories.set(part.category,(categories.get(part.category) || 0) + value);
    entries.push({booking,index,value:value/100,status:bucket,category:part.category,kind:part.kind,isRefund});
  }
  bookings.forEach((b,index) => {
    if (monthKey(b.date) !== key || day(b.date) > maxDay) return;
    const amount = cents(b.amount);
    if (amount >= 0) {
      cashIn += amount;
      if (b.refund && b.flowType === 'refund') {
        refunds += amount;
        if (spending) for (const p of b.refund.allocations) add(b,index,p,-cents(p.amount),true);
      } else if (flowKind(b.category,b.flowType) === 'transfer') transfersIn += amount;
      else if (b.flowType === 'investment') investmentIn += amount;
      else income += amount;
    } else {
      cashOut -= amount;
      for (const part of bookingParts(b)) add(b,index,part,part.cents);
    }
  });
  return {income:(spending?income:cashIn)/100,earnedIncome:income/100,cashIncome:cashIn/100,expense:expense/100,yes:yes/100,maybe:maybe/100,variable:variable/100,balance:(cashIn-cashOut)/100,cashExpense:cashOut/100,excluded:(cashOut-expense)/100,refunds:refunds/100,transfersIn:transfersIn/100,investmentIn:investmentIn/100,categories:[...categories].map(([n,v])=>[n,v/100]).sort((a,b)=>b[1]-a[1]),entries:entries.sort((a,b)=>b.value-a.value||a.index-b.index)};
}
export function shiftMonth(key, offset) {
  const [year,month] = key.split('-').map(Number), date = new Date(Date.UTC(year,month-1+offset,1));
  return date.toISOString().slice(0,7);
}
export function berlinToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function compareMonths(bookings,key,{mode='previous',spendingOnly=true,today=berlinToday(),sameDay=true}={}) {
  const present = new Set(bookings.map(b=>monthKey(b.date)).filter(Boolean));
  const keys = mode === 'year' ? [shiftMonth(key,-12)] : mode === 'average' ? Array.from({length:12},(_,i)=>shiftMonth(key,-12+i)) : [shiftMonth(key,-1)];
  const used = keys.filter(k=>present.has(k)), missing = keys.filter(k=>!present.has(k));
  const latest = [...present].sort().at(-1);
  const maxBookedDay = Math.max(0,...bookings.filter(b=>monthKey(b.date)===key).map(b=>day(b.date)));
  const days = new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5,7)),0)).getUTCDate();
  const currentMonth = key === today.slice(0,7);
  const partial = currentMonth || key === latest && maxBookedDay < days;
  const throughDay = sameDay && partial ? Math.max(1,Math.min(maxBookedDay || 31,currentMonth?Number(today.slice(8)):31)) : 31;
  const current = analyzeMonth(bookings,key,{spendingOnly,throughDay});
  const prior = used.map(k=>({key:k,...analyzeMonth(bookings,k,{spendingOnly,throughDay})}));
  const names = new Set([...current.categories.map(([n])=>n),...prior.flatMap(p=>p.categories.map(([n])=>n))]);
  const currentMap = new Map(current.categories), maps = prior.map(p=>new Map(p.categories));
  const changes = [...names].map(name=>{
    const now = cents(currentMap.get(name) || 0), before = used.length ? Math.round(maps.reduce((sum,m)=>sum+cents(m.get(name)||0),0)/used.length) : 0;
    return {name,now:now/100,previous:before/100,delta:(now-before)/100};
  }).sort((a,b)=>b.delta-a.delta||a.name.localeCompare(b.name,'de'));
  const average = changes.reduce((n,r)=>n+cents(r.previous),0)/100;
  return {current,prior,keys:used,missing,changes,average,delta:(cents(current.expense)-cents(average))/100,throughDay,partial,hasComparison:present.has(key)&&used.length>0};
}
const normalized = value => String(value || '').toLocaleLowerCase('de').replace(/\s+/g,' ').trim();
const dateNumber = b => Date.UTC(Number(b.date.slice(6)),Number(b.date.slice(3,5))-1,Number(b.date.slice(0,2)));
export function relationCandidates(bookings, booking, type) {
  const currentTime=dateNumber(booking);
  return bookings.filter(b=>b!==booking).map(b=>{
    const days=(currentTime-dateNumber(b))/86400000, samePayee=normalized(b.payee).length>=3&&normalized(b.payee)===normalized(booking.payee);
    if (type==='refund') {
      const remaining=refundableParts(bookings,b,booking.financeId).reduce((n,p)=>n+p.cents,0);
      if (!(booking.amount>0&&b.amount<0) || b.transferPeerId || remaining<cents(booking.amount) || days<0) return null;
      return {booking:b,score:(samePayee?100:0)+(remaining===cents(booking.amount)?20:0)-Math.min(days,365)/365,suggested:samePayee&&days<=180};
    }
    if (b.refund||b.splits?.length||b.transferPeerId&&b.transferPeerId!==booking.financeId||cents(b.amount)+cents(booking.amount)!==0||!cents(b.amount)||b.account&&booking.account&&b.account===booking.account) return null;
    const knownAccounts=b.account&&booking.account&&b.account!==booking.account;
    return {booking:b,score:(knownAccounts?100:0)-Math.abs(days),suggested:!!knownAccounts&&Math.abs(days)<=7};
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
}
