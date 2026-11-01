// Category suggestions are deliberately conservative. This module is also embedded in the HTML.
export const START_CATEGORIES=['ETFs','Essen gehen','Reisen','Werkstatt/Auto','Mobilität - Parken','Wohnen - Miete','Haushaltsgeld','Drogerie'];

function normalized(value){return String(value??'').normalize('NFC').toLocaleLowerCase('de').replace(/\s+/g,' ').trim()}

function matchesDirection(booking,direction){return direction==='all'||(direction==='income'?Number(booking.amount)>0:Number(booking.amount)<0)}

export function matchingRule(booking,rules=[]){
  const payee=normalized(booking.payee),purpose=normalized(booking.purpose);
  return rules.find(rule=>{
    if(!rule||!rule.keyword||!matchesDirection(booking,rule.direction||'all'))return false;
    const text=rule.field==='payee'?payee:rule.field==='purpose'?purpose:`${payee} ${purpose}`;
    if(rule.exact?text!==normalized(rule.keyword):!text.includes(normalized(rule.keyword)))return false;
    return rule.amount===undefined||rule.amount===null||Math.round(Math.abs(Number(booking.amount))*100)===Math.round(Number(rule.amount)*100);
  })||null;
}

export function suggestCategory(booking,customRules=[],knownBookings=[]){
  const payee=normalized(booking.payee),purpose=normalized(booking.purpose),bookingText=normalized(booking.booking),all=`${payee} ${purpose}`;
  const rule=matchingRule(booking,customRules);
  if(rule?.category)return{category:rule.category,reason:`Eigene Regel: ${rule.keyword}`};
  if(Number(booking.amount)>0){
    if(/lohn\/gehalt|gehaltszahlung|lohnabrechnung/.test(`${purpose} ${bookingText}`))return{category:'Gehalt',reason:'Gehalt/Lohn'};
    if(/erstattung|rückzahlung|rueckzahlung|retoure|refund|gutschrift/.test(purpose))return{category:'Erstattungen/Gutschriften',reason:'Erstattung'};
    return{category:'Sonstige Einnahmen',reason:'Übriger Geldeingang'};
  }
  if(Number(booking.amount)>=0)return null;
  if(/\betf\b|\bsparplan\b|\bmomentum\s+\d{8,}/.test(purpose))return{category:'ETFs',reason:'ETF/Sparplan'};
  if((/commerzbank/.test(payee)&&/leistungen per|tilgung|darlehen|baufinanzierung/.test(purpose))||/baufinanzierung|darlehensrate|immobilienkredit/.test(purpose))return{category:'Wohnen - Finanzierung',reason:'Finanzierungsrate'};
  if(/\bmiete\b/.test(purpose)&&/dauerauftrag|überweis|ueberweis/.test(bookingText))return{category:'Wohnen - Miete',reason:'Mietzahlung'};
  if(/haushaltsgeld/.test(purpose))return{category:'Haushaltsgeld',reason:'Haushaltsgeld-Übertrag'};
  if(/\b(aldi|edeka|rewe|lidl|penny|netto|kaufland|marktkauf|famila|combi)\b/.test(payee)||/obst-?\s*gem[uü]sehandel/.test(purpose))return{category:'Lebensmittel',reason:'Supermarkt/Lebensmittel'};
  if(/familotel|\bhotel\b|airbnb|booking\.com|ferienhaus|ferienwohnung|campingplatz|jugendherberge/.test(all))return{category:'Reisen',reason:'Unterkunft/Reise'};
  if(/mcdonald|burger king|\brestaurant\b|\brest\.|pizzeria|bäckerei|baeckerei|backerei|cafe|bistro|imbiss/.test(all))return{category:'Essen gehen',reason:'Restaurant/Bäckerei'};
  if(/kfz techniker|autowerkstatt|reifenservice|autohaus|werkstatt/.test(all))return{category:'Werkstatt/Auto',reason:'Fahrzeug/Werkstatt'};
  if(/parkstaett|parkhaus|tiefgarage|parkgeb[uü]hr/.test(all))return{category:'Mobilität - Parken',reason:'Parken'};
  if(/drogerie|dm drogerie|rossmann/.test(all))return{category:'Drogerie',reason:'Drogerie'};
  if(/vodafone|telekom|freenet|o2 telefonica/.test(payee))return{category:'Telefon/Internet',reason:'Telekommunikation'};
  if(/otto payments/.test(payee))return{category:'Online-Einkäufe',reason:'Online-Einkauf'};
  if(/vattenfall/.test(payee)&&/strom/.test(purpose))return{category:'Wohnen - Strom',reason:'Stromabschlag'};
  if(/vattenfall/.test(payee)&&/gas/.test(purpose))return{category:'Wohnen - Gas',reason:'Gasabschlag'};
  if(/wasserwerke|stadtwerke/.test(payee))return{category:'Wohnen - Wasser/Abgaben',reason:'Versorgerabschlag'};
  if(/gemeinde|stadtkasse|stadtverwaltung/.test(payee)&&/\bpk:/.test(purpose))return{category:'Wohnen - Kommunale Abgaben',reason:'Kommunale Abgaben'};
  if(/hornbach|bauhaus|obi baumarkt/.test(payee))return{category:'Haus & Einrichtung',reason:'Baumarkt'};
  if(/amazon digital/.test(payee)||/crunchyroll|prime video channels|amazon music|nabu casa/.test(purpose))return{category:'Abos/Streaming',reason:'Digitales Abo'};
  if(/\b(tankstelle|aral|shell|totalenergies|avia)\b/.test(payee)||/\bq1\b/.test(purpose))return{category:'Mobilität - Tanken',reason:'Tankstelle'};
  if(/\b(versicherung|debeka|vhv|ammerl[aä]nder)\b/.test(payee))return{category:'Versicherungen',reason:'Versicherung'};
  if(bookingText==='abschluss'&&/abschluss per/.test(purpose))return{category:'Bankgebühren',reason:'Kontogebühr'};
  if(/rundfunkbeitrag|beitragsservice/.test(all))return{category:'Rundfunkbeitrag',reason:'Rundfunkbeitrag'};
  // Learn only unambiguous, repeated merchants. Payment processors mix many kinds of purchases.
  const generic=/^(paypal|sumup|adyen|nexi|dz bank|lastschrift aus kartenzahlung|tankstelle)$/;
  if(payee.length<4||generic.test(payee))return null;
  const categories=new Set();let examples=0;
  for(const known of knownBookings){
    if(Math.sign(Number(known.amount))!==Math.sign(Number(booking.amount)))continue;
    if(normalized(known.payee)!==payee||!known.category||known.category==='Sonstiges')continue;
    categories.add(known.category);examples++;
    if(categories.size>1)break;
  }
  if(examples>=2&&categories.size===1)return{category:[...categories][0],reason:'Wiederkehrender Zahlungsbeteiligter'};
  return null;
}

export function suggestFixedStatus(booking,knownBookings=[],customRules=[]){
  if(Number(booking.amount)>=0)return null;
  const rule=matchingRule(booking,customRules);
  if(['Ja','Möglich','Nein'].includes(rule?.fixed))return rule.fixed;
  const payee=normalized(booking.payee),purpose=normalized(booking.purpose),category=booking.category||'';
  if(category==='Wohnen - Finanzierung'&&/commerzbank/.test(payee)&&/leistungen per|tilgung|darlehen/.test(purpose))return'Ja';
  if(category==='Wohnen - Strom'&&/vattenfall/.test(payee)&&/abschlag/.test(purpose))return'Ja';
  if(category==='Wohnen - Gas'&&/vattenfall/.test(payee)&&/abschlag/.test(purpose))return'Ja';
  if(category==='Wohnen - Kommunale Abgaben'&&/gemeinde|stadtkasse|stadtverwaltung/.test(payee)&&/\bpk:/.test(purpose))return'Möglich';
  // Match repeated historical debits using payee, amount and category.
  const same=knownBookings.filter(x=>Number(x.amount)<0&&normalized(x.payee)===payee&&x.category===category&&Math.round(Number(x.amount)*100)===Math.round(Number(booking.amount)*100));
  const yes=same.filter(x=>x.fixed==='Ja').length,maybe=same.filter(x=>x.fixed==='Möglich').length;
  if(yes>=2&&maybe===0)return'Ja';
  if(maybe>=2&&yes===0)return'Möglich';
  if(category==='Telefon/Internet'&&/telekom|freenet/.test(payee)&&/basislastschrift/i.test(booking.booking||''))return'Ja';
  if(category==='Versicherungen'&&/devk|debeka/.test(payee)&&/basislastschrift/i.test(booking.booking||''))return'Ja';
  return null;
}

export function reviewReason(booking,knownBookings=[]){
  if(Number(booking.amount)>=0)return booking.category==='Sonstige Einnahmen'?'Einnahme prüfen':null;
  if(!booking.category||booking.category==='Sonstiges')return'Kategorie prüfen';
  const prior=knownBookings.filter(b=>Number(b.amount)<0&&normalized(b.payee)===normalized(booking.payee)&&b.fixed==='Ja');
  if(booking.fixed!=='Ja'&&prior.length>=2)return'Mögliche Fixkostenänderung';
  if(booking.fixed==='Ja'&&prior.length>=2&&!prior.some(b=>Math.abs(Number(b.amount)-Number(booking.amount))<=Math.max(2,Math.abs(Number(b.amount))*.05)))return'Betrag weicht ab';
  return null;
}

export function suggestUncategorized(bookings,customRules=[]){
  const updates=[];
  for(let index=0;index<bookings.length;index++){
    const booking=bookings[index];
    if(booking.category&&booking.category!=='Sonstiges'||booking.categoryManual)continue;
    const suggestion=suggestCategory(booking,customRules,bookings);
    if(suggestion&&suggestion.category!=='Sonstiges')updates.push({index,...suggestion});
  }
  return updates;
}
