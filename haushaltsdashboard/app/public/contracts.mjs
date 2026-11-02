import {genericPayPalKeyword} from './booking-text.mjs';
import {bookingParts,cents,shiftMonth,monthKey} from './finance.mjs';
const norm=s=>String(s||'').normalize('NFC').toLocaleLowerCase('de').replace(/\s+/g,' ').trim();
const iso=b=>b.date.slice(6)+'-'+b.date.slice(3,5)+'-'+b.date.slice(0,2);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const dateOptional=s=>s===undefined||s===''||validDate(s);
const cycles={1:'monatlich',2:'zweimonatlich',3:'vierteljährlich',6:'halbjährlich',12:'jährlich'};
export function validateContracts(contracts){
  if(contracts===undefined)return null;
  if(!Array.isArray(contracts)||contracts.length>1000)return 'Ungültige Vertragsliste.';
  const ids=new Set();
  for(const c of contracts){
    if(!c||typeof c.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(c.id)||ids.has(c.id))return 'Ungültige oder doppelte Vertragskennung.';ids.add(c.id);
    for(const [key,max,required] of [['name',80,true],['provider',100,true],['category',100,true],['matchKeyword',100,c.matchMode!=='manual'],['number',100,false],['notes',2000,false],['patternId',100,false]])if(c[key]!==undefined&&typeof c[key]!=='string'||required&&!String(c[key]||'').trim()||String(c[key]||'').length>max)return 'Bitte Vertragsbezeichnung, Anbieter, Kategorie und Suchtext prüfen.';
    if(typeof c.amount!=='number'||!Number.isFinite(c.amount)||c.amount<=0||c.amount>=1e10||Math.abs(c.amount*100-cents(c.amount))>.001||!Number.isInteger(c.cycleMonths)||!cycles[c.cycleMonths]||!Number.isInteger(c.dueDay)||c.dueDay<1||c.dueDay>31||!Number.isInteger(c.anchorMonth)||c.anchorMonth<1||c.anchorMonth>12)return 'Zahlbetrag, Rhythmus und Fälligkeit prüfen.';
    if(c.matchMode!==undefined&&!['text','manual'].includes(c.matchMode))return 'Ungültige Buchungszuordnung.';
    if(!['active','cancelled','ended'].includes(c.status)||!['observed','manual'].includes(c.priceMode))return 'Ungültiger Vertragsstatus oder Preisplan.';
    if(['startDate','endDate','deadline','cancellationSent'].some(key=>!dateOptional(c[key])))return 'Ungültiges Vertragsdatum.';
    if(c.startDate&&c.endDate&&c.startDate>c.endDate||c.deadline&&c.endDate&&c.deadline>c.endDate)return 'Vertragsdaten widersprechen sich.';
    if(c.status==='cancelled'&&!c.endDate)return 'Bei gekündigten Verträgen bitte das bestätigte Enddatum eintragen.';
    if(c.noticeValue!==null&&c.noticeValue!==undefined&&(!Number.isInteger(c.noticeValue)||c.noticeValue<0||c.noticeValue>3650)||!['days','months'].includes(c.noticeUnit)||!Number.isInteger(c.renewalMonths)||c.renewalMonths<0||c.renewalMonths>120)return 'Kündigungsfrist oder Verlängerung prüfen.';
    if(c.linkedFixedIndex!==null&&c.linkedFixedIndex!==undefined&&(!Number.isInteger(c.linkedFixedIndex)||c.linkedFixedIndex<0||c.linkedFixedIndex>10000))return 'Ungültiger verknüpfter Fixkostenposten.';
  }
  for(let i=0;i<contracts.length;i++)for(let j=i+1;j<contracts.length;j++){const a=contracts[i],b=contracts[j];if(a.linkedFixedIndex===null||a.linkedFixedIndex===undefined||a.linkedFixedIndex!==b.linkedFixedIndex||a.status==='ended'||b.status==='ended')continue;const endA=a.status==='active'&&a.renewalMonths?'9999-12-31':a.endDate||'9999-12-31',endB=b.status==='active'&&b.renewalMonths?'9999-12-31':b.endDate||'9999-12-31';if((a.startDate||'0000-01-01')<=endB&&(b.startDate||'0000-01-01')<=endA)return 'Ein Fixkostenposten darf nicht gleichzeitig zwei laufende Verträge ersetzen.';}
  return null;
}
export function shiftDate(date,months){const key=shiftMonth(date.slice(0,7),months),last=new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5)),0)).getUTCDate();return key+'-'+String(Math.min(Number(date.slice(8)),last)).padStart(2,'0');}
export function contractTerm(c,today){
  let end=c.endDate||null;
  if(end&&c.status==='active'&&c.renewalMonths>0&&end<today){let n=0;do{n++;end=shiftDate(c.endDate,n*c.renewalMonths);}while(end<today&&n<2400);}
  const ended=c.status==='ended'||!!end&&end<today&&(c.status==='cancelled'||!c.renewalMonths);
  let deadline=null;
  if(!ended&&c.status==='active'){
    if(c.deadline&&(!end||end===c.endDate))deadline=c.deadline;
    else if(end&&Number.isInteger(c.noticeValue))deadline=c.noticeUnit==='months'?shiftDate(end,-c.noticeValue):new Date(Date.parse(end+'T12:00:00Z')-c.noticeValue*86400000).toISOString().slice(0,10);
  }
  const days=deadline?Math.round((Date.parse(deadline)-Date.parse(today))/86400000):null;
  return {end,ended,deadline,days,alert:days===null?'unknown':days<0?'missed':days<=30?'soon':'later'};
}
export function contractHistories(contracts,bookings,today){
  const histories=new Map(contracts.map(c=>[c.id,{rows:[],ambiguous:0}]));
  bookings.forEach((b,index)=>{
    if(!(b.amount<0)||b.forecastOneOff||!b.date||iso(b)>today)return;
    for(const part of bookingParts(b)){
      const candidates=contracts.filter(c=>matchesContractBooking(c,b,part.category)&&(!c.startDate||iso(b)>=c.startDate)&&(!c.endDate||c.status==='active'&&c.renewalMonths>0||iso(b)<=c.endDate)).map(c=>({c,diff:Math.abs(part.cents-cents(c.amount))})).sort((a,b)=>a.diff-b.diff);
      if(!candidates.length)continue;
      if(candidates.length>1&&candidates[0].diff===candidates[1].diff){for(const item of candidates)histories.get(item.c.id).ambiguous++;continue;}
      const c=candidates[0].c;histories.get(c.id).rows.push({date:b.date,iso:iso(b),payee:b.payee,amount:part.cents/100,index,category:part.category});
    }
  });
  for(const c of contracts){const h=histories.get(c.id);h.rows.sort((a,b)=>a.iso.localeCompare(b.iso)||a.index-b.index);h.latest=h.rows.at(-1)||null;h.changes=[];
    for(let i=1;i<h.rows.length;i++){const previous=h.rows[i-1],current=h.rows[i];if(cents(previous.amount)!==cents(current.amount))h.changes.push({date:current.date,before:previous.amount,after:current.amount,delta:(cents(current.amount)-cents(previous.amount))/100,percent:(current.amount/previous.amount-1)*100});}
    h.pending=!!h.latest&&cents(h.latest.amount)!==cents(c.amount);h.projectedAmount=c.priceMode==='observed'&&h.latest?h.latest.amount:c.amount;
  }
  return histories;
}
export function contractFixedModels(contracts,models,bookings,today){
  const history=contractHistories(contracts,bookings,today),out=models.map((f,index)=>contracts.some(c=>c.linkedFixedIndex===index||c.patternId&&c.patternId===f.id||f.id?.startsWith('auto-fixed-')&&c.category===f.category&&(norm(c.matchKeyword).includes(norm(f.matchKeyword))||norm(f.matchKeyword).includes(norm(c.matchKeyword))))?{...f,status:'Nein'}:f);
  for(const c of contracts){const term=contractTerm(c,today);if(term.ended)continue;const h=history.get(c.id);out.push({id:'contract-'+c.id,name:c.name,category:c.category,monthly:h.projectedAmount/c.cycleMonths,contractAmount:h.projectedAmount,rhythm:cycles[c.cycleMonths],dueDay:c.dueDay,anchorMonth:c.anchorMonth,status:'Ja',matchKeyword:c.matchKeyword,startDate:c.startDate||null,untilDate:c.status==='cancelled'||!c.renewalMonths?c.endDate||null:null,contractId:c.id});}
  return out;
}
export function contractSuggestions(state,learning){
  const existing=state.contracts||[],out=[];
  for(const model of learning.fixed){if(existing.some(c=>c.patternId===model.id||model.existing&&c.linkedFixedIndex===Number(model.id.slice(9))))continue;
    const linkedFixedIndex=model.existing?Number(model.id.slice(9)):null,source=model.sources.at(-1),hint=linkedFixedIndex!==null?state.fixed[linkedFixedIndex]?.matchKeyword||source?.payee:source?.payee;
    if(!hint||existing.some(c=>c.category===model.category&&norm(c.matchKeyword)===norm(hint)))continue;
    out.push({patternId:model.id,name:model.name,provider:source?.payee||model.name,category:model.category,amount:model.amount,cycleMonths:model.cycle,dueDay:model.day,anchorMonth:model.anchorMonth,matchKeyword:hint,linkedFixedIndex,sources:model.sources,confidence:model.confidence});
  }
  // Fully specified legacy fixed items may not appear in the missing-timing suggestions.
  (state.fixed||[]).forEach((f,index)=>{if(f.status==='Nein'||existing.some(c=>c.linkedFixedIndex===index)||out.some(c=>c.linkedFixedIndex===index))return;const cycle=Object.entries(cycles).find(([,rhythm])=>rhythm===f.rhythm)?.[0];if(!cycle)return;out.push({name:f.name,provider:f.matchKeyword||f.name,category:f.category,amount:Math.round(f.monthly*Number(cycle)*100)/100,cycleMonths:Number(cycle),dueDay:Number(f.dueDay)||1,anchorMonth:Number(f.anchorMonth)||1,matchKeyword:f.matchKeyword||f.name,linkedFixedIndex:index,patternId:'existing-'+index,sources:[],confidence:'Bitte Termine prüfen'});});
  return out;
}
export function calendarEntry(c,deadline){
  if(!validDate(deadline))return null;const escape=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'),compact=d=>d.replace(/-/g,'');const next=new Date(Date.parse(deadline+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Haushaltsdashboard//Vertragsfristen//DE','BEGIN:VEVENT',`UID:${c.id}-${compact(deadline)}@haushaltsdashboard.local`,'DTSTAMP:'+new Date().toISOString().replace(/[-:]|\.\d{3}/g,''),`DTSTART;VALUE=DATE:${compact(deadline)}`,`DTEND;VALUE=DATE:${compact(next)}`,`SUMMARY:${escape('Kündigungsfrist: '+c.name)}`,`DESCRIPTION:${escape(c.provider+' · Frist laut deinen Vertragsangaben. Kündigung selbst ausführen.')}`,'BEGIN:VALARM','TRIGGER:-P7D','ACTION:DISPLAY','DESCRIPTION:Vertragsfrist prüfen','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}

export function matchesContractBooking(c,b,category){
  if(b.contractId)return b.contractId===c.id;
  if(c.matchMode==='manual'||c.category!==category||!norm(c.matchKeyword)||genericPayPalKeyword(c,b))return false;
  return norm(b.payee+' '+b.purpose).includes(norm(c.matchKeyword));
}
export function validateContractLinks(state){
  const ids=new Set((state.contracts||[]).map(c=>c.id));
  for(const b of state.bookings||[])if(b.contractId!==undefined&&(typeof b.contractId!=='string'||!ids.has(b.contractId)||!(b.amount<0)||b.splits?.length>1||b.transferPeerId))return 'Ungültige Vertragsverknüpfung. Nur einzelne Abbuchungen können direkt verknüpft werden.';
  return null;
}
