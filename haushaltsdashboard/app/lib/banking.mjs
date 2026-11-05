import {createPrivateKey,createHash,randomBytes,sign,timingSafeEqual} from 'node:crypto';
import {suggestCategory,suggestFixedStatus,reviewReason,matchingRule} from './categorization.mjs';
import {applyContributionRules} from '../public/finance.mjs';

export function equalSecret(a,b) {const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length>0 && x.length===y.length && timingSafeEqual(x,y);}
export function parseKey(pem) {
  let key;try {key=createPrivateKey(pem);}catch {throw new Error('Die Datei ist kein lesbarer privater PEM-Schlüssel (unverschlüsselt).');}
  if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw new Error('Ein privater RSA-Schlüssel mit mindestens 2048 Bit ist erforderlich.');
  return key;
}
export function jwt(pem,appId,now=Date.now()) {
  if(!/^[a-f0-9-]{36}$/i.test(appId||''))throw new Error('Bitte zuerst eine gültige Application ID konfigurieren.');
  const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),iat=Math.floor(now/1000)-5;
  const payload=b64({typ:'JWT',alg:'RS256',kid:appId})+'.'+b64({iss:'enablebanking.com',aud:'api.enablebanking.com',iat,exp:iat+3600});
  return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),parseKey(pem)).toString('base64url');
}
export class BankError extends Error {constructor(status,code){super(`Enable Banking: ${code} (HTTP ${status}).`);this.status=status;this.code=code;}}
export class EnableBanking {
  constructor(pem,appId,fetcher=fetch) {this.pem=pem;this.appId=appId;this.fetcher=fetcher;}
  async request(route,{method='GET',body}={}) {
    if(!/^\/(application|aspsps|auth|sessions(?:\/[a-zA-Z0-9-]+)?|accounts\/[a-zA-Z0-9-]+\/(?:details|transactions|balances))(?:\?.*)?$/.test(route))throw new Error('API-Pfad nicht erlaubt.');
    const r=await this.fetcher('https://api.enablebanking.com'+route,{method,redirect:'error',signal:AbortSignal.timeout(90000),headers:{Authorization:'Bearer '+jwt(this.pem,this.appId),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let data;try {data=await r.json();}catch {throw new BankError(r.status,'UNREADABLE_RESPONSE');}
    if(!r.ok)throw new BankError(r.status,String(data.error||'API_ERROR').replace(/[^A-Z0-9_]/g,'').slice(0,80));
    return data;
  }
  async transactions(uid,from,to) {
    const rows=[],seen=new Set();let continuation;
    for(let i=0;i<1000;i++) {
      const query=new URLSearchParams({date_from:from,date_to:to,transaction_status:'BOOK'});
      if(continuation)query.set('continuation_key',continuation);
      const result=await this.request(`/accounts/${encodeURIComponent(uid)}/transactions?${query}`);
      if(!Array.isArray(result.transactions))throw new Error('Unerwartetes Umsatzformat. Es wurde nichts aus diesem Abruf übernommen.');
      rows.push(...result.transactions);
      if(!result.continuation_key)return rows;
      if(seen.has(result.continuation_key))throw new Error('Wiederholter Seitenschlüssel. Abruf abgebrochen.');
      seen.add(result.continuation_key);continuation=result.continuation_key;
    }
    throw new Error('Zu viele Umsatzseiten. Abruf abgebrochen.');
  }
}
export function pendingAuthorization(aspsp,now=Date.now()) {
  const max=Number(aspsp.maximum_consent_validity);
  if(!(max>0))throw new Error('Die Bank meldet keine gültige Freigabedauer.');
  const validUntil=new Date(now+Math.min(max,180*86400)*1000-60000).toISOString();
  return {state:randomBytes(32).toString('hex'),expires:now+15*60*1000,aspsp:{name:aspsp.name,country:aspsp.country},validUntil};
}
export function consumeAuthorization(vault,input,now=Date.now()) {
  const pending=vault.pending;
  if(!pending||pending.expires<now||!equalSecret(pending.state,input.state))throw new Error('Ungültige oder abgelaufene Bank-Rückleitung. Bitte die Verbindung in der App neu starten.');
  // Invalid guesses cannot cancel a valid in-progress flow. A valid return is single-use.
  delete vault.pending;
  if(input.error)throw new Error('Bankfreigabe wurde abgebrochen oder abgelehnt. Bitte in der App erneut starten.');
  if(typeof input.code!=='string'||!input.code||input.code.length>8192)throw new Error('Die Bank hat keinen gültigen Freigabecode geliefert.');
  return pending;
}
const norm=v=>String(v??'').normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim();
const purpose=v=>norm(v).split(/\s+(?:eref|mref|cred|iban|bic):/)[0].trim();
const hash=v=>createHash('sha256').update(v).digest('hex');
export function accountKey(account) {return String(account.account_id?.iban||account.identification_hash||'').replace(/\s/g,'').toUpperCase();}
function day(iso) {if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))throw new Error('Buchungsdatum fehlt oder ist ungültig.');const d=new Date(iso+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==iso)throw new Error('Buchungsdatum ist ungültig.');return iso.slice(8,10)+'.'+iso.slice(5,7)+'.'+iso.slice(0,4);}
export function convertTransactions(transactions,account) {
  const converted=[],counts=new Map(),stats={pending:0,foreign:0};const key=accountKey(account);
  if(!key)throw new Error('Konto ohne stabile Kennung. Kein sicherer Import möglich.');
  for(const tx of transactions) {
    if(tx.status!=='BOOK'){stats.pending++;continue;}
    if(tx.transaction_amount?.currency!=='EUR'){stats.foreign++;continue;}
    const raw=String(tx.transaction_amount.amount);
    if(!/^\d+(\.\d{1,2})?$/.test(raw))throw new Error('Umsatzbetrag ungültig. Kein Teilimport dieses Kontos.');
    if(!['DBIT','CRDT'].includes(tx.credit_debit_indicator))throw new Error('Umsatzrichtung fehlt.');
    const amount=Number(raw)*(tx.credit_debit_indicator==='DBIT'?-1:1);
    const date=day(tx.booking_date||tx.value_date||tx.transaction_date);
    const counterparty=tx.credit_debit_indicator==='DBIT'?tx.creditor:tx.debtor;
    const b={date,amount,currency:'EUR',account:key,payee:String(counterparty?.name||''),purpose:Array.isArray(tx.remittance_information)?tx.remittance_information.join(' '):String(tx.remittance_information||''),booking:'Bankimport',category:'Sonstiges',fixed:'Nein',note:'',importSource:'enablebanking'};
    const fp=hash(JSON.stringify([key,date,Math.round(amount*100),norm(b.payee),purpose(b.purpose)]));
    const occurrence=(counts.get(fp)||0)+1;counts.set(fp,occurrence);
    // entry_reference is stable across sessions. transaction_id is deliberately not used.
    b.bankId=key+':'+(tx.entry_reference?'ref:'+tx.entry_reference:'fp:'+fp+':'+occurrence);
    converted.push(b);
  }
  return {converted,stats};
}
function sameAccount(b,key,defaultAccount) {return String(b.account||defaultAccount||'').replace(/\s/g,'').toUpperCase()===key;}
function annotate(b,state) {
  const c=suggestCategory(b,state.rules||[],state.bookings);if(c){b.category=c.category;b.categoryAuto=true;}
  const f=suggestFixedStatus(b,state.bookings,state.rules||[]);if(f){b.fixed=f;b.fixedAuto=true;}
  const rule=matchingRule(b,state.rules||[]);if(rule?.kind)b.flowType=rule.kind;
  applyContributionRules([b],state.contributionPayees||[]);b.reviewReason=reviewReason(b,state.bookings);return b;
}
export function reconcile(state,incoming,defaultAccount) {
  const used=new Set(),ids=new Set(state.bookings.flatMap(b=>[b.bankId,...(b.bankIds||[])].filter(Boolean)));
  const review=state.bankReview||[],deferred=new Set(review.map(r=>r.booking.bankId)),dismissed=new Set(state.bankDismissed||[]);
  const stats={added:0,matched:0,duplicates:0,review:0};
  for(const b of incoming) {
    if(ids.has(b.bankId)||dismissed.has(b.bankId)){stats.duplicates++;continue;}
    if(deferred.has(b.bankId)){stats.review++;continue;}
    const candidates=state.bookings.map((x,index)=>({x,index})).filter(({x,index})=>!used.has(index)&&sameAccount(x,b.account,defaultAccount)&&x.date===b.date&&Math.round(x.amount*100)===Math.round(b.amount*100));
    // Existing CSV dates/amount/payee/purpose must match. Booking type may vary between CSV and API.
    const exact=candidates.find(({x})=>!x.importSource && norm(x.payee)===norm(b.payee)&&purpose(x.purpose)===purpose(b.purpose)&&(norm(b.payee)||purpose(b.purpose)));
    if(exact){exact.x.bankIds=[...new Set([...(exact.x.bankIds||[]),b.bankId])];used.add(exact.index);ids.add(b.bankId);stats.matched++;continue;}
    // Similarities or changing API references are reviewed, not silently counted twice/deleted.
    if(candidates.length) {review.push({id:hash(b.bankId),booking:annotate(b,state),candidates:candidates.slice(0,10).map(({x})=>({date:x.date,payee:x.payee,purpose:x.purpose,amount:x.amount,bankId:x.bankId||null}))});deferred.add(b.bankId);stats.review++;continue;}
    state.bookings.push(annotate(b,state));used.add(state.bookings.length-1);ids.add(b.bankId);stats.added++;
  }
  state.bankReview=review;return stats;
}
